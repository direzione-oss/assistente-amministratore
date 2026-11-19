import os
import json
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    import httpx
except ImportError:
    httpx = None

try:
    import config
except ImportError:
    from .. import config

condomini_in_memoria: List[Dict[str, Any]] = []

def sincronizza_condomini() -> List[Dict[str, Any]]:
    """
    Carica l'elenco condomini dal database CRM (studio_condominiale.db)
    oppure dal file JSON di fallback condominiStudioSerra.json.
    """
    global condomini_in_memoria
    condomini_in_memoria.clear()

    # 1. Tentativo da database SQLite del CRM
    if os.path.exists(config.CRM_DB_PATH):
        try:
            conn = sqlite3.connect(config.CRM_DB_PATH)
            c = conn.cursor()
            cols = [r[1] for r in c.execute("PRAGMA table_info(condomini)").fetchall()]
            query = "SELECT id, nome, codice_danea, indirizzo FROM condomini "
            if "attivo" in cols:
                query += "WHERE attivo = 1 "
            query += "ORDER BY nome ASC"
            rows = c.execute(query).fetchall()
            if rows:
                for r in rows:
                    condomini_in_memoria.append({
                        "id": r[0],
                        "name": r[1],
                        "code": r[2] or "",
                        "address": r[3] or "",
                    })
                conn.close()
                print(f"✅ [DETTOFATTO/CRM] Caricati {len(condomini_in_memoria)} condomini dal DB locale.")
                return condomini_in_memoria
            conn.close()
        except Exception as e_db:
            print(f"⚠️ Errore lettura condomini dal DB: {e_db}")

    # 2. Fallback da condominiStudioSerra.json
    if os.path.exists(config.CONDOMINI_JSON_PATH):
        try:
            with open(config.CONDOMINI_JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    nome = item.get("nome", "").strip()
                    if nome:
                        condomini_in_memoria.append({
                            "id": item.get("id"),
                            "name": nome,
                            "code": item.get("codice_danea", ""),
                            "address": item.get("indirizzo", ""),
                        })
                print(f"✅ [DETTOFATTO/CRM] Caricati {len(condomini_in_memoria)} condomini dal JSON di fallback.")
                return condomini_in_memoria
        except Exception as e_json:
            print(f"⚠️ Errore lettura condomini da JSON: {e_json}")

    # 3. Lista minima predefinita di sicurezza
    fallback_nomi = [
        "AMBIVERI B", "ALLA FORNACE BERGAMINA", "AUTOSTRADA 1", "CURNO NUOVA",
        "SAN BERNARDINO 77", "SETTE TORRI", "TRIESTE 15", "VERDI 4", "VITTORIO EMANUELE"
    ]
    for idx, f_nome in enumerate(fallback_nomi, 1):
        condomini_in_memoria.append({"id": idx, "name": f_nome, "code": f"CND-{idx}", "address": "Bergamo"})
    return condomini_in_memoria

def _invia_mcp_dettofatto(nome_condominio: str, testo_ticket: str) -> Optional[str]:
    """Invia opzionalmente la segnalazione al server MCP DettoFatto."""
    if not httpx or not config.DETTOFATTO_MCP_TOKEN:
        return None
    try:
        url = config.DETTOFATTO_MCP_URL
        headers = {
            "Authorization": f"Bearer {config.DETTOFATTO_MCP_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        # Inizializzazione sessione MCP
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "serra-mobile", "version": "1.0.0"}
            }
        }
        with httpx.Client(verify=False, timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=init_payload)
            sid = resp.headers.get("mcp-session-id")
            if sid:
                headers["Mcp-Session-Id"] = sid
                client.post(url, headers=headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
                call_payload = {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {
                        "name": "crea_segnalazione",
                        "arguments": {
                            "titolo": f"Intervento urgente - {nome_condominio}",
                            "descrizione": testo_ticket[:500],
                            "condominio": nome_condominio
                        }
                    }
                }
                c_resp = client.post(url, headers=headers, json=call_payload)
                return "Inviato a server DettoFatto MCP"
    except Exception as e:
        print(f"⚠️ Errore invio MCP DettoFatto: {e}")
    return None

def apri_ticket_dettofatto(cond, t_ia, p_doc, data) -> Dict[str, Any]:
    """
    Apre un ticket di manutenzione nel CRM Studio Serra e lo sincronizza con DettoFatto.
    """
    now_ts = int(datetime.now().timestamp())
    codice_df = f"DF-MOB-{now_ts}"
    titolo = f"Rilevazione Campo: {cond}"
    descrizione = f"{t_ia}\n\nDocumento Report: {p_doc}"
    note_avanz = f"Generato da S.E.R.R.A. Mobile il {data}. Report archiviato in: {p_doc}"

    cond_id = None
    if condomini_in_memoria:
        for c in condomini_in_memoria:
            if c["name"].strip().lower() == str(cond).strip().lower():
                cond_id = c.get("id")
                break
        if not cond_id:
            cond_id = condomini_in_memoria[0].get("id")

    # Registrazione su database CRM locale (studio_condominiale.db)
    if os.path.exists(config.CRM_DB_PATH):
        try:
            conn = sqlite3.connect(config.CRM_DB_PATH)
            c = conn.cursor()
            
            # Se cond_id non trovato, cerca nel DB
            if not cond_id:
                row_c = c.execute("SELECT id FROM condomini WHERE nome LIKE ? LIMIT 1", (f"%{cond}%",)).fetchone()
                cond_id = row_c[0] if row_c else 1

            c.execute("""
                INSERT INTO tickets_manutenzione (
                    codice_dettofatto, titolo, descrizione, categoria, priorita,
                    stato, condominio_id, fornitore_id, segnalante, sincronizzato_dettofatto,
                    note_avanzamento, data_apertura, ultimo_aggiornamento
                ) VALUES (?, ?, ?, 'Manutenzione Generale', 'Alta', 'Aperto', ?, NULL, 'S.E.R.R.A. Mobile', 1, ?, datetime('now'), datetime('now'))
            """, (codice_df, titolo, descrizione, cond_id, note_avanz))
            
            conn.commit()
            conn.close()
            print(f"✅ [CRM] Nuovo ticket aperto con codice {codice_df} per {cond}.")
        except Exception as e_sql:
            print(f"⚠️ Errore inserimento ticket su DB CRM: {e_sql}")

    # Chiamata opzionale MCP DettoFatto Live
    _invia_mcp_dettofatto(str(cond), t_ia)

    return {
        "success": True,
        "codice_ticket": codice_df,
        "condominio": cond,
        "data": data,
        "report_doc": p_doc
    }
