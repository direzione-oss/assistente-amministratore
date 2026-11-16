from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Text,
    ForeignKey,
    DateTime,
)
from sqlalchemy.orm import relationship
from .database import Base


class Condominio(Base):
    __tablename__ = "condomini"

    id = Column(Integer, primary_key=True, index=True)
    codice_danea = Column(String(50), unique=True, index=True)
    danea_id = Column(Integer, index=True, nullable=True)
    attivo = Column(Boolean, default=True, nullable=False)
    nome = Column(String(200), nullable=False)
    indirizzo = Column(String(250), nullable=True)
    citta = Column(String(100), default="Bergamo")
    cap = Column(String(10), default="24128")
    codice_fiscale = Column(String(30), nullable=True)
    iban = Column(String(50), nullable=True)
    numero_unita = Column(Integer, default=0)
    esercizio_in_corso = Column(String(50), default="2026")
    data_ultima_assemblea = Column(String(30), nullable=True)
    fondo_cassa = Column(Float, default=0.0)
    totale_morosita = Column(Float, default=0.0)
    note_operative = Column(Text, nullable=True)
    ultimo_sync_danea = Column(DateTime, default=datetime.utcnow)

    # Gestione Rendiconto & Checklist Documenti
    data_inizio_esercizio = Column(String(30), nullable=True)
    data_fine_esercizio = Column(String(30), nullable=True)
    scadenza_rendiconto = Column(String(30), nullable=True)
    rendiconto_stato = Column(String(30), default="in_corso")  # in_corso, completato
    documenti_necessari_json = Column(Text, default="[]")


    anagrafiche = relationship("Anagrafica", back_populates="condominio", cascade="all, delete-orphan")
    comunicazioni = relationship("Comunicazione", back_populates="condominio")
    tickets = relationship("TicketManutenzione", back_populates="condominio")
    scadenze = relationship("ScadenzaTask", back_populates="condominio")
    schede_rendiconto = relationship("SchedaRendiconto", back_populates="condominio", cascade="all, delete-orphan")
    assemblee_straordinarie = relationship("AssembleaStraordinaria", back_populates="condominio", cascade="all, delete-orphan")


class Anagrafica(Base):
    __tablename__ = "anagrafiche"

    id = Column(Integer, primary_key=True, index=True)
    codice_danea = Column(String(50), index=True, nullable=True)
    condominio_id = Column(Integer, ForeignKey("condomini.id"), nullable=False)
    nome_cognome = Column(String(200), nullable=False)
    email = Column(String(200), index=True, nullable=True)
    pec = Column(String(200), nullable=True)
    telefono = Column(String(50), nullable=True)
    scala_interno = Column(String(100), nullable=False)
    ruolo = Column(String(50), default="Proprietario")  # Proprietario, Inquilino, Consigliere
    is_consigliere = Column(Boolean, default=False)
    millesimi_generali = Column(Float, default=0.0)
    saldo_attuale = Column(Float, default=0.0)  # Positivo = a debito (moroso), Negativo/0 = in regola
    rate_scadute = Column(Integer, default=0)
    note = Column(Text, nullable=True)

    condominio = relationship("Condominio", back_populates="anagrafiche")
    comunicazioni = relationship("Comunicazione", back_populates="mittente_anagrafica")


class Fornitore(Base):
    __tablename__ = "fornitori"

    id = Column(Integer, primary_key=True, index=True)
    codice_danea = Column(String(50), index=True, nullable=True)
    dettofatto_id = Column(String(80), index=True, nullable=True)
    ragione_sociale = Column(String(200), nullable=False)
    categoria = Column(String(100), nullable=False)  # Idraulico, Elettricista, Ascensorista, Pulizie, Edile, Caldaie
    referente = Column(String(150), nullable=True)
    email = Column(String(200), nullable=True)
    pec = Column(String(200), nullable=True)
    telefono = Column(String(50), nullable=True)
    partita_iva = Column(String(30), nullable=True)
    rating_affidabilita = Column(Float, default=4.5)
    interventi_attivi = Column(Integer, default=0)
    fatture_da_pagare = Column(Float, default=0.0)

    tickets = relationship("TicketManutenzione", back_populates="fornitore")


