import json
import os
from datetime import datetime, timedelta, date
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from .auth import (
    AUTH_ENABLED,
    AUTH_COOKIE_NAME,
    TOKEN_TTL_SECONDS,
    verify_credentials,
    create_access_token,
    verify_access_token,
    extract_token,
    get_client_ip,
    check_login_rate_limit,
    record_login_attempt,
)

from .database import engine, Base, get_db, SessionLocal
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
    AssembleaStraordinaria,
)
from .schemas import (
    CondominioBase,
    CondominioOut,
    AnagraficaBase,
    AnagraficaOut,
    FornitoreBase,
    FornitoreOut,
    ComunicazioneCreate,
    ComunicazioneUpdate,
    ComunicazioneOut,
    TicketCreate,
    TicketUpdate,
    TicketOut,
    ScadenzaCreate,
    ScadenzaOut,
    AIChatRequest,
    IntegrationSettingsUpdate,
    PassoRendicontoUpdate,
    PassoRendicontoOut,
    SchedaRendicontoCreate,
    SchedaRendicontoUpdate,
    SchedaRendicontoOut,
    AssembleaStraordinariaCreate,
    AssembleaStraordinariaUpdate,
    AssembleaStraordinariaOut,
)
from .seed import seed_initial_data, create_scheda_for_condominio
from .services.ai_secretary import AISecretaryService, get_config_value
from .services.rendiconto_service import (
    calcola_documenti_allegati,
    calcola_acqua_eccedente,
    PROMPT_SLIDE_NOTEBOOKLM,
    PROMPT_PODCAST_NOTEBOOKLM,
    CUSTOM_PASSI_CONFIG_KEY,
    DEFAULT_PASSI_MODELLO_5,
    get_custom_passi_modello_5,
    normalize_passi_template,
    sync_all_schede_with_custom_passi,
)
from .connectors.danea_connector import DaneaConnector
from .connectors.dettofatto_connector import DettoFattoConnector
from .connectors.google_connector import GoogleWorkspaceConnector

Base.metadata.create_all(bind=engine)

_ENABLE_DOCS = os.environ.get("ENABLE_SWAGGER_DOCS", "false").lower() in ("1", "true", "yes")

app = FastAPI(
    title="Assistente Amministratore di Condominio - CRM & Segretario AI",
    version="1.0.0",
    docs_url="/docs" if _ENABLE_DOCS else None,
    redoc_url="/redoc" if _ENABLE_DOCS else None,
    openapi_url="/openapi.json" if _ENABLE_DOCS else None,
)

_DEFAULT_ALLOWED_ORIGINS = [
    "https://assistente.187.126.30.207.sslip.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8502",
    "http://127.0.0.1:8502",
    "http://localhost:8018",
    "http://127.0.0.1:8018",
]
_EXTRA_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(_DEFAULT_ALLOWED_ORIGINS + _EXTRA_ORIGINS)),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)


_PUBLIC_API_PATHS = {"/api/health", "/api/auth/login", "/api/auth/logout"}
_PROTECTED_DOC_PATHS = {"/docs", "/redoc", "/openapi.json"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    host = request.headers.get("host", "").split(":")[0].lower()
    forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
    is_https = request.url.scheme == "https" or forwarded_proto == "https"

    # Redirect automatico HTTP -> HTTPS sul dominio pubblico VPS
    if (
        forwarded_proto == "http"
        and host.endswith(".sslip.io")
        and path != "/api/health"
    ):
        https_url = str(request.url).replace("http://", "https://", 1)
        return RedirectResponse(url=https_url, status_code=308)

    requires_auth = (
        AUTH_ENABLED
        and request.method != "OPTIONS"
        and (
            (path.startswith("/api/") and path not in _PUBLIC_API_PATHS)
            or path in _PROTECTED_DOC_PATHS
        )
    )
    if requires_auth:
        token = extract_token(request)
        user_email = verify_access_token(token)
        if not user_email:
            return JSONResponse(
                status_code=401,
                content={"detail": "Autenticazione richiesta"},
            )
        request.state.user_email = user_email

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if is_https:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


class LoginRequest(BaseModel):
    email: str
    password: str


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request):
    client_ip = get_client_ip(request)
    allowed, retry_after = check_login_rate_limit(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Troppi tentativi di accesso falliti. Riprova tra {retry_after} secondi.",
        )

    if not verify_credentials(payload.email, payload.password):
        record_login_attempt(client_ip, False)
        raise HTTPException(status_code=401, detail="Email o password non validi")

    record_login_attempt(client_ip, True)
    email_clean = payload.email.strip().lower()
    token = create_access_token(email_clean)
    response = JSONResponse(
        content={
            "access_token": token,
            "token_type": "bearer",
            "email": email_clean,
        }
    )
    is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").lower() == "https"
    )
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=is_https,
        max_age=TOKEN_TTL_SECONDS,
        path="/",
    )
    return response


@app.get("/api/auth/me")
def get_current_user(request: Request):
    email = getattr(request.state, "user_email", None)
    return {"authenticated": True, "email": email}


@app.post("/api/auth/logout")
def logout():
    response = JSONResponse(content={"success": True})
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    return response


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()


def serialize_comunicazione(c: Comunicazione) -> ComunicazioneOut:
    return ComunicazioneOut(
        id=c.id,
        gmail_message_id=c.gmail_message_id,
        canale=c.canale,
        mittente_nome=c.mittente_nome,
        mittente_email=c.mittente_email,
        oggetto=c.oggetto,
        corpo=c.corpo,
        data_ricezione=c.data_ricezione,
        letta=c.letta,
        archiviata=c.archiviata,
        condominio_id=c.condominio_id,
        condominio_nome=c.condominio.nome if c.condominio else None,
        anagrafica_id=c.anagrafica_id,
        anagrafica_scala=c.mittente_anagrafica.scala_interno if c.mittente_anagrafica else None,
        anagrafica_saldo=c.mittente_anagrafica.saldo_attuale if c.mittente_anagrafica else None,
        anagrafica_consigliere=c.mittente_anagrafica.is_consigliere if c.mittente_anagrafica else False,
        categoria_ai=c.categoria_ai,
        urgenza_ai=c.urgenza_ai,
        riassunto_ai=c.riassunto_ai,
        azione_suggerita_ai=c.azione_suggerita_ai,
        tipo_azione_rapida=c.tipo_azione_rapida,
        bozza_risposta_ai=c.bozza_risposta_ai,
        stato_lavorazione=c.stato_lavorazione,
    )


def serialize_ticket(t: TicketManutenzione) -> TicketOut:
    return TicketOut(
        id=t.id,
        codice_dettofatto=t.codice_dettofatto,
        titolo=t.titolo,
        descrizione=t.descrizione,
        categoria=t.categoria,
        priorita=t.priorita,
        stato=t.stato,
        condominio_id=t.condominio_id,
        condominio_nome=t.condominio.nome if t.condominio else None,
        fornitore_id=t.fornitore_id,
        fornitore_nome=t.fornitore.ragione_sociale if t.fornitore else None,
        fornitore_telefono=t.fornitore.telefono if t.fornitore else None,
        segnalante=t.segnalante,
        costo_stimato=t.costo_stimato,
        sincronizzato_dettofatto=t.sincronizzato_dettofatto,
        data_apertura=t.data_apertura,
        ultimo_aggiornamento=t.ultimo_aggiornamento,
        note_avanzamento=t.note_avanzamento,
    )


