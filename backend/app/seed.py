import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import (
    Condominio,
    Anagrafica,
    Fornitore,
    Comunicazione,
    TicketManutenzione,
    ScadenzaTask,
    IntegrationConfig,
    SchedaRendiconto,
    PassoRendiconto,
)
from .services.ai_secretary import AISecretaryService
from .services.rendiconto_service import (
    DEFAULT_PASSI_MODELLO_5,
    DEFAULT_NOTA_ESPLICATIVA_CHECKS,
    get_custom_passi_modello_5,
)


def create_scheda_for_condominio(
    db: Session,
    condominio: Condominio,
    gestione: str,
    note_intestazione: str = "",
    pre_check_up_to: int = 0,
    sample_pages: dict = None,
    acqua_vals: tuple = (0.0, 0.0, 0.0),
) -> SchedaRendiconto:
    today_str = datetime.now().strftime("%d/%m/%Y")

    # Cerca l'eventuale gestione precedente dello stesso condominio per riportare note e appunti
    prev_scheda = (
        db.query(SchedaRendiconto)
        .filter(SchedaRendiconto.condominio_id == condominio.id)
        .order_by(SchedaRendiconto.id.desc())
        .first()
    )

    prev_passi_by_code = {}
    prev_passi_by_ordine = {}
    prev_nota_notes = {}

    if prev_scheda:
        # Se la gestione precedente non aveva ancora la data di chiusura, segnala come chiusa oggi
        if not prev_scheda.fatto_il:
            prev_scheda.fatto_il = today_str
        if not note_intestazione and prev_scheda.note_intestazione:
            note_intestazione = prev_scheda.note_intestazione
        try:
            old_checks = json.loads(prev_scheda.nota_esplicativa_checks_json or "[]")
            for oc in old_checks:
                if isinstance(oc, dict) and oc.get("codice") and oc.get("note"):
                    prev_nota_notes[oc["codice"]] = oc["note"]
        except Exception:
            pass
        for pp in prev_scheda.passi:
            prev_passi_by_code[pp.numero_codice] = pp
            prev_passi_by_ordine[pp.ordine] = pp

    checks = json.loads(json.dumps(DEFAULT_NOTA_ESPLICATIVA_CHECKS))
    for c in checks:
        if c["codice"] in prev_nota_notes:
            c["note"] = prev_nota_notes[c["codice"]]
    if pre_check_up_to > 15:
        for c in checks[:5]:
            c["fatto"] = True

    scheda = SchedaRendiconto(
        condominio_id=condominio.id,
        procedura_codice="Procedura 002 - Modello 5",
        gestione=gestione,
        note_intestazione=note_intestazione,
        chi_lo_fa_default=prev_scheda.chi_lo_fa_default if prev_scheda else "G",
        acqua_consumo_contabilizzatori=acqua_vals[0],
        acqua_mc_fatture=acqua_vals[1],
        acqua_costo_fatture=acqua_vals[2],
        nota_esplicativa_checks_json=json.dumps(checks, ensure_ascii=False),
    )
    db.add(scheda)
    db.flush()

    sample_pages = sample_pages or {}
    custom_passi_template = get_custom_passi_modello_5(db)

    for p_def in custom_passi_template:
        is_done = p_def["ordine"] <= pre_check_up_to
        doc_cod = p_def["doc_codice"]
        prev_p = prev_passi_by_code.get(p_def["numero_codice"]) or prev_passi_by_ordine.get(p_def["ordine"])

        pag = (
            sample_pages.get(doc_cod, prev_p.num_pagine if prev_p and prev_p.num_pagine else p_def["num_pagine"])
            if doc_cod
            else 0
        )
        extra = dict(p_def["campi_extra"])
        if prev_p and prev_p.campi_extra_json:
            try:
                prev_extra = json.loads(prev_p.campi_extra_json or "{}")
                if isinstance(prev_extra, dict):
                    for k, v in prev_extra.items():
                        if v is not None and str(v).strip() != "":
                            extra[k] = str(v)
                    # Al passo 30 riporta il saldo Attuale della gestione chiusa come Precedente della nuova gestione
                    if p_def["numero_codice"] == "30" and prev_extra.get("Attuale (€)"):
                        extra["Precedente (€)"] = str(prev_extra["Attuale (€)"])
                        extra["Attuale (€)"] = ""
                    if p_def["numero_codice"] == "31" and "Attuale (€)" in extra:
                        extra.pop("Attuale (€)", None)
            except Exception:
                pass

        if is_done and "Rate registrate sino al giorno" in extra and not extra["Rate registrate sino al giorno"]:
            extra["Rate registrate sino al giorno"] = "31/12/2025"
        if is_done and "Precedente (€)" in extra and not extra["Precedente (€)"]:
            extra["Precedente (€)"] = "14.280,50"

        carried_note = (prev_p.note_passo or "") if prev_p else ""
        carried_chi = (prev_p.chi_lo_fa or p_def["chi_lo_fa"]) if prev_p else p_def["chi_lo_fa"]

        passo = PassoRendiconto(
            scheda_id=scheda.id,
            ordine=p_def["ordine"],
            numero_codice=p_def["numero_codice"],
            sezione=p_def["sezione"],
            chi_lo_fa=carried_chi,
            fatto=is_done,
            data_spunta=today_str if is_done else None,
            descrizione=p_def["descrizione"],
            ha_pagine=p_def["ha_pagine"],
            doc_codice=doc_cod,
            num_pagine=pag,
            campi_extra_json=json.dumps(extra, ensure_ascii=False),
            note_passo=carried_note,
        )
        db.add(passo)

    return scheda