class Comunicazione(Base):
    __tablename__ = "comunicazioni"

    id = Column(Integer, primary_key=True, index=True)
    gmail_message_id = Column(String(120), unique=True, index=True, nullable=True)
    canale = Column(String(40), default="Gmail")  # Gmail, PEC, WhatsApp/DettoFatto
    mittente_nome = Column(String(200), nullable=False)
    mittente_email = Column(String(200), nullable=False)
    oggetto = Column(String(300), nullable=False)
    corpo = Column(Text, nullable=False)
    data_ricezione = Column(DateTime, default=datetime.utcnow)
    letta = Column(Boolean, default=False)
    archiviata = Column(Boolean, default=False)

    # Associazioni CRM
    condominio_id = Column(Integer, ForeignKey("condomini.id"), nullable=True)
    anagrafica_id = Column(Integer, ForeignKey("anagrafiche.id"), nullable=True)

    # Analisi del Segretario AI
    categoria_ai = Column(String(80), default="Da classificare")
    # Guasto/Manutenzione, Contabilità/Rate, Assemblea/Verbali, Fornitore/Fattura, Legale/PEC, Info Generali
    urgenza_ai = Column(String(30), default="Media")  # Critica, Alta, Media, Bassa
    riassunto_ai = Column(Text, nullable=True)
    azione_suggerita_ai = Column(String(250), nullable=True)
    tipo_azione_rapida = Column(String(50), nullable=True)  # crea_ticket_dettofatto, invia_estratto_danea, fissa_appuntamento, rispondi
    bozza_risposta_ai = Column(Text, nullable=True)
    stato_lavorazione = Column(String(50), default="Da gestire")  # Da gestire, In attesa fornitore, Risposta inviata, Convertita in Ticket

    condominio = relationship("Condominio", back_populates="comunicazioni")
    mittente_anagrafica = relationship("Anagrafica", back_populates="comunicazioni")


class TicketManutenzione(Base):
    __tablename__ = "tickets_manutenzione"

    id = Column(Integer, primary_key=True, index=True)
    codice_dettofatto = Column(String(80), unique=True, index=True)
    titolo = Column(String(250), nullable=False)
    descrizione = Column(Text, nullable=False)
    categoria = Column(String(100), default="Idraulica")
    priorita = Column(String(30), default="Alta")  # Urgente, Alta, Normale, Programmata
    stato = Column(String(50), default="Aperto")  # Aperto, Assegnato a Fornitore, Sopralluogo, In Corso, Risolto
    condominio_id = Column(Integer, ForeignKey("condomini.id"), nullable=False)
    fornitore_id = Column(Integer, ForeignKey("fornitori.id"), nullable=True)
    segnalante = Column(String(200), nullable=True)
    costo_stimato = Column(Float, default=0.0)
    sincronizzato_dettofatto = Column(Boolean, default=True)
    data_apertura = Column(DateTime, default=datetime.utcnow)
    ultimo_aggiornamento = Column(DateTime, default=datetime.utcnow)
    note_avanzamento = Column(Text, nullable=True)

    condominio = relationship("Condominio", back_populates="tickets")
    fornitore = relationship("Fornitore", back_populates="tickets")


class ScadenzaTask(Base):
    __tablename__ = "scadenze_tasks"

    id = Column(Integer, primary_key=True, index=True)
    google_event_id = Column(String(120), index=True, nullable=True)
    titolo = Column(String(250), nullable=False)
    descrizione = Column(Text, nullable=True)
    tipo = Column(String(60), default="Adempimento")  # Assemblea, Scadenza Fiscale, Manutenzione Periodica, Pagamento/F24, Appuntamento
    data_scadenza = Column(String(40), nullable=False)  # ISO date/datetime string
    ora = Column(String(20), nullable=True)
    priorita = Column(String(30), default="Alta")
    completato = Column(Boolean, default=False)
    condominio_id = Column(Integer, ForeignKey("condomini.id"), nullable=True)
    sincronizzato_gcal = Column(Boolean, default=False)

    condominio = relationship("Condominio", back_populates="scadenze")


