import os
import sqlite3
from datetime import datetime, date
from typing import List, Dict, Any, Optional

try:
    import config
except ImportError:
    from .. import config

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

        # Assemblee
        row_as = c.execute("SELECT COUNT(*) FROM assemblee_straordinarie WHERE stato NOT IN ('Conclusa', 'Annullata')").fetchone()
        if row_as:
            res["assemblee_programmate"] = row_as[0]

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

def elenca_scadenze_crm(solo_attive: bool = True, limite: int = 15) -> List[Dict[str, Any]]:
    """Elenca le scadenze e compiti dal CRM."""
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

def elenca_assemblee_crm(limite: int = 10) -> List[Dict[str, Any]]:
    """Elenca le assemblee programmate dal CRM."""
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
            WHERE a.stato NOT IN ('Conclusa', 'Annullata')
            ORDER BY a.data_assemblea ASC LIMIT ?
        """, (limite,)).fetchall()
        for r in rows:
            risultati.append(dict(r))
    except Exception as exc:
        print(f"⚠️ Errore elenco assemblee CRM: {exc}")
    finally:
        conn.close()
    return risultati
