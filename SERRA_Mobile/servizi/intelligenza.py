import os
import json
import urllib.request
import ssl
from typing import Optional, Dict, Any, List

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

def _deterministico_master_agent(msg: str) -> Optional[str]:
    """Fallback deterministico intelligente per instradare le richieste verso il CRM."""
    m = msg.lower().strip()
    
    # 1. Briefing e Stato Studio
    if any(k in m for k in ["cruscotto", "stato studio", "riepilogo studio", "panoramica", "briefing", "come va lo studio"]):
        return json.dumps({"azione": "crm_briefing", "parametri": {}})

    # 2. Fornitori & Rubrica
    for cat, kw in [
        ("Idraulica & Caldaie", ["idraulic", "caldaia", "tubo", "perdita acqua"]),
        ("Elettricista & Automazioni", ["elettric", "cancello", "citofon", "corrente", "luce"]),
        ("Ascensori", ["ascensor", "elevatore"]),
        ("Spurghi", ["spurg", "fogn"]),
        ("Fabbro", ["fabbro", "serratur", "porta bloccata"]),
        ("Generale", ["fornitor", "manutentor", "chi chiam"])
    ]:
        if any(w in m for w in kw):
            return json.dumps({"azione": "crm_fornitore", "parametri": {"categoria": cat if cat != "Generale" else ""}})

    # 3. Ticket & Guasti
    if any(k in m for k in ["ticket", "guasti", "guasto", "interventi aperti", "riparazion"]):
        return json.dumps({"azione": "crm_ticket", "parametri": {}})

    # 4. Scadenze & CPI
    if any(k in m for k in ["scadenz", "cpi", "antincendio", "adempiment", "obbligh"]):
        return json.dumps({"azione": "crm_scadenze", "parametri": {}})

    # 5. Saldi e Condomini
    if any(k in m for k in ["saldo", "cassa", "fondo cassa", "moros", "conto", "iban", "codice fiscale", "condominio"]):
        # Estrai eventuale nome
        words = msg.split()
        cand_name = " ".join([w for w in words if w.lower().strip("?.,! ") not in ["qual", "qual è", "quale", "è", "il", "lo", "la", "del", "della", "dello", "dei", "di", "conto", "saldo", "cassa", "fondo", "morosità", "condominio", "mi", "dici", "dammi"]])
        cand_clean = cand_name.strip("?.,! ")
        return json.dumps({"azione": "crm_condominio", "parametri": {"condominio": cand_clean or msg}})

    # 6. Promemoria Staff
    if any(k in m for k in ["promemoria", "avvisa lo staff", "scrivi allo staff", "ricorda allo staff"]):
        return json.dumps({"azione": "promemoria", "parametri": {"oggetto": "📌 Promemoria Staff", "testo": msg}})

    # 7. Calendario
    if any(k in m for k in ["fissa", "prenota", "appuntamento", "calendario"]):
        return None

    return None

def esegui_master_agent(messaggio_utente):
    from datetime import datetime
    oggi = datetime.now().strftime("%d/%m/%Y")
    prompt_agente = f"""Sei il Master Agent del Sistema S.E.R.R.A. e del CRM Studio Serra. Oggi è il {oggi}.
Il tuo compito è comprendere la richiesta dell'amministratore e instradarla correttamente:
1. "crm_briefing": panoramica generale dello studio, totale condomini, cassa, morosità, ticket aperti. Parametri: {{}}
2. "crm_condominio": informazioni economiche/tecniche su un condominio specifico (saldo cassa, morosità, unità, ticket, scadenze). Parametri: "condominio" (nome estratto del condominio).
3. "crm_ticket": consultazione o ricerca ticket di manutenzione e guasti. Parametri: "condominio" (opzionale).
4. "crm_scadenze": scadenze obbligatorie, CPI, assicurazioni o compiti. Parametri: "tipo" (opzionale).
5. "crm_fornitore": rubrica e numeri dei tecnici/manutentori (idraulico, elettricista, ascensori, spurghi, ecc.). Parametri: "categoria" o "nome".
6. "calendario": fissare appuntamenti su Google Calendar. Parametri: "titolo", "data_ora" (GG/MM/AAAA HH:MM), "durata_minuti" (intero).
7. "promemoria": inviare email/note allo staff operativo. Parametri: "oggetto", "testo".
8. "ricerca": cercare informazioni tecniche o storiche nei fascicoli d'archivio PDF. Parametri: "condominio" (nome o CARTELLA GENERICA), "domanda".
9. "chat": risposta a chiarimenti o istruzioni. Parametri: "risposta".

RISPONDI SOLO CON JSON VALIDO. Esempi:
- "Qual è il fondo cassa del condominio Betulla?" -> {{"azione": "crm_condominio", "parametri": {{"condominio": "Betulla"}}}}
- "Ci sono ticket o guasti aperti?" -> {{"azione": "crm_ticket", "parametri": {{}}}}
- "Chi è l'idraulico dello studio?" -> {{"azione": "crm_fornitore", "parametri": {{"categoria": "Idraulica"}}}}
- "Stato dello studio" -> {{"azione": "crm_briefing", "parametri": {{}}}}
- "Fissa sopralluogo domani alle 15" -> {{"azione": "calendario", "parametri": {{"titolo": "Sopralluogo", "data_ora": "{oggi} 15:00", "durata_minuti": 60}}}}"""
    
    # Prova con Gemini se disponibile
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
                        contents=[prompt_agente, f"Richiesta: {messaggio_utente}"]
                    )
                    if risposta and risposta.text:
                        raw = risposta.text.replace("```json", "").replace("```", "").strip()
                        # Verifica validità JSON
                        json.loads(raw)
                        return raw
                except Exception as e:
                    if "404" in str(e) or "NOT_FOUND" in str(e):
                        continue
                    break

    # Fallback deterministico intelligente su parole chiave
    det = _deterministico_master_agent(messaggio_utente)
    if det:
        return det

    return json.dumps({
        "azione": "chat",
        "parametri": {
            "risposta": "Sono l'Assistente Studio Serra. Puoi usare i pulsanti del menu in basso oppure chiedermi informazioni su condomini, ticket, fornitori, scadenze e appuntamenti."
        }
    })
