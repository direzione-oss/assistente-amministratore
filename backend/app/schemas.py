from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class AnagraficaBase(BaseModel):
    codice_danea: Optional[str] = None
    condominio_id: int
    nome_cognome: str
    email: Optional[str] = None
    pec: Optional[str] = None
    telefono: Optional[str] = None
    scala_interno: str
    ruolo: str = "Proprietario"
    is_consigliere: bool = False
    millesimi_generali: float = 0.0
    saldo_attuale: float = 0.0
    rate_scadute: int = 0
    note: Optional[str] = None


class AnagraficaOut(AnagraficaBase):
    id: int
    condominio_nome: Optional[str] = None

    class Config:
        from_attributes = True


class CondominioBase(BaseModel):
    codice_danea: Optional[str] = None
    nome: str
    indirizzo: Optional[str] = "Da specificare"
    citta: Optional[str] = "Bergamo"
    cap: Optional[str] = "24128"
    codice_fiscale: Optional[str] = None
    iban: Optional[str] = None
    numero_unita: int = 0
    esercizio_in_corso: Optional[str] = "2026"
    data_ultima_assemblea: Optional[str] = None
    fondo_cassa: float = 0.0
    totale_morosita: float = 0.0
    note_operative: Optional[str] = None
    data_inizio_esercizio: Optional[str] = None
    data_fine_esercizio: Optional[str] = None
    scadenza_rendiconto: Optional[str] = None
    rendiconto_stato: Optional[str] = "in_corso"
    documenti_necessari_json: Optional[str] = "[]"


class CondominioOut(CondominioBase):
    id: int
    ultimo_sync_danea: Optional[datetime] = None
    tickets_aperti_count: int = 0
    comunicazioni_da_gestire_count: int = 0
    documenti_totali: int = 0
    documenti_recuperati: int = 0
    percentuale_documenti: float = 0.0
    giorni_alla_scadenza: Optional[int] = None
    gestione_chiusa: bool = False

    class Config:
        from_attributes = True



class FornitoreBase(BaseModel):
    codice_danea: Optional[str] = None
    dettofatto_id: Optional[str] = None
    ragione_sociale: str
    categoria: str
    referente: Optional[str] = None
    email: Optional[str] = None
    pec: Optional[str] = None
    telefono: Optional[str] = None
    partita_iva: Optional[str] = None
    rating_affidabilita: float = 4.5
    interventi_attivi: int = 0
    fatture_da_pagare: float = 0.0


class FornitoreOut(FornitoreBase):
    id: int

    class Config:
        from_attributes = True


class ComunicazioneCreate(BaseModel):
    canale: str = "Gmail"
    mittente_nome: str
    mittente_email: str
    oggetto: str
    corpo: str
    condominio_id: Optional[int] = None


class ComunicazioneUpdate(BaseModel):
    stato_lavorazione: Optional[str] = None
    bozza_risposta_ai: Optional[str] = None
    letta: Optional[bool] = None
    archiviata: Optional[bool] = None
    condominio_id: Optional[int] = None


class ComunicazioneOut(BaseModel):
    id: int
    gmail_message_id: Optional[str] = None
    canale: str
    mittente_nome: str
    mittente_email: str
    oggetto: str
    corpo: str
    data_ricezione: datetime
    letta: bool
    archiviata: bool
    condominio_id: Optional[int] = None
    condominio_nome: Optional[str] = None
    anagrafica_id: Optional[int] = None
    anagrafica_scala: Optional[str] = None
    anagrafica_saldo: Optional[float] = None
    anagrafica_consigliere: Optional[bool] = None
    categoria_ai: str
    urgenza_ai: str
    riassunto_ai: Optional[str] = None
    azione_suggerita_ai: Optional[str] = None
    tipo_azione_rapida: Optional[str] = None
    bozza_risposta_ai: Optional[str] = None
    stato_lavorazione: str

    class Config:
        from_attributes = True


class TicketCreate(BaseModel):
    titolo: str
    descrizione: str
    categoria: str = "Idraulica"
    priorita: str = "Alta"
    stato: str = "Aperto"
    condominio_id: int
    fornitore_id: Optional[int] = None
    segnalante: Optional[str] = None
    costo_stimato: float = 0.0
    note_avanzamento: Optional[str] = None


class TicketUpdate(BaseModel):
    stato: Optional[str] = None
    priorita: Optional[str] = None
    fornitore_id: Optional[int] = None
    costo_stimato: Optional[float] = None
    note_avanzamento: Optional[str] = None


class TicketOut(BaseModel):
    id: int
    codice_dettofatto: str
    titolo: str
    descrizione: str
    categoria: str
    priorita: str
    stato: str
    condominio_id: int
    condominio_nome: Optional[str] = None
    fornitore_id: Optional[int] = None
    fornitore_nome: Optional[str] = None
    fornitore_telefono: Optional[str] = None
    segnalante: Optional[str] = None
    costo_stimato: float
    sincronizzato_dettofatto: bool
    data_apertura: datetime
    ultimo_aggiornamento: datetime
    note_avanzamento: Optional[str] = None

    class Config:
        from_attributes = True


class ScadenzaCreate(BaseModel):
    titolo: str
    descrizione: Optional[str] = None
    tipo: str = "Adempimento"
    data_scadenza: str
    ora: Optional[str] = "09:30"
    priorita: str = "Alta"
    condominio_id: Optional[int] = None
    sincronizzato_gcal: bool = True


