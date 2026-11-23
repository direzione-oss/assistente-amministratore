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

def ottieni_tutti_condomini() -> List[Dict[str, Any]]:
    """
    Ritorna sempre l'elenco completo di tutti i condomini attivi ordinati alfabeticamente.
    Se la memoria è vuota, effettua la sincronizzazione automatica.
    """
    global condomini_in_memoria
    if not condomini_in_memoria:
        sincronizza_condomini()
    return condomini_in_memoria

def sincronizza_condomini() -> List[Dict[str, Any]]:
    """
    Carica l'elenco condomini dal database CRM (studio_condominiale.db)
    oppure dal file JSON di fallback condominiStudioSerra.json.
    """
    global condomini_in_memoria
    condomini_in_memoria.clear()

    # 1. Tentativo da database SQLite del CRM con percorsi candidati
    candidate_dbs = [
        getattr(config, "CRM_DB_PATH", ""),
        "/app/data/studio_condominiale.db",
        "/data/assistente/studio_condominiale.db",
        os.path.join(getattr(config, "BASE_DIR", "."), "..", "backend", "studio_condominiale.db"),
        os.path.join(getattr(config, "BASE_DIR", "."), "studio_condominiale.db")
    ]
    db_trovato = next((p for p in candidate_dbs if p and os.path.exists(p)), None)

    if db_trovato:
        try:
            conn = sqlite3.connect(db_trovato)
            c = conn.cursor()
            cols = [r[1] for r in c.execute("PRAGMA table_info(condomini)").fetchall()]
            query = "SELECT id, nome, codice_danea, indirizzo FROM condomini "
            if "attivo" in cols:
                query += "WHERE attivo = 1 "
            query += "ORDER BY nome ASC"
            rows = c.execute(query).fetchall()
            if rows:
                for r in rows:
                    nome_pulito = str(r[1] or "").strip()
                    if nome_pulito:
                        condomini_in_memoria.append({
                            "id": r[0],
                            "name": nome_pulito,
                            "code": r[2] or "",
                            "address": r[3] or "",
                        })
                conn.close()
                condomini_in_memoria.sort(key=lambda x: x["name"].upper())
                print(f"✅ [DETTOFATTO/CRM] Caricati {len(condomini_in_memoria)} condomini dal DB ({db_trovato}).")
                return condomini_in_memoria
            conn.close()
        except Exception as e_db:
            print(f"⚠️ Errore lettura condomini dal DB: {e_db}")

    # 2. Fallback da condominiStudioSerra.json
    candidate_jsons = [
        getattr(config, "CONDOMINI_JSON_PATH", ""),
        "/app/frontend/src/data/condominiStudioSerra.json",
        os.path.join(getattr(config, "BASE_DIR", "."), "..", "frontend", "src", "data", "condominiStudioSerra.json")
    ]
    json_trovato = next((p for p in candidate_jsons if p and os.path.exists(p)), None)

    if json_trovato:
        try:
            with open(json_trovato, "r", encoding="utf-8") as f:
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
                condomini_in_memoria.sort(key=lambda x: x["name"].upper())
                print(f"✅ [DETTOFATTO/CRM] Caricati {len(condomini_in_memoria)} condomini dal JSON di fallback ({json_trovato}).")
                return condomini_in_memoria
        except Exception as e_json:
            print(f"⚠️ Errore lettura condomini da JSON: {e_json}")

    # 3. Lista minima predefinita di sicurezza
    fallback_nomi = [
        "ALLA FORNACE BERGAMINA", "AMBIVERI B", "AUTOSTRADA 1", "BETULLA",
        "BORGO PALAZZO 48", "BORGO PALAZZO CLEMENTINA", "BORGO SANTA CATERINA",
        "CURNO NUOVA", "EUROPA", "GINESTRA", "IL SOLE 23", "LA PRIMULA",
        "NINFEA", "ROMANO", "SAN BERNARDINO 77", "SAN PIETRO", "SETTE TORRI",
        "TRECOURT", "TRIESTE 15", "V. DAMIANO CHIESA 20", "VERDI 4", "VIA CONTE GHISALBERTO",
        "VIA MARTINEL", "VIA PALMA IL VECCHIO 20A", "VITTORIO EMANUELE"
    ]
    for idx, f_nome in enumerate(fallback_nomi, 1):
        condomini_in_memoria.append({"id": idx, "name": f_nome, "code": f"CND-{idx}", "address": "Bergamo"})
    condomini_in_memoria.sort(key=lambda x: x["name"].upper())
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
