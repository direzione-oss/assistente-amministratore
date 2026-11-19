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
    USA_GEMINI = hasattr(config, 'CHIAVE_GEMINI') and bool(config.CHIAVE_GEMINI)
    if USA_GEMINI:
        client_gemini = genai.Client(api_key=config.CHIAVE_GEMINI)
except Exception:
    USA_GEMINI = False

contesto_ssl = ssl._create_unverified_context()
BASE_ARCHIVIO = os.path.join(config.CARTELLA_IA, "2_Gia_Letti_dall_IA")

def chiama_ia_testuale(prompt_ia):
    if USA_GEMINI:
        try:
            risposta = client_gemini.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt_ia
            )
            return risposta.text.strip()
        except Exception as e:
            print(f"⚠️ Errore Gemini: {e}. Fallback su Ollama...")
            
    URL_OLLAMA = "http://127.0.0.1:11434/api/generate"
    dati = {"model": "llama3.2:latest", "prompt": prompt_ia, "stream": False}
    try:
        req = urllib.request.Request(
            URL_OLLAMA,
            data=json.dumps(dati).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method='POST'
        )
        resp = urllib.request.urlopen(req, context=contesto_ssl, timeout=120)
        return json.loads(resp.read().decode('utf-8')).get("response", "").strip()
    except Exception as e:
        return f"⚠️ Errore IA: {e}"

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

def genera_testo_ia(nome_condominio, testo_messaggio, data_ispezione, tipo="intervento"):
    contesto_tipo = (
        "verbale tecnico di sopralluogo"
        if tipo == "sopralluogo"
        else "richiesta di intervento manutentivo"
    )
    prompt_ia = (
        f"Sei un geometra/tecnico condominiale dello Studio Serra. Scrivi un {contesto_tipo} sintetico e "
        f"professionale per '{nome_condominio}' (Data: {data_ispezione}). "
        f"Appunti rilevati sul campo: '{testo_messaggio}'. Usa un elenco puntato chiaro, massimo 4-5 righe."
    )
    return chiama_ia_testuale(prompt_ia)

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

    try:
        contenuti = [prompt_agente, f"Richiesta: {messaggio_utente}"]
        if percorso_foto and os.path.exists(percorso_foto):
            contenuti.append(Image.open(percorso_foto))
        risposta = client_gemini.models.generate_content(
            model='gemini-2.5-flash',
            contents=contenuti
        )
        return risposta.text.replace("```json", "").replace("```", "").strip()
    except Exception as e:
        return f'{{"azione": "errore", "testo": "Errore Agente: {e}"}}'

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
    try:
        risposta = client_gemini.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt_agente, f"Richiesta: {messaggio_utente}"]
        )
        return risposta.text.replace("```json", "").replace("```", "").strip()
    except Exception as e:
        return f'{{"azione": "chat", "parametri": {{"risposta": "Errore Agente: {e}"}}}}'
