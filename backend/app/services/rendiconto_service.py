import json
from typing import Dict, Any, List

PROMPT_SLIDE_NOTEBOOKLM = """Agisci come un esperto di comunicazione condominiale e consulente contabile per l'Ing. Gian Carlo Serra (Studio Serra). 
Analizzando attentamente la fonte allegata (Rendiconto), crea una presentazione a slide completa, professionale, chiara e visivamente schematica, pensata per illustrare il bilancio all'assemblea dei condòmini.

Obiettivo della presentazione: rassicurare i condòmini, mostrare la massima trasparenza, evidenziare la precisione contabile (scostamento minimo), spiegare i lavori svolti e illustrare le novità organizzative e il nuovo preventivo.

Per ogni slide indica:
- Numero e Titolo della slide
- Sottotitolo / Messaggio chiave (Key Takeaway in una riga)
- Punti elenco sintetici (massimo 3-4 punti, stile frammento con parole chiave in grassetto, senza muri di testo)
- Box Dati / Metriche in evidenza (cifre esatte in Euro e percentuali)
- Nota per il relatore (cosa dire a voce per rassicurare l'assemblea)

Struttura le slide seguendo questo percorso logico:
1. Slide 1 - Copertina: nome del condominio, anno di gestione, Amministratore Ing. Gian Carlo Serra - "Il condominio trasparente: tutto limpido, tutto evidente".
2. Slide 2 - Sintesi della Gestione & Obiettivi: I tre pilastri dello Studio Serra (Sicurezza, Servizi, Spese/Risparmio) e continuità dei criteri contabili (Legge 220/2012, linee guida ANACI).
3. Slide 3 - Quadro Economico Consuntivo (I Numeri Chiave): 
   - Preventivo vs Consuntivo (evidenziare lo scostamento e giustificarlo).
   - Tasso di puntualità nei versamenti e morosità eventuali.
4. Slide 4 - Ripartizione delle Spese secondo i capitoli di spesa.
5. Slide 5 - Il Valore del Risparmio e Manutenzioni Svolte:
   - Focus Risparmio: circa 150 € risparmiati grazie all'invio diretto telematico dei modelli 770 e CU da parte dell'amministratore senza parcella del commercialista esterno.
   - Opere dell'anno.
6. Slide 6 - Situazione di Cassa e Trasparenza Bancaria:
   - Riconciliazione totale con estratto conto bancario.
   - Gestione precisa e cassa a pareggio.
7. Slide 7 - Innovazione & Nuova Comunicazione:
   - Utilizzo portale web e app "MioCondominio".
   - Novità: canale Telegram "DettoFatto Condomini" (codice YERJE) per segnalare guasti ai fornitori senza il caos dei gruppi WhatsApp, ma utilizzabile ora anche da WhatsApp.
   - Presenza sul posto: sopralluoghi programmati dell'Ing. Serra ogni 4 mesi.
8. Slide 8 - Sicurezza, Antincendio (GSA) & Privacy:
   - Registro Analisi Sicurezza (RAS), conformità DM 25/01/2019 (GSA), gestione privacy GDPR.
9. Slide 9 - Nuovo Preventivo per la prossima gestione:
   - Spesa complessiva ordinaria prevista.
   - Proposta delle rate ordinarie.
10. Slide 10 - Raccomandazioni di Buon Vicinato & Conclusione:
    - Cura dei consumi idrici (controllo perdite cassette WC), rispetto orari del silenzio (22-08 e 12-14), decoro facciate.
    - Chiusura con il recapito dello Studio Serra e sessione Q&A per l'approvazione del rendiconto.

Genera il testo in italiano formale, rassicurante e trasparente."""