class IntegrationConfig(Base):
    __tablename__ = "integration_configs"

    id = Column(Integer, primary_key=True, index=True)
    chiave = Column(String(100), unique=True, index=True, nullable=False)
    valore = Column(Text, nullable=True)
    attivo = Column(Boolean, default=False)
    ultimo_sync = Column(String(60), nullable=True)
    stato_connessione = Column(String(100), default="Modalità Demo Attiva")


class SchedaRendiconto(Base):
    __tablename__ = "schede_rendiconto"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condomini.id"), nullable=False)
    procedura_codice = Column(String(80), default="Procedura 002 - Modello 5")
    gestione = Column(String(100), nullable=False)
    fatto_il = Column(String(40), nullable=True)
    note_intestazione = Column(Text, nullable=True)
    chi_lo_fa_default = Column(String(30), default="G")

    # Calcolatore Acqua Eccedente (colonne O-P righe 17-23 di modello 5)
    acqua_consumo_contabilizzatori = Column(Float, default=0.0)
    acqua_mc_fatture = Column(Float, default=0.0)
    acqua_costo_fatture = Column(Float, default=0.0)

    # Checklist secondaria "DA FARE / SENZA PERIODO GESTITO / NOTA ESPLICATIVA" (righe 70-89)
    nota_esplicativa_checks_json = Column(Text, default="[]")

    data_creazione = Column(DateTime, default=datetime.utcnow)
    ultimo_aggiornamento = Column(DateTime, default=datetime.utcnow)

    condominio = relationship("Condominio", back_populates="schede_rendiconto")
    passi = relationship(
        "PassoRendiconto",
        back_populates="scheda",
        cascade="all, delete-orphan",
        order_by="PassoRendiconto.ordine",
    )


class PassoRendiconto(Base):
    __tablename__ = "passi_rendiconto"

    id = Column(Integer, primary_key=True, index=True)
    scheda_id = Column(Integer, ForeignKey("schede_rendiconto.id"), nullable=False)
    ordine = Column(Integer, nullable=False)
    numero_codice = Column(String(20), nullable=False)
    sezione = Column(String(150), nullable=False)
    chi_lo_fa = Column(String(20), default="G")
    fatto = Column(Boolean, default=False)
    data_spunta = Column(String(40), nullable=True)
    descrizione = Column(Text, nullable=False)
    ha_pagine = Column(Boolean, default=False)
    doc_codice = Column(String(60), nullable=True)
    num_pagine = Column(Integer, default=0)
    campi_extra_json = Column(Text, default="{}")
    note_passo = Column(Text, nullable=True)

    scheda = relationship("SchedaRendiconto", back_populates="passi")


class AssembleaStraordinaria(Base):
    __tablename__ = "assemblee_straordinarie"

    id = Column(Integer, primary_key=True, index=True)
    condominio_id = Column(Integer, ForeignKey("condomini.id"), nullable=False)
    titolo = Column(String(250), nullable=False)
    tipo = Column(String(50), default="Straordinaria")  # Straordinaria, Ordinaria
    data_prima_convocazione = Column(String(40), nullable=True)
    ora_prima_convocazione = Column(String(20), nullable=True)
    data_assemblea = Column(String(40), nullable=True)
    ora_assemblea = Column(String(20), nullable=True)
    luogo_sala = Column(String(200), default="Sala Riunioni Studio Serra")
    ordine_del_giorno = Column(Text, nullable=True)
    presidente = Column(String(150), nullable=True)
    segretario = Column(String(150), nullable=True)
    modalita_invio = Column(String(100), default="PEC / Raccomandata / Consegna a mano")
    fatturata = Column(Boolean, default=False)
    importo_compenso = Column(Float, default=0.0)
    stato = Column(String(50), default="in_organizzazione")
    note_generali = Column(Text, nullable=True)
    scaletta_json = Column(Text, default="[]")

    data_creazione = Column(DateTime, default=datetime.utcnow)
    ultimo_aggiornamento = Column(DateTime, default=datetime.utcnow)

    condominio = relationship("Condominio", back_populates="assemblee_straordinarie")


