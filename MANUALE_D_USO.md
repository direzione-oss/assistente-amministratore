# Manuale d'Uso Completo — Studio Serra: Gestione Rendiconti (Modello 5)

Benvenuto nel manuale operativo ufficiale del software **Studio Serra — Gestione Rendiconti (Modello 5)** (`A-018 Assistente Amministratore`).  
Questa guida illustra in modo dettagliato ogni schermata, funzione, automatismo, calcolo e modalità di salvataggio del programma, accompagnata dalle immagini reali dell'interfaccia.

---

## Indice dei Contenuti

1. [Panoramica del Programma e Architettura](#1-panoramica-del-programma-e-architettura)
2. [Dashboard Scadenze & Dati (Monitoraggio 180 Giorni)](#2-dashboard-scadenze--dati-monitoraggio-180-giorni)
   - [I 5 Riquadri KPI Interattivi](#21-i-5-riquadri-kpi-interattivi)
   - [Lettura del Quadrante Condominio e Avanzamento Procedura (%)](#22-lettura-del-quadrante-condominio-e-avanzamento-procedura-)
   - [Azioni Rapide sul Quadrante Condominio](#23-azioni-rapide-sul-quadrante-condominio)
3. [Condomini & Checklist Dati Necessari](#3-condomini--checklist-dati-necessari)
   - [Spunta Letture, Contatori e Documenti Contabili](#31-spunta-letture-contatori-e-documenti-contabili)
   - [Personalizzazione della Checklist e Date Esercizio](#32-personalizzazione-della-checklist-e-date-esercizio)
4. [Procedura Rendiconto — Modello 5 (63 Passaggi)](#4-procedura-rendiconto--modello-5-63-passaggi)
   - [Struttura della Schermata e Indicatore % Fatto (Scaletta)](#41-struttura-della-schermata-e-indicatore--fatto-scaletta)
   - [Compilazione Sequenziale e Pulsante "Completa e Vai al Passaggio Successivo"](#42-compilazione-sequenziale-e-pulsante-completa-e-vai-al-passaggio-successivo)
   - [Passaggi Speciali: Sinistri Multipli (Passo #38 e #39)](#43-passaggi-speciali-sinistri-multipli-passo-38-e-39)
   - [Passaggi Speciali: Convocazione Assemblea — Luogo, Data e Ora (Passo #51)](#44-passaggi-speciali-convocazione-assemblea--luogo-data-e-ora-passo-51)
5. [Fascicolo Allegati & Numerazione Automatica Pagine](#5-fascicolo-allegati--numerazione-automatica-pagine)
6. [Calcolatore Acqua Eccedente & Controlli Nota Esplicativa](#6-calcolatore-acqua-eccedente--controlli-nota-esplicativa)
7. [Prompt AI per NotebookLM (Slide & Podcast Assemblea)](#7-prompt-ai-per-notebooklm-slide--podcast-assemblea)
8. [Utilizzo da Cellulare / Tablet via Wi-Fi (Senza Cloud)](#8-utilizzo-da-cellulare--tablet-via-wi-fi-senza-cloud)
9. [Dove Vengono Salvati i Dati e Come Fare il Backup](#9-dove-vengono-salvati-i-dati-e-come-fare-il-backup)

---

## 1. Panoramica del Programma e Architettura

Il programma **Studio Serra — Gestione Rendiconti (Modello 5)** digitalizza e coordina l'intero ciclo di preparazione, controllo, redazione e convocazione del rendiconto condominiale per tutti i **79 condomini** dello Studio Serra:

- **Monitoraggio legale del termine di 180 giorni** dalla chiusura dell'esercizio (*art. 1130 n. 10 c.c.*) per la convocazione dell'assemblea di approvazione del rendiconto.
- **Verifica preliminare dei dati e contatori** (letture acqua, letture riscaldamento/teleriscaldamento, estratti conto bancari, fatture fornitori, F24/ritenute, ecc.) per distinguere immediatamente i condomini **già pronti da redigere** da quelli in attesa di letture.
- **Procedura operativa standardizzata in 63 passaggi (Modello 5)** suddivisa in **5 Fasi** e per **Operatore incaricato** (`G` = Gestore, `C` = Contabilità, `A` = Amministratore).
- **Calcolo automatico della numerazione delle pagine del Fascicolo Rendiconto**, del **consumo Acqua Eccedente** e generazione dei **Prompt AI per NotebookLM** (presentazione in slide e podcast audio per i condòmini).

---

## 2. Dashboard Scadenze & Dati (Monitoraggio 180 Giorni)

All'apertura del programma viene mostrata la **Dashboard Scadenze & Dati**, progettata per offrire in un solo colpo d'occhio lo stato di tutti i condomini dello Studio rispetto alla scadenza dei **180 giorni dalla chiusura dell'esercizio**.

![Dashboard Scadenze & Dati — Condomini Pronti da Fare](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_01_dashboard_pronti.png)

### 2.1 I 5 Riquadri KPI Interattivi

Nella fascia superiore della Dashboard sono presenti **5 grandi riquadri interattivi**. Cliccando su ciascun riquadro si apre immediatamente sotto l'elenco filtrato dei condomini corrispondenti:

| Riquadro KPI | Cosa mostra | Quando usarlo |
| :--- | :--- | :--- |
| **1. GESTIONI CHIUSE (180GG)** | Tutti i condomini il cui esercizio contabile è già chiuso e per i quali decorre il termine di 180 giorni. | Per avere il quadro generale di tutti i bilanci da approvare ordinati per scadenza. |
| **2. PRONTI DA FARE** *(Verde)* | I condomini con gestione chiusa che hanno il **100% dei dati e contatori acquisiti** (0 dati mancanti). | È la lista operativa prioritaria: sono i rendiconti che puoi iniziare o completare **subito** senza attese esterne. |
| **3. SCADENZE IMMINENTI (<= 60GG)** *(Rosso)* | I condomini il cui termine di 180 giorni scade entro i prossimi 60 giorni (o è già superato). | Per individuare le urgenze di convocazione assembleare. |
| **4. DATI & CONTATORI MANCANTI** *(Azzurro)* | I condomini per i quali mancano ancora letture acqua, riscaldamento o documenti contabili. | Per sollecitare letturisti, ditte termiche o fornitori. |
| **5. RENDICONTI COMPLETATI** *(Smeraldo)* | I condomini il cui rendiconto dell'esercizio corrente è stato segnato come completato/approvato. | Per verificare lo storico dei bilanci chiusi. |

![Vista Gestioni Chiuse (180gg)](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_02_dashboard_chiuse.png)

![Vista Dati & Contatori Mancanti](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_03_dashboard_mancanti.png)

### 2.2 Lettura del Quadrante Condominio e Avanzamento Procedura (%)

Ogni condominio nella Dashboard è rappresentato da una scheda (quadrante) che riporta:

1. **Codice identificativo e Nome Condominio** (es. `ST-013 — DIAMANTE`).
2. **Stato Dati Preliminari** in alto a destra (es. `✓ 100% Dati Pronti` oppure il numero di letture mancanti).
3. **Chiusura Gestione e Termine 180gg**: mostra la data di fine esercizio (es. `31/05/2026`), la data limite dei 180 giorni (es. `27/11/2026`) e i giorni residui (`41gg`).
4. **Riquadro Avanzamento Procedura Rendiconto**:
   - Mostra esattamente a che punto è la lavorazione dei **63 passaggi del Modello 5** per quel condominio, indicando sia il rapporto dei passaggi completati (es. **`55/63 passi`**) sia la **percentuale esatta con virgola** (es. **`87,3%`** per il condominio **DIAMANTE**) corredata da una barra di avanzamento colorata:
     - **Verde smeraldo**: `100%` (tutti i 63 passaggi completati).
     - **Arancione/Ambra**: procedura in corso di lavorazione (es. `87,3%`).
     - **Grigio**: `0%` (procedura non ancora iniziata).

### 2.3 Azioni Rapide sul Quadrante Condominio

In fondo a ogni scheda condominio trovi 4 pulsanti operativi:

- **`Dati`**: apre direttamente la scheda **Checklist Dati & Contatori** di quel condominio per spuntare o controllare le letture.
- **`✓ Fatto`**: segna il rendiconto dell'esercizio attuale come completato.
- **`↻ Fatto & Rinnova (+1a)`**: chiude il rendiconto dell'anno corrente, fa avanzare automaticamente di **+1 anno** le date di inizio e fine esercizio del condominio e azzera le spunte delle letture per il nuovo anno gestionale.
- **`Compila` / `Avvia Procedura Rendiconto (63 Passi)`** *(Pulsante verde in basso)*: apre direttamente la scheda **Procedura Rendiconto (Modello 5)** selezionando automaticamente quel condominio.

---

## 3. Condomini & Checklist Dati Necessari

Cliccando sulla seconda voce del menu laterale sinistro (**`Condomini & Checklist Dati`**), accedi all'elenco completo dei **79 condomini** con le rispettive checklist di raccolta dati preliminari.

![Condomini & Checklist Dati Necessari](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_04_condomini_checklist.png)

### 3.1 Spunta Letture, Contatori e Documenti Contabili

Per ogni condominio sono elencate le voci necessarie prima di poter redigere il bilancio (es. *Letture contatori acqua*, *Letture riscaldamento / ripartitori*, *Estratto conto bancario finale*, *Fatture fornitori esercizio*, *Quietanza F24 e ritenute*).

- **Per segnare un dato come acquisito**: clicca direttamente sulla casella della voce; diventerà **verde con il segno di spunta `✓`** e la barra percentuale del condominio si aggiornerà in tempo reale.
- Quando tutte le voci attive di un condominio sono spuntate (`100%`), il condominio passa automaticamente nella sezione **`PRONTI DA FARE`** della Dashboard.

### 3.2 Personalizzazione della Checklist e Date Esercizio

Su ogni riga condominio sono presenti i pulsanti di configurazione in alto a destra:

1. **`Configura Checklist` (icona ingranaggio)**: permette di attivare o disattivare specifiche voci per quel condominio (ad esempio disattivare il *Riscaldamento centralizzato* per i condomini termoautonomi) oppure di **aggiungere nuove voci personalizzate**.
2. **`Modifica Date Esercizio` (icona calendario)**: consente di rettificare in qualsiasi momento la data di inizio e fine esercizio contabile.
3. **Barra di Ricerca e Filtri Rapidi** (in alto): puoi cercare un condominio per nome o codice (`ST-...`) e filtrare per *Tutti*, *Gestione Chiusa*, *Pronti da Fare*, *Dati Mancanti* o *Completati*.
4. **`+ Nuovo Condominio`**: permette di inserire in anagrafica un nuovo condominio acquisito dallo Studio.

---

## 4. Procedura Rendiconto — Modello 5 (63 Passaggi)

Cliccando sulla terza voce del menu laterale (**`Procedura Rendiconto 63 Passi`**) — oppure cliccando il tasto verde **`Compila`** su un condominio nella Dashboard — si apre il cuore operativo del programma: la **Procedura Standard Modello 5**.

![Procedura Rendiconto — Vista Generale e Compilazione Guidata](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_05_procedura_wizard.png)

### 4.1 Struttura della Schermata e Indicatore `% Fatto (Scaletta)`

La schermata è progettata per non farti mai perdere il segno durante la lavorazione del bilancio:

- **Fascia Superiore del Condominio Attivo**:
  - Menu a tendina per scegliere o cambiare rapidamente il **Condominio in lavorazione** (es. `DIAMANTE — Esercizio 2025-06-01 → 2026-05-31`).
  - Riquadro **`% FATTO (SCALETTA)`** che mostra la percentuale di completamento (es. `87,3%`) e il conteggio `55 / 63 passaggi`.
  - Selettore delle **4 Sotto-schede del Modello 5**:
    1. `1. Scaletta & Passaggi`
    2. `2. Allegati & Pagine`
    3. `3. Nota & Acqua`
    4. `4. Prompt AI`
- **Riquadro Sempre Visibile nel Menu Laterale Sinistro (`AVANZAMENTO PROCEDURA`)**:
  - Anche mentre scorri la pagina verso il basso, nella barra nera a sinistra rimane sempre visibile il riquadro **`AVANZAMENTO PROCEDURA`** con il nome del condominio, la barra verde/azzurra **`87,3% (55/63)`**, il numero di passaggi *Fatti* e *Da fare* e il pulsante rapido per tornare al passaggio corrente.
- **Colonna Sinistra (`VISTA GENERALE PROCEDURA`)**:
  - Mostra l'elenco completo dei **63 passaggi** raggruppati nelle **5 Fasi**:
    1. *Fase 1 — Operazioni Preliminari & Contabilità Base*
    2. *Fase 2 — Chiusura C/C, Acqua, Riscaldamento & Quadratura*
    3. *Fase 3 — Preventivo, Rate & Verifiche Condominio*
    4. *Fase 4 — Fascicolo Rendiconto, Nota Esplicativa & AI*
    5. *Fase 5 — Adempimenti Dopo Assemblea*
  - Include una **casella di ricerca rapida** (es. cerca `acqua`, `Danea`, `assemblea`), un filtro per **Fase**, un filtro per stato (**`Tutti` / `Da fare` / `Fatti`**) e il pulsante arancione **`▶ Primo da fare`** che salta istantaneamente al primo passaggio non ancora completato.

### 4.2 Compilazione Sequenziale e Pulsante "Completa e Vai al Passaggio Successivo"

Nella **Colonna Destra** viene visualizzata la scheda di lavoro del passaggio selezionato:

- **Intestazione Passaggio**: indica il numero codice del passo (es. `PASSO #1`, `PASSO #39`, `PASSO #51`), lo stato (`COMPLETATO` con data e ora oppure `DA ESEGUIRE`) e la lettera dell'**Operatore incaricato** (`Chi lo fa: G / C / A`).
- **Istruzione Operativa del Passaggio**: riporta fedelmente la prescrizione del Modello 5 dello Studio Serra.
- **Dati da Compilare in questo Passaggio**: mostra le caselle specifiche richieste da quel singolo passaggio (importi di quadratura, pagine del documento per il fascicolo, date, note, ecc.). **Il salvataggio è completamente automatico** mentre digiti.
- **Pulsante Verde `✓ Completa e Vai al Passaggio Successivo →`**:
  - Con un solo clic **mette la spunta di completamento** sul passaggio attuale, aggiorna la percentuale d'avanzamento e **apre automaticamente la scheda del passaggio successivo**, permettendoti di lavorare in sequenza continua dall'1 al 63.
  - Puoi inoltre spostarti liberamente tra i passaggi usando i pulsanti `< Passaggio Prec.` / `Passaggio Succ. >`, le **frecce della tastiera `◀` e `▶`**, oppure cliccando su qualsiasi riga nella colonna di sinistra o nella striscia `SEQUENZA PASSAGGI ADIACENTI` in fondo.

---

### 4.3 Passaggi Speciali: Sinistri Multipli (Passo #38 e #39)

Nei passaggi dedicati alla verifica dei **Sinistri aperti o chiusi** (come il **Passo #39**), la scheda mette a disposizione una tabella dinamica dedicata:

![Passo #39 — Gestione Sinistri Aperti o Chiusi con aggiunta righe multiple](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_06_passo39_sinistri.png)

- Per ogni sinistro sono presenti due caselle affiancate:
  1. **`DATA SINISTRO`** (es. `18/11/25`)
  2. **`OGGETTO SINISTRO`** (es. `fulminazione portone, rimborso 682`)
- **Aggiunta di più sinistri**: cliccando il pulsante blu **`+`** a destra della riga (oppure **`+ Aggiungi Sinistro`** in alto a destra), viene creata subito una nuova riga con `Data Sinistro` e `Oggetto Sinistro` per registrare tutti i sinistri verificatisi nell'esercizio.
- Nella colonna di sinistra (`VISTA GENERALE PROCEDURA`), il badge del Passo #39 mostra automaticamente il conteggio dei sinistri registrati (es. `1 sinistro`).

---

### 4.4 Passaggi Speciali: Convocazione Assemblea — Luogo, Data e Ora (Passo #51)

Il **Passo #51 (`Prenotare sala assemblea`)** raccoglie tutte le coordinate della riunione assembleare in tre caselle dedicate:

![Passo #51 — Luogo, Data e Ora della Riunione Assembleare](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_07_passo51_assemblea.png)

1. **`LUOGO RIUNIONE (PRESSO)`**: dove si terrà l'assemblea (es. *Sala Riunioni Studio*, *Parrocchia*, ecc.).
2. **`DATA DELLA RIUNIONE`**: data fissata per l'assemblea (`gg/mm/aaaa`).
3. **`ORA DELLA RIUNIONE`**: orario di convocazione (es. `18:00`).

I campi **Data** e **Ora** dell'assemblea risiedono esclusivamente nel **Passo #51** assieme al **Luogo della riunione**, mentre i passi **#52** (*Creare ordine del giorno per assemblea*) e **#53** (*Unisci i documenti in un unico file Rendiconto*) restano snelli senza duplicazione di data/ora.

---

## 5. Fascicolo Allegati & Numerazione Automatica Pagine

Cliccando sulla sotto-scheda **`2. Allegati & Pagine`** nella testata della Procedura Rendiconto, si apre il prospetto **`DOCUMENTI DA ALLEGARE AL RENDICONTO (Numerazione Automatica Pagine)`** (corrispondente alle righe 65–85, colonne L–R del Modello 5 Excel).

![Fascicolo Allegati con Numerazione Automatica Pagine](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_10_fascicolo_allegati.png)

### Come funziona il calcolo automatico delle pagine:
1. **Collegamento diretto con i Passaggi della Scaletta**: quando inserisci il numero di pagine di un documento mentre compili i passaggi della scaletta (ad esempio `12 pag.` per la Nota Esplicativa al Passo #47, `4 pag.` per il Bilancio Consuntivo al Passo #25, `8 pag.` per il Registro di Contabilità al Passo #15), il valore viene riportato automaticamente in questa tabella. Puoi anche modificare il numero di pagine direttamente nella colonna **`PAG DOC`** della tabella.
2. **Spunta `PREDISPOSTO` (`Sì / No`)**: spuntando la casella blu a sinistra di ogni allegato, il programma:
   - Assegna il numero progressivo dell'allegato (**`N. (ALL.)`**).
   - Imposta la colonna **`INCLUSO`** a `1 (Sì)` (oppure `0 (No)` se il documento ha 0 pagine o non è spuntato, come nel caso di assenza di Bilancio Straordinario).
   - **Calcola istantaneamente la colonna `N. 1° PAG`** (il numero di pagina iniziale di ciascun documento all'interno del PDF unico del fascicolo) e il **Totale Pagine Fascicolo** in alto (es. **`48 pagine`** per il condominio Diamante).
3. **Pulsanti `Passo #... →`**: cliccando sul badge del passaggio nella colonna *RIF. SCALETTA*, torni direttamente al passaggio corrispondente della procedura.

---

## 6. Calcolatore Acqua Eccedente & Controlli Nota Esplicativa

Cliccando sulla sotto-scheda **`3. Nota & Acqua`**, accedi a due strumenti affiancati fondamentali per la quadratura contabile e la redazione della Nota Esplicativa:

![Calcolatore Acqua Eccedente & Checklist Nota Esplicativa](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_09_calcolatore_acqua_nota.png)

### Colonna Sinistra: Calcolatore Acqua Eccedente (Formule Modello 5)
Replica fedelmente le formule del foglio di calcolo dello Studio:
- Inserisci i 3 valori base:
  1. **`CONSUMO DEI CONTABILIZZATORI (MC) [CELLA P17]`**
  2. **`MC DELLE FATTURE (MC) [CELLA P18]`**
  3. **`COSTO FATTURE H2O (€) [CELLA P21]`**
- Il programma calcola in automatico:
  - **`mc oltre le letture`** (`= P18 - P17`)
  - **`Costo al mc`** (`= P21 / P18`)
  - **`QUOTA ACQUA ECCEDENTE`**: applica automaticamente la soglia di tolleranza di `50 mc` (`=IF(P19<50, 0, P22*P19)`) e ti avvisa se la quota supera i **€ 300,00** (per l'eventuale ripartizione in tabella).

### Colonna Destra: Checklist Controlli Nota Esplicativa (art. 1130 bis c.c.)
Elenca tutte le sezioni obbligatorie e di controllo da verificare prima di chiudere la Nota Esplicativa:
- *Controlli Nuovo Anno* (`01 Estratti conto NUOVO ANNO`, `02 Scritture contabili NUOVO ANNO`, `09 Comande`)
- *03 Rapporti in corso* (`Appalti`, `Preventivi approvati`, `A chiamata`, `Per comportamento concludente`)
- *04 Patrimonio & Inventario beni mobili*
- *05 Informazioni con rilevanza non numerale* (`Controversie/contenziosi`, `Recupero crediti`, `Garanzie prestate/ricevute`, `Beni di terzi`, `Questioni pendenti 10 anni`, `Casa custode`, `Postumi decennali`, ecc.)

---

## 7. Prompt AI per NotebookLM (Slide & Podcast Assemblea)

Cliccando sulla sotto-scheda **`4. Prompt AI`** (utilizzata al **Passo #54** della procedura), trovi i prompt ufficiali dello Studio Serra già pronti da copiare con un clic per **Google NotebookLM**:

![Prompt AI pronti per Slide e Podcast su NotebookLM](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_11_notebooklm_ai.png)

1. **`Prompt Presentazione SLIDE (NotebookLM)`**: istruzioni strutturate per generare la presentazione visiva del rendiconto da proiettare in assemblea e pubblicare su Danea / MioCondominio.
2. **`Prompt PODCAST Audio (NotebookLM)`**: istruzioni per generare il riepilogo vocale discorsivo che spiega ai condòmini le voci principali del consuntivo, del preventivo e della nota esplicativa.

---

## 8. Utilizzo da Cellulare / Tablet via Wi-Fi (Senza Cloud)

Cliccando sul pulsante **`Usa da Cellulare (Wi-Fi)`** nella barra laterale sinistra (oppure **`Usa da Cellulare (QR)`** in alto a destra), si apre la finestra di connessione rapida per smartphone e tablet:

![Connessione da Cellulare tramite QR Code Wi-Fi Locale](C:/Users/serra/.gemini/antigravity/brain/f2768fcf-efeb-4b6e-8739-0069e7650387/manual_12_mobile_qr_wifi.png)

- Assicurati che il cellulare o tablet sia collegato alla **stessa rete Wi-Fi** del computer dell'ufficio e inquadra il **QR Code** con la fotocamera per aprire l'interfaccia senza passare da alcun cloud esterno.

---

## 9. Dove Vengono Salvati i Dati e Come Fare il Backup

Tutti i dati inseriti nel programma risiedono **esclusivamente sul tuo computer**:

- **Database SQLite principale**: [`c:\Progetti\A-018 Assistente Amministratore\backend\studio_condominiale.db`](file:///c:/Progetti/A-018%20Assistente%20Amministratore/backend/studio_condominiale.db) (contiene tutti i condomini, le date d'esercizio, le scadenze dei 180 giorni e tutte le spunte delle checklist contatori/fatture).
- **Archivio Procedura 63 Passaggi**: `localStorage` del browser (`modello5_proc_v3_condo_<ID>`), sincronizzato in tempo reale con la Dashboard.
- **Anagrafica JSON Studio Serra**: [`c:\Progetti\A-018 Assistente Amministratore\frontend\src\data\condominiStudioSerra.json`](file:///c:/Progetti/A-018%20Assistente%20Amministratore/frontend/src/data/condominiStudioSerra.json).
