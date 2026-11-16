import type {
  SchedaRendiconto,
  PassoRendiconto,
  DocumentoAllegato,
  NotaCheckItem,
} from '../components/ProceduraRendicontoView';

export const PROMPT_SLIDE_NOTEBOOKLM = `Ruolo e Obiettivo: Agisci come l'Ing. Gian Carlo Serra (Amministratore dello Studio Serra). Devi preparare la presentazione (Slide) per l'assemblea ordinaria annuale dei condomini basandoti sui documenti caricati (Rendiconto consuntivo, Nota esplicativa, Preventivo e Riparto).
Tono di voce: Professionale, trasparente, rassicurante, chiaro e orientato alla comprensione anche per chi non è esperto di contabilità.

Struttura richiesta per le Slide:
1. SLIDE TITOLO: Nome del Condominio, Periodo di Gestione, Data Assemblea e riferimenti Studio Serra.
2. SINTESI DEL CONSUNTIVO: Totale spese consuntive, confronto sintetico con il preventivo precedente e indicazione delle principali voci di spesa (es. Amministrazione, Pulizie, Energia, Manutenzioni, Acqua).
3. SITUAZIONE CASSA, BANCA E PATRIMONIALE: Saldo finale C/C bancario al termine dell'esercizio, crediti verso condomini, debiti verso fornitori e fondi accantonati (es. Fondo TFR / Fondi lavori).
4. EVENTUALI SCOSTAMENTI SIGNIFICATIVI: Spiegazione chiara delle voci che hanno subito aumenti o risparmi rispetto al preventivo (come indicato nella Nota Esplicativa).
5. INTERVENTI E RAPPORTI IN CORSO: Riepilogo delle manutenzioni svolte nell'anno, eventuali sinistri assicurativi o pratiche/questioni pendenti.
6. BILANCIO PREVENTIVO NUOVA GESTIONE: Totale preventivo proposto, eventuali adeguamenti o fondi straordinari proposti e prospetto delle scadenze delle 4 rate.
7. SERVIZI DIGITALI STUDIO SERRA: Promemoria sull'utilizzo del portale MioCondominio (consultazione documenti, stato pagamenti) e piattaforma DettoFatto per segnalazione guasti.`;

export const PROMPT_PODCAST_NOTEBOOKLM = `Istruzioni per l'Audio Overview (Podcast di NotebookLM):
Crea un episodio audio discorsivo, chiaro e coinvolgente in lingua italiana destinato ai condomini, realizzato a nome dello Studio Serra (Amministratore Ing. Gian Carlo Serra), per aiutarli a comprendere in 5-7 minuti il fascicolo del Rendiconto prima dell'assemblea.

Punti fondamentali da trattare nel dialogo:
- Saluto iniziale cordiale ai condomini da parte dello Studio Serra e indicazione dell'esercizio di riferimento.
- Spiegazione semplice di come è andato l'anno gestionale: quanto si è speso complessivamente nel Consuntivo e quali sono state le voci più rilevanti.
- Chiarimento trasparente sulla quadratura dei conti: saldo del conto corrente condominiale, situazione dei pagamenti (invitando con cortesia alla regolarità nei versamenti) ed eventuali fondi accantonati.
- Illustrazione dei punti salienti della Nota Esplicativa: lavori eseguiti, contratti in essere e questioni su cui l'assemblea dovrà prendere decisioni.
- Presentazione del nuovo Preventivo e delle date di scadenza delle rate.
- Invito finale a partecipare all'assemblea (o a conferire delega) e a consultare tutti gli allegati completi sul portale MioCondominio.`;