def seed_rendiconto_if_empty(db: Session):
    if db.query(SchedaRendiconto).count() > 0:
        return
    condomini = db.query(Condominio).order_by(Condominio.id.asc()).all()
    if not condomini:
        return

    for idx, c in enumerate(condomini):
        if idx == 0:
            create_scheda_for_condominio(
                db,
                condominio=c,
                gestione=c.esercizio_in_corso or "01/01/2025 - 31/12/2025",
                note_intestazione="Rendiconto in fase di chiusura pre-assembleare • Verifica contatori acqua e Nota Esplicativa",
                pre_check_up_to=26,
                sample_pages={
                    "doc_02_nota_esplicativa": 4,
                    "doc_03_straordinario": 0,
                    "doc_04_consuntivo": 3,
                    "doc_05_sit_patrimoniale": 2,
                    "doc_06_registro": 8,
                    "doc_07a_debiti_crediti": 2,
                    "doc_07b_fondo": 1,
                    "doc_08_comparativo": 2,
                    "doc_09_riparto_cons": 4,
                    "doc_10_attivita": 2,
                    "doc_11_calendar": 1,
                    "doc_12_acqua": 2,
                    "doc_13_riscaldamento": 3,
                    "doc_14_interessi": 0,
                    "doc_15_criteri": 1,
                    "doc_16_preventivo": 2,
                    "doc_17_riparto_prev": 3,
                    "doc_18_rate": 2,
                },
                acqua_vals=(1420.0, 1510.0, 3473.0),
            )
        elif idx == 1:
            create_scheda_for_condominio(
                db,
                condominio=c,
                gestione=c.esercizio_in_corso or "01/07/2025 - 30/06/2026",
                note_intestazione="In attesa ultime fatture energia e riconciliazione bancaria",
                pre_check_up_to=14,
                sample_pages={
                    "doc_02_nota_esplicativa": 3,
                    "doc_04_consuntivo": 2,
                    "doc_06_registro": 5,
                },
                acqua_vals=(890.0, 915.0, 2104.50),
            )
        else:
            create_scheda_for_condominio(
                db,
                condominio=c,
                gestione=c.esercizio_in_corso or "01/01/2026 - 31/12/2026",
                note_intestazione="Scheda Bilancio Procedura 002 pronta per la lavorazione",
                pre_check_up_to=2,
            )
    db.commit()


