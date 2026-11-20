import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Cartelle Archivio e Output Operativi
# In ambiente Docker VPS (/app/data persistente) usa il volume persistente, altrimenti cartella locale
_default_ia_dir = (
    os.path.join("/app/data", "archivio_ia")
    if os.path.isdir("/app/data")
    else os.path.join(BASE_DIR, "archivio_ia")
)
CARTELLA_IA = os.environ.get("CARTELLA_IA", _default_ia_dir)
CARTELLA_SOPRALLUOGHI = os.environ.get("CARTELLA_SOPRALLUOGHI", os.path.join(CARTELLA_IA, "Sopralluoghi"))
CARTELLA_INTERVENTI = os.environ.get("CARTELLA_INTERVENTI", os.path.join(CARTELLA_IA, "Interventi"))
CARTELLA_SOLLECITI = os.environ.get("CARTELLA_SOLLECITI", os.path.join(CARTELLA_IA, "Solleciti"))

for _d in [CARTELLA_IA, CARTELLA_SOPRALLUOGHI, CARTELLA_INTERVENTI, CARTELLA_SOLLECITI]:
    os.makedirs(_d, exist_ok=True)

# Token Bot Telegram Studio Serra (@AssistenteStudioSerra_bot)
TOKEN_TELEGRAM = os.environ.get(
    "TOKEN_TELEGRAM",
    os.environ.get("TELEGRAM_BOT_TOKEN", "8697082786:AAEyeZqWY5OLTgOacCf5mSr2vvB_aTDnIAI")
)

# Gestione Utenti Autorizzati:
# Se la lista ID_AUTORIZZATI è vuota, permette l'interazione a tutti (utile per il primo avvio da smartphone).
class _AuthorizedUsers(list):
    def __contains__(self, item):
        if not self:
            return True
        s_item = str(item).strip()
        for x in self:
            if str(x).strip() == s_item:
                return True
        return False

_raw_ids = [x.strip() for x in os.environ.get("ID_AUTORIZZATI", "").split(",") if x.strip()]
ID_AUTORIZZATI = _AuthorizedUsers(_raw_ids)

# Google Gemini API Keys
GEMINI_API_KEYS = []
_env_gemini = os.environ.get("GEMINI_API_KEY", "").strip()
if _env_gemini:
    GEMINI_API_KEYS.append(_env_gemini)

# Cerca eventuale chiave in file .env (locale o volume persistente VPS /app/data)
for _env_path in ["/app/data/.env", "/data/assistente/.env", os.path.join(BASE_DIR, ".env"), os.path.join(BASE_DIR, "..", ".env")]:
    if os.path.exists(_env_path):
        try:
            with open(_env_path, "r", encoding="utf-8") as _ef:
                for _l in _ef:
                    _l = _l.strip()
                    if _l.startswith("GEMINI_API_KEY="):
                        _val = _l.split("=", 1)[1].strip().strip('"').strip("'")
                        if _val and _val not in GEMINI_API_KEYS:
                            GEMINI_API_KEYS.append(_val)
        except Exception:
            pass

CHIAVE_GEMINI = GEMINI_API_KEYS[0] if GEMINI_API_KEYS else ""

# Configurazione SMTP Studio Serra (per invio promemoria allo staff)
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
EMAIL_MITTENTE = os.environ.get("EMAIL_MITTENTE", "direzione@serrastudio.it")
PASSWORD_EMAIL = os.environ.get("PASSWORD_EMAIL", "rdqoapqzseaifnrn")
EMAIL_DESTINATARIO_STAFF = os.environ.get("EMAIL_DESTINATARIO_STAFF", "operativo@serrastudio.it")

# Tecnico incaricato per sopralluoghi e verbali
NOME_TECNICO = os.environ.get("NOME_TECNICO", "Gian Carlo ing. Serra")

# Google Calendar OAuth (supporta file locale e volume persistente /app/data su VPS)
_candidate_creds = [
    os.environ.get("GOOGLE_CREDENTIALS_PATH", ""),
    "/app/data/credentials.json",
    os.path.join(BASE_DIR, "credentials.json"),
]
GOOGLE_CREDENTIALS_PATH = next(
    (p for p in _candidate_creds if p and os.path.exists(p)),
    os.path.join(BASE_DIR, "credentials.json")
)

_candidate_tokens = [
    os.environ.get("GOOGLE_TOKEN_PATH", ""),
    "/app/data/token_calendar.json",
    os.path.join(BASE_DIR, "token_calendar.json"),
]
GOOGLE_TOKEN_PATH = next(
    (p for p in _candidate_tokens if p and os.path.exists(p)),
    os.path.join(BASE_DIR, "token_calendar.json")
)
GOOGLE_CALENDAR_ID = os.environ.get("GOOGLE_CALENDAR_ID", "primary")

# Connessione CRM e DettoFatto MCP
CRM_DB_PATH = os.environ.get(
    "DATABASE_PATH",
    os.path.abspath(os.path.join(BASE_DIR, "..", "backend", "studio_condominiale.db"))
)
CONDOMINI_JSON_PATH = os.path.abspath(
    os.path.join(BASE_DIR, "..", "frontend", "src", "data", "condominiStudioSerra.json")
)
DETTOFATTO_MCP_URL = os.environ.get("DETTOFATTO_MCP_URL", "https://df.dettofatto.org/mcp")
DETTOFATTO_MCP_TOKEN = os.environ.get(
    "DETTOFATTO_MCP_TOKEN", "r1wp6o4o7brjuj2pqzxd0nsgu8ua1m02kkr4ux0en3sb"
)