export const DEFAULT_NOTA_CHECKS: NotaCheckItem[] = [
  { codice: '01', titolo: '01 Estratti conto NUOVO ANNO', gruppo: 'Controlli Nuovo Anno', fatto: false, note: '' },
  { codice: '02', titolo: '02 Scritture contabili NUOVO ANNO', gruppo: 'Controlli Nuovo Anno', fatto: false, note: '' },
  { codice: '09', titolo: '09 Comande', gruppo: 'Controlli Nuovo Anno', fatto: false, note: '' },
  { codice: '03a', titolo: '03 Rapporti in corso: Appalti', gruppo: '03 Rapporti in corso (contratti e incarichi)', fatto: false, note: '' },
  { codice: '03b', titolo: '03 Rapporti in corso: Preventivi approvati', gruppo: '03 Rapporti in corso (contratti e incarichi)', fatto: false, note: '' },
  { codice: '03c', titolo: '03 Rapporti in corso: A chiamata', gruppo: '03 Rapporti in corso (contratti e incarichi)', fatto: false, note: '' },
  { codice: '03d', titolo: '03 Rapporti in corso: Per comportamento concludente', gruppo: '03 Rapporti in corso (contratti e incarichi)', fatto: false, note: '' },
  { codice: '04', titolo: '04 Inventario beni mobili', gruppo: 'Patrimonio & Inventario', fatto: false, note: '' },
  { codice: '05a', titolo: '05 Info non numerali: Controversie - contenziosi', gruppo: '05 Informazioni con rilevanza non numerale', fatto: false, note: '' },
  { codice: '05b', titolo: '05 Info non numerali: Recupero crediti', gruppo: '05 Informazioni con rilevanza non numerale', fatto: false, note: '' },
  { codice: '05c', titolo: '05 Info non numerali: Garanzie prestate', gruppo: '05 Informazioni con rilevanza non numerale', fatto: false, note: '' },
  { codice: '05d', titolo: '05 Info non numerali: Garanzie ricevute', gruppo: '05 Informazioni con rilevanza non numerale', fatto: false, note: '' },
  { codice: '05e', titolo: '05 Info non numerali: Beni di terzi', gruppo: '05 Informazioni con rilevanza non numerale', fatto: false, note: '' },
  { codice: '05f', titolo: '05 Info non numerali: Costo messa a norma impianti', gruppo: '05 Informazioni con rilevanza non numerale', fatto: false, note: '' },
  { codice: '06', titolo: '06 Richieste', gruppo: 'Altre Verifiche Nota Esplicativa', fatto: false, note: '' },
  { codice: '07', titolo: '07 Certificazioni', gruppo: 'Altre Verifiche Nota Esplicativa', fatto: false, note: '' },
  { codice: '08', titolo: '08 Questioni pendenti (doc mancanti ultimi 10 anni)', gruppo: 'Altre Verifiche Nota Esplicativa', fatto: false, note: '' },
  { codice: 'pat_1', titolo: 'Info Patrimoniali: Tutto ciò che produce reddito', gruppo: 'Informazioni Patrimoniali (Nota Esplicativa)', fatto: false, note: '' },
  { codice: 'pat_2', titolo: 'Info Patrimoniali: Valore casa custode', gruppo: 'Informazioni Patrimoniali (Nota Esplicativa)', fatto: false, note: '' },
  { codice: 'pat_3', titolo: 'Info Patrimoniali: Postuma decennale', gruppo: 'Informazioni Patrimoniali (Nota Esplicativa)', fatto: false, note: '' },
  { codice: 'pat_4', titolo: 'Info Patrimoniali: Affitto a caldo (caldaie, ascensori, ecc.)', gruppo: 'Informazioni Patrimoniali (Nota Esplicativa)', fatto: false, note: '' },
  { codice: 'pat_5', titolo: 'Info Patrimoniali: Beni su cui si paga l\'IMU', gruppo: 'Informazioni Patrimoniali (Nota Esplicativa)', fatto: false, note: '' },
  { codice: 'pat_6', titolo: 'Info Patrimoniali: Posti auto', gruppo: 'Informazioni Patrimoniali (Nota Esplicativa)', fatto: false, note: '' },
];

