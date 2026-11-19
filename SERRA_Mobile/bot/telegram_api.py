import os
import urllib.request
import urllib.error
import json
import ssl

try:
    import config
except ImportError:
    from .. import config

contesto_ssl = ssl._create_unverified_context()

def invia_messaggio(chat_id, testo, tastiera=None):
    url = f"https://api.telegram.org/bot{config.TOKEN_TELEGRAM}/sendMessage"
    payload = {"chat_id": chat_id, "text": testo, "parse_mode": "Markdown"}
    if tastiera:
        payload["reply_markup"] = tastiera
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, context=contesto_ssl)
    except Exception as e:
        # Fallback senza parse_mode se Telegram ha problemi con caratteri speciali Markdown
        try:
            payload.pop("parse_mode", None)
            data_raw = json.dumps(payload).encode('utf-8')
            req_raw = urllib.request.Request(url, data=data_raw, headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(req_raw, context=contesto_ssl)
        except Exception as e2:
            print(f"⚠️ Errore invio messaggio Telegram: {e2}")

def scarica_foto_telegram(file_id, cartella_destinazione):
    url_file = f"https://api.telegram.org/bot{config.TOKEN_TELEGRAM}/getFile?file_id={file_id}"
    try:
        req = urllib.request.Request(url_file)
        resp = urllib.request.urlopen(req, context=contesto_ssl)
        info_file = json.loads(resp.read().decode('utf-8'))
        file_path = info_file["result"]["file_path"]
        
        url_download = f"https://api.telegram.org/file/bot{config.TOKEN_TELEGRAM}/{file_path}"
        estensione = os.path.splitext(file_path)[1]
        nome_file = f"media_{file_id}{estensione}"
        percorso_completo = os.path.join(cartella_destinazione, nome_file)
        
        req_dl = urllib.request.Request(url_download)
        with urllib.request.urlopen(req_dl, context=contesto_ssl) as response, open(percorso_completo, 'wb') as out_file:
            out_file.write(response.read())
        return percorso_completo
    except Exception as e:
        print(f"⚠️ Errore download file Telegram: {e}")
        return None

def invia_documento_telegram(chat_id, percorso_file, didascalia=None):
    """Invia un file (PDF o DOCX) su Telegram tramite sendDocument multipart/form-data."""
    if not percorso_file or not os.path.exists(percorso_file):
        print(f"⚠️ invia_documento_telegram: file non trovato {percorso_file}")
        return False
    try:
        import httpx
        url = f"https://api.telegram.org/bot{config.TOKEN_TELEGRAM}/sendDocument"
        filename = os.path.basename(percorso_file)
        mime = "application/pdf" if filename.lower().endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        data = {"chat_id": str(chat_id)}
        if didascalia:
            data["caption"] = didascalia
        with open(percorso_file, "rb") as f:
            files = {"document": (filename, f, mime)}
            with httpx.Client(verify=False, timeout=60.0) as client:
                res = client.post(url, data=data, files=files)
                if res.status_code == 200:
                    print(f"✅ [TELEGRAM] Documento inviato con successo a {chat_id}: {filename}")
                    return True
                else:
                    print(f"⚠️ [TELEGRAM] Errore invio documento: {res.status_code} - {res.text}")
    except Exception as e_httpx:
        print(f"⚠️ Errore invio documento Telegram: {e_httpx}")
    return False

def imposta_comandi_bot():
    url = f"https://api.telegram.org/bot{config.TOKEN_TELEGRAM}/setMyCommands"
    comandi = [
        {"command": "start", "description": "🤖 S.E.R.R.A. (Sistema Esecutivo di Ricerca a Risposta Autonoma)"},
        {"command": "sopralluogo", "description": "📋 1. Report Sopralluogo"},
        {"command": "intervento", "description": "🛠️ 2. Segnala Intervento"},
        {"command": "ricerca", "description": "🔎 3. Ricerca Archivio"},
        {"command": "segreteria", "description": "👩💼 4. Agente Segreteria"},
        {"command": "promemoria", "description": "📌 5. Promemoria Staff"},
        {"command": "calendario", "description": "📅 6. Prenota Calendar"}
    ]
    data = json.dumps({"commands": comandi}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, context=contesto_ssl)
        print("✅ [TELEGRAM] Menu comandi mobile aggiornato.")
    except Exception as e:
        print(f"⚠️ Errore menu comandi: {e}")