# ---------------------------------------------------------
# 1. DASHBOARD & BRIEFING MATTUTINO DEL SEGRETARIO
# ---------------------------------------------------------
@app.get("/api/dashboard/briefing")
def get_dashboard_briefing(db: Session = Depends(get_db)):
    condomini = db.query(Condominio).order_by(Condominio.nome).all()
    schede = db.query(SchedaRendiconto).options(joinedload(SchedaRendiconto.passi)).order_by(SchedaRendiconto.id.asc()).all()
    condo_al_100 = set()
    for s in schede:
        passi = s.passi or []
        if passi:
            pre_passi = [p for p in passi if "Dopo Assemblea" not in (p.sezione or "") and p.numero_codice not in ("58", "59", "60", "61", "62")]
            passo_57_done = any(p.numero_codice == "57" and p.fatto for p in passi)
            all_pre_done = len(pre_passi) > 0 and all(p.fatto for p in pre_passi)
            if passo_57_done or all_pre_done:
                condo_al_100.add(s.condominio_id)

    today = datetime.utcnow().date()

    gestioni_chiuse = []
    gestioni_in_corso = []
    scadenze_urgenti = []
    condomini_dati_mancanti = []
    rendiconti_completati = 0

    for c in condomini:
        is_completato = (c.rendiconto_stato == "completato")
        is_al_100 = is_completato or (c.id in condo_al_100)
        if is_completato:
            rendiconti_completati += 1

        docs = []
        try:
            if c.documenti_necessari_json:
                docs = json.loads(c.documenti_necessari_json)
        except Exception:
            docs = []

        richiesti = [d for d in docs if d.get("richiesto", True)]
        mancanti = [d for d in richiesti if not d.get("recuperato", False)]

        # Scadenza & Giorni
        giorni_scad = None
        if c.scadenza_rendiconto:
            try:
                dt_scad = datetime.strptime(c.scadenza_rendiconto, "%Y-%m-%d").date()
                giorni_scad = (dt_scad - today).days
            except Exception:
                giorni_scad = None

        # Chiusura esercizio
        dt_fine = None
        if c.data_fine_esercizio:
            try:
                dt_fine = datetime.strptime(c.data_fine_esercizio, "%Y-%m-%d").date()
            except Exception:
                dt_fine = None

        is_chiusa = bool(dt_fine and today > dt_fine)

        condo_summary = {
            "id": c.id,
            "nome": c.nome,
            "codice_danea": c.codice_danea,
            "data_fine_esercizio": c.data_fine_esercizio,
            "scadenza_rendiconto": c.scadenza_rendiconto,
            "giorni_alla_scadenza": giorni_scad,
            "rendiconto_stato": c.rendiconto_stato or "in_corso",
            "documenti_richiesti": len(richiesti),
            "documenti_mancanti": len(mancanti),
            "mancanti_dettaglio": [m["titolo"] for m in mancanti],
            "gestione_chiusa": is_chiusa,
        }

        if is_chiusa:
            if not is_al_100:
                gestioni_chiuse.append(condo_summary)
                if giorni_scad is not None:
                    scadenze_urgenti.append(condo_summary)
                if len(mancanti) > 0:
                    condomini_dati_mancanti.append(condo_summary)
        else:
            gestioni_in_corso.append(condo_summary)

    # Ordina scadenze imminenti per giorni rimanenti (le più vicine o scadute per prime)
    scadenze_urgenti.sort(key=lambda x: (x["giorni_alla_scadenza"] if x["giorni_alla_scadenza"] is not None else 9999))

    briefing_text = (
        f"Pannello Rendiconti Studio Serra: {len(gestioni_chiuse)} gestioni risultano CHIUSE "
        f"con termine di rendiconto attivo (180 giorni di legge). "
        f"{len(scadenze_urgenti)} bilanci da redigere, di cui {len(condomini_dati_mancanti)} richiedono "
        f"il recupero delle letture contatori e dei documenti necessari."
    )

    return {
        "briefing_text": briefing_text,
        "kpi": {
            "condomini_totali": len(condomini),
            "gestioni_chiuse": len(gestioni_chiuse),
            "gestioni_in_corso": len(gestioni_in_corso),
            "rendiconti_da_redigere": len(condomini) - rendiconti_completati,
            "rendiconti_completati": rendiconti_completati,
            "condomini_dati_mancanti": len(condomini_dati_mancanti),
            "scadenze_imminenti": len([s for s in scadenze_urgenti if s["giorni_alla_scadenza"] is not None and s["giorni_alla_scadenza"] <= 60]),
        },
        "scadenze_gestioni_chiuse": scadenze_urgenti,
        "necessita_recupero_dati": condomini_dati_mancanti,
    }



# ---------------------------------------------------------
# 2. RICERCA GLOBALE RAPIDA (Ctrl+K)
# ---------------------------------------------------------
@app.get("/api/search")
def global_search(q: str = "", db: Session = Depends(get_db)):
    q = q.strip()
    if not q:
        return {"condomini": [], "anagrafiche": [], "tickets": [], "comunicazioni": []}

    condomini = (
        db.query(Condominio)
        .filter(
            (Condominio.nome.ilike(f"%{q}%"))
            | (Condominio.indirizzo.ilike(f"%{q}%"))
            | (Condominio.codice_danea.ilike(f"%{q}%"))
        )
        .limit(5)
        .all()
    )
    anagrafiche = (
        db.query(Anagrafica)
        .filter(
            (Anagrafica.nome_cognome.ilike(f"%{q}%"))
            | (Anagrafica.email.ilike(f"%{q}%"))
            | (Anagrafica.scala_interno.ilike(f"%{q}%"))
        )
        .limit(6)
        .all()
    )
    tickets = (
        db.query(TicketManutenzione)
        .filter(
            (TicketManutenzione.titolo.ilike(f"%{q}%"))
            | (TicketManutenzione.codice_dettofatto.ilike(f"%{q}%"))
        )
        .limit(5)
        .all()
    )
    comunicazioni = (
        db.query(Comunicazione)
        .filter(
            (Comunicazione.oggetto.ilike(f"%{q}%"))
            | (Comunicazione.mittente_nome.ilike(f"%{q}%"))
        )
        .limit(5)
        .all()
    )

    return {
        "condomini": [{"id": c.id, "nome": c.nome, "indirizzo": c.indirizzo, "codice_danea": c.codice_danea} for c in condomini],
        "anagrafiche": [
            {
                "id": a.id,
                "nome_cognome": a.nome_cognome,
                "scala_interno": a.scala_interno,
                "condominio_nome": a.condominio.nome if a.condominio else "",
                "condominio_id": a.condominio_id,
                "saldo_attuale": a.saldo_attuale,
            }
            for a in anagrafiche
        ],
        "tickets": [{"id": t.id, "codice_dettofatto": t.codice_dettofatto, "titolo": t.titolo, "stato": t.stato} for t in tickets],
        "comunicazioni": [{"id": m.id, "oggetto": m.oggetto, "mittente_nome": m.mittente_nome, "categoria_ai": m.categoria_ai} for m in comunicazioni],
    }


# ---------------------------------------------------------
# 3. CONDOMINI, ANAGRAFICHE & CONTABILITÀ DANEA
def _serialize_condominio(c: Condominio, today: Optional[date] = None) -> CondominioOut:
    if today is None:
        today = datetime.utcnow().date()

    t_open = sum(1 for t in (c.tickets or []) if t.stato != "Risolto")
    m_open = sum(1 for m in (c.comunicazioni or []) if m.stato_lavorazione == "Da gestire")

    docs = []
    try:
        if c.documenti_necessari_json:
            docs = json.loads(c.documenti_necessari_json)
    except Exception:
        docs = []

    richiesti = [d for d in docs if d.get("richiesto", False)]
    recuperati = [d for d in richiesti if d.get("recuperato", False)]
    pct_docs = round((len(recuperati) / len(richiesti) * 100), 1) if richiesti else 100.0

    giorni_scad = None
    if c.scadenza_rendiconto:
        try:
            dt_scad = datetime.strptime(c.scadenza_rendiconto, "%Y-%m-%d").date()
            giorni_scad = (dt_scad - today).days
        except Exception:
            giorni_scad = None

    gestione_chiusa = False
    if c.data_fine_esercizio:
        try:
            dt_fine = datetime.strptime(c.data_fine_esercizio, "%Y-%m-%d").date()
            gestione_chiusa = today > dt_fine
        except Exception:
            gestione_chiusa = False

    return CondominioOut(
        id=c.id,
        codice_danea=c.codice_danea,
        nome=c.nome,
        indirizzo=c.indirizzo or "Da specificare",
        citta=c.citta or "Bergamo",
        cap=c.cap or "24128",
        codice_fiscale=c.codice_fiscale or "-",
        iban=c.iban,
        numero_unita=c.numero_unita or 0,
        esercizio_in_corso=c.esercizio_in_corso,
        data_ultima_assemblea=c.data_ultima_assemblea,
        fondo_cassa=c.fondo_cassa or 0.0,
        totale_morosita=c.totale_morosita or 0.0,
        note_operative=c.note_operative,
        ultimo_sync_danea=c.ultimo_sync_danea,
        data_inizio_esercizio=c.data_inizio_esercizio,
        data_fine_esercizio=c.data_fine_esercizio,
        scadenza_rendiconto=c.scadenza_rendiconto,
        rendiconto_stato=c.rendiconto_stato or "da_iniziare",
        documenti_necessari_json=c.documenti_necessari_json or "[]",
        tickets_aperti_count=t_open,
        comunicazioni_da_gestire_count=m_open,
        documenti_totali=len(richiesti),
        documenti_recuperati=len(recuperati),
        percentuale_documenti=pct_docs,
        giorni_alla_scadenza=giorni_scad,
        gestione_chiusa=gestione_chiusa,
    )


# ---------------------------------------------------------
# Condomini & Dashboard Scadenze Rendiconto
# ---------------------------------------------------------
@app.get("/api/condomini", response_model=List[CondominioOut])
def list_condomini(db: Session = Depends(get_db)):
    conds = (
        db.query(Condominio)
        .options(joinedload(Condominio.tickets), joinedload(Condominio.comunicazioni))
        .order_by(Condominio.nome)
        .all()
    )
    today = datetime.utcnow().date()
    return [_serialize_condominio(c, today) for c in conds]