PROMPT_PODCAST_NOTEBOOKLM = """Agisci come un comunicatore empatico, rassicurante e professionale incaricato di condurre un podcast informativo audio destinato a tutti i residenti e proprietari del Condominio. 

Basandoti esclusivamente sulla Nota Esplicativa e sul Rendiconto redatto dall'Ing. Gian Carlo Serra dello Studio Serra:

Obiettivo dell'audio: Spiegare in modo semplice, caldo e trasparente come sono stati spesi i soldi del condominio, perché il bilancio è virtuoso, quali lavori tangibili sono stati fatti e quali novità pratiche migliorano la vita di tutti i giorni. Evita il burocratese e trasforma i numeri in benefici reali.

Struttura la narrazione del podcast (durata ideale circa 10-15 minuti d'ascolto) toccando i seguenti punti in sequenza:
1. Benvenuto e Contesto: Saluto caloroso ai condòmini del condominio. Citare la filosofia dello Studio Serra: "il condominio trasparente, tutto limpido, tutto evidente".
2. I Conti in Pillole (La Buona Notizia): 
   - Spiegare la chiusura del bilancio rispetto a quanto preventivato e motivare le eventuali differenze. 
   - Evidenziare il tasso di versamento delle rate da parte dei residenti.
3. Dove sono finiti i soldi? (I Lavori Visibili e la Cura dello Stabile): elencare i lavori e le manutenzioni svolte. Evidenziare se ci sono stati gli interventi "invisibili ma vitali": verifiche di sicurezza elettrica, messa a terra e presidi antincendio, ecc. Elenca brevemente le spese dell'anno secondo i capitoli di spesa concludendo con la ripresa del debito della gestione precedente, il totale delle spese, il totale dei versamenti e la differenza che andrà nel nuovo preventivo. Con particolare attenzione a quanto riportato nella sezione "Analisi delle voci di spesa" della nota.
4. Come l'Amministratore vi ha fatto risparmiare:
   - Raccontare con tono chiaro che l'Ing. Serra si è occupato direttamente dell'invio dei modelli fiscali 770 e CU aprendo il canale con l'Agenzia delle Entrate, risparmiando circa 150 € di commercialista esterno per le tasche del condominio.
5. Comunicare meglio senza lo stress di WhatsApp:
   - Spiegare il portale MioCondominio.
   - Introdurre la novità utilissima: il sistema Telegram "DettoFatto" per segnalare guasti direttamente a chi di dovere, evitando discussioni e notifiche a raffica nelle chat WhatsApp, ma utilizzabile ora anche da WhatsApp.
   - Annunciare i sopralluoghi periodici dell'amministratore ogni 4 mesi per incontrarsi di persona.
6. Uno sguardo al Futuro (Preventivo nuova gestione):
   - La spesa per il prossimo anno.
   - Suddivisione in rate comode del preventivo con promemoria automatici 10 giorni prima per non dimenticarsi.
7. Due consigli d'oro da buon vicino:
   - Attenzione alle perdite delle cassette del WC per non sprecare acqua e soldi.
   - Rispetto degli orari di riposo e della raccolta differenziata.
8. Saluto finale e disponibilità: Ricordare i contatti dello studio a Bergamo e Chiari, ricordando che l'amministratore è un alleato per dare valore alla casa di ciascuno.

Tono di voce: Cordiale, colloquiale, rassicurante, professionale, limpido ed educativo."""


