import os
import sqlite3
from datetime import datetime, timedelta

try:
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    GOOGLE_API_AVAIL = True
except ImportError:
    GOOGLE_API_AVAIL = False

try:
    import config
except ImportError:
    from .. import config

SCOPES = ['https://www.googleapis.com/auth/calendar']

def _get_calendar_service():
    if not GOOGLE_API_AVAIL:
        return None
    creds = None
    if os.path.exists(config.GOOGLE_TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(config.GOOGLE_TOKEN_PATH, SCOPES)
        except Exception as e:
            print(f"⚠️ Errore lettura token_calendar.json: {e}")

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            with open(config.GOOGLE_TOKEN_PATH, "w", encoding="utf-8") as f:
                f.write(creds.to_json())
        except Exception as e:
            print(f"⚠️ Errore refresh token Google Calendar: {e}")
            creds = None

    if creds and creds.valid:
        return build('calendar', 'v3', credentials=creds)
    return None

def _salva_su_crm_db(titolo: str, start_dt: datetime, durata_minuti: int, google_event_id: str = None):
    """Registra l'appuntamento come Scadenza/Task nel DB del CRM Assistente Amministratore."""
    try:
        if os.path.exists(config.CRM_DB_PATH):
            conn = sqlite3.connect(config.CRM_DB_PATH)
            c = conn.cursor()
            ora_str = start_dt.strftime("%H:%M")
            data_scad = start_dt.strftime("%Y-%m-%d")
            desc = f"Prenotato via S.E.R.R.A. Mobile (durata: {durata_minuti} min)"
            c.execute("""
                INSERT INTO scadenze_tasks (titolo, descrizione, tipo, data_scadenza, ora, priorita, completato, sincronizzato_gcal, google_event_id)
                VALUES (?, ?, 'Appuntamento', ?, ?, 'Alta', 0, ?, ?)
            """, (titolo, desc, data_scad, ora_str, 1 if google_event_id else 0, google_event_id))
            conn.commit()
            conn.close()
            print(f"✅ [CRM] Scadenza/Appuntamento salvato nel database locale ({titolo}).")
    except Exception as e:
        print(f"⚠️ Errore salvataggio CRM DB per calendario: {e}")

def verifica_e_prenota_appuntamento(titolo: str, data_ora: str, durata_minuti: int = 60) -> tuple[bool, str]:
    """
    Verifica conflitti di orario e crea l'evento su Google Calendar e nel CRM locale.
    Formato data_ora: 'GG/MM/AAAA HH:MM' oppure 'AAAA-MM-GG HH:MM'
    """
    try:
        # Parsing data e ora
        data_ora_clean = data_ora.strip()
        try:
            start_dt = datetime.strptime(data_ora_clean, "%d/%m/%Y %H:%M")
        except ValueError:
            start_dt = datetime.strptime(data_ora_clean, "%Y-%m-%d %H:%M")
    except Exception as pe:
        return False, f"⚠️ Formato data/ora non valido: {pe}. Usa 'GG/MM/AAAA HH:MM'."

    end_dt = start_dt + timedelta(minutes=durata_minuti)
    service = _get_calendar_service()

    if service:
        try:
            local_tz = datetime.now().astimezone().tzinfo
            time_min = start_dt.replace(tzinfo=local_tz).isoformat()
            time_max = end_dt.replace(tzinfo=local_tz).isoformat()

            # Controllo conflitti di slot
            events_res = service.events().list(
                calendarId=config.GOOGLE_CALENDAR_ID,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            items = events_res.get('items', [])

            if items:
                primo_conflitto = items[0].get('summary', 'Impegno senza titolo')
                return False, (
                    f"⚠️ **CONFLITTO IN AGENDA!**\n\n"
                    f"Slot non disponibile: è già presente l'evento *'{primo_conflitto}'* "
                    f"nella fascia {start_dt.strftime('%H:%M')} - {end_dt.strftime('%H:%M')}.\n\n"
                    f"Scegli un orario differente."
                )

            # Prenotazione evento Google Calendar
            corpo_evento = {
                'summary': titolo,
                'description': f"Appuntamento fissato da S.E.R.R.A. Mobile per Studio Serra.",
                'start': {
                    'dateTime': start_dt.isoformat(),
                    'timeZone': 'Europe/Rome',
                },
                'end': {
                    'dateTime': end_dt.isoformat(),
                    'timeZone': 'Europe/Rome',
                }
            }

            evento_creato = service.events().insert(
                calendarId=config.GOOGLE_CALENDAR_ID,
                body=corpo_evento
            ).execute()

            evt_id = evento_creato.get("id")
            _salva_su_crm_db(titolo, start_dt, durata_minuti, google_event_id=evt_id)

            return True, (
                f"✅ **APPUNTAMENTO CONFERMATO SU GOOGLE CALENDAR!**\n\n"
                f"📅 **Titolo:** {titolo}\n"
                f"🕒 **Data/Ora:** {start_dt.strftime('%d/%m/%Y')} dalle {start_dt.strftime('%H:%M')} alle {end_dt.strftime('%H:%M')}\n"
                f"⏳ **Durata:** {durata_minuti} minuti\n"
                f"📌 Sincronizzato con l'agenda e il CRM Studio Serra."
            )

        except Exception as e_cal:
            print(f"⚠️ Errore Google Calendar API: {e_cal}")
            _salva_su_crm_db(titolo, start_dt, durata_minuti)
            return True, (
                f"⚠️ **REGISTRATO SOLO NEL CRM LOCALE**\n\n"
                f"Non è stato possibile sincronizzare Google Calendar ({e_cal}), ma l'impegno "
                f"*{titolo}* è stato salvato nel cruscotto dello Studio Serra per il "
                f"{start_dt.strftime('%d/%m/%Y %H:%M')}."
            )

    # Se Google API non autenticato o mancante
    _salva_su_crm_db(titolo, start_dt, durata_minuti)
    return True, (
        f"✅ **APPUNTAMENTO REGISTRATO NEL CRM!**\n\n"
        f"📅 **Titolo:** {titolo}\n"
        f"🕒 **Data/Ora:** {start_dt.strftime('%d/%m/%Y %H:%M')}\n"
        f"📌 Salvato nel registro impegni e scadenze di Studio Serra."
    )
