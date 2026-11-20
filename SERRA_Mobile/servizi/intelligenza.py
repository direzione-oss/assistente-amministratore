import os
import json
import urllib.request
import ssl

try:
    import config
except ImportError:
    from .. import config

try:
    import fitz
except ImportError:
    pass

try:
    from PIL import Image
except ImportError:
    pass

try:
    import whisper
    MODELLO_WHISPER = whisper.load_model("small")
except Exception:
    MODELLO_WHISPER = None

try:
    from google import genai
    USA_GEMINI = hasattr(config, 'GEMINI_API_KEYS') and bool(config.GEMINI_API_KEYS)
except Exception:
    USA_GEMINI = False

contesto_ssl = ssl._create_unverified_context()
BASE_ARCHIVIO = os.path.join(config.CARTELLA_IA, "2_Gia_Letti_dall_IA")

MODELLI_GEMINI_PRIORITARI = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]

def notifica_consumo_token_crm(input_tokens, output_tokens, operazione="Sintesi Sopralluogo"):
    urls = [
        "http://dettofatto00000000000001:3000/api/gemini-billing",
        "https://dettofatto.187.126.30.207.sslip.io/api/gemini-billing",
        "http://localhost:3000/api/gemini-billing"
    ]
    payload = json.dumps({
        "action": "record",
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "operation": operazione
    }).encode("utf-8")
    for u in urls:
        try:
            req = urllib.request.Request(u, data=payload, headers={"Content-Type": "application/json"}, method="POST")
            urllib.request.urlopen(req, timeout=1.5, context=contesto_ssl)
            break
        except Exception:
            continue

def chiama_ia_testuale(prompt_ia):
    if USA_GEMINI:
        keys = getattr(config, "GEMINI_API_KEYS", [config.CHIAVE_GEMINI])
        for k in keys:
            if not k:
                continue
            for mod in MODELLI_GEMINI_PRIORITARI:
                try:
                    c = genai.Client(api_key=k)
                    risposta = c.models.generate_content(
                        model=mod,
                        contents=prompt_ia
                    )
                    if risposta and risposta.text:
                        try:
                            um = getattr(risposta, 'usage_metadata', None)
                            in_t = getattr(um, 'prompt_token_count', 800) if um else 800
                            out_t = getattr(um, 'candidates_token_count', 400) if um else 400
                            notifica_consumo_token_crm(in_t, out_t, "Sintesi Sopralluogo Assistente")
                        except Exception:
                            pass
                        return risposta.text.strip()
                except Exception as e:
                    # Se il modello non è supportato/trovato, prova il prossimo modello
                    if "404" in str(e) or "NOT_FOUND" in str(e):
                        continue
                    print(f"⚠️ Errore Gemini key (...{k[-6:]}) modello {mod}: {e}. Tentativo successiva...")
                    break
            
    # Prova Ollama solo se abilitato esplicitamente e raggiungibile
    if getattr(config, "ENABLE_OLLAMA", False):
        URL_OLLAMA = getattr(config, "URL_OLLAMA", "http://127.0.0.1:11434/api/generate")
        dati = {"model": "llama3.2:latest", "prompt": prompt_ia, "stream": False}
        try:
            req = urllib.request.Request(
                URL_OLLAMA,
                data=json.dumps(dati).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method='POST'
            )
            resp = urllib.request.urlopen(req, context=contesto_ssl, timeout=10)
            return json.loads(resp.read().decode('utf-8')).get("response", "").strip()
        except Exception as e:
            print(f"⚠️ Errore Ollama: {e}")
    return ""

def trascrivi_audio_con_whisper(percorso_audio):
    if not MODELLO_WHISPER:
        return "⚠️ Errore: Whisper non installato."
    try:
        return MODELLO_WHISPER.transcribe(percorso_audio, language="it")["text"]
    except Exception as e:
        return f"⚠️ Errore ascolto audio: {e}"