# Definizione completa dei 63 passaggi del "modello 5" (MODELLO SCHEDA BILANCIO3.xlsm)
DEFAULT_PASSI_MODELLO_5: List[Dict[str, Any]] = [
    # --- FASE 1: CONTROLLI PRELIMINARI & RICONCILIAZIONE ---
    {
        "ordine": 1,
        "numero_codice": "1",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare mail da gestire del condominio in oggetto",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 2,
        "numero_codice": "2",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare bilanciamento situazione contabile",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 3,
        "numero_codice": "3",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare che le Rate versate siano nella competenza corretta e con data entro la gestione e che non facciano parte di Conto Titoli",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Rate registrate sino al giorno": ""},
    },
    {
        "ordine": 4,
        "numero_codice": "4",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Leggere Regolamento di Condominio",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 5,
        "numero_codice": "5",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare costi fotocopie (inserire a bilancio se necessario)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 6,
        "numero_codice": "6",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare assemblee straordinarie fatte: fare fattura",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Data assemblea straord.": "", "Oggetto": ""},
    },
    {
        "ordine": 7,
        "numero_codice": "7",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Se con DIPENDENTE: verificare rateo fondo TFR maturato alla chiusura del bilancio",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 8,
        "numero_codice": "8",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare Gestione Inquilini e fare fattura",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {
            "N. unità con gestione inquilino": "",
            "Quota gestione per unità (€)": "35",
            "Compenso Gestione Inquilini (€)": "0,00",
        },
    },
    {
        "ordine": 9,
        "numero_codice": "9",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Spostare le sanzioni nelle spese bancarie",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 10,
        "numero_codice": "10",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Leggere Verbale Assemblea precedente",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 11,
        "numero_codice": "11",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Applicare gli interessi di morosità se previsti (solo interessi legali). Creare DOC INTERESSI DI MOROSITA'",
        "ha_pagine": True,
        "doc_codice": "doc_14_interessi",
        "num_pagine": 0,
        "campi_extra": {"% e gg": ""},
    },
    {
        "ordine": 12,
        "numero_codice": "12",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Redigere BILANCIO STRAORDINARIO se presente (a: Copertina; b: Bilancio consuntivo stra; c: Riparto)",
        "ha_pagine": True,
        "doc_codice": "doc_03_straordinario",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 13,
        "numero_codice": "13",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Verificare contante cassaforte",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Contante €": ""},
    },
    {
        "ordine": 14,
        "numero_codice": "14",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Riconciliazione bancaria + verifica corrispondenza estratto conto risorsa",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 15,
        "numero_codice": "15",
        "sezione": "1. Controlli Preliminari & Riconciliazione",
        "chi_lo_fa": "G",
        "descrizione": "Crea DOC REGISTRO DI CONTABILITA' (estratto conto bancario) + Verifiche Risorse",
        "ha_pagine": True,
        "doc_codice": "doc_06_registro",
        "num_pagine": 0,
        "campi_extra": {},
    },

    # --- FASE 2: CONTATORI, PEZZE GIUSTIFICATIVE & BILANCIO CONSUNTIVO ---
    {
        "ordine": 16,
        "numero_codice": "15b",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare CONTATORI acqua (crea DOC CONTATORI ACQUA) [vedi Calcolatore Acqua Eccedente]",
        "ha_pagine": True,
        "doc_codice": "doc_12_acqua",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 17,
        "numero_codice": "16",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare CONTATORI riscaldamento (crea DOC CONTATORI RISCALDAMENTO)",
        "ha_pagine": True,
        "doc_codice": "doc_13_riscaldamento",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 18,
        "numero_codice": "17",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare la competenza delle fatture nel bilancio attuale",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 19,
        "numero_codice": "18",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Crea DOC CRITERI DI RIPARTO DELLE SPESE",
        "ha_pagine": True,
        "doc_codice": "doc_15_criteri",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 20,
        "numero_codice": "19",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare se ci sono fatture doppie della stessa ditta",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 21,
        "numero_codice": "20",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare che gli estratti conto scansionati ci siano tutti + caricare negli allegati Danea tutti gli EC della gestione",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 22,
        "numero_codice": "21",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare che le scansioni delle pezze giustificative dell'esercizio ci siano",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 23,
        "numero_codice": "22",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verifica bilancio consuntivo e modifica descrizioni e conti + VERIFICARE POLIZZA FABBRICATO (scadenze)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Scadenza Polizza": ""},
    },
    {
        "ordine": 24,
        "numero_codice": "23",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Controllo nel bilancio vecchio i valori nelle tabelle individuali rispetto a proprietari e ex proprietari e inquilini",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 25,
        "numero_codice": "24",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verifica dal bilancio precedente eventuali spese personali e inseriscile (spese parcheggi, rimborsi acqua, spese ricorrenti, ecc)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 26,
        "numero_codice": "25",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Crea BILANCIO CONSUNTIVO per conto, suo controllo con bilancio precedente e crea INFOGRAFICA con NotebookLM",
        "ha_pagine": True,
        "doc_codice": "doc_04_consuntivo",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 27,
        "numero_codice": "26",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Controllare doc prossima assemblea",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 28,
        "numero_codice": "27",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Apertura nuova gestione su Danea e aggiornamento codici di riferimento Danea su pezze nuovo anno",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 29,
        "numero_codice": "28",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Controllo dei valori nelle tabelle rispetto a proprietari e ex proprietari e inquilini",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 30,
        "numero_codice": "29",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Aggiornare fornitori secondo il bilancio consuntivo e verificare presenza contratti",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 31,
        "numero_codice": "30",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verifica corrispondenza con saldo precedente",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Precedente (€)": "", "Attuale (€)": ""},
    },
    {
        "ordine": 32,
        "numero_codice": "31",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Controllo e crea BILANCIO COMPARATIVO: consuntivo attuale / preventivo",
        "ha_pagine": True,
        "doc_codice": "doc_08_comparativo",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 33,
        "numero_codice": "32",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Crea RIPARTO BILANCIO CONSUNTIVO secondo quanto fatto l'anno precedente in excel (verificare unità di misura delle tabelle)",
        "ha_pagine": True,
        "doc_codice": "doc_09_riparto_cons",
        "num_pagine": 0,
        "campi_extra": {"Conti / Note": ""},
    },
    {
        "ordine": 34,
        "numero_codice": "33",
        "sezione": "2. Contatori, Pezze & Bilancio Consuntivo",
        "chi_lo_fa": "G",
        "descrizione": "Verificare fondo e creare tabella di riparto (se importo > 0: CREA IL RIPARTO DEL FONDO e salvalo)",
        "ha_pagine": True,
        "doc_codice": "doc_07b_fondo",
        "num_pagine": 0,
        "campi_extra": {"Importo Fondo (€)": "0", "Natura Fondo": ""},
    },

    # --- FASE 3: PREVENTIVO, RIPARTO RATEALE & VERIFICHE ---
    {
        "ordine": 35,
        "numero_codice": "34",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Creare PREVENTIVO SINTETICO per tabella nuovo anno",
        "ha_pagine": True,
        "doc_codice": "doc_16_preventivo",
        "num_pagine": 0,
        "campi_extra": {"Importo Preventivo (€)": ""},
    },
    {
        "ordine": 36,
        "numero_codice": "35",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Controllo saldo precedente nel preventivo",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 37,
        "numero_codice": "36",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Creare RIPARTO PREVENTIVO sintetico per tabelle",
        "ha_pagine": True,
        "doc_codice": "doc_17_riparto_prev",
        "num_pagine": 0,
        "campi_extra": {"Conti / Note": ""},
    },
    {
        "ordine": 38,
        "numero_codice": "37",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Riparto rateale (eliminare importi sotto i 50 euro) -> VERIFICA CON AI: CONDORATE: salva grafico",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Date scadenze rate": ""},
    },
    {
        "ordine": 39,
        "numero_codice": "38",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "RIPARTO RATEALE: crea doc e verifica la correttezza dell'IBAN della banca riportata",
        "ha_pagine": True,
        "doc_codice": "doc_18_rate",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 40,
        "numero_codice": "39",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Verificare sinistri aperti o chiusi: (data + oggetto)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Data sinistro": "", "Oggetto sinistro": ""},
    },
    {
        "ordine": 41,
        "numero_codice": "40a",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Calendario (Google Calendar - usare carta intestata su Danea)",
        "ha_pagine": True,
        "doc_codice": "doc_11_calendar",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 42,
        "numero_codice": "40b",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Verificare procedure legali: (data + oggetto)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Data e Oggetto legali": ""},
    },
    {
        "ordine": 43,
        "numero_codice": "42",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Verificare solleciti di pagamento (in file excel condomini e recuperi crediti aperti)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 44,
        "numero_codice": "43",
        "sezione": "3. Preventivo, Rate & Verifiche Condominio",
        "chi_lo_fa": "G",
        "descrizione": "Verificare accessi in MioCondominio",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Utenti": "", "Accessi": "", "Mail": ""},
    },

    # --- FASE 4: FASCICOLO RENDICONTO, NOTA ESPLICATIVA, AI & CONVOCAZIONE ---
    {
        "ordine": 45,
        "numero_codice": "44",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Creare e salvare ELENCO ATTIVITA' (a.dettofatto.cloud: STATISTICHE - REPORT)",
        "ha_pagine": True,
        "doc_codice": "doc_10_attivita",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 46,
        "numero_codice": "45",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Verificare e creare SITUAZIONE ECONOMICO/PATRIMONIALE",
        "ha_pagine": True,
        "doc_codice": "doc_05_sit_patrimoniale",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 47,
        "numero_codice": "46",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Creare DETTAGLIO DEBITI CREDITI (da situazione contabile con elenco dettagliato)",
        "ha_pagine": True,
        "doc_codice": "doc_07a_debiti_crediti",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 48,
        "numero_codice": "47",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Fare e creare NOTA ESPLICATIVA (questioni pendenti 10 anni, rapporti in corso, info patrimoniali: reddito, casa custode, postuma decennale, affitto a caldo, IMU, posti auto)",
        "ha_pagine": True,
        "doc_codice": "doc_02_nota_esplicativa",
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 49,
        "numero_codice": "48",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Stampare i Documenti del Rendiconto con numero pagine corrette (vedi tabella Documenti da Allegare)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 50,
        "numero_codice": "49",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Salvare negli allegati di Danea i PDF creati",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 51,
        "numero_codice": "50",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Creare e salvare in Danea i Bilanci individuali",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 52,
        "numero_codice": "51",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Prenotare sala assemblea",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {"Presso": "", "Data riunione": "", "Ora riunione": ""},
    },
    {
        "ordine": 53,
        "numero_codice": "52",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Creare ordine del giorno per assemblea",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 54,
        "numero_codice": "53",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Unisci i documenti in un unico file Rendiconto",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 55,
        "numero_codice": "54",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "PRODUCI LA PRESENTAZIONE E IL PODCAST DEL RENDICONTO su NOTEBOOK LM e PUBBLICALA SU DANEA (vedi Prompt Slide e Prompt Podcast)",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 56,
        "numero_codice": "55",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "PRODUCI L'ANALISI DI CONDOCERTA PER VERIFICARE CRITICITA' DEL RENDICONTO",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 57,
        "numero_codice": "56",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Inviare convocazioni con allegati",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 58,
        "numero_codice": "57",
        "sezione": "4. Fascicolo Rendiconto, Nota Esplicativa & AI",
        "chi_lo_fa": "G",
        "descrizione": "Inviare Rendiconto agli inquilini",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },

    # --- FASE 5: DOPO ASSEMBLEA ---
    {
        "ordine": 59,
        "numero_codice": "58",
        "sezione": "5. Adempimenti Dopo Assemblea",
        "chi_lo_fa": "G",
        "descrizione": "Redigere verbale",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 60,
        "numero_codice": "59",
        "sezione": "5. Adempimenti Dopo Assemblea",
        "chi_lo_fa": "G",
        "descrizione": "Recuperare firma Presidente e Segretario",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 61,
        "numero_codice": "60",
        "sezione": "5. Adempimenti Dopo Assemblea",
        "chi_lo_fa": "G",
        "descrizione": "Inviare verbale",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 62,
        "numero_codice": "61",
        "sezione": "5. Adempimenti Dopo Assemblea",
        "chi_lo_fa": "G",
        "descrizione": "Aggiornare/inviare scadenze RATE su DettoFatto e appuntamenti in condominio dell'amministratore",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
    {
        "ordine": 63,
        "numero_codice": "62",
        "sezione": "5. Adempimenti Dopo Assemblea",
        "chi_lo_fa": "G",
        "descrizione": "Invio eventuali MAV",
        "ha_pagine": False,
        "doc_codice": None,
        "num_pagine": 0,
        "campi_extra": {},
    },
]

