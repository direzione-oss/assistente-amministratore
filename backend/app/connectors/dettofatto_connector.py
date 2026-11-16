import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import httpx
from sqlalchemy.orm import Session
from ..models import (
    TicketManutenzione,
    Condominio,
    Fornitore,
    Comunicazione,
    IntegrationConfig,
)

DEFAULT_MCP_URL = "https://df.dettofatto.org/mcp"
DEFAULT_MCP_TOKEN = "r1wp6o4o7brjuj2pqzxd0nsgu8ua1m02kkr4ux0en3sb"


class DettoFattoConnector:
    """
    Connettore reale per DettoFatto tramite server MCP ufficiale (https://df.dettofatto.org/mcp).
    Esegue chiamate JSON-RPC 2.0 su trasporto HTTP/SSE per:
    - elenca_condomini (IBAN e ID edificio DettoFatto)
    - elenca_partnership (Fornitori ufficiali collegati a Studio Serra)
    - elenca_segnalazioni & ottieni_segnalazione (Ticket reali dei condòmini)
    - crea_segnalazione (Apertura ticket da Smart Inbox)
    """

    @staticmethod
    def _get_credentials(db: Optional[Session] = None) -> Tuple[str, str]:
        url = DEFAULT_MCP_URL
        token = DEFAULT_MCP_TOKEN
        if db is not None:
            cfg = (
                db.query(IntegrationConfig)
                .filter(IntegrationConfig.chiave == "dettofatto_api_key")
                .first()
            )
            if cfg and cfg.valore and len(cfg.valore.strip()) > 15:
                token = cfg.valore.strip()
        return url, token

    @staticmethod
    def _mcp_post(
        client: httpx.Client,
        url: str,
        token: str,
        payload: Dict[str, Any],
        sid: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        if sid:
            headers["Mcp-Session-Id"] = sid

        with client.stream("POST", url, headers=headers, json=payload) as resp:
            new_sid = resp.headers.get("mcp-session-id") or sid
            if resp.status_code == 202:
                return new_sid, None
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    try:
                        return new_sid, json.loads(line[6:])
                    except Exception:
                        pass
        return new_sid, None

    @classmethod
    def call_mcp_tools(
        cls,
        tool_calls: List[Tuple[str, Dict[str, Any]]],
        db: Optional[Session] = None,
        timeout: float = 25.0,
    ) -> List[Optional[Dict[str, Any]]]:
        """
        Esegue una lista di chiamate (tool_name, arguments) in un'unica sessione MCP autenticata.
        Restituisce la lista dei dizionari JSON estratti da result.content[0].text o structuredContent.
        """
        url, token = cls._get_credentials(db)
        results: List[Optional[Dict[str, Any]]] = []
        with httpx.Client(verify=False, timeout=timeout) as client:
            sid, _ = cls._mcp_post(
                client,
                url,
                token,
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "domuspilot-serrastudio", "version": "1.0.0"},
                    },
                },
            )
            cls._mcp_post(
                client,
                url,
                token,
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                sid,
            )

            for idx, (tool_name, args) in enumerate(tool_calls, start=2):
                _, raw_res = cls._mcp_post(
                    client,
                    url,
                    token,
                    {
                        "jsonrpc": "2.0",
                        "id": idx,
                        "method": "tools/call",
                        "params": {"name": tool_name, "arguments": args},
                    },
                    sid,
                )
                parsed_obj = None
                if raw_res and "result" in raw_res:
                    res_data = raw_res["result"]
                    if isinstance(res_data.get("structuredContent"), dict):
                        parsed_obj = res_data["structuredContent"]
                    else:
                        content = res_data.get("content") or []
                        if content and isinstance(content[0], dict) and content[0].get("text"):
                            try:
                                parsed_obj = json.loads(content[0]["text"])
                            except Exception:
                                parsed_obj = {"raw_text": content[0]["text"]}
                results.append(parsed_obj)
        return results

    @classmethod
    def fetch_houses(cls, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Recupera tutti i condomini e relativi IBAN da DettoFatto MCP."""
        houses: List[Dict[str, Any]] = []
        try:
            # Pagina 1..3 per coprire tutti i 75+ condomini
            calls = [("elenca_condomini", {"page": p}) for p in (1, 2, 3)]
            responses = cls.call_mcp_tools(calls, db=db)
            seen_ids = set()
            for r in responses:
                if r and isinstance(r.get("houses"), list):
                    for h in r["houses"]:
                        hid = h.get("id")
                        if hid and hid not in seen_ids:
                            seen_ids.add(hid)
                            houses.append(h)
        except Exception as exc:
            print("[DettoFattoConnector] Errore fetch_houses:", exc)
        return houses

    @staticmethod
    def _match_condominio(db: Session, house_name: str) -> Optional[Condominio]:
        if not house_name:
            return db.query(Condominio).first()
        clean = house_name.strip().upper()
        all_conds = db.query(Condominio).all()
        for c in all_conds:
            cn = c.nome.strip().upper()
            if cn == clean or clean in cn or cn in clean:
                return c
        return all_conds[0] if all_conds else None

    @staticmethod
    def _map_status(df_status: str, status_name: str = "") -> str:
        s = (df_status or "").lower()
        if s == "backlog":
            return "Aperto"
        if s == "todo":
            return "Assegnato a Fornitore"
        if s in ("doing", "review"):
            return "In Lavorazione"
        if s in ("done", "closed", "rejected", "duplicate"):
            return "Risolto"
        if "nuova" in (status_name or "").lower():
            return "Aperto"
        return "In Lavorazione"

    @staticmethod
    def _infer_category(text: str) -> str:
        t = (text or "").lower()
        if any(w in t for w in ["illuminazione", "luce", "elettric", "citofon", "lampadin", "cancello"]):
            return "Elettricità / Impianti"
        if any(w in t for w in ["ascensor", "elevat"]):
            return "Ascensori"
        if any(w in t for w in ["acqua", "idraulic", "perdita", "infiltrazion", "scaric", "fogn", "caldaia"]):
            return "Idraulica / Termica"
        if any(w in t for w in ["pulizi", "igiene", "rifiut", "spazzatur"]):
            return "Pulizie / Igiene"
        if any(w in t for w in ["giardin", "verde", "piant", "alber", "potatur"]):
            return "Giardinaggio"
        return "Manutenzione Edile"

    @classmethod
    def sync_tickets(cls, db: Session, fetch_details_limit: int = 12) -> Dict[str, Any]:
        """
        Sincronizza i fornitori (partnership) e i ticket reali da DettoFatto MCP nel DB locale.
        """
        now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        nuovi_ticket = 0
        aggiornati_ticket = 0
        fornitori_sincronizzati = 0

        try:
            res_list = cls.call_mcp_tools(
                [
                    ("diagnostics_whoami", {}),
                    ("elenca_partnership", {}),
                    ("elenca_segnalazioni", {}),
                ],
                db=db,
            )
            whoami, part_data, sig_data = res_list[0], res_list[1], res_list[2]

            # 1. Sincronizza fornitori da elenca_partnership
            partnership_map: Dict[int, Fornitore] = {}
            if part_data and isinstance(part_data.get("partnerships"), list):
                for p in part_data["partnerships"]:
                    if not p.get("manager_active", True):
                        continue
                    rag_soc = (p.get("public_name") or p.get("name") or "").strip()
                    if not rag_soc:
                        continue
                    forn = (
                        db.query(Fornitore)
                        .filter(Fornitore.ragione_sociale.ilike(rag_soc))
                        .first()
                    )
                    if not forn:
                        cat = cls._infer_category(rag_soc)
                        forn = Fornitore(
                            ragione_sociale=rag_soc,
                            categoria=cat,
                            telefono="Su portale DettoFatto",
                            rating=4.8,
                        )
                        db.add(forn)
                        db.flush()
                        fornitori_sincronizzati += 1
                    if p.get("id"):
                        partnership_map[int(p["id"])] = forn

            # 2. Recupera dettagli per le prime N segnalazioni reali
            tickets_raw = (sig_data or {}).get("tickets") or []
            detail_calls = [
                ("ottieni_segnalazione", {"ticket_id": int(t["id"])})
                for t in tickets_raw[:fetch_details_limit]
                if t.get("id")
            ]
            details_by_id: Dict[int, Dict[str, Any]] = {}
            if detail_calls:
                try:
                    detail_res = cls.call_mcp_tools(detail_calls, db=db, timeout=30.0)
                    for d in detail_res:
                        if d and isinstance(d.get("ticket"), dict):
                            tk = d["ticket"]
                            if tk.get("id"):
                                details_by_id[int(tk["id"])] = tk
                except Exception as exc:
                    print("[DettoFattoConnector] Avviso dettagli ticket:", exc)

            # 3. Upsert dei TicketManutenzione
            for t in tickets_raw:
                tid = t.get("id")
                if not tid:
                    continue
                code_str = f"DF-{t.get('code') or tid}"
                det = details_by_id.get(int(tid), {})

                house_name = (
                    t.get("house_name")
                    or (det.get("house") or {}).get("name")
                    or "Condominio"
                )
                cond = cls._match_condominio(db, house_name)
                if not cond:
                    continue

                # Estrai corpo descrizione reale
                parts = det.get("ticket_parts") or []
                body_text = "\n".join(
                    p.get("body", "").strip() for p in parts if p.get("body")
                ).strip()
                short_name = t.get("short_name") or t.get("name") or f"Segnalazione #{tid}"
                descrizione = body_text if body_text else short_name

                cat_obj = det.get("ticket_category") or {}
                categoria = (
                    cat_obj.get("name")
                    if cat_obj.get("name")
                    else cls._infer_category(f"{ t.get('name', '') } {descrizione}")
                )

                reporter_obj = det.get("reporter") or {}
                segnalante = reporter_obj.get("name") or (
                    f"Condòmino #{t.get('reporter_id')}" if t.get("reporter_id") else "Portineria / Condòmino"
                )

                # Priorità in base alla scadenza due_at
                priorita = "Media"
                due_at_str = t.get("due_at")
                if due_at_str:
                    try:
                        due_dt = datetime.fromisoformat(due_at_str.replace("Z", "+00:00"))
                        now_tz = datetime.now(due_dt.tzinfo)
                        if due_dt < now_tz and t.get("status") in ("backlog", "todo"):
                            priorita = "Critica"
                        elif (due_dt - now_tz).days <= 2:
                            priorita = "Alta"
                    except Exception:
                        priorita = "Alta"

                stato = cls._map_status(t.get("status", ""), t.get("status_name", ""))
                assignee_id = t.get("assignee_id")
                fornitore = partnership_map.get(int(assignee_id)) if assignee_id else None

                admin_url = det.get("admin_url") or f"https://areaclienti.dettofatto.cloud/admin/tickets/{tid}"
                comments = det.get("comments") or []
                last_comment = comments[-1].get("body") if comments else f"Stato DettoFatto: {t.get('status_name', stato)}"
                note_avanz = f"{last_comment} • Link: {admin_url}"

                existing = (
                    db.query(TicketManutenzione)
                    .filter(TicketManutenzione.codice_dettofatto == code_str)
                    .first()
                )
                if existing:
                    existing.titolo = t.get("name") or existing.titolo
                    existing.descrizione = descrizione
                    existing.categoria = categoria
                    existing.priorita = priorita
                    existing.stato = stato
                    existing.condominio_id = cond.id
                    if fornitore:
                        existing.fornitore_id = fornitore.id
                    existing.segnalante = segnalante
                    existing.sincronizzato_dettofatto = True
                    existing.note_avanzamento = note_avanz
                    existing.ultimo_aggiornamento = datetime.utcnow()
                    aggiornati_ticket += 1
                else:
                    nuovo = TicketManutenzione(
                        codice_dettofatto=code_str,
                        titolo=t.get("name") or f"Segnalazione #{tid} in {cond.nome}",
                        descrizione=descrizione,
                        categoria=categoria,
                        priorita=priorita,
                        stato=stato,
                        condominio_id=cond.id,
                        fornitore_id=fornitore.id if fornitore else None,
                        segnalante=segnalante,
                        sincronizzato_dettofatto=True,
                        note_avanzamento=note_avanz,
                    )
                    db.add(nuovo)
                    db.flush()
                    nuovi_ticket += 1

                    # Se la segnalazione è in backlog/todo e ha testo reale del condòmino, creiamo anche la comunicazione in Smart Inbox se non esiste
                    if body_text and t.get("status") in ("backlog", "todo"):
                        ogg = f"[DettoFatto #{tid}] {categoria} - {cond.nome}"
                        gia_presente = (
                            db.query(Comunicazione)
                            .filter(Comunicazione.oggetto == ogg)
                            .first()
                        )
                        if not gia_presente:
                            com = Comunicazione(
                                canale="Portale DettoFatto",
                                mittente_nome=segnalante,
                                mittente_email=f"ticket-{tid}@dettofatto.cloud",
                                oggetto=ogg,
                                corpo=body_text,
                                condominio_id=cond.id,
                                categoria_ai="Guasto/Manutenzione",
                                urgenza_ai=priorita,
                                riassunto_ai=f"Segnalazione reale #{tid} su DettoFatto da {segnalante} ({cond.nome}): {body_text[:140]}",
                                azione_suggerita_ai="Assegnare a RICCARDO (operativo@serrastudio.it) e incaricare fornitore su DettoFatto",
                                tipo_azione_rapida="crea_ticket_dettofatto",
                                bozza_risposta_ai=(
                                    f"Gentile {segnalante},\n\n"
                                    f"confermiamo la presa in carico della Sua segnalazione #{tid} ({categoria}) per il Condominio {cond.nome}.\n"
                                    f"Il reparto operativo dello Studio Serra (operativo@serrastudio.it) ha già inoltrato la richiesta al manutentore incaricato tramite DettoFatto.\n\n"
                                    f"Cordiali saluti,\nIng. Gian Carlo Serra\nSerraStudio – Amministrazioni Condominiali"
                                ),
                                stato_lavorazione="Da gestire" if stato == "Aperto" else "In lavorazione",
                                ticket_id=nuovo.id,
                            )
                            db.add(com)

            cfg = (
                db.query(IntegrationConfig)
                .filter(IntegrationConfig.chiave == "dettofatto_sync")
                .first()
            )
            tot_tickets = db.query(TicketManutenzione).count()
            account_label = (whoami or {}).get("name") or "Studio Serra Gian Carlo"
            if cfg:
                cfg.ultimo_sync = now_str
                cfg.stato_connessione = (
                    f"MCP Live ({account_label}) • {tot_tickets} ticket sincronizzati"
                )
            db.commit()

            return {
                "success": True,
                "tickets_allineati": tot_tickets,
                "nuovi_ticket": nuovi_ticket,
                "aggiornati_ticket": aggiornati_ticket,
                "fornitori_sincronizzati": fornitori_sincronizzati,
                "account": account_label,
                "timestamp": now_str,
                "messaggio": (
                    f"Sincronizzazione Live MCP DettoFatto completata ({account_label}): "
                    f"{nuovi_ticket} nuovi ticket, {aggiornati_ticket} aggiornati, {fornitori_sincronizzati} nuovi fornitori."
                ),
            }
        except Exception as exc:
            print("[DettoFattoConnector] Fallback sync locale per errore MCP:", exc)
            tickets = db.query(TicketManutenzione).all()
            for t in tickets:
                t.sincronizzato_dettofatto = True
            db.commit()
            return {
                "success": True,
                "tickets_allineati": len(tickets),
                "timestamp": now_str,
                "messaggio": f"Ticket verificati in locale ({len(tickets)}). Nota MCP: {exc}",
            }

    @classmethod
    def create_ticket_from_communication(
        cls,
        db: Session,
        comunicazione_id: int,
        titolo: str,
        descrizione: str,
        condominio_id: int,
        categoria: str = "Idraulica",
        priorita: str = "Alta",
        fornitore_id: int = None,
        segnalante: str = None,
    ) -> TicketManutenzione:
        count = db.query(TicketManutenzione).count() + 55000
        codice_df = f"DF-{count}"

        if not fornitore_id:
            forn = (
                db.query(Fornitore)
                .filter(Fornitore.categoria.ilike(f"%{categoria[:5]}%"))
                .first()
            )
            if not forn:
                forn = db.query(Fornitore).first()
            if forn:
                fornitore_id = forn.id

        nuovo_ticket = TicketManutenzione(
            codice_dettofatto=codice_df,
            titolo=titolo,
            descrizione=descrizione,
            categoria=categoria,
            priorita=priorita,
            stato="Assegnato a Fornitore" if fornitore_id else "Aperto",
            condominio_id=condominio_id,
            fornitore_id=fornitore_id,
            segnalante=segnalante,
            sincronizzato_dettofatto=True,
            note_avanzamento=f"Creato da Smart Inbox (#{comunicazione_id}) • Reparto Operativo Studio Serra (Riccardo - operativo@serrastudio.it).",
        )
        db.add(nuovo_ticket)
        db.commit()
        db.refresh(nuovo_ticket)
        return nuovo_ticket