@app.patch("/api/condomini/{condominio_id}/documenti-necessari")
def update_condominio_documenti(
    condominio_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    condominio = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio non trovato")

    if "documenti" in payload:
        condominio.documenti_necessari_json = json.dumps(payload["documenti"], ensure_ascii=False)
    if "rendiconto_stato" in payload:
        condominio.rendiconto_stato = payload["rendiconto_stato"]
    if "data_inizio_esercizio" in payload:
        condominio.data_inizio_esercizio = payload["data_inizio_esercizio"]
    if "data_fine_esercizio" in payload:
        condominio.data_fine_esercizio = payload["data_fine_esercizio"]
    if "scadenza_rendiconto" in payload:
        condominio.scadenza_rendiconto = payload["scadenza_rendiconto"]
    if "esercizio_in_corso" in payload:
        condominio.esercizio_in_corso = payload["esercizio_in_corso"]
    if "data_ultima_assemblea" in payload:
        condominio.data_ultima_assemblea = payload["data_ultima_assemblea"]

    db.commit()
    db.refresh(condominio)

    return {
        "success": True,
        "condominio_id": condominio.id,
        "rendiconto_stato": condominio.rendiconto_stato,
        "data_inizio_esercizio": condominio.data_inizio_esercizio,
        "data_fine_esercizio": condominio.data_fine_esercizio,
        "scadenza_rendiconto": condominio.scadenza_rendiconto,
        "documenti_necessari_json": condominio.documenti_necessari_json,
    }


def _add_one_year(date_str: str, fallback: date) -> date:
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
    except Exception:
        dt = fallback
    try:
        return dt.replace(year=dt.year + 1)
    except ValueError:
        # Gestione anno bisestile (29 febbraio -> 28 febbraio)
        return dt.replace(year=dt.year + 1, day=28)


@app.post("/api/condomini/{condominio_id}/rinnova-esercizio")
def rinnova_esercizio_condominio(
    condominio_id: int,
    db: Session = Depends(get_db),
):
    """
    Rinnova automaticamente l'esercizio del condominio all'anno successivo (+1 anno)
    quando il rendiconto dell'anno precedente è stato completato:
    - Avanza data_inizio_esercizio di +1 anno
    - Avanza data_fine_esercizio di +1 anno
    - Ricalcola scadenza_rendiconto a +180 giorni dalla nuova fine esercizio
    - Imposta data_ultima_assemblea ad oggi
    - Azzera i flag 'recuperato' dei documenti richiesti mantenendo la configurazione del condominio
    - Imposta rendiconto_stato = 'in_corso'
    """
    condominio = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio non trovato")

    today = datetime.utcnow().date()
    new_start = _add_one_year(condominio.data_inizio_esercizio or "", date(today.year, 1, 1))
    new_end = _add_one_year(condominio.data_fine_esercizio or "", date(today.year, 12, 31))
    new_scad = new_end + timedelta(days=180)

    condominio.data_inizio_esercizio = new_start.strftime("%Y-%m-%d")
    condominio.data_fine_esercizio = new_end.strftime("%Y-%m-%d")
    condominio.scadenza_rendiconto = new_scad.strftime("%Y-%m-%d")
    condominio.esercizio_in_corso = f"{condominio.data_inizio_esercizio} - {condominio.data_fine_esercizio}"
    condominio.data_ultima_assemblea = today.strftime("%Y-%m-%d")
    condominio.rendiconto_stato = "in_corso"

    # Reset stato recupero documenti (mantenendo intatto 'richiesto' per il condominio)
    try:
        docs = json.loads(condominio.documenti_necessari_json or "[]")
        if isinstance(docs, list):
            for d in docs:
                if isinstance(d, dict):
                    d["richiesta_inviata"] = False
                    d["data_richiesta_inviata"] = None
                    d["recuperato"] = False
                    d["data_recupero"] = None
            condominio.documenti_necessari_json = json.dumps(docs, ensure_ascii=False)
    except Exception:
        pass

    db.commit()
    db.refresh(condominio)

    # Crea scheda rendiconto per il nuovo esercizio se non esiste già (riportando note e appunti dalla gestione precedente)
    existing_scheda = (
        db.query(SchedaRendiconto)
        .filter(
            SchedaRendiconto.condominio_id == condominio.id,
            SchedaRendiconto.gestione == condominio.esercizio_in_corso,
        )
        .first()
    )
    if not existing_scheda:
        try:
            create_scheda_for_condominio(
                db,
                condominio=condominio,
                gestione=condominio.esercizio_in_corso,
            )
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Errore creazione scheda nuovo esercizio: {e}")

    return _serialize_condominio(condominio, today)


@app.post("/api/condomini", response_model=CondominioOut)
def create_condominio(payload: CondominioBase, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("codice_danea"):
        # Auto-generate a clean code based on max ID
        max_id = db.query(func.max(Condominio.id)).scalar() or 0
        data["codice_danea"] = f"CONDO-{max_id + 1:03d}"
    if not data.get("indirizzo"):
        data["indirizzo"] = "Da specificare"
    if not data.get("citta"):
        data["citta"] = "Bergamo"
    if not data.get("cap"):
        data["cap"] = "24128"
    if not data.get("codice_fiscale"):
        data["codice_fiscale"] = "-"
    if not data.get("rendiconto_stato"):
        data["rendiconto_stato"] = "da_iniziare"

    # Calcolo scadenza 180 giorni automatica ex art. 1130 c.c. se non fornita
    if not data.get("scadenza_rendiconto") and data.get("data_fine_esercizio"):
        try:
            dt_fine = datetime.strptime(data["data_fine_esercizio"], "%Y-%m-%d").date()
            data["scadenza_rendiconto"] = (dt_fine + timedelta(days=180)).strftime("%Y-%m-%d")
        except Exception:
            pass

    if not data.get("documenti_necessari_json") or data.get("documenti_necessari_json") == "[]":
        default_docs = [
            {"id": "acqua", "titolo": "Lettura contatori dell'acqua", "richiesto": False, "recuperato": False, "note": "Contatori divisionali idrici"},
            {"id": "riscaldamento", "titolo": "Lettura contatori/ripartitori riscaldamento", "richiesto": False, "recuperato": False, "note": "Ripartitori di calore o conta-calorie"},
            {"id": "estratto_conto", "titolo": "Estratto conto bancario finale", "richiesto": False, "recuperato": False, "note": "Saldi al termine dell'esercizio"},
            {"id": "fatture_gestione", "titolo": "Tutte le fatture fornitori dell'esercizio", "richiesto": False, "recuperato": False, "note": "Pezze giustificative di spesa"},
            {"id": "f24_quietanze", "titolo": "Modelli F24 e quietanze ritenute d'acconto", "richiesto": False, "recuperato": False, "note": "Ritenute 4% versate"},
        ]
        data["documenti_necessari_json"] = json.dumps(default_docs, ensure_ascii=False)

    nuovo = Condominio(**data)
    db.add(nuovo)
    db.flush()

    # Creazione automatica Modello 5 - Scheda Rendiconto Procedura 002
    create_scheda_for_condominio(
        db,
        condominio=nuovo,
        gestione=nuovo.esercizio_in_corso or (f"{nuovo.data_inizio_esercizio} - {nuovo.data_fine_esercizio}" if nuovo.data_inizio_esercizio and nuovo.data_fine_esercizio else "2026"),
        note_intestazione="Scheda Bilancio Procedura 002 creata automaticamente",
    )
    db.commit()
    db.refresh(nuovo)

    return _serialize_condominio(nuovo)


@app.delete("/api/condomini/{condominio_id}")
def delete_condominio(condominio_id: int, db: Session = Depends(get_db)):
    condominio = db.query(Condominio).filter(Condominio.id == condominio_id).first()
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio non trovato")

    nome = condominio.nome

    # Pulisci o dissocia comunicazioni collegate
    db.query(Comunicazione).filter(Comunicazione.condominio_id == condominio_id).update(
        {Comunicazione.condominio_id: None}
    )
    # Rimuovi tickets manutenzione associati
    db.query(TicketManutenzione).filter(TicketManutenzione.condominio_id == condominio_id).delete()
    # Rimuovi scadenze associate
    db.query(ScadenzaTask).filter(ScadenzaTask.condominio_id == condominio_id).delete()

    # Le anagrafiche e le schede_rendiconto verranno rimosse in cascata grazie a cascade='all, delete-orphan'
    db.delete(condominio)
    db.commit()

    return {
        "success": True,
        "messaggio": f"Condominio '{nome}' eliminato definitivamente.",
        "id": condominio_id,
    }



@app.get("/api/anagrafiche", response_model=List[AnagraficaOut])
def list_anagrafiche(condominio_id: Optional[int] = None, solo_morosi: bool = False, db: Session = Depends(get_db)):
    q = db.query(Anagrafica)
    if condominio_id:
        q = q.filter(Anagrafica.condominio_id == condominio_id)
    if solo_morosi:
        q = q.filter(Anagrafica.saldo_attuale > 0)
    items = q.order_by(Anagrafica.saldo_attuale.desc()).all()
    return [
        AnagraficaOut(
            id=a.id,
            codice_danea=a.codice_danea,
            condominio_id=a.condominio_id,
            condominio_nome=a.condominio.nome if a.condominio else None,
            nome_cognome=a.nome_cognome,
            email=a.email,
            pec=a.pec,
            telefono=a.telefono,
            scala_interno=a.scala_interno,
            ruolo=a.ruolo,
            is_consigliere=a.is_consigliere,
            millesimi_generali=a.millesimi_generali,
            saldo_attuale=a.saldo_attuale,
            rate_scadute=a.rate_scadute,
            note=a.note,
        )
        for a in items
    ]


@app.post("/api/anagrafiche", response_model=AnagraficaOut)
def create_anagrafica(payload: AnagraficaBase, db: Session = Depends(get_db)):
    nuova = Anagrafica(**payload.model_dump())
    db.add(nuova)
    db.commit()
    db.refresh(nuova)
    cond = db.query(Condominio).filter(Condominio.id == nuova.condominio_id).first()
    if cond:
        cond.totale_morosita = round(sum(x.saldo_attuale for x in cond.anagrafiche if x.saldo_attuale > 0), 2)
        db.commit()
    return AnagraficaOut(
        **payload.model_dump(),
        id=nuova.id,
        condominio_nome=cond.nome if cond else None,
    )


@app.post("/api/anagrafiche/{anagrafica_id}/genera-sollecito")
def genera_sollecito_danea(anagrafica_id: int, db: Session = Depends(get_db)):
    anag = db.query(Anagrafica).filter(Anagrafica.id == anagrafica_id).first()
    if not anag:
        raise HTTPException(status_code=404, detail="Anagrafica non trovata")
    cond = anag.condominio
    firma = get_config_value(db, "firma_email", "Cordiali saluti,\nL'Amministratore")
    testo_sollecito = (
        f"Gentile {anag.nome_cognome},\n\n"
        f"dalla verifica contabile aggiornata sul gestionale Danea Domustudio per il **{cond.nome}** "
        f"({anag.scala_interno}), risulta a Suo carico un saldo scaduto pari a **€ {anag.saldo_attuale:,.2f}** "
        f"({anag.rate_scadute} rate insolute).\n\n"
        f"La invitiamo cortesemente a regolarizzare la posizione entro 7 giorni tramite bonifico bancario "
        f"intestato a {cond.nome} (IBAN: {cond.iban or 'come da avviso di rata'}) trasmettendo copia della contabile allo Studio.\n\n"
        f"Qualora avesse già provveduto nelle ultime ore, La preghiamo di considerare nullo il presente avviso.\n\n"
        f"{firma}"
    )
    return {
        "destinatario": anag.nome_cognome,
        "email": anag.pec or anag.email or "email@condomino.it",
        "oggetto": f"Sollecito pagamento quote condominiali scadute - {cond.nome} ({anag.scala_interno})",
        "testo_sollecito": testo_sollecito,
    }


@app.get("/api/fornitori", response_model=List[FornitoreOut])
def list_fornitori(db: Session = Depends(get_db)):
    return db.query(Fornitore).all()


@app.post("/api/fornitori", response_model=FornitoreOut)
def create_fornitore(payload: FornitoreBase, db: Session = Depends(get_db)):
    f = Fornitore(**payload.model_dump())
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


# ---------------------------------------------------------
# 4. SMART INBOX & SEGRETARIO AI
# ---------------------------------------------------------
@app.get("/api/comunicazioni", response_model=List[ComunicazioneOut])
def list_comunicazioni(
    stato: Optional[str] = None,
    condominio_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Comunicazione)
    if stato and stato != "Tutte":
        q = q.filter(Comunicazione.stato_lavorazione == stato)
    if condominio_id:
        q = q.filter(Comunicazione.condominio_id == condominio_id)
    items = q.order_by(Comunicazione.data_ricezione.desc()).all()
    return [serialize_comunicazione(c) for c in items]


@app.post("/api/comunicazioni", response_model=ComunicazioneOut)
def create_and_triage_comunicazione(
    payload: ComunicazioneCreate, db: Session = Depends(get_db)
):
    analysis = AISecretaryService.analyze_communication(
        db,
        payload.mittente_nome,
        payload.mittente_email,
        payload.oggetto,
        payload.corpo,
        payload.condominio_id,
    )
    nuova = Comunicazione(
        gmail_message_id=f"msg_{int(datetime.utcnow().timestamp())}",
        canale=payload.canale,
        mittente_nome=payload.mittente_nome,
        mittente_email=payload.mittente_email,
        oggetto=payload.oggetto,
        corpo=payload.corpo,
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
    db.add(nuova)
    db.commit()
    db.refresh(nuova)
    return serialize_comunicazione(nuova)


@app.patch("/api/comunicazioni/{com_id}", response_model=ComunicazioneOut)
def update_comunicazione(
    com_id: int, payload: ComunicazioneUpdate, db: Session = Depends(get_db)
):
    com = db.query(Comunicazione).filter(Comunicazione.id == com_id).first()
    if not com:
        raise HTTPException(status_code=404, detail="Comunicazione non trovata")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(com, k, v)
    db.commit()
    db.refresh(com)
    return serialize_comunicazione(com)


@app.post("/api/comunicazioni/{com_id}/rigenera-bozza")
def rigenera_bozza_ai(
    com_id: int,
    tono: str = "Formale",
    istruzioni_extra: str = "",
    db: Session = Depends(get_db),
):
    com = db.query(Comunicazione).filter(Comunicazione.id == com_id).first()
    if not com:
        raise HTTPException(status_code=404, detail="Comunicazione non trovata")

    nuova_bozza = AISecretaryService.customize_draft(db, com, tono, istruzioni_extra)
    com.bozza_risposta_ai = nuova_bozza
    db.commit()
    return {"bozza_risposta_ai": nuova_bozza}


@app.post("/api/comunicazioni/{com_id}/invia-risposta")
def invia_risposta_gmail(
    com_id: int, testo_finale: Optional[str] = None, db: Session = Depends(get_db)
):
    com = db.query(Comunicazione).filter(Comunicazione.id == com_id).first()
    if not com:
        raise HTTPException(status_code=404, detail="Comunicazione non trovata")
    if testo_finale:
        com.bozza_risposta_ai = testo_finale
    com.stato_lavorazione = "Risposta inviata"
    com.letta = True
    db.commit()
    return {
        "success": True,
        "messaggio": f"Risposta inviata tramite {com.canale} a {com.mittente_email}",
        "stato_lavorazione": com.stato_lavorazione,
    }


@app.post("/api/comunicazioni/{com_id}/crea-ticket-dettofatto", response_model=TicketOut)
def converti_comunicazione_in_ticket(
    com_id: int,
    fornitore_id: Optional[int] = None,
    priorita: Optional[str] = None,
    db: Session = Depends(get_db),
):
    com = db.query(Comunicazione).filter(Comunicazione.id == com_id).first()
    if not com:
        raise HTTPException(status_code=404, detail="Comunicazione non trovata")

    cond_id = com.condominio_id
    if not cond_id:
        first_c = db.query(Condominio).first()
        cond_id = first_c.id if first_c else 1

    ticket = DettoFattoConnector.create_ticket_from_communication(
        db=db,
        comunicazione_id=com.id,
        titolo=com.oggetto,
        descrizione=com.riassunto_ai or com.corpo,
        condominio_id=cond_id,
        categoria="Idraulica & Caldaie" if "acqua" in com.corpo.lower() or "perdita" in com.corpo.lower() else "Manutenzione Generale",
        priorita=priorita or ("Urgente" if com.urgenza_ai == "Critica" else "Alta"),
        fornitore_id=fornitore_id,
        segnalante=com.mittente_nome,
    )
    com.stato_lavorazione = "Convertita in Ticket"
    com.letta = True
    db.commit()
    return serialize_ticket(ticket)


# ---------------------------------------------------------
# 5. TICKET GUASTI & DETTOFATTO
# ---------------------------------------------------------
@app.get("/api/tickets", response_model=List[TicketOut])
def list_tickets(
    condominio_id: Optional[int] = None,
    stato: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(TicketManutenzione)
    if condominio_id:
        q = q.filter(TicketManutenzione.condominio_id == condominio_id)
    if stato and stato != "Tutti":
        q = q.filter(TicketManutenzione.stato == stato)
    items = q.order_by(TicketManutenzione.data_apertura.desc()).all()
    return [serialize_ticket(t) for t in items]


@app.post("/api/tickets", response_model=TicketOut)
def create_ticket(payload: TicketCreate, db: Session = Depends(get_db)):
    count = db.query(TicketManutenzione).count() + 1041
    nuovo = TicketManutenzione(
        codice_dettofatto=f"DF-2026-{count}",
        titolo=payload.titolo,
        descrizione=payload.descrizione,
        categoria=payload.categoria,
        priorita=payload.priorita,
        stato=payload.stato,
        condominio_id=payload.condominio_id,
        fornitore_id=payload.fornitore_id,
        segnalante=payload.segnalante,
        costo_stimato=payload.costo_stimato,
        sincronizzato_dettofatto=True,
        note_avanzamento=payload.note_avanzamento or "Ticket aperto e sincronizzato con DettoFatto.",
    )
    db.add(nuovo)
    db.commit()
    db.refresh(nuovo)
    return serialize_ticket(nuovo)


@app.patch("/api/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int, payload: TicketUpdate, db: Session = Depends(get_db)
):
    t = db.query(TicketManutenzione).filter(TicketManutenzione.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket non trovato")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    t.ultimo_aggiornamento = datetime.utcnow()
    t.sincronizzato_dettofatto = True
    db.commit()
    db.refresh(t)
    return serialize_ticket(t)


# ---------------------------------------------------------
# 6. AGENDA, SCADENZIARIO & GOOGLE CALENDAR
# ---------------------------------------------------------
@app.get("/api/scadenze", response_model=List[ScadenzaOut])
def list_scadenze(db: Session = Depends(get_db)):
    items = db.query(ScadenzaTask).order_by(ScadenzaTask.data_scadenza.asc()).all()
    return [
        ScadenzaOut(
            id=s.id,
            google_event_id=s.google_event_id,
            titolo=s.titolo,
            descrizione=s.descrizione,
            tipo=s.tipo,
            data_scadenza=s.data_scadenza,
            ora=s.ora,
            priorita=s.priorita,
            completato=s.completato,
            condominio_id=s.condominio_id,
            condominio_nome=s.condominio.nome if s.condominio else "Studio Generale",
            sincronizzato_gcal=s.sincronizzato_gcal,
        )
        for s in items
    ]


@app.post("/api/scadenze", response_model=ScadenzaOut)
def create_scadenza(payload: ScadenzaCreate, db: Session = Depends(get_db)):
    nuova = ScadenzaTask(
        google_event_id=f"gcal_{int(datetime.utcnow().timestamp())}" if payload.sincronizzato_gcal else None,
        titolo=payload.titolo,
        descrizione=payload.descrizione,
        tipo=payload.tipo,
        data_scadenza=payload.data_scadenza,
        ora=payload.ora,
        priorita=payload.priorita,
        completato=False,
        condominio_id=payload.condominio_id,
        sincronizzato_gcal=payload.sincronizzato_gcal,
    )
    db.add(nuova)
    db.commit()
    db.refresh(nuova)
    return ScadenzaOut(
        id=nuova.id,
        google_event_id=nuova.google_event_id,
        titolo=nuova.titolo,
        descrizione=nuova.descrizione,
        tipo=nuova.tipo,
        data_scadenza=nuova.data_scadenza,
        ora=nuova.ora,
        priorita=nuova.priorita,
        completato=nuova.completato,
        condominio_id=nuova.condominio_id,
        condominio_nome=nuova.condominio.nome if nuova.condominio else "Studio Generale",
        sincronizzato_gcal=nuova.sincronizzato_gcal,
    )


@app.patch("/api/scadenze/{scadenza_id}/toggle")
def toggle_scadenza(scadenza_id: int, db: Session = Depends(get_db)):
    s = db.query(ScadenzaTask).filter(ScadenzaTask.id == scadenza_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Scadenza non trovata")
    s.completato = not s.completato
    db.commit()
    return {"id": s.id, "completato": s.completato}


# ---------------------------------------------------------
# 7. COPILOTA AI CONVERSAZIONALE
# ---------------------------------------------------------
@app.post("/api/ai/chat")
def chat_with_secretary(payload: AIChatRequest, db: Session = Depends(get_db)):
    return AISecretaryService.answer_copilot_query(
        db, payload.messaggio, payload.contesto_condominio_id
    )


# ---------------------------------------------------------
# 8. HUB INTEGRAZIONI (DANEA, DETTOFATTO, GOOGLE, AI)
# ---------------------------------------------------------
@app.get("/api/integrations/status")
def get_integrations_status(db: Session = Depends(get_db)):
    configs = {c.chiave: c for c in db.query(IntegrationConfig).all()}
    return {
        "danea": {
            "percorso": configs.get("danea_sync").valore if "danea_sync" in configs else "",
            "ultimo_sync": configs.get("danea_sync").ultimo_sync if "danea_sync" in configs else "",
            "stato": configs.get("danea_sync").stato_connessione if "danea_sync" in configs else "Attivo",
        },
        "dettofatto": {
            "endpoint": configs.get("dettofatto_sync").valore if "dettofatto_sync" in configs else "",
            "ultimo_sync": configs.get("dettofatto_sync").ultimo_sync if "dettofatto_sync" in configs else "",
            "stato": configs.get("dettofatto_sync").stato_connessione if "dettofatto_sync" in configs else "Connesso",
        },
        "google": {
            "account": configs.get("google_sync").valore if "google_sync" in configs else "",
            "ultimo_sync": configs.get("google_sync").ultimo_sync if "google_sync" in configs else "",
            "stato": configs.get("google_sync").stato_connessione if "google_sync" in configs else "Connesso",
        },
        "ai": {
            "provider": get_config_value(db, "ai_provider", "gemini"),
            "has_gemini_key": bool(get_config_value(db, "gemini_api_key", "")),
            "has_openai_key": bool(get_config_value(db, "openai_api_key", "")),
            "nome_studio": get_config_value(db, "nome_studio", "Studio Amministrazioni Condominiali"),
            "firma_email": get_config_value(db, "firma_email", "Cordiali saluti,\nL'Amministratore"),
        },
    }


@app.post("/api/integrations/settings")
def save_integration_settings(
    payload: IntegrationSettingsUpdate, db: Session = Depends(get_db)
):
    mapping = {
        "ai_provider": payload.ai_provider,
        "nome_studio": payload.nome_studio,
        "firma_email": payload.firma_email,
    }
    if payload.gemini_api_key is not None and payload.gemini_api_key.strip() != "":
        mapping["gemini_api_key"] = payload.gemini_api_key.strip()
    if payload.openai_api_key is not None and payload.openai_api_key.strip() != "":
        mapping["openai_api_key"] = payload.openai_api_key.strip()
    if payload.danea_export_path:
        mapping["danea_sync"] = payload.danea_export_path
    if payload.dettofatto_api_url:
        mapping["dettofatto_sync"] = payload.dettofatto_api_url
    if payload.google_client_email:
        mapping["google_sync"] = payload.google_client_email

    for k, val in mapping.items():
        if val is None:
            continue
        cfg = db.query(IntegrationConfig).filter(IntegrationConfig.chiave == k).first()
        if not cfg:
            cfg = IntegrationConfig(chiave=k, valore=val, attivo=True)
            db.add(cfg)
        else:
            cfg.valore = val
            cfg.ultimo_sync = datetime.now().strftime("%d/%m/%Y %H:%M")

    db.commit()
    return {"success": True, "messaggio": "Configurazioni salvate con successo."}


_MAX_DANEA_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_DANEA_EXTENSIONS = {".csv", ".txt", ".xls", ".xlsx", ".xml", ".json"}


@app.post("/api/integrations/danea/import")
async def import_danea_file(
    tipo_import: str = Form("anagrafiche_saldi"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    filename = (file.filename or "import.csv").strip()
    ext = os.path.splitext(filename)[1].lower()
    if ext and ext not in _ALLOWED_DANEA_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Formato file non consentito. Usa file CSV, TXT, XLS, XLSX, XML o JSON.",
        )
    content = await file.read(_MAX_DANEA_UPLOAD_BYTES + 1)
    if len(content) > _MAX_DANEA_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File troppo grande (dimensione massima consentita: 10 MB).",
        )
    return DaneaConnector.import_file(db, filename, content, tipo_import)


@app.get("/api/integrations/danea/template", response_class=PlainTextResponse)
def download_danea_template():
    csv_sample = (
        "codice;condominio;nominativo;scala_interno;email;telefono;ruolo;millesimi;saldo_attuale;rate_scadute\n"
        "AN-901;Condominio Parco Vittoria;Mario Rossi;Scala B - Int. 10;mario.rossi@example.it;3401122334;Proprietario;42,50;980,00;2\n"
        "AN-902;Residenza Le Magnolie;Giulia Bianchi;Scala Unica - Int. 3;giulia.bianchi@example.it;3398877665;Proprietario;51,00;0,00;0\n"
    )
    return PlainTextResponse(
        content=csv_sample,
        headers={"Content-Disposition": "attachment; filename=modello_esportazione_danea.csv"},
    )


@app.post("/api/integrations/dettofatto/sync")
def sync_dettofatto_endpoint(db: Session = Depends(get_db)):
    return DettoFattoConnector.sync_tickets(db)


@app.post("/api/integrations/google/sync")
def sync_google_endpoint(db: Session = Depends(get_db)):
    return GoogleWorkspaceConnector.sync_workspace(db)


# ---------------------------------------------------------
# 9. PROCEDURA REDAZIONE RENDICONTO (PROCEDURA 002 - MODELLO 5)
# ---------------------------------------------------------
CODICI_POST_ASSEMBLEA = {"58", "59", "60", "61", "62"}


def _is_passo_post_assemblea(p: PassoRendiconto) -> bool:
    if str(p.numero_codice or "").strip() in CODICI_POST_ASSEMBLEA:
        return True
    if "Dopo Assemblea" in str(p.sezione or ""):
        return True
    return False


def serialize_scheda_rendiconto(s: SchedaRendiconto) -> SchedaRendicontoOut:
    passi_sorted = sorted(s.passi, key=lambda x: x.ordine)
    passi_pre = [p for p in passi_sorted if not _is_passo_post_assemblea(p)]
    passi_post = [p for p in passi_sorted if _is_passo_post_assemblea(p)]
    passo_62_fatto = any(
        str(p.numero_codice or "").strip() == "62" and bool(p.fatto)
        for p in passi_sorted
    )
    passo_57_fatto = any(
        str(p.numero_codice or "").strip() == "57" and bool(p.fatto)
        for p in passi_sorted
    )
    totale = len(passi_pre) if len(passi_pre) > 0 else 58
    fatti_pre_raw = sum(1 for p in passi_pre if p.fatto)
    completati = totale if (passo_57_fatto or fatti_pre_raw >= totale) else fatti_pre_raw
    percentuale = (
        100.0
        if (passo_57_fatto or completati >= totale)
        else (round((completati / totale) * 100, 1) if totale > 0 else 0.0)
    )
    post_totale = len(passi_post) if len(passi_post) > 0 else 5
    post_completati_raw = sum(1 for p in passi_post if p.fatto)
    post_completati = (
        post_totale if (passo_62_fatto or post_completati_raw >= post_totale) else post_completati_raw
    )
    in_attesa_assemblea = bool((passo_57_fatto or percentuale >= 100.0) and post_completati < post_totale)

    docs_allegati = calcola_documenti_allegati(passi_sorted)
    tot_pagine = sum(d["pagine_documento"] for d in docs_allegati)
    calc_acqua = calcola_acqua_eccedente(
        s.acqua_consumo_contabilizzatori or 0.0,
        s.acqua_mc_fatture or 0.0,
        s.acqua_costo_fatture or 0.0,
    )

    try:
        nota_checks = json.loads(s.nota_esplicativa_checks_json or "[]")
    except Exception:
        nota_checks = []

    # Trova eventuale 'Attuale (€)' residuo sul passo 31 per spostarlo sul passo 30
    legacy_attuale = ""
    for p in passi_sorted:
        if p.numero_codice == "31":
            try:
                ex31 = json.loads(p.campi_extra_json or "{}")
                if isinstance(ex31, dict) and ex31.get("Attuale (€)"):
                    legacy_attuale = str(ex31["Attuale (€)"])
            except Exception:
                pass

    passi_out = []
    for p in passi_sorted:
        try:
            extra = json.loads(p.campi_extra_json or "{}")
            if not isinstance(extra, dict):
                extra = {}
        except Exception:
            extra = {}

        if p.numero_codice == "30":
            if "Precedente (€)" not in extra:
                extra["Precedente (€)"] = ""
            if not extra.get("Attuale (€)") and legacy_attuale:
                extra["Attuale (€)"] = legacy_attuale
            elif "Attuale (€)" not in extra:
                extra["Attuale (€)"] = ""
        elif p.numero_codice == "31" and "Attuale (€)" in extra:
            extra.pop("Attuale (€)", None)

        passi_out.append(
            PassoRendicontoOut(
                id=p.id,
                scheda_id=p.scheda_id,
                ordine=p.ordine,
                numero_codice=p.numero_codice,
                sezione=p.sezione,
                chi_lo_fa=p.chi_lo_fa,
                fatto=p.fatto,
                data_spunta=p.data_spunta,
                descrizione=p.descrizione,
                ha_pagine=p.ha_pagine,
                doc_codice=p.doc_codice,
                num_pagine=p.num_pagine or 0,
                campi_extra=extra,
                note_passo=p.note_passo,
            )
        )

    return SchedaRendicontoOut(
        id=s.id,
        condominio_id=s.condominio_id,
        condominio_nome=s.condominio.nome if s.condominio else f"Condominio #{s.condominio_id}",
        condominio_codice_danea=s.condominio.codice_danea if s.condominio else None,
        condominio_iban=s.condominio.iban if s.condominio else None,
        procedura_codice=s.procedura_codice,
        gestione=s.gestione,
        fatto_il=s.fatto_il,
        note_intestazione=s.note_intestazione,
        chi_lo_fa_default=s.chi_lo_fa_default,
        totale_passi=totale,
        passi_completati=completati,
        percentuale_fatto=percentuale,
        post_assemblea_completati=post_completati,
        post_assemblea_totale=post_totale,
        in_attesa_assemblea=in_attesa_assemblea,
        calcolatore_acqua=calc_acqua,
        nota_esplicativa_checks=nota_checks,
        documenti_allegati=docs_allegati,
        totale_pagine_fascicolo=tot_pagine,
        passi=passi_out,
        prompt_slide_notebooklm=PROMPT_SLIDE_NOTEBOOKLM,
        prompt_podcast_notebooklm=PROMPT_PODCAST_NOTEBOOKLM,
    )


@app.get("/api/impostazioni/passi-rendiconto")
def get_impostazioni_passi_rendiconto(db: Session = Depends(get_db)):
    cfg = (
        db.query(IntegrationConfig)
        .filter(IntegrationConfig.chiave == CUSTOM_PASSI_CONFIG_KEY)
        .first()
    )
    is_custom = bool(cfg and cfg.valore)
    passi = get_custom_passi_modello_5(db)
    return {
        "is_custom": is_custom,
        "totale_passi": len(passi),
        "passi": passi,
        "default_passi": DEFAULT_PASSI_MODELLO_5,
    }


@app.put("/api/impostazioni/passi-rendiconto")
def update_impostazioni_passi_rendiconto(
    payload: dict, db: Session = Depends(get_db)
):
    raw_passi = payload.get("passi")
    if not isinstance(raw_passi, list) or len(raw_passi) == 0:
        raise HTTPException(
            status_code=400,
            detail="La lista dei passaggi non può essere vuota.",
        )

    normalized = normalize_passi_template(raw_passi)

    cfg = (
        db.query(IntegrationConfig)
        .filter(IntegrationConfig.chiave == CUSTOM_PASSI_CONFIG_KEY)
        .first()
    )
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    if not cfg:
        cfg = IntegrationConfig(
            chiave=CUSTOM_PASSI_CONFIG_KEY,
            valore=json.dumps(normalized, ensure_ascii=False),
            attivo=True,
            ultimo_sync=now_str,
            stato_connessione="Template Personalizzato Attivo",
        )
        db.add(cfg)
    else:
        cfg.valore = json.dumps(normalized, ensure_ascii=False)
        cfg.attivo = True
        cfg.ultimo_sync = now_str
        cfg.stato_connessione = "Template Personalizzato Attivo"
    db.commit()

    schede_aggiornate = sync_all_schede_with_custom_passi(db, normalized)
    return {
        "is_custom": True,
        "totale_passi": len(normalized),
        "schede_sincronizzate": schede_aggiornate,
        "passi": normalized,
    }


@app.post("/api/impostazioni/passi-rendiconto/reset")
def reset_impostazioni_passi_rendiconto(db: Session = Depends(get_db)):
    cfg = (
        db.query(IntegrationConfig)
        .filter(IntegrationConfig.chiave == CUSTOM_PASSI_CONFIG_KEY)
        .first()
    )
    if cfg:
        db.delete(cfg)
        db.commit()

    normalized = normalize_passi_template(DEFAULT_PASSI_MODELLO_5)
    schede_aggiornate = sync_all_schede_with_custom_passi(db, normalized)
    return {
        "is_custom": False,
        "totale_passi": len(normalized),
        "schede_sincronizzate": schede_aggiornate,
        "passi": normalized,
    }


@app.get("/api/rendiconti/progress")
def list_schede_rendiconto_progress(db: Session = Depends(get_db)):
    is_post_cond = PassoRendiconto.sezione.like("%Dopo Assemblea%") | PassoRendiconto.numero_codice.in_(
        ["58", "59", "60", "61", "62"]
    )
    rows = (
        db.query(
            SchedaRendiconto.id,
            SchedaRendiconto.condominio_id,
            SchedaRendiconto.gestione,
            func.sum(case((~is_post_cond, 1), else_=0)).label("totale_passi_pre"),
            func.sum(
                case(
                    ((~is_post_cond) & (PassoRendiconto.fatto == True), 1),
                    else_=0,
                )
            ).label("passi_completati_pre"),
            func.max(
                case(
                    (
                        (PassoRendiconto.numero_codice == "57")
                        & (PassoRendiconto.fatto == True),
                        1,
                    ),
                    else_=0,
                )
            ).label("passo_57_fatto"),
            func.max(
                case(
                    (
                        (PassoRendiconto.numero_codice == "62")
                        & (PassoRendiconto.fatto == True),
                        1,
                    ),
                    else_=0,
                )
            ).label("passo_62_fatto"),
            func.sum(case((is_post_cond, 1), else_=0)).label("post_assemblea_totale"),
            func.sum(
                case(
                    (is_post_cond & (PassoRendiconto.fatto == True), 1),
                    else_=0,
                )
            ).label("post_assemblea_completati"),
        )
        .outerjoin(PassoRendiconto, PassoRendiconto.scheda_id == SchedaRendiconto.id)
        .group_by(SchedaRendiconto.id, SchedaRendiconto.condominio_id, SchedaRendiconto.gestione)
        .order_by(SchedaRendiconto.id.asc())
        .all()
    )
    out = []
    for r in rows:
        tot = int(r.totale_passi_pre or 58)
        raw_done = int(r.passi_completati_pre or 0)
        passo_62_done = bool(r.passo_62_fatto)
        passo_57_done = bool(r.passo_57_fatto)
        done = tot if (passo_57_done or raw_done >= tot) else raw_done
        pct = 100.0 if (passo_57_done or done >= tot) else (round((done / tot) * 100, 1) if tot > 0 else 0.0)
        post_tot = int(r.post_assemblea_totale or 5)
        post_done_raw = int(r.post_assemblea_completati or 0)
        post_done = post_tot if (passo_62_done or post_done_raw >= post_tot) else post_done_raw
        in_attesa = bool((passo_57_done or pct >= 100.0) and post_done < post_tot)
        out.append(
            {
                "id": r.id,
                "condominio_id": r.condominio_id,
                "gestione": r.gestione,
                "totale_passi": tot,
                "passi_completati": done,
                "percentuale_fatto": pct,
                "post_assemblea_completati": post_done,
                "post_assemblea_totale": post_tot,
                "in_attesa_assemblea": in_attesa,
            }
        )
    return out


@app.get("/api/rendiconti", response_model=List[SchedaRendicontoOut])
def list_schede_rendiconto(
    condominio_id: Optional[int] = None, db: Session = Depends(get_db)
):
    q = db.query(SchedaRendiconto).options(
        joinedload(SchedaRendiconto.passi),
        joinedload(SchedaRendiconto.condominio),
    )
    if condominio_id:
        q = q.filter(SchedaRendiconto.condominio_id == condominio_id)
    schede = q.order_by(SchedaRendiconto.id.asc()).all()
    return [serialize_scheda_rendiconto(s) for s in schede]


@app.get("/api/rendiconti/{scheda_id}", response_model=SchedaRendicontoOut)
def get_scheda_rendiconto(scheda_id: int, db: Session = Depends(get_db)):
    s = (
        db.query(SchedaRendiconto)
        .options(joinedload(SchedaRendiconto.passi), joinedload(SchedaRendiconto.condominio))
        .filter(SchedaRendiconto.id == scheda_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Scheda Rendiconto non trovata")
    return serialize_scheda_rendiconto(s)


@app.post("/api/rendiconti", response_model=SchedaRendicontoOut)
def create_scheda_rendiconto_endpoint(
    payload: SchedaRendicontoCreate, db: Session = Depends(get_db)
):
    cond = db.query(Condominio).filter(Condominio.id == payload.condominio_id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condominio non trovato")
    nuova = create_scheda_for_condominio(
        db=db,
        condominio=cond,
        gestione=payload.gestione,
        note_intestazione=payload.note_intestazione or "",
    )
    nuova.chi_lo_fa_default = payload.chi_lo_fa_default
    db.commit()
    db.refresh(nuova)
    return serialize_scheda_rendiconto(nuova)


@app.patch("/api/rendiconti/{scheda_id}", response_model=SchedaRendicontoOut)
def update_scheda_rendiconto(
    scheda_id: int, payload: SchedaRendicontoUpdate, db: Session = Depends(get_db)
):
    s = db.query(SchedaRendiconto).filter(SchedaRendiconto.id == scheda_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Scheda Rendiconto non trovata")

    data = payload.model_dump(exclude_unset=True)
    if "nota_esplicativa_checks" in data and data["nota_esplicativa_checks"] is not None:
        s.nota_esplicativa_checks_json = json.dumps(
            data.pop("nota_esplicativa_checks"), ensure_ascii=False
        )
    for k, v in data.items():
        setattr(s, k, v)
    s.ultimo_aggiornamento = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return serialize_scheda_rendiconto(s)


@app.patch(
    "/api/rendiconti/{scheda_id}/passi/{passo_id}",
    response_model=SchedaRendicontoOut,
)
def update_passo_rendiconto(
    scheda_id: int,
    passo_id: int,
    payload: PassoRendicontoUpdate,
    db: Session = Depends(get_db),
):
    p = (
        db.query(PassoRendiconto)
        .filter(PassoRendiconto.id == passo_id, PassoRendiconto.scheda_id == scheda_id)
        .first()
    )
    if not p and passo_id < 100:
        p = (
            db.query(PassoRendiconto)
            .filter(
                PassoRendiconto.scheda_id == scheda_id,
                PassoRendiconto.numero_codice == str(passo_id),
            )
            .first()
        )
    if not p:
        ordine_candidate = passo_id % 1000 if passo_id >= 1000 else passo_id
        p = (
            db.query(PassoRendiconto)
            .filter(
                PassoRendiconto.scheda_id == scheda_id,
                PassoRendiconto.ordine == ordine_candidate,
            )
            .first()
        )
    if not p:
        raise HTTPException(status_code=404, detail="Passaggio non trovato")

    if payload.fatto is not None:
        p.fatto = payload.fatto
        p.data_spunta = datetime.now().strftime("%d/%m/%Y %H:%M") if payload.fatto else None
    if payload.chi_lo_fa is not None:
        p.chi_lo_fa = payload.chi_lo_fa
    if payload.num_pagine is not None:
        p.num_pagine = max(0, payload.num_pagine)
    if payload.campi_extra is not None:
        p.campi_extra_json = json.dumps(payload.campi_extra, ensure_ascii=False)
    if payload.note_passo is not None:
        p.note_passo = payload.note_passo

    scheda = db.query(SchedaRendiconto).filter(SchedaRendiconto.id == scheda_id).first()
    if scheda:
        scheda.ultimo_aggiornamento = datetime.utcnow()
        now_spunta = datetime.now().strftime("%d/%m/%Y %H:%M")
        # Se il passo 62 (Invio eventuali MAV) viene spuntato, chiude automaticamente tutta la fase post-assemblea (58-62)
        if str(p.numero_codice or "").strip() == "62" and bool(p.fatto):
            for x in scheda.passi:
                if _is_passo_post_assemblea(x) and not x.fatto:
                    x.fatto = True
                    x.data_spunta = x.data_spunta or now_spunta
        passi_post_scheda = [x for x in scheda.passi if _is_passo_post_assemblea(x)]
        tutti_post_fatti = len(passi_post_scheda) > 0 and all(bool(x.fatto) for x in passi_post_scheda)
        if tutti_post_fatti:
            if not scheda.fatto_il:
                scheda.fatto_il = datetime.now().strftime("%d/%m/%Y")
            if scheda.condominio:
                scheda.condominio.rendiconto_stato = "completato"
        elif str(p.numero_codice or "").strip() in CODICI_POST_ASSEMBLEA and payload.fatto is False:
            if scheda.condominio and scheda.condominio.rendiconto_stato == "completato":
                scheda.condominio.rendiconto_stato = "in_corso"
        # Se tutti i passi sono spuntati, imposta fatto_il automaticamente se vuoto
        if all(x.fatto for x in scheda.passi) and not scheda.fatto_il:
            scheda.fatto_il = datetime.now().strftime("%d/%m/%Y")

    db.commit()
    db.refresh(scheda)
    return serialize_scheda_rendiconto(scheda)


@app.post("/api/rendiconti/riepilogo-pdf")
def generate_riepilogo_pdf_from_payload(payload: dict):
    from fastapi.responses import Response
    from .riepilogo_pdf import build_riepilogo_procedura_pdf
    import re as _re

    pdf_bytes = build_riepilogo_procedura_pdf(payload)
    cond_slug = _re.sub(r"[^A-Za-z0-9_-]+", "_", str(payload.get("condominio_nome") or "Condominio")).strip("_")
    gest_slug = _re.sub(r"[^A-Za-z0-9_-]+", "_", str(payload.get("gestione") or "Gestione")).strip("_")
    filename = f"Riepilogo_Procedura_{cond_slug}_{gest_slug}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/rendiconti/{scheda_id}/riepilogo-pdf")
def generate_riepilogo_pdf_by_id(scheda_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import Response
    from .riepilogo_pdf import build_riepilogo_procedura_pdf
    import re as _re

    s = (
        db.query(SchedaRendiconto)
        .options(joinedload(SchedaRendiconto.passi), joinedload(SchedaRendiconto.condominio))
        .filter(SchedaRendiconto.id == scheda_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Scheda Rendiconto non trovata")
    scheda_dict = serialize_scheda_rendiconto(s).model_dump()
    pdf_bytes = build_riepilogo_procedura_pdf(scheda_dict)
    cond_slug = _re.sub(r"[^A-Za-z0-9_-]+", "_", str(scheda_dict.get("condominio_nome") or "Condominio")).strip("_")
    gest_slug = _re.sub(r"[^A-Za-z0-9_-]+", "_", str(scheda_dict.get("gestione") or "Gestione")).strip("_")
    filename = f"Riepilogo_Procedura_{cond_slug}_{gest_slug}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------
# 9B. GESTIONE ASSEMBLEE STRAORDINARIE (SCALETTA 5 PASSI)
# ---------------------------------------------------------
DEFAULT_SCALETTA_ASSEMBLEA_STRAORDINARIA = [
    {
        "id": "odg",
        "ordine": 1,
        "titolo": "Creazione ordine del giorno",
        "descrizione": "Definizione punti all'Ordine del Giorno, verifica preventivi/capitolati da sottoporre all'assemblea",
        "fatto": False,
        "data_spunta": None,
        "dettaglio": "",
        "note": "",
    },
    {
        "id": "sala",
        "ordine": 2,
        "titolo": "Prenotazione sala, data e ora",
        "descrizione": "Scelta e prenotazione del posto/sala riunioni e fissazione della data e dell'ora dell'assemblea (1ª e 2ª convocazione)",
        "fatto": False,
        "data_spunta": None,
        "dettaglio": "",
        "note": "",
    },
    {
        "id": "convocazioni",
        "ordine": 3,
        "titolo": "Invio delle convocazioni",
        "descrizione": "Trasmissione avviso di convocazione con allegati (almeno 5 giorni liberi prima della 1ª convocazione ex art. 66 disp. att. c.c.)",
        "fatto": False,
        "data_spunta": None,
        "dettaglio": "",
        "note": "",
    },
    {
        "id": "firma_presidente",
        "ordine": 4,
        "titolo": "Invio verbale presidente per firma",
        "descrizione": "Redazione del verbale post-assemblea e invio al Presidente (e Segretario) per verifica e sottoscrizione",
        "fatto": False,
        "data_spunta": None,
        "dettaglio": "",
        "note": "",
    },
    {
        "id": "invio_condomini",
        "ordine": 5,
        "titolo": "Invio verbale ai condomini",
        "descrizione": "Trasmissione copia del verbale firmato a tutti i condomini (presenti e assenti ex art. 1137 c.c.) e pubblicazione su Danea/MioCondominio",
        "fatto": False,
        "data_spunta": None,
        "dettaglio": "",
        "note": "",
    },
]


def _calcola_stato_assemblea(scaletta: list) -> str:
    if not scaletta:
        return "in_organizzazione"
    fatti_ids = {str(s.get("id")) for s in scaletta if s.get("fatto")}
    if "passo_62" in fatti_ids or len(fatti_ids) >= len(scaletta):
        return "conclusa"
    if fatti_ids & {"firma_presidente", "passo_58", "invio_condomini", "passo_61"}:
        return "in_firma"
    if "convocazioni" in fatti_ids:
        return "convocata"
    return "in_organizzazione"


def serialize_assemblea_straordinaria(a: AssembleaStraordinaria) -> AssembleaStraordinariaOut:
    try:
        scaletta = json.loads(a.scaletta_json or "[]")
        if not isinstance(scaletta, list) or len(scaletta) == 0:
            scaletta = json.loads(json.dumps(DEFAULT_SCALETTA_ASSEMBLEA_STRAORDINARIA))
    except Exception:
        scaletta = json.loads(json.dumps(DEFAULT_SCALETTA_ASSEMBLEA_STRAORDINARIA))

    totale = len(scaletta) if len(scaletta) > 0 else 5
    completati = sum(1 for s in scaletta if s.get("fatto"))
    pct = round((completati / totale) * 100, 1) if totale > 0 else 0.0
    calc_stato = _calcola_stato_assemblea(scaletta)
    if calc_stato == "conclusa":
        stato = "conclusa"
    elif a.stato == "in_firma" or calc_stato == "in_firma":
        stato = "in_firma"
    else:
        stato = a.stato or calc_stato

    return AssembleaStraordinariaOut(
        id=a.id,
        condominio_id=a.condominio_id,
        condominio_nome=a.condominio.nome if a.condominio else f"Condominio #{a.condominio_id}",
        condominio_codice_danea=a.condominio.codice_danea if a.condominio else None,
        condominio_indirizzo=f"{a.condominio.indirizzo}, {a.condominio.citta}" if a.condominio and a.condominio.indirizzo else None,
        titolo=a.titolo,
        tipo=a.tipo or "Straordinaria",
        data_prima_convocazione=a.data_prima_convocazione,
        ora_prima_convocazione=a.ora_prima_convocazione,
        data_assemblea=a.data_assemblea,
        ora_assemblea=a.ora_assemblea,
        luogo_sala=a.luogo_sala,
        ordine_del_giorno=a.ordine_del_giorno,
        presidente=a.presidente,
        segretario=a.segretario,
        modalita_invio=a.modalita_invio,
        fatturata=bool(a.fatturata),
        importo_compenso=float(a.importo_compenso or 0.0),
        stato=stato,
        note_generali=a.note_generali,
        scaletta=scaletta,
        passi_completati=completati,
        totale_passi=totale,
        percentuale=pct,
        data_creazione=a.data_creazione,
        ultimo_aggiornamento=a.ultimo_aggiornamento,
    )


@app.get("/api/assemblee-straordinarie", response_model=List[AssembleaStraordinariaOut])
def list_assemblee_straordinarie(
    condominio_id: Optional[int] = None, db: Session = Depends(get_db)
):
    q = db.query(AssembleaStraordinaria).options(joinedload(AssembleaStraordinaria.condominio))
    if condominio_id:
        q = q.filter(AssembleaStraordinaria.condominio_id == condominio_id)
    rows = q.order_by(AssembleaStraordinaria.id.desc()).all()
    return [serialize_assemblea_straordinaria(r) for r in rows]


@app.post("/api/assemblee-straordinarie", response_model=AssembleaStraordinariaOut)
def create_assemblea_straordinaria(
    payload: AssembleaStraordinariaCreate, db: Session = Depends(get_db)
):
    cond = db.query(Condominio).filter(Condominio.id == payload.condominio_id).first()
    if not cond:
        raise HTTPException(status_code=404, detail="Condominio non trovato")

    scaletta = (
        payload.scaletta
        if payload.scaletta and len(payload.scaletta) > 0
        else json.loads(json.dumps(DEFAULT_SCALETTA_ASSEMBLEA_STRAORDINARIA))
    )
    stato = _calcola_stato_assemblea(scaletta)

    nuova = AssembleaStraordinaria(
        condominio_id=payload.condominio_id,
        titolo=payload.titolo.strip(),
        tipo=payload.tipo or "Straordinaria",
        data_prima_convocazione=payload.data_prima_convocazione,
        ora_prima_convocazione=payload.ora_prima_convocazione or "07:00",
        data_assemblea=payload.data_assemblea,
        ora_assemblea=payload.ora_assemblea or "18:00",
        luogo_sala=payload.luogo_sala or "Sala Riunioni Studio Serra",
        ordine_del_giorno=payload.ordine_del_giorno,
        presidente=payload.presidente,
        segretario=payload.segretario,
        modalita_invio=payload.modalita_invio or "PEC / Raccomandata / Consegna a mano",
        fatturata=bool(payload.fatturata),
        importo_compenso=float(payload.importo_compenso or 0.0),
        stato=stato,
        note_generali=payload.note_generali,
        scaletta_json=json.dumps(scaletta, ensure_ascii=False),
    )
    db.add(nuova)
    db.commit()
    db.refresh(nuova)
    return serialize_assemblea_straordinaria(nuova)


@app.patch("/api/assemblee-straordinarie/{assemblea_id}", response_model=AssembleaStraordinariaOut)
def update_assemblea_straordinaria(
    assemblea_id: int,
    payload: AssembleaStraordinariaUpdate,
    db: Session = Depends(get_db),
):
    a = (
        db.query(AssembleaStraordinaria)
        .options(joinedload(AssembleaStraordinaria.condominio))
        .filter(AssembleaStraordinaria.id == assemblea_id)
        .first()
    )
    if not a and assemblea_id >= 900000:
        condo_id = assemblea_id - 900000
        a = (
            db.query(AssembleaStraordinaria)
            .options(joinedload(AssembleaStraordinaria.condominio))
            .filter(
                AssembleaStraordinaria.condominio_id == condo_id,
                AssembleaStraordinaria.tipo == "Ordinaria",
            )
            .first()
        )
        if not a:
            cond = db.query(Condominio).filter(Condominio.id == condo_id).first()
            if cond:
                a = AssembleaStraordinaria(
                    id=assemblea_id,
                    condominio_id=condo_id,
                    titolo=payload.titolo or f"Assemblea Ordinaria Approvazione Rendiconto ({cond.nome})",
                    tipo="Ordinaria",
                    ora_prima_convocazione=payload.ora_prima_convocazione or "07:00",
                    ora_assemblea=payload.ora_assemblea or "18:00",
                    luogo_sala=payload.luogo_sala or "Sala Riunioni Studio Serra",
                    stato=payload.stato or "in_firma",
                    scaletta_json="[]",
                )
                db.add(a)
                db.flush()
    if not a:
        raise HTTPException(status_code=404, detail="Assemblea non trovata")

    data = payload.model_dump(exclude_unset=True)
    if "scaletta" in data and data["scaletta"] is not None:
        scaletta_list = data.pop("scaletta")
        a.scaletta_json = json.dumps(scaletta_list, ensure_ascii=False)
        if "stato" not in data or not data["stato"]:
            a.stato = _calcola_stato_assemblea(scaletta_list)

    for k, v in data.items():
        setattr(a, k, v)

    a.ultimo_aggiornamento = datetime.utcnow()
    db.commit()
    db.refresh(a)
    return serialize_assemblea_straordinaria(a)


@app.delete("/api/assemblee-straordinarie/{assemblea_id}")
def delete_assemblea_straordinaria(assemblea_id: int, db: Session = Depends(get_db)):
    a = db.query(AssembleaStraordinaria).filter(AssembleaStraordinaria.id == assemblea_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assemblea non trovata")
    db.delete(a)
    db.commit()
    return {"success": True, "deleted_id": assemblea_id}


# ---------------------------------------------------------
# 10. COLLEGAMENTO MOBILE SU RETE WI-FI LOCALE (QR CODE)
# ---------------------------------------------------------
@app.get("/api/system/network-info")
def get_network_info(port: int = 8502, custom_url: Optional[str] = None):
    import socket

    ips = []
    primary_ip = "127.0.0.1"

    # Rileva l'IP principale usato per uscire sulla rete locale (Wi-Fi / LAN)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        primary_ip = s.getsockname()[0]
        s.close()
        if primary_ip and not primary_ip.startswith("127."):
            ips.append(primary_ip)
    except Exception:
        pass

    # Rileva eventuali altre schede di rete (es. Ethernet + Wi-Fi)
    try:
        hostname = socket.gethostname()
        _, _, host_ips = socket.gethostbyname_ex(hostname)
        for ip in host_ips:
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        hostname = "PC-Studio-Serra"

    if not ips:
        ips = [primary_ip]
    primary_ip = ips[0]

    target_url = custom_url.strip() if custom_url and custom_url.strip() else f"http://{primary_ip}:{port}"

    qr_matrix = []
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(target_url)
        qr.make(fit=True)
        qr_matrix = qr.get_matrix()
    except Exception:
        qr_matrix = []

    return {
        "hostname": hostname,
        "primary_ip": primary_ip,
        "all_ips": ips,
        "port": port,
        "mobile_url": target_url,
        "qr_matrix": qr_matrix,
    }


# ---------------------------------------------------------
# 11. SERVIZIO STATICO FRONTEND PER ACCESSO MOBILE WI-FI (PORTA 8502)
# ---------------------------------------------------------
import os as _os
from fastapi.staticfiles import StaticFiles

_frontend_dist = _os.path.abspath(
    _os.path.join(_os.path.dirname(__file__), "..", "..", "frontend", "dist")
)
if _os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend_spa")