export const RAW_PASSI_MODELLO_5: Array<{
  ordine: number;
  numero_codice: string;
  sezione: string;
  descrizione: string;
  ha_pagine?: boolean;
  doc_codice?: string | null;
  default_pagine?: number;
  campi_extra?: Record<string, string>;
}> = [
  // FASE 1: CONTROLLI PRELIMINARI & RICONCILIAZIONE
  { ordine: 1, numero_codice: '1', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare mail da gestire del condominio in oggetto' },
  { ordine: 2, numero_codice: '2', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare bilanciamento situazione contabile' },
  { ordine: 3, numero_codice: '3', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare che le Rate versate siano nella competenza corretta e con data entro la gestione e che non facciano parte di Conto Titoli', campi_extra: { 'Rate registrate sino al giorno': '15/10/2026' } },
  { ordine: 4, numero_codice: '4', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Leggere Regolamento di Condominio' },
  { ordine: 5, numero_codice: '5', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare costi fotocopie (inserire a bilancio se necessario)' },
  { ordine: 6, numero_codice: '6', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare assemblee straordinarie fatte: fare fattura', campi_extra: { 'Data assemblea straord.': '', 'Oggetto': '' } },
  { ordine: 7, numero_codice: '7', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Se con DIPENDENTE: verificare rateo fondo TFR maturato alla chiusura del bilancio' },
  { ordine: 8, numero_codice: '8', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare Gestione Inquilini e fare fattura', campi_extra: { 'N. unità con gestione inquilino': '', 'Quota gestione per unità (€)': '35', 'Compenso Gestione Inquilini (€)': '0,00' } },
  { ordine: 9, numero_codice: '9', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Spostare le sanzioni nelle spese bancarie' },
  { ordine: 10, numero_codice: '10', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Leggere Verbale Assemblea precedente' },
  { ordine: 11, numero_codice: '11', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Applicare gli interessi di morosità se previsti (solo interessi legali). Creare DOC INTERESSI DI MOROSITA\'', ha_pagine: true, doc_codice: 'doc_14_interessi', default_pagine: 0, campi_extra: { '% e gg': '' } },
  { ordine: 12, numero_codice: '12', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Redigere BILANCIO STRAORDINARIO se presente (a: Copertina; b: Bilancio consuntivo stra; c: Riparto)', ha_pagine: true, doc_codice: 'doc_03_straordinario', default_pagine: 0 },
  { ordine: 13, numero_codice: '13', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Verificare contante cassaforte', campi_extra: { 'Contante €': '' } },
  { ordine: 14, numero_codice: '14', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Riconciliazione bancaria + verifica corrispondenza estratto conto risorsa' },
  { ordine: 15, numero_codice: '15', sezione: '1. Controlli Preliminari & Riconciliazione', descrizione: 'Crea DOC REGISTRO DI CONTABILITA\' (estratto conto bancario) + Verifiche Risorse', ha_pagine: true, doc_codice: 'doc_06_registro', default_pagine: 8 },

  // FASE 2: CONTATORI, PEZZE & BILANCIO CONSUNTIVO
  { ordine: 16, numero_codice: '15b', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare CONTATORI acqua (crea DOC CONTATORI ACQUA) [vedi Calcolatore Acqua Eccedente]', ha_pagine: true, doc_codice: 'doc_12_acqua', default_pagine: 2 },
  { ordine: 17, numero_codice: '16', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare CONTATORI riscaldamento (crea DOC CONTATORI RISCALDAMENTO)', ha_pagine: true, doc_codice: 'doc_13_riscaldamento', default_pagine: 0 },
  { ordine: 18, numero_codice: '17', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare la competenza delle fatture nel bilancio attuale' },
  { ordine: 19, numero_codice: '18', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Crea DOC CRITERI DI RIPARTO DELLE SPESE', ha_pagine: true, doc_codice: 'doc_15_criteri', default_pagine: 1 },
  { ordine: 20, numero_codice: '19', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare se ci sono fatture doppie della stessa ditta' },
  { ordine: 21, numero_codice: '20', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare che gli estratti conto scansionati ci siano tutti + caricare negli allegati Danea tutti gli EC della gestione' },
  { ordine: 22, numero_codice: '21', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare che le scansioni delle pezze giustificative dell\'esercizio ci siano' },
  { ordine: 23, numero_codice: '22', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verifica bilancio consuntivo e modifica descrizioni e conti + VERIFICARE POLIZZA FABBRICATO (scadenze)', campi_extra: { 'Scadenza Polizza': '' } },
  { ordine: 24, numero_codice: '23', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Controllo nel bilancio vecchio i valori nelle tabelle individuali rispetto a proprietari e ex proprietari e inquilini' },
  { ordine: 25, numero_codice: '24', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verifica dal bilancio precedente eventuali spese personali e inseriscile (spese parcheggi, rimborsi acqua, spese ricorrenti, ecc)' },
  { ordine: 26, numero_codice: '25', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Crea BILANCIO CONSUNTIVO per conto, suo controllo con bilancio precedente e crea INFOGRAFICA con NotebookLM', ha_pagine: true, doc_codice: 'doc_04_consuntivo', default_pagine: 3 },
  { ordine: 27, numero_codice: '26', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Controllare doc prossima assemblea' },
  { ordine: 28, numero_codice: '27', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Apertura nuova gestione su Danea e aggiornamento codici di riferimento Danea su pezze nuovo anno' },
  { ordine: 29, numero_codice: '28', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Controllo dei valori nelle tabelle rispetto a proprietari e ex proprietari e inquilini' },
  { ordine: 30, numero_codice: '29', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Aggiornare fornitori secondo il bilancio consuntivo e verificare presenza contratti' },
  { ordine: 31, numero_codice: '30', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verifica corrispondenza con saldo precedente', campi_extra: { 'Precedente (€)': '18.500,00', 'Attuale (€)': '19.200,00' } },
  { ordine: 32, numero_codice: '31', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Controllo e crea BILANCIO COMPARATIVO: consuntivo attuale / preventivo', ha_pagine: true, doc_codice: 'doc_08_comparativo', default_pagine: 2 },
  { ordine: 33, numero_codice: '32', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Crea RIPARTO BILANCIO CONSUNTIVO secondo quanto fatto l\'anno precedente in excel (verificare unità di misura delle tabelle)', ha_pagine: true, doc_codice: 'doc_09_riparto_cons', default_pagine: 4, campi_extra: { 'Conti / Note': '' } },
  { ordine: 34, numero_codice: '33', sezione: '2. Contatori, Pezze & Bilancio Consuntivo', descrizione: 'Verificare fondo e creare tabella di riparto (se importo > 0: CREA IL RIPARTO DEL FONDO e salvalo)', ha_pagine: true, doc_codice: 'doc_07b_fondo', default_pagine: 0, campi_extra: { 'Importo Fondo (€)': '0', 'Natura Fondo': '' } },

  // FASE 3: PREVENTIVO, RATE & VERIFICHE
  { ordine: 35, numero_codice: '34', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Creare PREVENTIVO SINTETICO per tabella nuovo anno', ha_pagine: true, doc_codice: 'doc_16_preventivo', default_pagine: 2, campi_extra: { 'Importo Preventivo (€)': '19.800,00' } },
  { ordine: 36, numero_codice: '35', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Controllo saldo precedente nel preventivo' },
  { ordine: 37, numero_codice: '36', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Creare RIPARTO PREVENTIVO sintetico per tabelle', ha_pagine: true, doc_codice: 'doc_17_riparto_prev', default_pagine: 3, campi_extra: { 'Conti / Note': '' } },
  { ordine: 38, numero_codice: '37', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Riparto rateale (eliminare importi sotto i 50 euro) -> VERIFICA CON AI: CONDORATE: salva grafico', campi_extra: { 'Date scadenze rate': '01/03 - 01/06 - 01/09 - 01/12' } },
  { ordine: 39, numero_codice: '38', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'RIPARTO RATEALE: crea doc e verifica la correttezza dell\'IBAN della banca riportata', ha_pagine: true, doc_codice: 'doc_18_rate', default_pagine: 2 },
  { ordine: 40, numero_codice: '39', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Verificare sinistri aperti o chiusi: (data + oggetto)', campi_extra: { 'Data sinistro': '', 'Oggetto sinistro': '' } },
  { ordine: 41, numero_codice: '40a', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Calendario (Google Calendar - usare carta intestata su Danea)', ha_pagine: true, doc_codice: 'doc_11_calendar', default_pagine: 1 },
  { ordine: 42, numero_codice: '40b', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Verificare procedure legali: (data + oggetto)', campi_extra: { 'Data e Oggetto legali': 'Nessuna procedura in corso' } },
  { ordine: 43, numero_codice: '42', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Verificare solleciti di pagamento (in file excel condomini e recuperi crediti aperti)' },
  { ordine: 44, numero_codice: '43', sezione: '3. Preventivo, Rate & Verifiche Condominio', descrizione: 'Verificare accessi in MioCondominio', campi_extra: { 'Utenti': '24', 'Accessi': '19', 'Mail': '22' } },

  // FASE 4: FASCICOLO RENDICONTO, NOTA ESPLICATIVA & AI
  { ordine: 45, numero_codice: '44', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Creare e salvare ELENCO ATTIVITA\' (a.dettofatto.cloud: STATISTICHE - REPORT)', ha_pagine: true, doc_codice: 'doc_10_attivita', default_pagine: 2 },
  { ordine: 46, numero_codice: '45', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Verificare e creare SITUAZIONE ECONOMICO/PATRIMONIALE', ha_pagine: true, doc_codice: 'doc_05_sit_patrimoniale', default_pagine: 2 },
  { ordine: 47, numero_codice: '46', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Creare DETTAGLIO DEBITI CREDITI (da situazione contabile con elenco dettagliato)', ha_pagine: true, doc_codice: 'doc_07a_debiti_crediti', default_pagine: 3 },
  { ordine: 48, numero_codice: '47', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Fare e creare NOTA ESPLICATIVA (questioni pendenti 10 anni, rapporti in corso, info patrimoniali: reddito, casa custode, postuma decennale, affitto a caldo, IMU, posti auto)', ha_pagine: true, doc_codice: 'doc_02_nota_esplicativa', default_pagine: 4 },
  { ordine: 49, numero_codice: '48', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Stampare i Documenti del Rendiconto con numero pagine corrette (vedi tabella Documenti da Allegare)' },
  { ordine: 50, numero_codice: '49', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Salvare negli allegati di Danea i PDF creati' },
  { ordine: 51, numero_codice: '50', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Creare e salvare in Danea i Bilanci individuali' },
  { ordine: 52, numero_codice: '51', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Prenotare sala assemblea', campi_extra: { 'Presso': 'Sala Riunioni Studio Serra', 'Data riunione': '28/11/2026', 'Ora riunione': '18:00' } },
  { ordine: 53, numero_codice: '52', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Creare ordine del giorno per assemblea' },
  { ordine: 54, numero_codice: '53', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Unisci i documenti in un unico file Rendiconto' },
  { ordine: 55, numero_codice: '54', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'PRODUCI LA PRESENTAZIONE E IL PODCAST DEL RENDICONTO su NOTEBOOK LM e PUBBLICALA SU DANEA (vedi Prompt Slide e Prompt Podcast)' },
  { ordine: 56, numero_codice: '55', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'PRODUCI L\'ANALISI DI CONDOCERTA PER VERIFICARE CRITICITA\' DEL RENDICONTO' },
  { ordine: 57, numero_codice: '56', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Inviare convocazioni con allegati' },
  { ordine: 58, numero_codice: '57', sezione: '4. Fascicolo Rendiconto, Nota Esplicativa & AI', descrizione: 'Inviare Rendiconto agli inquilini' },

  // FASE 5: DOPO ASSEMBLEA
  { ordine: 59, numero_codice: '58', sezione: '5. Adempimenti Dopo Assemblea', descrizione: 'Redigere verbale' },
  { ordine: 60, numero_codice: '59', sezione: '5. Adempimenti Dopo Assemblea', descrizione: 'Recuperare firma Presidente e Segretario' },
  { ordine: 61, numero_codice: '60', sezione: '5. Adempimenti Dopo Assemblea', descrizione: 'Inviare verbale' },
  { ordine: 62, numero_codice: '61', sezione: '5. Adempimenti Dopo Assemblea', descrizione: 'Aggiornare/inviare scadenze RATE su DettoFatto e appuntamenti in condominio dell\'amministratore' },
  { ordine: 63, numero_codice: '62', sezione: '5. Adempimenti Dopo Assemblea', descrizione: 'Invio eventuali MAV' },
];

export function calcolaDocumentiAllegatiFrontend(
  passi: PassoRendiconto[]
): { documenti: DocumentoAllegato[]; totalePagine: number } {
  // Mappa le pagine impostate su ogni passo
  const pagPerCodice: Record<string, number> = {};
  for (const p of passi) {
    if (p.doc_codice) {
      pagPerCodice[p.doc_codice] = Math.max(0, Number(p.num_pagine) || 0);
    }
    // Fallback con numero codice se presente
    if (p.ha_pagine) {
      pagPerCodice[`passo_${p.numero_codice}`] = Math.max(0, Number(p.num_pagine) || 0);
    }
  }

  // Struttura dei 20 documenti nell'ordine esatto di Modello 5 (righe 66-85 di Excel)
  const struttura = [
    {
      id_riga: 1,
      titolo: 'Copertina Rendic. Condom. (art. 1130 bis c.c.)',
      fisso: true,
      pag_doc: 1,
      riferimento_passo: 'Copertina Generale',
    },
    {
      id_riga: 2,
      titolo: '02 Nota esplicativa',
      fisso: false,
      pag_doc: pagPerCodice['doc_02_nota_esplicativa'] ?? pagPerCodice['passo_47'] ?? 0,
      riferimento_passo: 'Passo 47',
    },
    {
      id_riga: 3,
      titolo: '03 Documenti Bilancio Straordinario',
      fisso: false,
      pag_doc: pagPerCodice['doc_03_straordinario'] ?? pagPerCodice['passo_12'] ?? 0,
      riferimento_passo: 'Passo 12',
    },
    {
      id_riga: 4,
      titolo: 'Copertina Consuntivo',
      fisso: true,
      pag_doc: 1,
      riferimento_passo: 'Copertina Sezione',
    },
    {
      id_riga: 5,
      titolo: '04 Bilancio consuntivo',
      fisso: false,
      pag_doc: pagPerCodice['doc_04_consuntivo'] ?? pagPerCodice['passo_25'] ?? 0,
      riferimento_passo: 'Passo 25',
    },
    {
      id_riga: 6,
      titolo: '05 Situazione economica/patrimoniale',
      fisso: false,
      pag_doc: pagPerCodice['doc_05_sit_patrimoniale'] ?? pagPerCodice['passo_45'] ?? 0,
      riferimento_passo: 'Passo 45',
    },
    {
      id_riga: 7,
      titolo: '06 Registro di contabilità per risorsa',
      fisso: false,
      pag_doc: pagPerCodice['doc_06_registro'] ?? pagPerCodice['passo_15'] ?? 0,
      riferimento_passo: 'Passo 15',
    },
    {
      id_riga: 8,
      titolo: '07 a Dettaglio debiti/crediti + b riparto Fondi',
      fisso: false,
      // In Excel: formula ='modello 5'!D53 + 'modello 5'!D38 (Passo 46 + Passo 33)
      pag_doc:
        (pagPerCodice['doc_07a_debiti_crediti'] ?? pagPerCodice['passo_46'] ?? 0) +
        (pagPerCodice['doc_07b_fondo'] ?? pagPerCodice['passo_33'] ?? 0),
      riferimento_passo: 'Passi 46 + 33',
    },
    {
      id_riga: 9,
      titolo: '08 Bilancio comparativo',
      fisso: false,
      pag_doc: pagPerCodice['doc_08_comparativo'] ?? pagPerCodice['passo_31'] ?? 0,
      riferimento_passo: 'Passo 31',
    },
    {
      id_riga: 10,
      titolo: '09 Riparto consuntivo per unità',
      fisso: false,
      pag_doc: pagPerCodice['doc_09_riparto_cons'] ?? pagPerCodice['passo_32'] ?? 0,
      riferimento_passo: 'Passo 32',
    },
    {
      id_riga: 11,
      titolo: '10 Elenco attività',
      fisso: false,
      pag_doc: pagPerCodice['doc_10_attivita'] ?? pagPerCodice['passo_44'] ?? 0,
      riferimento_passo: 'Passo 44',
    },
    {
      id_riga: 12,
      titolo: '11 Google Calendar (usare carta int. su Danea)',
      fisso: false,
      pag_doc: pagPerCodice['doc_11_calendar'] ?? pagPerCodice['passo_40a'] ?? 0,
      riferimento_passo: 'Passo 40a',
    },
    {
      id_riga: 13,
      titolo: '12 Contatori acqua (tabelle-contatori-stampa)',
      fisso: false,
      pag_doc: pagPerCodice['doc_12_acqua'] ?? pagPerCodice['passo_15b'] ?? 0,
      riferimento_passo: 'Passo 15b',
    },
    {
      id_riga: 14,
      titolo: '13 Letture contabilizzatori (riscaldamento)',
      fisso: false,
      pag_doc: pagPerCodice['doc_13_riscaldamento'] ?? pagPerCodice['passo_16'] ?? 0,
      riferimento_passo: 'Passo 16',
    },
    {
      id_riga: 15,
      titolo: '14 Interessi di morosità',
      fisso: false,
      pag_doc: pagPerCodice['doc_14_interessi'] ?? pagPerCodice['passo_11'] ?? 0,
      riferimento_passo: 'Passo 11',
    },
    {
      id_riga: 16,
      titolo: '15 Criteri di ripartizione delle spese',
      fisso: false,
      pag_doc: pagPerCodice['doc_15_criteri'] ?? pagPerCodice['passo_18'] ?? 0,
      riferimento_passo: 'Passo 18',
    },
    {
      id_riga: 17,
      titolo: 'Copertina Preventivo',
      fisso: true,
      pag_doc: 1,
      riferimento_passo: 'Copertina Sezione',
    },
    {
      id_riga: 18,
      titolo: '16 Bilancio preventivo',
      fisso: false,
      pag_doc: pagPerCodice['doc_16_preventivo'] ?? pagPerCodice['passo_34'] ?? 0,
      riferimento_passo: 'Passo 34',
    },
    {
      id_riga: 19,
      titolo: '17 Riparto preventivo sintetico per tabelle',
      fisso: false,
      pag_doc: pagPerCodice['doc_17_riparto_prev'] ?? pagPerCodice['passo_36'] ?? 0,
      riferimento_passo: 'Passo 36',
    },
    {
      id_riga: 20,
      titolo: '18 Prospetto rate',
      fisso: false,
      pag_doc: pagPerCodice['doc_18_rate'] ?? pagPerCodice['passo_38'] ?? 0,
      riferimento_passo: 'Passo 38',
    },
  ];

  const documenti: DocumentoAllegato[] = [];
  let progressivoDoc = 0;
  let paginaCorrente = 1;

  for (let idx = 0; idx < struttura.length; idx++) {
    const item = struttura[idx];
    const pag = item.pag_doc;
    const incluso = pag > 0;
    let numDoc = 0;
    if (incluso) {
      progressivoDoc += 1;
      numDoc = progressivoDoc;
    }

    let primaPag = 1;
    if (idx === 0) {
      // R66: Copertina Rendiconto ha L=1, M=1, prima pagina = 1
      primaPag = 1;
    } else if (idx === 1) {
      // R67: 02 Nota esplicativa parte da Q67 = 1
      primaPag = 1;
      paginaCorrente = 1 + pag;
    } else {
      primaPag = paginaCorrente;
      paginaCorrente = paginaCorrente + pag;
    }

    documenti.push({
      id_riga: item.id_riga,
      numero_allegato: numDoc,
      incluso,
      titolo: item.titolo,
      prima_pagina: primaPag,
      pagine_documento: pag,
      riferimento_passo: item.riferimento_passo,
      fisso: item.fisso,
    });
  }

  const totalePagine = documenti
    .filter((d) => d.incluso)
    .reduce((acc, curr) => acc + curr.pagine_documento, 0);

  return {
    documenti,
    totalePagine,
  };
}

export function calcolaAcquaEccedenteFrontend(
  consumoContabilizzatori: number,
  mcFatture: number,
  costoFattureH2o: number
) {
  const mcOltreLetture = Math.round((mcFatture - consumoContabilizzatori) * 100) / 100;
  const costoAlMc = mcFatture > 0 ? Math.round((costoFattureH2o / mcFatture) * 10000) / 10000 : 0;
  const sogliaSuperata = mcOltreLetture >= 50;
  const quotaEccedente = sogliaSuperata ? Math.round(costoAlMc * mcOltreLetture * 100) / 100 : 0;
  return {
    consumo_contabilizzatori: consumoContabilizzatori,
    mc_fatture: mcFatture,
    mc_oltre_letture: mcOltreLetture,
    costo_fatture_h2o: costoFattureH2o,
    costo_al_mc: costoAlMc,
    quota_acqua_eccedente: quotaEccedente,
    soglia_eccedenza_superata: sogliaSuperata,
  };
}

export const CODICI_POST_ASSEMBLEA = ['58', '59', '60', '61', '62'];

export function isPassoPostAssemblea(p: { numero_codice?: string | number; ordine?: number; sezione?: string }): boolean {
  const cod = String(p?.numero_codice ?? '').trim();
  if (CODICI_POST_ASSEMBLEA.includes(cod)) return true;
  if (typeof p?.sezione === 'string' && p.sezione.includes('Dopo Assemblea')) return true;
  return false;
}

export interface MetrichePassiRendiconto {
  totale_passi: number;
  passi_completati: number;
  percentuale_fatto: number;
  post_assemblea_completati: number;
  post_assemblea_totale: number;
  in_attesa_assemblea: boolean;
  passo_57_fatto: boolean;
  tutti_post_assemblea_fatti: boolean;
}

export function calcolaMetrichePassiRendiconto(
  passi: Array<{ numero_codice?: string | number; ordine?: number; sezione?: string; fatto?: boolean }>
): MetrichePassiRendiconto {
  const passiPre = passi.filter((p) => !isPassoPostAssemblea(p));
  const passiPost = passi.filter((p) => isPassoPostAssemblea(p));
  const passo57 = passi.find((p) => String(p?.numero_codice ?? '').trim() === '57');
  const passo62 = passi.find((p) => String(p?.numero_codice ?? '').trim() === '62');
  const passo57Fatto = Boolean(passo57?.fatto);
  const passo62Fatto = Boolean(passo62?.fatto);

  const totalePre = passiPre.length > 0 ? passiPre.length : 58;
  const fattiPreRaw = passiPre.filter((p) => Boolean(p?.fatto)).length;
  const passiCompletati = passo57Fatto || fattiPreRaw >= totalePre ? totalePre : fattiPreRaw;
  const percentualeFatto =
    passo57Fatto || passiCompletati >= totalePre
      ? 100
      : totalePre > 0
        ? Math.round((passiCompletati / totalePre) * 1000) / 10
        : 0;

  const postTotale = passiPost.length > 0 ? passiPost.length : 5;
  const postCompletatiRaw = passiPost.filter((p) => Boolean(p?.fatto)).length;
  const postCompletati = passo62Fatto || postCompletatiRaw >= postTotale ? postTotale : postCompletatiRaw;
  const tuttiPostFatti = passo62Fatto || postCompletati >= postTotale;
  const inAttesaAssemblea = (passo57Fatto || percentualeFatto >= 100) && !tuttiPostFatti;

  return {
    totale_passi: totalePre,
    passi_completati: passiCompletati,
    percentuale_fatto: percentualeFatto,
    post_assemblea_completati: postCompletati,
    post_assemblea_totale: postTotale,
    in_attesa_assemblea: inAttesaAssemblea,
    passo_57_fatto: passo57Fatto,
    tutti_post_assemblea_fatti: tuttiPostFatti,
  };
}

export const CUSTOM_PASSI_STORAGE_KEY = 'studio_serra_custom_passi_template_v1';

export interface CustomPassoTemplate {
  ordine: number;
  numero_codice: string;
  sezione: string;
  chi_lo_fa: string;
  descrizione: string;
  ha_pagine: boolean;
  doc_codice: string | null;
  num_pagine: number;
  campi_extra: Record<string, string>;
}

export function getDefaultPassiTemplate(): CustomPassoTemplate[] {
  return RAW_PASSI_MODELLO_5.map((raw, idx) => ({
    ordine: idx + 1,
    numero_codice: String(raw.numero_codice),
    sezione: raw.sezione,
    chi_lo_fa: 'G',
    descrizione: raw.descrizione,
    ha_pagine: Boolean(raw.ha_pagine),
    doc_codice: raw.doc_codice || null,
    num_pagine: raw.default_pagine || 0,
    campi_extra: { ...(raw.campi_extra || {}) },
  }));
}

export function normalizePassiTemplateFrontend(list: Partial<CustomPassoTemplate>[]): CustomPassoTemplate[] {
  return list.map((item, idx) => {
    const haPagine = Boolean(item.ha_pagine);
    const extraObj =
      item.campi_extra && typeof item.campi_extra === 'object' ? { ...item.campi_extra } : {};
    return {
      ordine: idx + 1,
      numero_codice: String(item.numero_codice || idx + 1).trim(),
      sezione: String(item.sezione || '1. Controlli Preliminari & Riconciliazione').trim(),
      chi_lo_fa: String(item.chi_lo_fa || 'G').trim(),
      descrizione: String(item.descrizione || '').trim(),
      ha_pagine: haPagine,
      doc_codice: haPagine ? item.doc_codice || null : null,
      num_pagine: Math.max(0, Number(item.num_pagine || 0)),
      campi_extra: extraObj,
    };
  });
}

let _runtimeCustomPassiTemplate: CustomPassoTemplate[] | null = null;

export function isCustomPassiTemplateActive(): boolean {
  return Array.isArray(_runtimeCustomPassiTemplate) && _runtimeCustomPassiTemplate.length > 0;
}

export function getCustomPassiTemplate(): CustomPassoTemplate[] {
  if (Array.isArray(_runtimeCustomPassiTemplate) && _runtimeCustomPassiTemplate.length > 0) {
    return _runtimeCustomPassiTemplate;
  }
  return getDefaultPassiTemplate();
}

export function saveCustomPassiTemplate(list: Partial<CustomPassoTemplate>[]): CustomPassoTemplate[] {
  const normalized = normalizePassiTemplateFrontend(list);
  _runtimeCustomPassiTemplate = normalized;
  return normalized;
}

export function resetCustomPassiTemplate(): CustomPassoTemplate[] {
  _runtimeCustomPassiTemplate = null;
  return getDefaultPassiTemplate();
}

export function syncSchedaWithTemplate(
  scheda: SchedaRendiconto,
  template?: CustomPassoTemplate[]
): SchedaRendiconto {
  const tplList = template || getCustomPassiTemplate();
  const byCode = new Map<string, PassoRendiconto>();
  for (const p of scheda.passi || []) {
    const codeKey = String(p.numero_codice || '').trim();
    if (codeKey && !byCode.has(codeKey)) {
      byCode.set(codeKey, p);
    }
  }

  const usedCodes = new Set<string>();
  const syncedPassi: PassoRendiconto[] = tplList.map((tpl, idx) => {
    const codeKey = tpl.numero_codice;
    const existing = !usedCodes.has(codeKey) ? byCode.get(codeKey) : undefined;
    if (existing) {
      usedCodes.add(codeKey);
      const oldExtra = existing.campi_extra || {};
      const mergedExtra: Record<string, string> = {};
      for (const [k, defVal] of Object.entries(tpl.campi_extra || {})) {
        mergedExtra[k] = k in oldExtra ? oldExtra[k] : defVal;
      }
      for (const [k, oldVal] of Object.entries(oldExtra)) {
        if (!(k in mergedExtra) && (k.startsWith('__') || (oldVal !== '' && oldVal != null))) {
          mergedExtra[k] = oldVal;
        }
      }
      return {
        ...existing,
        ordine: idx + 1,
        numero_codice: tpl.numero_codice,
        sezione: tpl.sezione,
        chi_lo_fa: existing.chi_lo_fa || tpl.chi_lo_fa || 'G',
        descrizione: tpl.descrizione,
        ha_pagine: tpl.ha_pagine,
        doc_codice: tpl.doc_codice,
        campi_extra: mergedExtra,
      };
    }

    return {
      id: scheda.id * 1000 + (idx + 1),
      scheda_id: scheda.id,
      ordine: idx + 1,
      numero_codice: tpl.numero_codice,
      sezione: tpl.sezione,
      chi_lo_fa: tpl.chi_lo_fa || 'G',
      fatto: false,
      data_spunta: null,
      descrizione: tpl.descrizione,
      ha_pagine: tpl.ha_pagine,
      doc_codice: tpl.doc_codice,
      num_pagine: tpl.num_pagine || 0,
      campi_extra: { ...(tpl.campi_extra || {}) },
      note_passo: null,
    };
  });

  return ricalcolaSchedaFrontend({
    ...scheda,
    passi: syncedPassi,
  });
}

export function ricalcolaSchedaFrontend(scheda: SchedaRendiconto): SchedaRendiconto {
  const passo31 = scheda.passi.find((p) => p.numero_codice === '31');
  const legacyAttuale = passo31?.campi_extra?.['Attuale (€)'] || '';

  const normalizedPassi = scheda.passi.map((p) => {
    if (p.numero_codice === '30') {
      const extra = { ...(p.campi_extra || {}) };
      if (!('Precedente (€)' in extra)) {
        extra['Precedente (€)'] = '';
      }
      if (!extra['Attuale (€)'] && legacyAttuale) {
        extra['Attuale (€)'] = legacyAttuale;
      } else if (!('Attuale (€)' in extra)) {
        extra['Attuale (€)'] = '';
      }
      return { ...p, campi_extra: extra };
    }
    if (p.numero_codice === '31' && p.campi_extra && 'Attuale (€)' in p.campi_extra) {
      const extra = { ...p.campi_extra };
      delete extra['Attuale (€)'];
      return { ...p, campi_extra: extra };
    }
    if (p.numero_codice === '39') {
      const extra = { ...(p.campi_extra || {}) };
      if ('Data e Oggetto sinistri' in extra) {
        const legacyVal = String(extra['Data e Oggetto sinistri'] || '').trim();
        if (legacyVal && legacyVal !== 'Nessun sinistro aperto' && !extra['Oggetto sinistro']) {
          extra['Oggetto sinistro'] = legacyVal;
        }
        delete extra['Data e Oggetto sinistri'];
      }
      if (!('Data sinistro' in extra)) {
        extra['Data sinistro'] = '';
      }
      if (!('Oggetto sinistro' in extra)) {
        extra['Oggetto sinistro'] = '';
      }
      return { ...p, campi_extra: extra };
    }
    return p;
  });

  const metriche = calcolaMetrichePassiRendiconto(normalizedPassi);
  const { documenti, totalePagine } = calcolaDocumentiAllegatiFrontend(normalizedPassi);
  const calcolatoreAcqua = calcolaAcquaEccedenteFrontend(
    scheda.calcolatore_acqua?.consumo_contabilizzatori || 0,
    scheda.calcolatore_acqua?.mc_fatture || 0,
    scheda.calcolatore_acqua?.costo_fatture_h2o || 0
  );
  return {
    ...scheda,
    passi: normalizedPassi,
    totale_passi: metriche.totale_passi,
    passi_completati: metriche.passi_completati,
    percentuale_fatto: metriche.percentuale_fatto,
    post_assemblea_completati: metriche.post_assemblea_completati,
    post_assemblea_totale: metriche.post_assemblea_totale,
    in_attesa_assemblea: metriche.in_attesa_assemblea,
    documenti_allegati: documenti,
    totale_pagine_fascicolo: totalePagine,
    calcolatore_acqua: calcolatoreAcqua,
  };
}

export function buildSchedaIniziale(
  schedaId: number,
  condominioId: number,
  condominioNome: string,
  codiceDanea: string,
  iban: string,
  gestione: string,
  noteIntestazione: string,
  passiGiaSpuntati: number,
  acquaConsumo: number,
  acquaMcFatture: number,
  acquaCosto: number
): SchedaRendiconto {
  const customTpl = getCustomPassiTemplate();
  const passi: PassoRendiconto[] = customTpl.map((raw, idx) => ({
    id: schedaId * 1000 + raw.ordine,
    scheda_id: schedaId,
    ordine: raw.ordine,
    numero_codice: raw.numero_codice,
    sezione: raw.sezione,
    chi_lo_fa: raw.chi_lo_fa || 'G',
    fatto: idx < passiGiaSpuntati,
    data_spunta: idx < passiGiaSpuntati ? '16/10/2026' : null,
    descrizione: raw.descrizione,
    ha_pagine: Boolean(raw.ha_pagine),
    doc_codice: raw.doc_codice || null,
    num_pagine: raw.num_pagine || 0,
    campi_extra: { ...(raw.campi_extra || {}) },
    note_passo: null,
  }));

  const base: SchedaRendiconto = {
    id: schedaId,
    condominio_id: condominioId,
    condominio_nome: condominioNome,
    condominio_codice_danea: codiceDanea,
    condominio_iban: iban,
    procedura_codice: 'Procedura 002 - Modello 5',
    gestione,
    fatto_il: null,
    note_intestazione: noteIntestazione,
    chi_lo_fa_default: 'G',
    totale_passi: passi.length,
    passi_completati: passiGiaSpuntati,
    percentuale_fatto: 0,
    calcolatore_acqua: calcolaAcquaEccedenteFrontend(acquaConsumo, acquaMcFatture, acquaCosto),
    nota_esplicativa_checks: DEFAULT_NOTA_CHECKS.map((c) => ({ ...c })),
    documenti_allegati: [],
    totale_pagine_fascicolo: 0,
    passi,
    prompt_slide_notebooklm: PROMPT_SLIDE_NOTEBOOKLM,
    prompt_podcast_notebooklm: PROMPT_PODCAST_NOTEBOOKLM,
  };

  return ricalcolaSchedaFrontend(base);
}

import condominiStudioSerra from './condominiStudioSerra.json';

export const FALLBACK_SCHEDE_RENDICONTO: SchedaRendiconto[] = condominiStudioSerra.map(
  (c: any, idx: number) =>
    buildSchedaIniziale(
      c.id,
      c.id,
      c.nome,
      c.codice_danea || `ST-${String(idx + 1).padStart(3, '0')}`,
      c.iban || '',
      c.esercizio_in_corso || '01/01/2026 - 31/12/2026',
      `Procedura 002 (Modello 5) • Studio Serra • ${c.note_operative || ''}`,
      c.id === 17 ? 55 : 0, // passi gia spuntati (DIAMANTE = 55/63 -> 87,3%)
      0,
      0,
      0
    )
);