def estrai_testo_da_file(percorso_file, parole_domanda=None):
    testo_estratto = ""
    try:
        if percorso_file.lower().endswith(".pdf"):
            with fitz.open(percorso_file) as pdf:
                for num_pagina in range(min(20, len(pdf))):
                    testo = pdf[num_pagina].get_text()
                    if parole_domanda:
                        if testo and any(p.lower() in testo.lower() for p in parole_domanda if len(p) > 4):
                            testo_estratto += testo + "\n"
                    else:
                        testo_estratto += testo + "\n"
    except Exception:
        pass
    return testo_estratto

def ricerca_mirata_ia(nome_condominio, domanda):
    cartella_target = None
    if "GENERICA" in nome_condominio.upper():
        cartella_target = os.path.join(BASE_ARCHIVIO, "GENERICA")
    elif os.path.exists(BASE_ARCHIVIO):
        for nome_cartella in os.listdir(BASE_ARCHIVIO):
            if nome_condominio.lower().replace("condominio", "").strip() in nome_cartella.lower():
                cartella_target = os.path.join(BASE_ARCHIVIO, nome_cartella)
                break
                
    if not cartella_target or not os.path.exists(cartella_target):
        return f"⚠️ Nessun archivio trovato per '{nome_condominio}' in 2_Gia_Letti_dall_IA."
    
    parole_domanda = [p for p in domanda.split() if len(p) > 3]
    testo_contesto = ""
    for root, dirs, files in os.walk(cartella_target):
        for file in files:
            if file.lower().endswith(".pdf"):
                frammento = estrai_testo_da_file(os.path.join(root, file), parole_domanda)
                if frammento:
                    testo_contesto += f"\n--- File: {file} ---\n{frammento}"
    
    if not testo_contesto.strip():
        return "🤷‍♂️ Nessuna corrispondenza trovata nei documenti dell'archivio."
        
    prompt_ia = (
        f"Sei l'archivista di S.E.R.R.A. Rispondi usando SOLO questi estratti documentali:\n"
        f"{testo_contesto[:50000]}\nDOMANDA: {domanda}\nRISPOSTA:"
    )
    return chiama_ia_testuale(prompt_ia)

def genera_testo_ia(nome_condominio, testo_messaggio, data_ispezione, tipo="intervento", tecnico=None):
    nome_tecnico = tecnico or getattr(config, "NOME_TECNICO", "Gian Carlo ing. Serra")
    contesto_tipo = (
        "verbale tecnico di sopralluogo"
        if tipo == "sopralluogo"
        else "richiesta di intervento manutentivo"
    )
    prompt_ia = (
        f"Sei il tecnico rilevatore {nome_tecnico} dello Studio Serra. Scrivi un {contesto_tipo} sintetico e "
        f"professionale per '{nome_condominio}' (Data: {data_ispezione}). "
        f"Appunti rilevati sul campo: '{testo_messaggio}'. Usa un elenco puntato chiaro, massimo 4-5 righe."
    )
    risposta_ia = chiama_ia_testuale(prompt_ia)
    if risposta_ia and not risposta_ia.startswith("⚠️") and len(risposta_ia.strip()) > 10:
        return risposta_ia.strip()

    # Fallback deterministico di sicurezza professionale se l'IA non risponde
    righe_raw = [r.strip() for r in (testo_messaggio or "").replace(";", "\n").split("\n") if r.strip()]
    if not righe_raw:
        righe_raw = ["Ispezione e controllo generale dello stato dei luoghi e degli impianti condominiali."]
    punti = "\n".join([f"• {r}" for r in righe_raw[:6]])
    azione = "Sopralluogo tecnico di ispezione" if tipo == "sopralluogo" else "Segnalazione di intervento manutentivo urgente"
    return (
        f"{azione} effettuato in data {data_ispezione} presso il condominio {nome_condominio} "
        f"a cura del Tecnico Rilevatore {nome_tecnico}.\n\n"
        f"Riepilogo delle rilevazioni e note registrate sul campo:\n"
        f"{punti}\n\n"
        f"Si rimanda al fascicolo fotografico allegato per i riscontri visivi di dettaglio."
    )