# Voci di controllo della sezione "DA FARE / SENZA PERIODO GESTITO / NOTA ESPLICATIVA" (righe 70-89 di modello 5)
DEFAULT_NOTA_ESPLICATIVA_CHECKS: List[Dict[str, Any]] = [
    {"codice": "01", "titolo": "01 Estratti conto NUOVO ANNO", "gruppo": "Controlli Nuovo Anno", "fatto": False, "note": ""},
    {"codice": "02", "titolo": "02 Scritture contabili NUOVO ANNO", "gruppo": "Controlli Nuovo Anno", "fatto": False, "note": ""},
    {"codice": "09", "titolo": "09 Comande", "gruppo": "Controlli Nuovo Anno", "fatto": False, "note": ""},
    {"codice": "03a", "titolo": "03 Rapporti in corso: Appalti", "gruppo": "03 Rapporti in corso (contratti e incarichi)", "fatto": False, "note": ""},
    {"codice": "03b", "titolo": "03 Rapporti in corso: Preventivi approvati", "gruppo": "03 Rapporti in corso (contratti e incarichi)", "fatto": False, "note": ""},
    {"codice": "03c", "titolo": "03 Rapporti in corso: A chiamata", "gruppo": "03 Rapporti in corso (contratti e incarichi)", "fatto": False, "note": ""},
    {"codice": "03d", "titolo": "03 Rapporti in corso: Per comportamento concludente", "gruppo": "03 Rapporti in corso (contratti e incarichi)", "fatto": False, "note": ""},
    {"codice": "04", "titolo": "04 Inventario beni mobili", "gruppo": "Patrimonio & Inventario", "fatto": False, "note": ""},
    {"codice": "05a", "titolo": "05 Info non numerali: Controversie - contenziosi", "gruppo": "05 Informazioni con rilevanza non numerale", "fatto": False, "note": ""},
    {"codice": "05b", "titolo": "05 Info non numerali: Recupero crediti", "gruppo": "05 Informazioni con rilevanza non numerale", "fatto": False, "note": ""},
    {"codice": "05c", "titolo": "05 Info non numerali: Garanzie prestate", "gruppo": "05 Informazioni con rilevanza non numerale", "fatto": False, "note": ""},
    {"codice": "05d", "titolo": "05 Info non numerali: Garanzie ricevute", "gruppo": "05 Informazioni con rilevanza non numerale", "fatto": False, "note": ""},
    {"codice": "05e", "titolo": "05 Info non numerali: Beni di terzi", "gruppo": "05 Informazioni con rilevanza non numerale", "fatto": False, "note": ""},
    {"codice": "05f", "titolo": "05 Info non numerali: Costo messa a norma impianti", "gruppo": "05 Informazioni con rilevanza non numerale", "fatto": False, "note": ""},
    {"codice": "06", "titolo": "06 Richieste", "gruppo": "Altre Verifiche Nota Esplicativa", "fatto": False, "note": ""},
    {"codice": "07", "titolo": "07 Certificazioni", "gruppo": "Altre Verifiche Nota Esplicativa", "fatto": False, "note": ""},
    {"codice": "08", "titolo": "08 Questioni pendenti (doc mancanti ultimi 10 anni)", "gruppo": "Altre Verifiche Nota Esplicativa", "fatto": False, "note": ""},
    {"codice": "pat_1", "titolo": "Info Patrimoniali: Tutto ciò che produce reddito", "gruppo": "Informazioni Patrimoniali (Nota Esplicativa)", "fatto": False, "note": ""},
    {"codice": "pat_2", "titolo": "Info Patrimoniali: Valore casa custode", "gruppo": "Informazioni Patrimoniali (Nota Esplicativa)", "fatto": False, "note": ""},
    {"codice": "pat_3", "titolo": "Info Patrimoniali: Postuma decennale", "gruppo": "Informazioni Patrimoniali (Nota Esplicativa)", "fatto": False, "note": ""},
    {"codice": "pat_4", "titolo": "Info Patrimoniali: Affitto a caldo (caldaie, ascensori, ecc.)", "gruppo": "Informazioni Patrimoniali (Nota Esplicativa)", "fatto": False, "note": ""},
    {"codice": "pat_5", "titolo": "Info Patrimoniali: Beni su cui si paga l'IMU", "gruppo": "Informazioni Patrimoniali (Nota Esplicativa)", "fatto": False, "note": ""},
    {"codice": "pat_6", "titolo": "Info Patrimoniali: Posti auto", "gruppo": "Informazioni Patrimoniali (Nota Esplicativa)", "fatto": False, "note": ""},
]


