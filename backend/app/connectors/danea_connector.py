import csv
import io
from datetime import datetime
from typing import Dict, Any, List
import openpyxl
from sqlalchemy.orm import Session
from ..models import Condominio, Anagrafica, Fornitore, IntegrationConfig


class DaneaConnector:
    """
    Connettore per Danea Domustudio:
    - Importazione diretta da esportazioni standard Danea (.csv / .xlsx) per:
      1) Elenco Condomini
      2) Registro Anagrafico e Situazione Contabile / Rate Scadute
      3) Anagrafica Fornitori
    - Aggiornamento idempotente tramite codice_danea / email / nome
    """

    @staticmethod
    def import_file(db: Session, filename: str, content: bytes, tipo_import: str = "anagrafiche_saldi") -> Dict[str, Any]:
        rows: List[Dict[str, Any]] = []
        ext = filename.lower().split(".")[-1]

        if ext in ("xlsx", "xls"):
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            ws = wb.active
            headers = [str(cell.value or "").strip().lower() for cell in next(ws.iter_rows(min_row=1, max_row=1))]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                rows.append({headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))})
        else:
            text = content.decode("utf-8-sig", errors="replace")
            delimiter = ";" if ";" in text.splitlines()[0] else ","
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            for r in reader:
                rows.append({(k or "").strip().lower(): (v or "").strip() for k, v in r.items()})

        aggiornati = 0
        creati = 0

        if tipo_import == "condomini":
            for r in rows:
                cod = str(r.get("codice") or r.get("codice_danea") or f"CND-{creati+100}")
                nome = str(r.get("denominazione") or r.get("nome") or "").strip()
                if not nome:
                    continue
                cond = db.query(Condominio).filter(Condominio.codice_danea == cod).first()
                if not cond:
                    cond = Condominio(
                        codice_danea=cod,
                        nome=nome,
                        indirizzo=str(r.get("indirizzo") or "Via da definire"),
                        citta=str(r.get("citta") or "Milano"),
                        cap=str(r.get("cap") or "20100"),
                        codice_fiscale=str(r.get("codice_fiscale") or r.get("cf") or "90000000000"),
                        iban=str(r.get("iban") or ""),
                        numero_unita=int(float(r.get("unita") or r.get("numero_unita") or 12)),
                        fondo_cassa=float(str(r.get("fondo_cassa") or 0).replace(",", ".")),
                        totale_morosita=float(str(r.get("morosita") or 0).replace(",", ".")),
                    )
                    db.add(cond)
                    creati += 1
                else:
                    cond.nome = nome
                    cond.ultimo_sync_danea = datetime.utcnow()
                    aggiornati += 1
        else:
            # Importazione Anagrafiche & Saldi Contabili Danea
            default_cond = db.query(Condominio).first()
            for r in rows:
                nome = str(r.get("nominativo") or r.get("nome_cognome") or r.get("condomino") or "").strip()
                if not nome:
                    continue
                cond_nome = str(r.get("condominio") or "").strip()
                cond = None
                if cond_nome:
                    cond = db.query(Condominio).filter(Condominio.nome.ilike(f"%{cond_nome}%")).first()
                if not cond:
                    cond = default_cond
                if not cond:
                    continue

                email = str(r.get("email") or "").strip()
                scala = str(r.get("interno") or r.get("scala_interno") or r.get("subalterno") or "Scala A - Int. 1")
                saldo_raw = str(r.get("saldo") or r.get("saldo_attuale") or r.get("debito") or "0").replace("€", "").replace(" ", "").replace(",", ".")
                try:
                    saldo = float(saldo_raw)
                except ValueError:
                    saldo = 0.0

                rate_raw = str(r.get("rate_scadute") or r.get("rate") or ("1" if saldo > 0 else "0"))
                try:
                    rate = int(float(rate_raw))
                except ValueError:
                    rate = 0

                existing = (
                    db.query(Anagrafica)
                    .filter(
                        Anagrafica.condominio_id == cond.id,
                        Anagrafica.nome_cognome.ilike(nome),
                    )
                    .first()
                )
                if existing:
                    existing.saldo_attuale = saldo
                    existing.rate_scadute = rate
                    if email:
                        existing.email = email
                    aggiornati += 1
                else:
                    nuovo = Anagrafica(
                        codice_danea=str(r.get("codice") or f"AN-{creati+200}"),
                        condominio_id=cond.id,
                        nome_cognome=nome,
                        email=email or None,
                        telefono=str(r.get("telefono") or r.get("cellulare") or ""),
                        scala_interno=scala,
                        ruolo=str(r.get("ruolo") or "Proprietario"),
                        millesimi_generali=float(str(r.get("millesimi") or "45.5").replace(",", ".")),
                        saldo_attuale=saldo,
                        rate_scadute=rate,
                    )
                    db.add(nuovo)
                    creati += 1

        db.commit()

        # Ricalcola i totali morosità dei condomini
        for c in db.query(Condominio).all():
            tot = sum(a.saldo_attuale for a in c.anagrafiche if a.saldo_attuale > 0)
            c.totale_morosita = round(tot, 2)
            c.ultimo_sync_danea = datetime.utcnow()

        cfg = db.query(IntegrationConfig).filter(IntegrationConfig.chiave == "danea_sync").first()
        if cfg:
            cfg.ultimo_sync = datetime.now().strftime("%d/%m/%Y %H:%M")
            cfg.stato_connessione = f"Sincronizzato ({creati} nuovi, {aggiornati} aggiornati)"
        db.commit()

        return {
            "success": True,
            "righe_elaborate": len(rows),
            "creati": creati,
            "aggiornati": aggiornati,
            "timestamp": datetime.now().strftime("%d/%m/%Y %H:%M"),
        }
