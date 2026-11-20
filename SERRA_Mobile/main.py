import os
import sys
import time
import json
import urllib.request
import urllib.error
import ssl
from datetime import datetime
import traceback

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import config
from bot.telegram_api import (
    invia_messaggio,
    scarica_foto_telegram,
    imposta_comandi_bot,
    invia_documento_telegram
)
from servizi import crm_service
import servizi.dettofatto as df
from servizi.intelligenza import (
    genera_testo_ia,
    ricerca_mirata_ia,
    trascrivi_audio_con_whisper,
    esegui_agente_segretario,
    esegui_master_agent
)
from servizi.documenti import crea_word_e_pdf, invia_email_promemoria
from servizi.calendario import verifica_e_prenota_appuntamento
from bot.handler import (
    gestisci_update_telegram,
    stato_utenti,
    TASTIERA_PRINCIPALE,
    TASTIERA_CRM,
    TASTIERA_TICKETS,
    TASTIERA_SCADENZE,
    TASTIERA_SEGRETERIA,
    TASTIERA_AGENDA
)

contesto_ssl = ssl._create_unverified_context()

def avvia_bot():
    print("================================================================")
    print("🚀 S.E.R.R.A. MOBILE & CRM FIELD ASSISTANT ONLINE")
    print("================================================================")
    cartella_temp = os.path.join(BASE_DIR, "foto_telegram_temp")
    
    for c in [config.CARTELLA_IA, config.CARTELLA_SOPRALLUOGHI, config.CARTELLA_INTERVENTI, cartella_temp]:
        os.makedirs(c, exist_ok=True)
    
    imposta_comandi_bot()
    df.sincronizza_condomini()
    offset = 0
    token_preview = config.TOKEN_TELEGRAM[:10] if config.TOKEN_TELEGRAM else ""
    print(f"📡 Bot in ascolto su token: {token_preview}... (Utenti autorizzati: {len(config.ID_AUTORIZZATI) if config.ID_AUTORIZZATI else 'Tutti'})")
    
    while True:
        try:
            url_updates = f"https://api.telegram.org/bot{config.TOKEN_TELEGRAM}/getUpdates?timeout=10&offset={offset}"
            req = urllib.request.Request(url_updates)
            resp = urllib.request.urlopen(req, context=contesto_ssl, timeout=15)
            updates = json.loads(resp.read().decode('utf-8')).get("result", [])
            
            for item in updates:
                offset = item["update_id"] + 1
                gestisci_update_telegram(item)

        except urllib.error.URLError:
            pass
        except Exception:
            time.sleep(2)

if __name__ == "__main__":
    try:
        avvia_bot()
    except Exception:
        traceback.print_exc()
        input()