def calcola_documenti_allegati(passi: List[Any]) -> List[Dict[str, Any]]:
    """
    Replica esattamente le formule delle righe 66-85 (colonne L, M, N, Q, R) di 'modello 5'
    per il calcolo automatico del numero documento (n.), della prima pagina (n.1° pag)
    e delle pagine di ciascun documento (pag doc) del fascicolo Rendiconto.
    """
    pag_per_codice: Dict[str, int] = {}
    passo_num_per_codice: Dict[str, str] = {}
    for p in passi:
        if p.doc_codice:
            pag_per_codice[p.doc_codice] = max(0, int(p.num_pagine or 0))
            passo_num_per_codice[p.doc_codice] = p.numero_codice

    # Struttura dei 20 documenti nell'ordine esatto di Modello 5
    struttura = [
        {
            "id_riga": 1,
            "titolo": "Copertina Rendic. Condom. (art. 1130 bis c.c.)",
            "fisso": True,
            "pag_doc": 1,
            "riferimento_passo": "Copertina Generale",
            "is_copertina_iniziale": True,
        },
        {
            "id_riga": 2,
            "titolo": "02 Nota esplicativa",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_02_nota_esplicativa", 0),
            "riferimento_passo": "Passo 47",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 3,
            "titolo": "03 Documenti Bilancio Straordinario",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_03_straordinario", 0),
            "riferimento_passo": "Passo 12",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 4,
            "titolo": "Copertina Consuntivo",
            "fisso": True,
            "pag_doc": 1,
            "riferimento_passo": "Copertina Sezione",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 5,
            "titolo": "04 Bilancio consuntivo",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_04_consuntivo", 0),
            "riferimento_passo": "Passo 25",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 6,
            "titolo": "05 Situazione economica/patrimoniale",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_05_sit_patrimoniale", 0),
            "riferimento_passo": "Passo 45",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 7,
            "titolo": "06 Registro di contabilità per risorsa",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_06_registro", 0),
            "riferimento_passo": "Passo 15",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 8,
            "titolo": "07 a Dettaglio debiti/crediti + b riparto Fondi",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_07a_debiti_crediti", 0) + pag_per_codice.get("doc_07b_fondo", 0),
            "riferimento_passo": "Passi 46 + 33",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 9,
            "titolo": "08 Bilancio comparativo",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_08_comparativo", 0),
            "riferimento_passo": "Passo 31",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 10,
            "titolo": "09 Riparto consuntivo per unità",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_09_riparto_cons", 0),
            "riferimento_passo": "Passo 32",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 11,
            "titolo": "10 Elenco attività",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_10_attivita", 0),
            "riferimento_passo": "Passo 44",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 12,
            "titolo": "11 Google Calendar (usare carta int. su Danea)",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_11_calendar", 0),
            "riferimento_passo": "Passo 40a",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 13,
            "titolo": "12 Contatori acqua (tabelle-contatori-stampa)",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_12_acqua", 0),
            "riferimento_passo": "Passo 15b",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 14,
            "titolo": "13 Letture contabilizzatori (riscaldamento)",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_13_riscaldamento", 0),
            "riferimento_passo": "Passo 16",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 15,
            "titolo": "14 Interessi di morosità",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_14_interessi", 0),
            "riferimento_passo": "Passo 11",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 16,
            "titolo": "15 Criteri di ripartizione delle spese",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_15_criteri", 0),
            "riferimento_passo": "Passo 18",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 17,
            "titolo": "Copertina Preventivo",
            "fisso": True,
            "pag_doc": 1,
            "riferimento_passo": "Copertina Sezione",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 18,
            "titolo": "16 Bilancio preventivo",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_16_preventivo", 0),
            "riferimento_passo": "Passo 34",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 19,
            "titolo": "17 Riparto preventivo sintetico per tabelle",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_17_riparto_prev", 0),
            "riferimento_passo": "Passo 36",
            "is_copertina_iniziale": False,
        },
        {
            "id_riga": 20,
            "titolo": "18 Prospetto rate",
            "fisso": False,
            "pag_doc": pag_per_codice.get("doc_18_rate", 0),
            "riferimento_passo": "Passo 38",
            "is_copertina_iniziale": False,
        },
    ]

    risultato = []
    progressivo_doc = 0
    pagina_corrente = 1

    for idx, item in enumerate(struttura):
        pag = item["pag_doc"]
        incluso = 1 if pag > 0 else 0
        if incluso:
            progressivo_doc += 1
            num_doc = progressivo_doc
        else:
            num_doc = 0

        if idx == 0:
            # R66: Copertina Rendiconto ha L=1, M=1, Q vuoto (non sposta Q67 che parte da 1)
            prima_pag = 1
        elif idx == 1:
            # R67: 02 Nota esplicativa parte da Q67 = 1
            prima_pag = 1
            pagina_corrente = 1 + pag
        else:
            prima_pag = pagina_corrente
            pagina_corrente = pagina_corrente + pag

        risultato.append(
            {
                "id_riga": item["id_riga"],
                "numero_allegato": num_doc,
                "incluso": bool(incluso),
                "titolo": item["titolo"],
                "prima_pagina": prima_pag,
                "pagine_documento": pag,
                "riferimento_passo": item["riferimento_passo"],
                "fisso": item["fisso"],
            }
        )

    return risultato