def esegui_agente_segretario(messaggio_utente, percorso_foto=None):
    prompt_agente = """Sei l'Agente Segretario dello Studio Serra. Analizza la richiesta e scegli tra 3 azioni:
1. "email": scrivere una mail/comunicazione professionale.
2. "sollecito": sollecitare formalmente un pagamento scaduto.
3. "anagrafica": trascrivere dati anagrafici da una foto o testo.

RISPONDI ESCLUSIVAMENTE CON JSON VALIDO:
email: {"azione": "email", "oggetto": "...", "testo": "..."}
sollecito: {"azione": "sollecito", "destinatario": "...", "testo": "..."}
anagrafica: {"azione": "anagrafica", "testo": "..."}"""
    
    if not USA_GEMINI:
        return '{"azione": "errore", "testo": "⚠️ Chiave API Gemini non configurata."}'

    keys = getattr(config, "GEMINI_API_KEYS", [config.CHIAVE_GEMINI])
    ultimo_errore = ""
    for k in keys:
        if not k:
            continue
        for mod in MODELLI_GEMINI_PRIORITARI:
            try:
                c = genai.Client(api_key=k)
                contenuti = [prompt_agente, f"Richiesta: {messaggio_utente}"]
                if percorso_foto and os.path.exists(percorso_foto):
                    contenuti.append(Image.open(percorso_foto))
                risposta = c.models.generate_content(
                    model=mod,
                    contents=contenuti
                )
                if risposta and risposta.text:
                    return risposta.text.replace("```json", "").replace("```", "").strip()
            except Exception as e:
                ultimo_errore = str(e)
                if "404" in str(e) or "NOT_FOUND" in str(e):
                    continue
                break
    return f'{{"azione": "errore", "testo": "Errore Agente: {ultimo_errore}"}}'

def esegui_master_agent(messaggio_utente):
    from datetime import datetime
    oggi = datetime.now().strftime("%d/%m/%Y")
    prompt_agente = f"""Sei il Master Agent del Sistema S.E.R.R.A. Oggi è il {oggi}.
Scegli lo strumento adatto tra:
1. "calendario": fissare appuntamenti. Parametri: "titolo", "data_ora" (GG/MM/AAAA HH:MM), "durata_minuti" (intero).
2. "promemoria": inviare email/note allo staff. Parametri: "oggetto", "testo".
3. "ricerca": cercare informazioni nell'archivio. Parametri: "condominio" (nome o GENERICA), "domanda".
4. "chat": conversazione generica. Parametri: "risposta".

RISPONDI SOLO CON JSON VALIDO. Esempio: {{"azione": "calendario", "parametri": {{"titolo": "Sopralluogo", "data_ora": "{oggi} 15:00", "durata_minuti": 60}}}}"""
    
    if not USA_GEMINI:
        return '{"azione": "chat", "parametri": {"risposta": "Attiva Gemini per usare il Master Agent."}}'

    keys = getattr(config, "GEMINI_API_KEYS", [config.CHIAVE_GEMINI])
    ultimo_errore = ""
    for k in keys:
        if not k:
            continue
        for mod in MODELLI_GEMINI_PRIORITARI:
            try:
                c = genai.Client(api_key=k)
                risposta = c.models.generate_content(
                    model=mod,
                    contents=[prompt_agente, f"Richiesta: {messaggio_utente}"]
                )
                if risposta and risposta.text:
                    return risposta.text.replace("```json", "").replace("```", "").strip()
            except Exception as e:
                ultimo_errore = str(e)
                if "404" in str(e) or "NOT_FOUND" in str(e):
                    continue
                break
    return f'{{"azione": "chat", "parametri": {{"risposta": "Errore Agente: {ultimo_errore}"}}}}'