class ScadenzaOut(BaseModel):
    id: int
    google_event_id: Optional[str] = None
    titolo: str
    descrizione: Optional[str] = None
    tipo: str
    data_scadenza: str
    ora: Optional[str] = None
    priorita: str
    completato: bool
    condominio_id: Optional[int] = None
    condominio_nome: Optional[str] = None
    sincronizzato_gcal: bool

    class Config:
        from_attributes = True


class AIChatRequest(BaseModel):
    messaggio: str
    contesto_condominio_id: Optional[int] = None


class IntegrationSettingsUpdate(BaseModel):
    ai_provider: str = "gemini"
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    danea_export_path: Optional[str] = None
    dettofatto_api_url: Optional[str] = None
    dettofatto_api_key: Optional[str] = None
    google_client_email: Optional[str] = None
    google_credentials_path: Optional[str] = None
    nome_studio: Optional[str] = "Studio Amministrazioni Condominiali"
    firma_email: Optional[str] = "Cordiali saluti,\nL'Amministratore\nStudio Gestione Condomini"


class PassoRendicontoUpdate(BaseModel):
    fatto: Optional[bool] = None
    chi_lo_fa: Optional[str] = None
    num_pagine: Optional[int] = None
    campi_extra: Optional[dict] = None
    note_passo: Optional[str] = None


class PassoRendicontoOut(BaseModel):
    id: int
    scheda_id: int
    ordine: int
    numero_codice: str
    sezione: str
    chi_lo_fa: str
    fatto: bool
    data_spunta: Optional[str] = None
    descrizione: str
    ha_pagine: bool
    doc_codice: Optional[str] = None
    num_pagine: int
    campi_extra: dict
    note_passo: Optional[str] = None


class SchedaRendicontoCreate(BaseModel):
    condominio_id: int
    gestione: str
    note_intestazione: Optional[str] = None
    chi_lo_fa_default: str = "G"


class SchedaRendicontoUpdate(BaseModel):
    gestione: Optional[str] = None
    fatto_il: Optional[str] = None
    note_intestazione: Optional[str] = None
    chi_lo_fa_default: Optional[str] = None
    acqua_consumo_contabilizzatori: Optional[float] = None
    acqua_mc_fatture: Optional[float] = None
    acqua_costo_fatture: Optional[float] = None
    nota_esplicativa_checks: Optional[list] = None


class SchedaRendicontoOut(BaseModel):
    id: int
    condominio_id: int
    condominio_nome: str
    condominio_codice_danea: Optional[str] = None
    condominio_iban: Optional[str] = None
    procedura_codice: str
    gestione: str
    fatto_il: Optional[str] = None
    note_intestazione: Optional[str] = None
    chi_lo_fa_default: str
    totale_passi: int
    passi_completati: int
    percentuale_fatto: float
    post_assemblea_completati: int = 0
    post_assemblea_totale: int = 5
    in_attesa_assemblea: bool = False
    calcolatore_acqua: dict
    nota_esplicativa_checks: list
    documenti_allegati: list
    totale_pagine_fascicolo: int
    passi: List[PassoRendicontoOut]
    prompt_slide_notebooklm: str
    prompt_podcast_notebooklm: str


class AssembleaStraordinariaCreate(BaseModel):
    condominio_id: int
    titolo: str
    tipo: str = "Straordinaria"
    data_prima_convocazione: Optional[str] = None
    ora_prima_convocazione: Optional[str] = "07:00"
    data_assemblea: Optional[str] = None
    ora_assemblea: Optional[str] = "18:00"
    luogo_sala: Optional[str] = "Sala Riunioni Studio Serra"
    ordine_del_giorno: Optional[str] = None
    presidente: Optional[str] = None
    segretario: Optional[str] = None
    modalita_invio: Optional[str] = "PEC / Raccomandata / Consegna a mano"
    fatturata: bool = False
    importo_compenso: float = 0.0
    note_generali: Optional[str] = None
    scaletta: Optional[list] = None


class AssembleaStraordinariaUpdate(BaseModel):
    condominio_id: Optional[int] = None
    titolo: Optional[str] = None
    tipo: Optional[str] = None
    data_prima_convocazione: Optional[str] = None
    ora_prima_convocazione: Optional[str] = None
    data_assemblea: Optional[str] = None
    ora_assemblea: Optional[str] = None
    luogo_sala: Optional[str] = None
    ordine_del_giorno: Optional[str] = None
    presidente: Optional[str] = None
    segretario: Optional[str] = None
    modalita_invio: Optional[str] = None
    fatturata: Optional[bool] = None
    importo_compenso: Optional[float] = None
    stato: Optional[str] = None
    note_generali: Optional[str] = None
    scaletta: Optional[list] = None


class AssembleaStraordinariaOut(BaseModel):
    id: int
    condominio_id: int
    condominio_nome: str
    condominio_codice_danea: Optional[str] = None
    condominio_indirizzo: Optional[str] = None
    titolo: str
    tipo: str
    data_prima_convocazione: Optional[str] = None
    ora_prima_convocazione: Optional[str] = None
    data_assemblea: Optional[str] = None
    ora_assemblea: Optional[str] = None
    luogo_sala: Optional[str] = None
    ordine_del_giorno: Optional[str] = None
    presidente: Optional[str] = None
    segretario: Optional[str] = None
    modalita_invio: Optional[str] = None
    fatturata: bool = False
    importo_compenso: float = 0.0
    stato: str
    note_generali: Optional[str] = None
    scaletta: list
    passi_completati: int
    totale_passi: int
    percentuale: float
    data_creazione: Optional[datetime] = None
    ultimo_aggiornamento: Optional[datetime] = None