def calcola_acqua_eccedente(
    consumo_contabilizzatori: float, mc_fatture: float, costo_fatture_h2o: float
) -> Dict[str, float]:
    """
    Replica le formule di Modello 5 (celle O17:P23):
    - P19 (mc oltre le letture) = P18 (mc delle fatture) - P17 (consumo dei contabilizzatori)
    - P22 (costo al mc) = IF(P21=0, 0, P21/P18)
    - P23 (quota acqua eccedente) = IF(P19<50, 0, P22*P19)
    """
    mc_oltre = round(mc_fatture - consumo_contabilizzatori, 2)
    costo_mc = round(costo_fatture_h2o / mc_fatture, 4) if mc_fatture > 0 else 0.0
    quota_eccedente = 0.0 if mc_oltre < 50 else round(costo_mc * mc_oltre, 2)
    return {
        "consumo_contabilizzatori": round(consumo_contabilizzatori, 2),
        "mc_fatture": round(mc_fatture, 2),
        "mc_oltre_letture": mc_oltre,
        "costo_fatture_h2o": round(costo_fatture_h2o, 2),
        "costo_al_mc": costo_mc,
        "quota_acqua_eccedente": quota_eccedente,
        "soglia_eccedenza_superata": mc_oltre >= 50,
    }


CUSTOM_PASSI_CONFIG_KEY = "modello_passi_rendiconto"


