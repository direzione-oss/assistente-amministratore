import json
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models import (
    Condominio,
    Anagrafica,
    Fornitore,
    Comunicazione,
    TicketManutenzione,
    ScadenzaTask,
    IntegrationConfig,
)


def get_config_value(db: Session, key: str, default: str = "") -> str:
    cfg = db.query(IntegrationConfig).filter(IntegrationConfig.chiave == key).first()
    return cfg.valore if (cfg and cfg.valore) else default


class AISecretaryService:
    """
    Motore Segretario AI per l'Amministratore di Condominio.
    Supporta Google Gemini API / OpenAI API + motore esperto locale di fallback
    con accesso completo al contesto CRM (Danea, DettoFatto, Scadenze).
    """

    @staticmethod
    def match_crm_context(
        db: Session, mittente_email: str, oggetto: str, corpo: str, condominio_id: Optional[int] = None
    ) -> Dict[str, Any]:
        anagrafica = (
            db.query(Anagrafica)
            .filter(Anagrafica.email.ilike(mittente_email.strip()))
            .first()
        )
        condominio = None
        if anagrafica:
            condominio = db.query(Condominio).filter(Condominio.id == anagrafica.condominio_id).first()
        elif condominio_id:
            condominio = db.query(Condominio).filter(Condominio.id == condominio_id).first()
        else:
            testo = f"{oggetto} {corpo}".lower()
            for c in db.query(Condominio).all():
                if c.nome.lower() in testo or c.indirizzo.lower() in testo:
                    condominio = c
                    break

        return {"anagrafica": anagrafica, "condominio": condominio}

    @staticmethod
    def analyze_communication(
        db: Session,
        mittente_nome: str,
        mittente_email: str,
        oggetto: str,
        corpo: str,
        condominio_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        ctx = AISecretaryService.match_crm_context(
            db, mittente_email, oggetto, corpo, condominio_id
        )
        anagrafica: Optional[Anagrafica] = ctx["anagrafica"]
        condominio: Optional[Condominio] = ctx["condominio"]

        firma = get_config_value(
            db,
            "firma_email",
            "Cordiali saluti,\nL'Amministratore\nStudio Gestione Condomini",
        )
        gemini_key = get_config_value(db, "gemini_api_key", "")
        openai_key = get_config_value(db, "openai_api_key", "")
        provider = get_config_value(db, "ai_provider", "gemini")

        # Costruiamo il contesto CRM per l'AI
        cond_info = (
            f"{condominio.nome} ({condominio.indirizzo}, CF {condominio.codice_fiscale})"
            if condominio
            else "Condominio da identificare"
        )
        anag_info = (
            f"{anagrafica.nome_cognome}, {anagrafica.scala_interno}, Ruolo: {anagrafica.ruolo}"
            f"{' (CONSIGLIERE)' if anagrafica.is_consigliere else ''}, "
            f"Saldo Danea: € {anagrafica.saldo_attuale:.2f} ({anagrafica.rate_scadute} rate scadute)"
            if anagrafica
            else "Mittente esterno o non ancora associato in anagrafica Danea"
        )

        # Se è configurata una API key reale (Gemini o OpenAI), interroghiamo il modello LLM
        if provider == "gemini" and gemini_key:
            try:
                from google import genai

                client = genai.Client(api_key=gemini_key)
                prompt = f"""Sei il segretario esperto di un Amministratore di Condominio italiano.
Analizza questa email e restituisci ESCLUSIVAMENTE un JSON valido con le chiavi:
"categoria_ai" (uno tra: "Guasto/Manutenzione", "Contabilità/Rate", "Assemblea/Verbali", "Fornitore/Fattura", "Legale/PEC", "Info Generali"),
"urgenza_ai" (uno tra: "Critica", "Alta", "Media", "Bassa"),
"riassunto_ai" (massimo 2 frasi chiare e operative),
"azione_suggerita_ai" (azione concreta per l'amministratore),
"tipo_azione_rapida" (uno tra: "crea_ticket_dettofatto", "invia_estratto_danea", "fissa_appuntamento", "rispondi"),
"bozza_risposta_ai" (testo completo della risposta email professionale in italiano, firmata con: {firma}).

Contesto Danea CRM:
- Condominio: {cond_info}
- Anagrafica Mittente: {anag_info}

Email ricevuta:
Da: {mittente_nome} <{mittente_email}>
Oggetto: {oggetto}
Corpo:
{corpo}
"""
                resp = None
                for mod_name in ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
                    try:
                        resp = client.models.generate_content(
                            model=mod_name, contents=prompt
                        )
                        if resp and resp.text:
                            break
                    except Exception as e_mod:
                        if "404" in str(e_mod) or "NOT_FOUND" in str(e_mod):
                            continue
                        break
                if not resp or not resp.text:
                    return None
                raw = resp.text.strip()
                if "```json" in raw:
                    raw = raw.split("```json")[1].split("```")[0].strip()
                elif "```" in raw:
                    raw = raw.split("```")[1].split("```")[0].strip()
                parsed = json.loads(raw)
                parsed["condominio_id"] = condominio.id if condominio else None
                parsed["anagrafica_id"] = anagrafica.id if anagrafica else None
                return parsed
            except Exception:
                pass

        elif provider == "openai" and openai_key:
            try:
                from openai import OpenAI

                client = OpenAI(api_key=openai_key)
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    response_format={"type": "json_object"},
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Sei il segretario esperto di un Amministratore di Condominio italiano. "
                                "Rispondi in JSON con le chiavi: categoria_ai, urgenza_ai, riassunto_ai, "
                                "azione_suggerita_ai, tipo_azione_rapida, bozza_risposta_ai."
                            ),
                        },
                        {
                            "role": "user",
                            "content": f"Condominio: {cond_info}\nAnagrafica: {anag_info}\nDa: {mittente_nome}\nOggetto: {oggetto}\nCorpo: {corpo}\nFirma: {firma}",
                        },
                    ],
                )
                parsed = json.loads(resp.choices[0].message.content)
                parsed["condominio_id"] = condominio.id if condominio else None
                parsed["anagrafica_id"] = anagrafica.id if anagrafica else None
                return parsed
            except Exception:
                pass

        # Motore Esperto Locale Deterministico (sempre attivo anche senza API key esterne)
        testo = f"{oggetto} {corpo}".lower()
        cond_label = condominio.nome if condominio else "il Condominio"
        unita_label = f" ({anagrafica.scala_interno})" if anagrafica else ""

        if any(
            k in testo
            for k in [
                "perdita",
                "acqua",
                "guasto",
                "ascensore",
                "bloccato",
                "caldaia",
                "cancello",
                "infiltrazione",
                "allagamento",
                "luce",
                "rottura",
            ]
        ):
            categoria = "Guasto/Manutenzione"
            urgenza = (
                "Critica"
                if any(
                    u in testo
                    for u in ["allagamento", "bloccato", "perdita copiosa", "urgente", "fermo"]
                )
                else "Alta"
            )
            riassunto = f"Segnalazione guasto tecnico presso {cond_label}{unita_label}: {oggetto}."
            azione = "Aprire ticket su DettoFatto e inviare fornitore di riferimento"
            tipo_azione = "crea_ticket_dettofatto"
            bozza = (
                f"Gentile {mittente_nome},\n\n"
                f"abbiamo preso in carico la Sua segnalazione relativa a \"{oggetto}\" presso {cond_label}{unita_label}.\n"
                f"Abbiamo già provveduto ad aprire il ticket di intervento sulla piattaforma DettoFatto e ad allertare la ditta incaricata per un sopralluogo tempestivo.\n"
                f"Sarà nostra cura aggiornarLa non appena il tecnico confermerà l'orario di uscita.\n\n"
                f"{firma}"
            )
        elif any(
            k in testo
            for k in [
                "rata",
                "rate",
                "bonifico",
                "mav",
                "estratto",
                "saldo",
                "conguaglio",
                "pagamento",
                "sollecito",
                "iban",
            ]
        ):
            categoria = "Contabilità/Rate"
            urgenza = "Media"
            saldo_str = (
                f" (Saldo attuale registrato in Danea: € {anagrafica.saldo_attuale:.2f})"
                if anagrafica
                else ""
            )
            riassunto = f"Richiesta verifica contabile / posizione rateale per {mittente_nome}{saldo_str}."
            azione = "Verificare scheda versamenti in Danea Domustudio e inviare estratto"
            tipo_azione = "invia_estratto_danea"
            dettaglio_saldo = (
                f"Da una verifica immediata sul gestionale Danea Domustudio per l'unità {anagrafica.scala_interno}, "
                f"la Sua posizione presenta attualmente un saldo a debito di € {anagrafica.saldo_attuale:.2f}."
                if (anagrafica and anagrafica.saldo_attuale > 0)
                else "Da una prima verifica sul gestionale Danea Domustudio, la Sua posizione contabile risulta regolarmente aggiornata."
            )
            iban_info = (
                f"\nLe ricordiamo l'IBAN intestato a {condominio.nome}: {condominio.iban}."
                if (condominio and condominio.iban)
                else ""
            )
            bozza = (
                f"Gentile {mittente_nome},\n\n"
                f"in riscontro alla Sua richiesta relativa a \"{oggetto}\", La informiamo di quanto segue:\n"
                f"{dettaglio_saldo}{iban_info}\n\n"
                f"Restiamo a disposizione per inviarLe il dettaglio analitico delle singole rate.\n\n"
                f"{firma}"
            )
        elif any(
            k in testo
            for k in ["assemblea", "verbale", "delega", "ordine del giorno", "convocazione", "consiglio"]
        ):
            categoria = "Assemblea/Verbali"
            urgenza = "Media"
            riassunto = f"Comunicazione riguardante l'assemblea o l'ordine del giorno di {cond_label}."
            azione = "Inserire punto nel fascicolo assembleare e aggiornare calendario"
            tipo_azione = "fissa_appuntamento"
            bozza = (
                f"Gentile {mittente_nome},\n\n"
                f"La ringraziamo per la comunicazione relativa a \"{oggetto}\" per {cond_label}.\n"
                f"Abbiamo annotato quanto segnalato all'interno del fascicolo assembleare e ne daremo riscontro secondo le tempistiche previste.\n\n"
                f"{firma}"
            )
        elif any(
            k in testo for k in ["fattura", "preventivo", "sopralluogo", "ditta", "intervento eseguito"]
        ):
            categoria = "Fornitore/Fattura"
            urgenza = "Media"
            riassunto = f"Aggiornamento o documento contabile dal fornitore {mittente_nome}: {oggetto}."
            azione = "Registrare documento in Danea e aggiornare stato ticket su DettoFatto"
            tipo_azione = "rispondi"
            bozza = (
                f"Spett.le {mittente_nome},\n\n"
                f"confermiamo la ricezione della Vostra comunicazione relativa a \"{oggetto}\".\n"
                f"Abbiamo provveduto ad aggiornare la pratica tecnica e a trasmettere la documentazione al reparto contabile.\n\n"
                f"{firma}"
            )
        else:
            categoria = "Info Generali"
            urgenza = "Bassa"
            riassunto = f"Richiesta informativa da {mittente_nome} per {cond_label}."
            azione = "Inviare riscontro informativo al condòmino"
            tipo_azione = "rispondi"
            bozza = (
                f"Gentile {mittente_nome},\n\n"
                f"confermiamo la ricezione del Suo messaggio avente ad oggetto \"{oggetto}\".\n"
                f"Lo studio ha preso visione della richiesta e Le fornirà tutti i dettagli nel più breve tempo possibile.\n\n"
                f"{firma}"
            )

        return {
            "condominio_id": condominio.id if condominio else None,
            "anagrafica_id": anagrafica.id if anagrafica else None,
            "categoria_ai": categoria,
            "urgenza_ai": urgenza,
            "riassunto_ai": riassunto,
            "azione_suggerita_ai": azione,
            "tipo_azione_rapida": tipo_azione,
            "bozza_risposta_ai": bozza,
        }

    @staticmethod
    def customize_draft(
        db: Session, com: Comunicazione, tono: str = "Formale", istruzioni_extra: str = ""
    ) -> str:
        firma = get_config_value(
            db,
            "firma_email",
            "Cordiali saluti,\nL'Amministratore\nStudio Gestione Condomini",
        )
        cond_nome = com.condominio.nome if com.condominio else "il Condominio"
        anag = com.mittente_anagrafica

        if tono == "Sollecito Formale" and anag and anag.saldo_attuale > 0:
            return (
                f"Gentile {com.mittente_nome},\n\n"
                f"facendo seguito alla Sua comunicazione per {cond_nome} ({anag.scala_interno}), "
                f"Le forniamo riscontro in merito a \"{com.oggetto}\".\n"
                f"Cogliamo inoltre l'occasione per segnalarLe che dalla contabilità condominiale (Danea Domustudio) "
                f"risulta uno scoperto pari a € {anag.saldo_attuale:.2f} relativo a n. {anag.rate_scadute} rate scadute.\n"
                f"La invitiamo cortesemente a provvedere al saldo tramite bonifico bancario sull'IBAN condominiale "
                f"{com.condominio.iban if com.condominio and com.condominio.iban else ''} inviando contabile allo studio.\n"
                f"{f'Nota: {istruzioni_extra}' if istruzioni_extra else ''}\n\n"
                f"{firma}"
            )
        elif tono == "Rassicurante ed Empatico":
            return (
                f"Caro/a {com.mittente_nome},\n\n"
                f"La ringrazio per averci scritto tempestivamente riguardo a \"{com.oggetto}\" in {cond_nome}.\n"
                f"Comprendiamo perfettamente il disagio e mi sono già attivato personalmente con i nostri tecnici di fiducia tramite DettoFatto per risolvere la situazione nel minor tempo possibile.\n"
                f"{f'{istruzioni_extra}\n' if istruzioni_extra else ''}"
                f"La terrò aggiornata passo dopo passo.\n\n"
                f"{firma}"
            )
        elif tono == "Sintetico ed Operativo":
            return (
                f"Gentile {com.mittente_nome},\n\n"
                f"ricevuto per {cond_nome}. Pratica \"{com.oggetto}\" presa in carico.\n"
                f"Azione avviata: {com.azione_suggerita_ai or 'Verifica in corso'}.\n"
                f"{f'{istruzioni_extra}\n' if istruzioni_extra else ''}\n"
                f"{firma}"
            )
        else:
            base = com.bozza_risposta_ai or ""
            if istruzioni_extra:
                return f"{base}\n\nP.S.: {istruzioni_extra}"
            return base

    @staticmethod
    def answer_copilot_query(
        db: Session, messaggio: str, contesto_condominio_id: Optional[int] = None
    ) -> Dict[str, Any]:
        condomini = db.query(Condominio).all()
        anagrafiche = db.query(Anagrafica).all()
        tickets = db.query(TicketManutenzione).filter(TicketManutenzione.stato != "Risolto").all()
        comunicazioni = (
            db.query(Comunicazione)
            .filter(Comunicazione.stato_lavorazione == "Da gestire")
            .all()
        )
        scadenze = (
            db.query(ScadenzaTask)
            .filter(ScadenzaTask.completato == False)
            .all()
        )

        msg_low = messaggio.lower()
        morosi = [a for a in anagrafiche if a.saldo_attuale > 0]
        morosi.sort(key=lambda x: x.saldo_attuale, reverse=True)

        if any(w in msg_low for w in ["moros", "debito", "rate", "insolut", "danea", "chi deve"]):
            totale_mor = sum(a.saldo_attuale for a in morosi)
            righe = [
                f"- **{a.nome_cognome}** ({a.condominio.nome}, {a.scala_interno}): **€ {a.saldo_attuale:,.2f}** ({a.rate_scadute} rate scadute)"
                for a in morosi[:6]
            ]
            risposta = (
                f"### Situazione Morosità da Danea Domustudio\n"
                f"Attualmente risultano **{len(morosi)} posizioni a debito** per un totale complessivo di **€ {totale_mor:,.2f}**.\n\n"
                f"Le posizioni più rilevanti da sollecitare sono:\n"
                + "\n".join(righe)
                + "\n\nPosso generare le email di sollecito formale per ciascuno direttamente nella sezione *Condomini & Danea*."
            )
        elif any(w in msg_low for w in ["guast", "ticket", "dettofatto", "manutenzion", "intervent", "urgen"]):
            righe = [
                f"- **[{t.codice_dettofatto}] {t.titolo}** ({t.condominio.nome}) — Priorità: *{t.priorita}*, Stato: **{t.stato}** (Fornitore: {t.fornitore.ragione_sociale if t.fornitore else 'Da assegnare'})"
                for t in tickets
            ]
            risposta = (
                f"### Situazione Interventi & DettoFatto\n"
                f"Ci sono **{len(tickets)} ticket aperti** sincronizzati con DettoFatto:\n\n"
                + "\n".join(righe)
            )
        elif any(w in msg_low for w in ["avviso", "circolare", "comunicazione", "bacheca", "scrivi"]):
            cond_target = (
                db.query(Condominio).filter(Condominio.id == contesto_condominio_id).first()
                if contesto_condominio_id
                else (condomini[0] if condomini else None)
            )
            nome_c = cond_target.nome if cond_target else "Condominio"
            ind_c = cond_target.indirizzo if cond_target else ""
            risposta = (
                f"Ecco la bozza di avviso pronta da stampare o inviare via email ai condòmini di **{nome_c}**:\n\n"
                f"---\n"
                f"**AVVISO AI SIGNORI CONDÒMINI**\n"
                f"**{nome_c} – {ind_c}**\n\n"
                f"Si informano i Signori Condòmini e gli Inquilini che, a seguito delle segnalazioni pervenute allo Studio, "
                f"è stato programmato l'intervento tecnico con la ditta incaricata.\n"
                f"Eventuali aggiornamenti sugli orari di ripristino sono consultabili anche tramite bacheca DettoFatto.\n\n"
                f"Per urgenze è attivo il recapito dello Studio.\n\n"
                f"*L'Amministratore*\n"
                f"---"
            )
        else:
            critiche = [c for c in comunicazioni if c.urgenza_ai in ("Critica", "Alta")]
            risposta = (
                f"### Riepilogo Operativo del Segretario AI\n"
                f"Ecco il punto della situazione in tempo reale sul tuo studio:\n\n"
                f"1. **Smart Inbox (Gmail/PEC)**: hai **{len(comunicazioni)} comunicazioni da gestire** (di cui **{len(critiche)} ad alta/critica priorità** con bozza già pronta).\n"
                f"2. **Guasti & DettoFatto**: **{len(tickets)} ticket attivi** sui **{len(condomini)} condomini** gestiti.\n"
                f"3. **Contabilità Danea**: **{len(morosi)} posizioni con rate scadute** per un totale di **€ {sum(a.saldo_attuale for a in morosi):,.2f}**.\n"
                f"4. **Agenda & Google Calendar**: **{len(scadenze)} scadenze/assemblee** in programma.\n\n"
                f"Chiedimi pure: *\"Quali sono i condòmini più morosi?\"*, *\"Mostrami i guasti urgenti su DettoFatto\"* oppure *\"Scrivi un avviso per il condominio\"*."
            )

        return {
            "risposta": risposta,
            "timestamp": "Adesso",
        }