def seed_initial_data(db: Session):
    if db.query(Condominio).count() > 0:
        seed_rendiconto_if_empty(db)
        return

    now = datetime.utcnow()

    # 1. CONDOMINI (Danea Domustudio)
    c1 = Condominio(
        codice_danea="DN-001",
        nome="Condominio Parco Vittoria",
        indirizzo="Via Vittoria Colonna 24",
        citta="Milano",
        cap="20149",
        codice_fiscale="97451200154",
        iban="IT60X0306909400100000012345",
        numero_unita=36,
        esercizio_in_corso="01/01/2026 - 31/12/2026",
        data_ultima_assemblea="14/05/2026",
        fondo_cassa=28450.00,
        totale_morosita=4120.00,
        note_operative="Portineria mezza giornata (8:00-13:00). Centrale termica centralizzata a condensazione.",
    )
    c2 = Condominio(
        codice_danea="DN-002",
        nome="Residenza Le Magnolie",
        indirizzo="Viale Lombardia 88",
        citta="Milano",
        cap="20131",
        codice_fiscale="97589010158",
        iban="IT88A0503401600000000098765",
        numero_unita=24,
        esercizio_in_corso="01/07/2026 - 30/06/2027",
        data_ultima_assemblea="22/09/2026",
        fondo_cassa=15200.00,
        totale_morosita=1850.00,
        note_operative="Lavori rifacimento facciata interna deliberati. Ascensore Kone matricola 44910.",
    )
    c3 = Condominio(
        codice_danea="DN-003",
        nome="Palazzo San Marco",
        indirizzo="Via San Marco 16",
        citta="Milano",
        cap="20121",
        codice_fiscale="80094120151",
        iban="IT42P0200801600000104455667",
        numero_unita=18,
        esercizio_in_corso="01/01/2026 - 31/12/2026",
        data_ultima_assemblea="10/04/2026",
        fondo_cassa=41900.00,
        totale_morosita=640.00,
        note_operative="Immobile storico vincolato. Cancello carraio automatizzato FAAC.",
    )
    c4 = Condominio(
        codice_danea="DN-004",
        nome="Supercondominio Giardini Est",
        indirizzo="Via Mecenate 76/A-B-C",
        citta="Milano",
        cap="20138",
        codice_fiscale="97811450152",
        iban="IT19K0306909400100000055443",
        numero_unita=64,
        esercizio_in_corso="01/01/2026 - 31/12/2026",
        data_ultima_assemblea="18/06/2026",
        fondo_cassa=54300.00,
        totale_morosita=7890.00,
        note_operative="Tre scale (A, B, C), impianto irrigazione parco e videosorveglianza condominiale.",
    )

    db.add_all([c1, c2, c3, c4])
    db.flush()

    # 2. ANAGRAFICHE & POSIZIONI CONTABILI DANEA
    anagrafiche = [
        Anagrafica(
            codice_danea="AN-101",
            condominio_id=c1.id,
            nome_cognome="Ing. Marco Ferretti",
            email="marco.ferretti@email.it",
            pec="marco.ferretti@ingpec.eu",
            telefono="348 2219044",
            scala_interno="Scala A - Int. 12 (Piano 4)",
            ruolo="Proprietario",
            is_consigliere=True,
            millesimi_generali=48.50,
            saldo_attuale=0.0,
            rate_scadute=0,
            note="Consigliere di riferimento per lavori tecnici e centrale termica.",
        ),
        Anagrafica(
            codice_danea="AN-102",
            condominio_id=c1.id,
            nome_cognome="Dott.ssa Elena Cattaneo",
            email="elena.cattaneo@studiolegale.it",
            pec="elena.cattaneo@milano.pecavvocati.it",
            telefono="335 7781209",
            scala_interno="Scala B - Int. 4 (Piano 1)",
            ruolo="Proprietario",
            is_consigliere=False,
            millesimi_generali=36.20,
            saldo_attuale=1640.00,
            rate_scadute=2,
            note="Richiede sempre invio avvisi anche su PEC.",
        ),
        Anagrafica(
            codice_danea="AN-103",
            condominio_id=c1.id,
            nome_cognome="Roberto Brambilla",
            email="r.brambilla68@gmail.com",
            telefono="340 9912341",
            scala_interno="Scala A - Int. 2 (Piano T)",
            ruolo="Proprietario",
            is_consigliere=False,
            millesimi_generali=52.10,
            saldo_attuale=2480.00,
            rate_scadute=3,
            note="Promesso bonifico di rientro entro fine mese.",
        ),
        Anagrafica(
            codice_danea="AN-201",
            condominio_id=c2.id,
            nome_cognome="Arch. Laura Galli",
            email="laura.galli@architettigalli.it",
            telefono="339 4410982",
            scala_interno="Scala Unica - Int. 18 (Attico)",
            ruolo="Proprietario",
            is_consigliere=True,
            millesimi_generali=74.00,
            saldo_attuale=0.0,
            rate_scadute=0,
            note="Consigliere delegato al controllo capitolato facciate.",
        ),
        Anagrafica(
            codice_danea="AN-202",
            condominio_id=c2.id,
            nome_cognome="Paolo Villa",
            email="paolo.villa@fastwebnet.it",
            telefono="347 6120987",
            scala_interno="Scala Unica - Int. 7 (Piano 2)",
            ruolo="Proprietario",
            is_consigliere=False,
            millesimi_generali=41.30,
            saldo_attuale=1850.00,
            rate_scadute=2,
        ),
        Anagrafica(
            codice_danea="AN-301",
            condominio_id=c3.id,
            nome_cognome="Avv. Stefano Visconti",
            email="s.visconti@viscontilex.it",
            pec="stefano.visconti@pec.it",
            telefono="333 1190844",
            scala_interno="Corpo Nobile - Int. 5",
            ruolo="Proprietario",
            is_consigliere=True,
            millesimi_generali=82.40,
            saldo_attuale=0.0,
            rate_scadute=0,
        ),
        Anagrafica(
            codice_danea="AN-302",
            condominio_id=c3.id,
            nome_cognome="Chiara De Santis",
            email="chiara.desantis@outlook.it",
            telefono="328 5543120",
            scala_interno="Corte Interna - Int. 11",
            ruolo="Proprietario",
            is_consigliere=False,
            millesimi_generali=29.80,
            saldo_attuale=640.00,
            rate_scadute=1,
        ),
        Anagrafica(
            codice_danea="AN-401",
            condominio_id=c4.id,
            nome_cognome="rag. Giorgio Colombo",
            email="giorgio.colombo@commercialisti.mi.it",
            telefono="349 8832110",
            scala_interno="Scala B - Int. 21",
            ruolo="Proprietario",
            is_consigliere=True,
            millesimi_generali=22.40,
            saldo_attuale=0.0,
            rate_scadute=0,
        ),
        Anagrafica(
            codice_danea="AN-402",
            condominio_id=c4.id,
            nome_cognome="Immobiliare Delta S.r.l.",
            email="amministrazione@immobiliaredelta.it",
            pec="immobiliaredelta@legalmail.it",
            telefono="02 5541209",
            scala_interno="Scala C - Int. 4, 5, 6",
            ruolo="Proprietario",
            is_consigliere=False,
            millesimi_generali=68.90,
            saldo_attuale=5140.00,
            rate_scadute=4,
            note="Sollecito formale da inviare via PEC per n. 3 unità.",
        ),
        Anagrafica(
            codice_danea="AN-403",
            condominio_id=c4.id,
            nome_cognome="Davide Moretti",
            email="davide.moretti@gmail.com",
            telefono="345 1092834",
            scala_interno="Scala A - Int. 9",
            ruolo="Proprietario",
            is_consigliere=False,
            millesimi_generali=19.50,
            saldo_attuale=2750.00,
            rate_scadute=3,
        ),
    ]
    db.add_all(anagrafiche)
    db.flush()

    # 3. FORNITORI (Sincronizzati Danea + DettoFatto)
    f1 = Fornitore(
        codice_danea="FO-01",
        dettofatto_id="DF-SUP-101",
        ragione_sociale="IdroTermica Milanese S.r.l.",
        categoria="Idraulica & Caldaie",
        referente="Geom. Claudio Riva",
        email="interventi@idrotermicamilanese.it",
        pec="idrotermicamilanese@pec.it",
        telefono="02 4891122",
        partita_iva="04112900961",
        rating_affidabilita=4.9,
        interventi_attivi=2,
        fatture_da_pagare=2450.00,
    )
    f2 = Fornitore(
        codice_danea="FO-02",
        dettofatto_id="DF-SUP-102",
        ragione_sociale="ElettroService Impianti S.n.c.",
        categoria="Elettricista & Automazioni",
        referente="Matteo Sartori",
        email="assistenza@elettroservice-mi.it",
        telefono="335 6019283",
        partita_iva="07891230964",
        rating_affidabilita=4.7,
        interventi_attivi=1,
        fatture_da_pagare=890.00,
    )
    f3 = Fornitore(
        codice_danea="FO-03",
        dettofatto_id="DF-SUP-103",
        ragione_sociale="Elevatori Nord Italia S.p.A.",
        categoria="Ascensori",
        referente="Pronto Intervento 24h",
        email="manutenzioni@elevatorinord.it",
        telefono="800 912300",
        partita_iva="01239870152",
        rating_affidabilita=4.6,
        interventi_attivi=1,
        fatture_da_pagare=1600.00,
    )
    f4 = Fornitore(
        codice_danea="FO-04",
        dettofatto_id="DF-SUP-104",
        ragione_sociale="EdilRestauri Lombardi S.r.l.",
        categoria="Edilizia & Coperture",
        referente="Arch. Franco Lodi",
        email="tecnico@edilrestaurilombardi.it",
        telefono="02 7712904",
        partita_iva="09912440968",
        rating_affidabilita=4.8,
        interventi_attivi=1,
        fatture_da_pagare=5400.00,
    )
    f5 = Fornitore(
        codice_danea="FO-05",
        dettofatto_id="DF-SUP-105",
        ragione_sociale="Verde & Pulito Servizi Soc. Coop.",
        categoria="Pulizie & Giardinaggio",
        referente="Sig.ra Teresa Conti",
        email="operativo@verdeepulito.it",
        telefono="02 3391044",
        partita_iva="05567120963",
        rating_affidabilita=4.5,
        interventi_attivi=0,
        fatture_da_pagare=1920.00,
    )
    db.add_all([f1, f2, f3, f4, f5])
    db.flush()

    # 4. TICKET DETTOFATTO
    tickets = [
        TicketManutenzione(
            codice_dettofatto="DF-2026-1036",
            titolo="Perdita colonna scarico verticale tra 3° e 4° piano Scala A",
            descrizione="Macchia di umidità in espansione sul soffitto del bagno Int. 9 con gocciolamento attivo.",
            categoria="Idraulica & Caldaie",
            priorita="Urgente",
            stato="Sopralluogo",
            condominio_id=c1.id,
            fornitore_id=f1.id,
            segnalante="Ing. Marco Ferretti (Consigliere)",
            costo_stimato=650.0,
            sincronizzato_dettofatto=True,
            data_apertura=now - timedelta(hours=18),
            note_avanzamento="IdroTermica conferma uscita con termocamera oggi alle ore 15:30.",
        ),
        TicketManutenzione(
            codice_dettofatto="DF-2026-1037",
            titolo="Blocco intermittente porta cabina ascensore al piano terra",
            descrizione="La fotocellula della porta interna rimane in blocco impedendo la richiusura.",
            categoria="Ascensori",
            priorita="Urgente",
            stato="Assegnato a Fornitore",
            condominio_id=c2.id,
            fornitore_id=f3.id,
            segnalante="Arch. Laura Galli",
            costo_stimato=320.0,
            sincronizzato_dettofatto=True,
            data_apertura=now - timedelta(hours=5),
            note_avanzamento="Chiamata aperta su portale DettoFatto; tecnico di zona allertato.",
        ),
        TicketManutenzione(
            codice_dettofatto="DF-2026-1038",
            titolo="Cancello carraio bloccato in apertura su Via San Marco 16",
            descrizione="Pistone idraulico anta destra rumoroso e finecorsa fuori asse.",
            categoria="Elettricista & Automazioni",
            priorita="Alta",
            stato="In Corso",
            condominio_id=c3.id,
            fornitore_id=f2.id,
            segnalante="Avv. Stefano Visconti",
            costo_stimato=480.0,
            sincronizzato_dettofatto=True,
            data_apertura=now - timedelta(days=2),
            note_avanzamento="Ricambio ordinato da ElettroService, montaggio previsto domani mattina.",
        ),
        TicketManutenzione(
            codice_dettofatto="DF-2026-1039",
            titolo="Sostituzione tegole smosse dopo temporale su Scala B",
            descrizione="Verifica infiltrazione sottotetto e riposizionamento 8 coppi.",
            categoria="Edilizia & Coperture",
            priorita="Normale",
            stato="Aperto",
            condominio_id=c4.id,
            fornitore_id=f4.id,
            segnalante="rag. Giorgio Colombo",
            costo_stimato=850.0,
            sincronizzato_dettofatto=True,
            data_apertura=now - timedelta(days=3),
            note_avanzamento="In attesa di preventivo fotografico su DettoFatto.",
        ),
    ]
    db.add_all(tickets)
    db.flush()

    # 5. COMUNICAZIONI (Smart Inbox Gmail & PEC con analisi Segretario AI)
    raw_emails = [
        {
            "canale": "Gmail",
            "mittente_nome": "Ing. Marco Ferretti",
            "mittente_email": "marco.ferretti@email.it",
            "oggetto": "URGENTE: Perdita acqua dal soffitto bagno Scala A Parco Vittoria",
            "corpo": (
                "Buongiorno Amministratore,\n"
                "le scrivo con urgenza dal Condominio Parco Vittoria (Scala A - Int. 12). "
                "Da stamattina notiamo una perdita d'acqua importante in corrispondenza della colonna verticale del bagno. "
                "Può mandare subito l'idraulico dello studio e aprire il ticket su DettoFatto?\n"
                "Grazie mille,\nMarco Ferretti"
            ),
            "condominio_id": c1.id,
        },
        {
            "canale": "Gmail",
            "mittente_nome": "Paolo Villa",
            "mittente_email": "paolo.villa@fastwebnet.it",
            "oggetto": "Richiesta verifica saldo rate e IBAN Residenza Le Magnolie",
            "corpo": (
                "Gentile Studio,\n"
                "vorrei sapere a quanto ammonta esattamente il mio saldo scoperto per l'appartamento Int. 7 "
                "di Viale Lombardia 88 (Residenza Le Magnolie) e avere conferma dell'IBAN condominiale aggiornato per disporre il bonifico in settimana.\n"
                "Saluti,\nPaolo Villa"
            ),
            "condominio_id": c2.id,
        },
        {
            "canale": "PEC",
            "mittente_nome": "Arch. Laura Galli",
            "mittente_email": "laura.galli@architettigalli.it",
            "oggetto": "Richiesta inserimento punto OdG prossima assemblea Le Magnolie + segnalazione ascensore",
            "corpo": (
                "Gentile Amministratore,\n"
                "in qualità di consigliere di Residenza Le Magnolie chiedo di inserire all'ordine del giorno della prossima assemblea "
                "la valutazione delle varianti cromatiche per la tinteggiatura del cortile interno.\n"
                "Inoltre segnalo che l'ascensore oggi si è bloccato due volte al piano terra.\n"
                "Cordiali saluti,\nArch. Laura Galli"
            ),
            "condominio_id": c2.id,
        },
        {
            "canale": "Gmail",
            "mittente_nome": "IdroTermica Milanese S.r.l.",
            "mittente_email": "interventi@idrotermicamilanese.it",
            "oggetto": "Preventivo sostituzione valvola miscelatrice Centrale Termica Parco Vittoria",
            "corpo": (
                "Spett.le Studio,\n"
                "in allegato trasmettiamo preventivo n. 248/2026 di € 1.180 + IVA per la sostituzione della valvola miscelatrice "
                "presso il Condominio Parco Vittoria (Via Vittoria Colonna 24) riscontrata durante la manutenzione pre-invernale.\n"
                "Restiamo in attesa di Vs. autorizzazione su DettoFatto per procedere.\n"
                "Geom. Claudio Riva"
            ),
            "condominio_id": c1.id,
        },
        {
            "canale": "PEC",
            "mittente_nome": "Avv. Stefano Visconti",
            "mittente_email": "s.visconti@viscontilex.it",
            "oggetto": "Palazzo San Marco - Malfunzionamento cancello carraio e richiesta copia verbale",
            "corpo": (
                "Caro Amministratore,\n"
                "ti segnalo che il cancello carraio di Via San Marco 16 fatica nuovamente a chiudersi la sera. "
                "Potresti sollecitare l'elettricista e inviarmi copia dell'ultimo verbale assembleare?\n"
                "Un cordiale saluto,\nStefano Visconti"
            ),
            "condominio_id": c3.id,
        },
    ]

    for idx, em in enumerate(raw_emails):
        analysis = AISecretaryService.analyze_communication(
            db,
            em["mittente_nome"],
            em["mittente_email"],
            em["oggetto"],
            em["corpo"],
            em["condominio_id"],
        )
        com = Comunicazione(
            gmail_message_id=f"msg_2026_00{idx+1}",
            canale=em["canale"],
            mittente_nome=em["mittente_nome"],
            mittente_email=em["mittente_email"],
            oggetto=em["oggetto"],
            corpo=em["corpo"],
            data_ricezione=now - timedelta(hours=(idx + 1) * 2),
            letta=False,
            archiviata=False,
            condominio_id=analysis["condominio_id"],
            anagrafica_id=analysis["anagrafica_id"],
            categoria_ai=analysis["categoria_ai"],
            urgenza_ai=analysis["urgenza_ai"],
            riassunto_ai=analysis["riassunto_ai"],
            azione_suggerita_ai=analysis["azione_suggerita_ai"],
            tipo_azione_rapida=analysis["tipo_azione_rapida"],
            bozza_risposta_ai=analysis["bozza_risposta_ai"],
            stato_lavorazione="Da gestire",
        )
        db.add(com)

    # 6. SCADENZE & GOOGLE CALENDAR
    scadenze = [
        ScadenzaTask(
            google_event_id="gcal_001",
            titolo="Assemblea Straordinaria - Lavori Cortile e Centrale Termica",
            descrizione="2a Convocazione presso Sala Riunioni Studio / Videoconferenza Meet",
            tipo="Assemblea",
            data_scadenza=(now + timedelta(days=2)).strftime("%Y-%m-%d"),
            ora="18:30",
            priorita="Critica",
            completato=False,
            condominio_id=c1.id,
            sincronizzato_gcal=True,
        ),
        ScadenzaTask(
            google_event_id="gcal_002",
            titolo="Versamento Ritenute d'Acconto F24 Condomini (Scadenza Mensile)",
            descrizione="Esportare distinta F24 da Danea Domustudio e procedere all'invio telematico.",
            tipo="Pagamento/F24",
            data_scadenza=(now + timedelta(days=1)).strftime("%Y-%m-%d"),
            ora="11:00",
            priorita="Critica",
            completato=False,
            condominio_id=None,
            sincronizzato_gcal=True,
        ),
        ScadenzaTask(
            google_event_id="gcal_003",
            titolo="Sopralluogo con EdilRestauri e Consiglieri per Capitolato Facciata",
            descrizione="Incontro in loco con Arch. Laura Galli e Arch. Franco Lodi",
            tipo="Appuntamento",
            data_scadenza=(now + timedelta(days=3)).strftime("%Y-%m-%d"),
            ora="10:00",
            priorita="Alta",
            completato=False,
            condominio_id=c2.id,
            sincronizzato_gcal=True,
        ),
        ScadenzaTask(
            google_event_id="gcal_004",
            titolo="Invio Solleciti Bonari Rate Scadute (Supercondominio Giardini Est)",
            descrizione="Verifica incassi Danea e invio PEC alle posizioni con oltre 2 rate insolute.",
            tipo="Adempimento",
            data_scadenza=(now + timedelta(days=4)).strftime("%Y-%m-%d"),
            ora="15:00",
            priorita="Alta",
            completato=False,
            condominio_id=c4.id,
            sincronizzato_gcal=True,
        ),
        ScadenzaTask(
            google_event_id="gcal_005",
            titolo="Verifica Biennale Impianto Messa a Terra & Ascensore DPR 162/99",
            descrizione="Presenza tecnico incaricato e ditta Elevatori Nord Italia.",
            tipo="Manutenzione Periodica",
            data_scadenza=(now + timedelta(days=6)).strftime("%Y-%m-%d"),
            ora="09:00",
            priorita="Media",
            completato=False,
            condominio_id=c3.id,
            sincronizzato_gcal=True,
        ),
    ]
    db.add_all(scadenze)

    # 7. CONFIGURAZIONI INTEGRAZIONI
    now_fmt = datetime.now().strftime("%d/%m/%Y %H:%M")
    configs = [
        IntegrationConfig(
            chiave="danea_sync",
            valore="C:\\Danea Domustudio\\Archivi",
            attivo=True,
            ultimo_sync=now_fmt,
            stato_connessione="Attivo • 4 Condomini e 10 Anagrafiche allineate",
        ),
        IntegrationConfig(
            chiave="dettofatto_sync",
            valore="https://api.dettofatto.it/v1/webhook",
            attivo=True,
            ultimo_sync=now_fmt,
            stato_connessione="Connesso • 4 Ticket e 5 Fornitori sincronizzati",
        ),
        IntegrationConfig(
            chiave="google_sync",
            valore="amministratore@studiocondomini.it",
            attivo=True,
            ultimo_sync=now_fmt,
            stato_connessione="Gmail & Google Calendar sincronizzati",
        ),
        IntegrationConfig(
            chiave="ai_provider",
            valore="gemini",
            attivo=True,
            ultimo_sync=now_fmt,
            stato_connessione="Segretario AI Attivo (Gemini + Motore Esperto)",
        ),
        IntegrationConfig(
            chiave="nome_studio",
            valore="Studio Amministrazioni Condominiali",
            attivo=True,
        ),
        IntegrationConfig(
            chiave="firma_email",
            valore="Cordiali saluti,\nL'Amministratore\nStudio Amministrazioni Condominiali\nTel. 02 0000000 - PEC: studio@pec.it",
            attivo=True,
        ),
    ]
    db.add_all(configs)
    db.commit()
    seed_rendiconto_if_empty(db)