def normalize_passi_template(raw_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalizza e riordina una lista di passaggi template."""
    normalized: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_list, start=1):
        ha_pagine = bool(item.get("ha_pagine", False))
        doc_codice = item.get("doc_codice") if ha_pagine else None
        campi_extra = item.get("campi_extra")
        if not isinstance(campi_extra, dict):
            campi_extra = {}
        normalized.append(
            {
                "ordine": idx,
                "numero_codice": str(item.get("numero_codice") or idx).strip(),
                "sezione": str(
                    item.get("sezione") or "1. Controlli Preliminari & Riconciliazione"
                ).strip(),
                "chi_lo_fa": str(item.get("chi_lo_fa") or "G").strip(),
                "descrizione": str(item.get("descrizione") or "").strip(),
                "ha_pagine": ha_pagine,
                "doc_codice": doc_codice,
                "num_pagine": max(0, int(item.get("num_pagine") or 0)),
                "campi_extra": {str(k): str(v) for k, v in campi_extra.items()},
            }
        )
    return normalized


def get_custom_passi_modello_5(db: Any) -> List[Dict[str, Any]]:
    """
    Restituisce i passaggi personalizzati del Rendiconto salvati in IntegrationConfig,
    oppure il template predefinito DEFAULT_PASSI_MODELLO_5 se non personalizzati.
    """
    import copy
    import json
    from ..models import IntegrationConfig

    if db is None:
        return copy.deepcopy(DEFAULT_PASSI_MODELLO_5)
    try:
        cfg = (
            db.query(IntegrationConfig)
            .filter(IntegrationConfig.chiave == CUSTOM_PASSI_CONFIG_KEY)
            .first()
        )
        if cfg and cfg.valore:
            parsed = json.loads(cfg.valore)
            if isinstance(parsed, list) and len(parsed) > 0:
                return normalize_passi_template(parsed)
    except Exception:
        pass
    return copy.deepcopy(DEFAULT_PASSI_MODELLO_5)


def sync_all_schede_with_custom_passi(
    db: Any, template_passi: List[Dict[str, Any]]
) -> int:
    """
    Sincronizza tutte le SchedaRendiconto esistenti con il nuovo elenco di passaggi template,
    preservando stato fatto, data_spunta, note_passo, num_pagine e valori campi_extra compilati.
    """
    import json
    from ..models import PassoRendiconto, SchedaRendiconto

    normalized = normalize_passi_template(template_passi)
    schede = db.query(SchedaRendiconto).all()
    updated_count = 0

    for scheda in schede:
        existing_passi = list(scheda.passi)
        by_code: Dict[str, PassoRendiconto] = {}
        used_ids = set()

        for p in existing_passi:
            code_key = str(p.numero_codice or "").strip()
            if code_key and code_key not in by_code:
                by_code[code_key] = p

        for tpl in normalized:
            code_key = tpl["numero_codice"]
            matched = by_code.get(code_key)
            if matched and matched.id not in used_ids:
                used_ids.add(matched.id)
                matched.ordine = tpl["ordine"]
                matched.numero_codice = tpl["numero_codice"]
                matched.sezione = tpl["sezione"]
                matched.chi_lo_fa = tpl["chi_lo_fa"]
                matched.descrizione = tpl["descrizione"]
                matched.ha_pagine = tpl["ha_pagine"]
                matched.doc_codice = tpl["doc_codice"]

                # Unisci campi_extra preservando i valori già inseriti e i campi di sistema (__*)
                old_extra: Dict[str, Any] = {}
                try:
                    old_extra = json.loads(matched.campi_extra_json or "{}")
                    if not isinstance(old_extra, dict):
                        old_extra = {}
                except Exception:
                    old_extra = {}

                new_extra: Dict[str, Any] = {}
                for k, default_val in tpl["campi_extra"].items():
                    new_extra[k] = old_extra.get(k, default_val)
                for k, old_val in old_extra.items():
                    if k not in new_extra and (
                        str(k).startswith("__") or old_val not in ("", None)
                    ):
                        new_extra[k] = old_val
                matched.campi_extra_json = json.dumps(new_extra, ensure_ascii=False)
            else:
                nuovo_passo = PassoRendiconto(
                    scheda_id=scheda.id,
                    ordine=tpl["ordine"],
                    numero_codice=tpl["numero_codice"],
                    sezione=tpl["sezione"],
                    chi_lo_fa=tpl["chi_lo_fa"],
                    descrizione=tpl["descrizione"],
                    fatto=False,
                    data_spunta=None,
                    note_passo="",
                    ha_pagine=tpl["ha_pagine"],
                    doc_codice=tpl["doc_codice"],
                    num_pagine=tpl["num_pagine"],
                    campi_extra_json=json.dumps(tpl["campi_extra"], ensure_ascii=False),
                )
                db.add(nuovo_passo)

        # Rimuovi i passaggi che sono stati eliminati dal template
        for p in existing_passi:
            if p.id not in used_ids:
                db.delete(p)

        updated_count += 1

    db.commit()
    return updated_count

