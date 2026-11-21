import os
import sqlite3
import json
from datetime import datetime, date
from typing import List, Dict, Any, Optional

try:
    import config
except ImportError:
    from .. import config

def _get_json_path(filename: str) -> Optional[str]:
    cands = [
        os.path.join("/app/data", filename),
        os.path.join("/data/assistente", filename),
        os.path.join("/data/dettofatto", filename),
        os.path.join(config.BASE_DIR, "..", "..", "DettoFattoMCP", "portale2", "data", filename),
        os.path.join(config.BASE_DIR, "..", "data", filename),
        os.path.join(config.BASE_DIR, filename),
    ]
    for c in cands:
        if os.path.exists(c):
            return c
    return None

def carica_scadenze_json() -> List[Dict[str, Any]]:
    p = _get_json_path("scadenze.json")
    if p and os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            print(f"⚠️ Errore lettura scadenze.json ({p}): {e}")
    return []

def carica_practices_json() -> List[Dict[str, Any]]:
    p = _get_json_path("practices.json")
    if p and os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            print(f"⚠️ Errore lettura practices.json ({p}): {e}")
    return []

def _get_connection() -> Optional[sqlite3.Connection]:
    db_path = config.CRM_DB_PATH
    if not os.path.exists(db_path):
        # Prova fallback su percorsi noti
        cands = [
            "/app/data/studio_condominiale.db",
            os.path.join(config.BASE_DIR, "..", "backend", "studio_condominiale.db"),
            os.path.join(config.BASE_DIR, "studio_condominiale.db")
        ]
        for c in cands:
            if os.path.exists(c):
                db_path = c
                break
    if not os.path.exists(db_path):
        return None
    try:
        conn = sqlite3.connect(db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as exc:
        print(f"⚠️ Errore connessione DB CRM ({db_path}): {exc}")
        return None

def ottieni_briefing_crm() -> Dict[str, Any]:
    """Restituisce un cruscotto sintetico dello stato dello studio."""
    res = {
        "success": False,
        "totale_condomini": 0,
        "fondo_cassa_totale": 0.0,
        "morosita_totale": 0.0,
        "tickets_aperti": 0,
        "tickets_totali": 0,
        "scadenze_attive": 0,
        "fornitori_totali": 0,
        "assemblee_programmate": 0,
        "condomini_top": []
    }
    conn = _get_connection()
    if not conn:
        return res
    try:
        c = conn.cursor()
        # Condomini
        row = c.execute("SELECT COUNT(*), COALESCE(SUM(fondo_cassa), 0), COALESCE(SUM(totale_morosita), 0) FROM condomini WHERE attivo = 1").fetchone()
        if row:
            res["totale_condomini"] = row[0]
            res["fondo_cassa_totale"] = float(row[1])
            res["morosita_totale"] = float(row[2])

        # Tickets
        row_tk = c.execute("SELECT COUNT(*) FROM tickets_manutenzione WHERE stato NOT IN ('Risolto', 'Chiuso', 'Annullato')").fetchone()
        if row_tk:
            res["tickets_aperti"] = row_tk[0]
        row_tk_tot = c.execute("SELECT COUNT(*) FROM tickets_manutenzione").fetchone()
        if row_tk_tot:
            res["tickets_totali"] = row_tk_tot[0]

        # Scadenze attive
        row_sc = c.execute("SELECT COUNT(*) FROM scadenze_tasks WHERE completato = 0").fetchone()
        if row_sc:
            res["scadenze_attive"] = row_sc[0]

        # Fornitori
        row_fn = c.execute("SELECT COUNT(*) FROM fornitori").fetchone()
        if row_fn:
            res["fornitori_totali"] = row_fn[0]

        # Assemblee future (dalla data attuale in avanti)
        res["assemblee_programmate"] = len(elenca_assemblee_crm(limite=500))

        # Top 5 condomini
        top_rows = c.execute("SELECT id, nome, codice_danea, numero_unita, fondo_cassa, totale_morosita FROM condomini WHERE attivo = 1 ORDER BY nome ASC LIMIT 5").fetchall()
        for r in top_rows:
            res["condomini_top"].append(dict(r))

        res["success"] = True
    except Exception as exc:
        print(f"⚠️ Errore briefing CRM: {exc}")
    finally:
        conn.close()
    return res

def cerca_condomini(query: str, limite: int = 10) -> List[Dict[str, Any]]:
    """Cerca condomini per nome, codice danea, indirizzo o codice fiscale."""
    risultati = []
    conn = _get_connection()
    if not conn:
        return risultati
    try:
        c = conn.cursor()
        q = f"%{query.strip()}%"
        rows = c.execute("""
            SELECT id, codice_danea, nome, indirizzo, citta, cap, codice_fiscale, iban,
                   numero_unita, esercizio_in_corso, fondo_cassa, totale_morosita,
                   note_operative, scadenza_rendiconto, rendiconto_stato
            FROM condomini
            WHERE (nome LIKE ? OR codice_danea LIKE ? OR indirizzo LIKE ? OR codice_fiscale LIKE ?)
              AND attivo = 1
            ORDER BY nome ASC
            LIMIT ?
        """, (q, q, q, q, limite)).fetchall()

        for r in rows:
            d = dict(r)
            cid = d["id"]
            # Conta ticket aperti e scadenze
            tk_count = c.execute("SELECT COUNT(*) FROM tickets_manutenzione WHERE condominio_id = ? AND stato NOT IN ('Risolto', 'Chiuso')", (cid,)).fetchone()[0]
            sc_count = c.execute("SELECT COUNT(*) FROM scadenze_tasks WHERE condominio_id = ? AND completato = 0", (cid,)).fetchone()[0]
            d["tickets_aperti_count"] = tk_count
            d["scadenze_attive_count"] = sc_count
            risultati.append(d)
    except Exception as exc:
        print(f"⚠️ Errore ricerca condomini: {exc}")
    finally:
        conn.close()
    return risultati

def ottieni_dettaglio_condominio(condominio_id_o_nome: Any) -> Optional[Dict[str, Any]]:
    """Recupera la scheda completa di un condominio con ticket e scadenze associate."""
    conn = _get_connection()
    if not conn:
        return None
    try:
        c = conn.cursor()
        if isinstance(condominio_id_o_nome, int) or (isinstance(condominio_id_o_nome, str) and condominio_id_o_nome.isdigit()):
            row = c.execute("SELECT * FROM condomini WHERE id = ?", (int(condominio_id_o_nome),)).fetchone()
        else:
            q = f"%{str(condominio_id_o_nome).strip()}%"
            row = c.execute("SELECT * FROM condomini WHERE nome LIKE ? LIMIT 1", (q,)).fetchone()

        if not row:
            return None
        d = dict(row)
        cid = d["id"]

        # Ticket associati
        tk_rows = c.execute("""
            SELECT id, codice_dettofatto, titolo, priorita, stato, data_apertura
            FROM tickets_manutenzione
            WHERE condominio_id = ?
            ORDER BY data_apertura DESC LIMIT 5
        """, (cid,)).fetchall()
        d["tickets"] = [dict(t) for t in tk_rows]

        # Scadenze associate
        sc_rows = c.execute("""
            SELECT id, titolo, tipo, data_scadenza, completato, priorita
            FROM scadenze_tasks
            WHERE condominio_id = ? AND completato = 0
            ORDER BY data_scadenza ASC LIMIT 5
        """, (cid,)).fetchall()
        d["scadenze"] = [dict(s) for s in sc_rows]

        return d
    except Exception as exc:
        print(f"⚠️ Errore dettaglio condominio: {exc}")
        return None
    finally:
        conn.close()

def elenca_ticket_crm(solo_aperti: bool = True, limite: int = 15) -> List[Dict[str, Any]]:
    """Elenca i ticket di manutenzione dal CRM."""
    risultati = []
    conn = _get_connection()
    if not conn:
        return risultati
    try:
        c = conn.cursor()
        sql = """
            SELECT t.id, t.codice_dettofatto, t.titolo, t.descrizione, t.categoria,
                   t.priorita, t.stato, t.data_apertura, t.note_avanzamento,
                   c.nome as condominio_nome, c.codice_danea as condominio_codice
            FROM tickets_manutenzione t
            LEFT JOIN condomini c ON t.condominio_id = c.id
        """
        if solo_aperti:
            sql += " WHERE t.stato NOT IN ('Risolto', 'Chiuso', 'Annullato')"
        sql += " ORDER BY t.id DESC LIMIT ?"
        rows = c.execute(sql, (limite,)).fetchall()
        for r in rows:
            risultati.append(dict(r))
    except Exception as exc:
        print(f"⚠️ Errore elenco ticket CRM: {exc}")
    finally:
        conn.close()
    return risultati

def crea_ticket_crm(condominio_id_o_nome: Any, titolo: str, descrizione: str = "", priorita: str = "Media", segnalante: str = "Bot Telegram") -> Optional[Dict[str, Any]]:
    """Crea un nuovo ticket di manutenzione nel database del CRM."""
    conn = _get_connection()
    if not conn:
        return None
    try:
        c = conn.cursor()
        # Risolvi ID condominio
        cond_id = 1
        cond_nome = "Generale"
        if isinstance(condominio_id_o_nome, int) or (isinstance(condominio_id_o_nome, str) and str(condominio_id_o_nome).isdigit()):
            row_c = c.execute("SELECT id, nome FROM condomini WHERE id = ?", (int(condominio_id_o_nome),)).fetchone()
            if row_c:
                cond_id = row_c["id"]
                cond_nome = row_c["nome"]
        elif condominio_id_o_nome:
            row_c = c.execute("SELECT id, nome FROM condomini WHERE nome LIKE ? LIMIT 1", (f"%{str(condominio_id_o_nome).strip()}%",)).fetchone()
            if row_c:
                cond_id = row_c["id"]
                cond_nome = row_c["nome"]

        now_ts = int(datetime.now().timestamp())
        codice_df = f"TK-{datetime.now().strftime('%Y')}-{now_ts % 100000:05d}"
        now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        c.execute("""
            INSERT INTO tickets_manutenzione (
                codice_dettofatto, titolo, descrizione, categoria, priorita,
                stato, condominio_id, fornitore_id, segnalante, sincronizzato_dettofatto,
                note_avanzamento, data_apertura, ultimo_aggiornamento
            ) VALUES (?, ?, ?, 'Manutenzione Ordinaria', ?, 'Aperto', ?, NULL, ?, 0, ?, ?, ?)
        """, (
            codice_df,
            titolo.strip(),
            descrizione.strip() or f"Segnalato tramite Bot Telegram per {cond_nome}",
            priorita,
            cond_id,
            segnalante,
            f"Creato via Bot Telegram il {datetime.now().strftime('%d/%m/%Y %H:%M')}",
            now_iso,
            now_iso
        ))
        ticket_id = c.lastrowid
        conn.commit()
        return {
            "id": ticket_id,
            "codice": codice_df,
            "titolo": titolo,
            "condominio": cond_nome,
            "priorita": priorita,
            "stato": "Aperto"
        }
    except Exception as exc:
        print(f"⚠️ Errore creazione ticket CRM: {exc}")
        return None
    finally:
        conn.close()

import re

def elenca_dafare_crm(limite: int = 20) -> List[Dict[str, Any]]:
    """Elenca le pratiche e i Da Fare reali dello Studio dal file practices.json."""
    raw = carica_practices_json()
    risultati = []
    closed = {"chiusa", "completata", "conclusa", "annullata", "risolta"}
    for p in raw:
        st = str(p.get("status", "")).lower().strip()
        if st in closed:
            continue
        plan = p.get("plannedAt") or ""
        dt_str = plan[:10] if plan else "N.D."
        titolo_pulito = re.sub(r"^\[[^\]]+\]\s*", "", str(p.get("title", "")))
        risultati.append({
            "id": p.get("id"),
            "titolo": titolo_pulito,
            "condominio_nome": p.get("building") or "Generale",
            "tipo": "Da Fare",
            "priorita": p.get("priority") or "P2",
            "stato": p.get("status") or "Nuova",
            "data_scadenza": dt_str,
            "fornitore": p.get("supplier") or p.get("assignedTo") or "Studio Serra",
            "note": p.get("note") or ""
        })
    # Ordina per data di scadenza/pianificazione
    risultati.sort(key=lambda x: (x["data_scadenza"] == "N.D.", x["data_scadenza"], x["priorita"]))
    return risultati[:limite]

def elenca_scadenze_crm(solo_attive: bool = True, limite: int = 15) -> List[Dict[str, Any]]:
    """Elenca le scadenze CPI e compiti reali dal CRM (scadenze.json e practices.json)."""
    # 1. Prova prima dal file scadenze.json (dati reali dell'app web)
    scad_raw = carica_scadenze_json()
    if scad_raw:
        risultati = []
        today_str = date.today().isoformat()
        for s in scad_raw:
            due = s.get("dueDate", "")
            # calcola giorni rimanenti
            giorni = 0
            if due:
                try:
                    d_obj = datetime.strptime(due[:10], "%Y-%m-%d").date()
                    giorni = (d_obj - date.today()).days
                except Exception:
                    giorni = 999
            risultati.append({
                "id": s.get("id"),
                "titolo": s.get("title", ""),
                "tipo": s.get("category", "CPI / Scadenza"),
                "data_scadenza": due[:10] if due else "N.D.",
                "condominio_nome": s.get("building", ""),
                "fornitore": s.get("supplier", "Da assegnare"),
                "priorita": "P1" if giorni <= 15 else "P2",
                "giorni_rimasti": giorni,
                "completato": 0
            })
        risultati.sort(key=lambda x: x["data_scadenza"])
        return risultati[:limite]

    # 2. Fallback su database SQLite se scadenze.json non è presente
    risultati = []
    conn = _get_connection()
    if not conn:
        return risultati
    try:
        c = conn.cursor()
        sql = """
            SELECT s.id, s.titolo, s.descrizione, s.tipo, s.data_scadenza,
                   s.ora, s.priorita, s.completato,
                   c.nome as condominio_nome, c.codice_danea as condominio_codice
            FROM scadenze_tasks s
            LEFT JOIN condomini c ON s.condominio_id = c.id
        """
        if solo_attive:
            sql += " WHERE s.completato = 0"
        sql += " ORDER BY s.data_scadenza ASC LIMIT ?"
        rows = c.execute(sql, (limite,)).fetchall()
        for r in rows:
            risultati.append(dict(r))
    except Exception as exc:
        print(f"⚠️ Errore elenco scadenze CRM: {exc}")
    finally:
        conn.close()
    return risultati

def crea_scadenza_crm(condominio_id_o_nome: Any, titolo: str, data_scadenza: str, tipo: str = "Manutenzione", priorita: str = "Media") -> Optional[Dict[str, Any]]:
    """Crea una nuova scadenza / task nel CRM."""
    conn = _get_connection()
    if not conn:
        return None
    try:
        c = conn.cursor()
        cond_id = None
        cond_nome = "Generale"
        if condominio_id_o_nome:
            row_c = c.execute("SELECT id, nome FROM condomini WHERE nome LIKE ? LIMIT 1", (f"%{str(condominio_id_o_nome).strip()}%",)).fetchone()
            if row_c:
                cond_id = row_c["id"]
                cond_nome = row_c["nome"]

        c.execute("""
            INSERT INTO scadenze_tasks (
                titolo, descrizione, tipo, data_scadenza, priorita, completato, condominio_id
            ) VALUES (?, ?, ?, ?, ?, 0, ?)
        """, (
            titolo.strip(),
            f"Inserito da Bot Telegram per {cond_nome}",
            tipo,
            data_scadenza.strip(),
            priorita,
            cond_id
        ))
        scadenza_id = c.lastrowid
        conn.commit()
        return {
            "id": scadenza_id,
            "titolo": titolo,
            "data_scadenza": data_scadenza,
            "condominio": cond_nome,
            "tipo": tipo
        }
    except Exception as exc:
        print(f"⚠️ Errore creazione scadenza CRM: {exc}")
        return None
    finally:
        conn.close()

def elenca_fornitori_crm(filtro: Optional[str] = None, limite: int = 15) -> List[Dict[str, Any]]:
    """Elenca i fornitori della rubrica del CRM."""
    risultati = []
    conn = _get_connection()
    if not conn:
        return risultati
    try:
        c = conn.cursor()
        if filtro and filtro.strip():
            q = f"%{filtro.strip()}%"
            rows = c.execute("""
                SELECT id, ragione_sociale, categoria, referente, email, telefono, partita_iva
                FROM fornitori
                WHERE ragione_sociale LIKE ? OR categoria LIKE ? OR referente LIKE ?
                ORDER BY ragione_sociale ASC LIMIT ?
            """, (q, q, q, limite)).fetchall()
        else:
            rows = c.execute("""
                SELECT id, ragione_sociale, categoria, referente, email, telefono, partita_iva
                FROM fornitori
                ORDER BY ragione_sociale ASC LIMIT ?
            """, (limite,)).fetchall()
        for r in rows:
            risultati.append(dict(r))
    except Exception as exc:
        print(f"⚠️ Errore rubrica fornitori CRM: {exc}")
    finally:
        conn.close()
    return risultati

def _parse_data_assemblea(raw_str: Optional[str]) -> Optional[date]:
    """Converte vari formati di data assemblea (es. 24-11-26, 2026-11-24, 11/11/2026, 16 17 18 nov) in un oggetto date."""
    if not raw_str:
        return None
    s = str(raw_str).strip()
    if not s:
        return None

    # 1. Formato ISO YYYY-MM-DD
    m_iso = re.search(r"(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})", s)
    if m_iso:
        try:
            return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
        except ValueError:
            pass

    # 2. Formato italiano DD/MM/YYYY o DD-MM-YY
    m_it = re.search(r"(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})", s)
    if m_it:
        try:
            d = int(m_it.group(1))
            m = int(m_it.group(2))
            y = int(m_it.group(3))
            if y < 100:
                y += 2000
            return date(y, m, d)
        except ValueError:
            pass

    # 3. Formato testuale tipo "16 17 18 nov" o "24 novembre 2026"
    mesi = {
        "gen": 1, "feb": 2, "mar": 3, "apr": 4, "mag": 5, "giu": 6,
        "lug": 7, "ago": 8, "set": 9, "ott": 10, "nov": 11, "dic": 12
    }
    low = s.lower()
    for nome_m, num_m in mesi.items():
        if nome_m in low:
            nums = [int(n) for n in re.findall(r"\b(\d{1,4})\b", low)]
            days = [n for n in nums if 1 <= n <= 31]
            years = [n if n >= 2000 else (2000 + n) for n in nums if (24 <= n <= 99 or n >= 2024)]
            if days:
                day_val = max(days)
                year_val = years[0] if years else date.today().year
                try:
                    return date(year_val, num_m, day_val)
                except ValueError:
                    pass
    return None

def elenca_assemblee_crm(limite: int = 20, solo_future: bool = True) -> List[Dict[str, Any]]:
    """Elenca le assemblee programmate dal CRM filtrando solo quelle dalla data attuale in avanti."""
    risultati = []
    conn = _get_connection()
    if not conn:
        return risultati
    try:
        c = conn.cursor()
        rows = c.execute("""
            SELECT a.id, a.titolo, a.tipo, a.data_assemblea, a.ora_assemblea,
                   a.luogo_sala, a.stato, c.nome as condominio_nome
            FROM assemblee_straordinarie a
            LEFT JOIN condomini c ON a.condominio_id = c.id
            WHERE LOWER(COALESCE(a.stato, '')) NOT IN ('conclusa', 'annullata', 'chiusa')
        """).fetchall()
        oggi = date.today()
        validi = []
        for r in rows:
            item = dict(r)
            dt_obj = _parse_data_assemblea(item.get("data_assemblea"))
            if solo_future:
                # Mostra solo le assemblee con data >= oggi
                if not dt_obj or dt_obj < oggi:
                    continue
            item["data_iso"] = dt_obj.isoformat() if dt_obj else "9999-12-31"
            item["data_formattata"] = dt_obj.strftime("%d/%m/%Y") if dt_obj else (item.get("data_assemblea") or "Da definire")
            validi.append(item)

        validi.sort(key=lambda x: (x["data_iso"], x.get("ora_assemblea") or ""))
        risultati = validi[:limite]
    except Exception as exc:
        print(f"⚠️ Errore elenco assemblee CRM: {exc}")
    finally:
        conn.close()
    return risultati
