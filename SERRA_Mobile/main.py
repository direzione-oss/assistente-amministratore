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

import docx
import config
from bot.telegram_api import invia_messaggio, scarica_foto_telegram, imposta_comandi_bot, invia_documento_telegram
import servizi.dettofatto as df
from servizi.intelligenza import (
    genera_testo_ia, ricerca_mirata_ia, trascrivi_audio_con_whisper,
    esegui_agente_segretario, esegui_master_agent
)
from servizi.documenti import crea_word_e_pdf, invia_email_promemoria
from servizi.calendario import verifica_e_prenota_appuntamento

contesto_ssl = ssl._create_unverified_context()
stato_utenti = {}

TASTIERA_PRINCIPALE = {
    "keyboard": [
        [{"text": "🤖 Menù S.E.R.R.A."}, {"text": "🏢 CRM"}],
        [{"text": "📋 1. Sopralluogo"}, {"text": "🛠️ 2. Intervento"}],
        [{"text": "🔎 3. Ricerca"}, {"text": "👩‍💼 4. Segreteria"}],
        [{"text": "📌 5. Promemoria"}, {"text": "📅 6. Calendario"}],
        [{"text": "🔥 Scadenze & CPI"}, {"text": "❌ Annulla"}]
    ],
    "resize_keyboard": True
}

def avvia_bot():
    print("================================================================")
    print("🚀 S.E.R.R.A. MOBILE & FIELD EDITION ONLINE")
    print("================================================================")
    CARTELLA_TEMP = os.path.join(BASE_DIR, "foto_telegram_temp")
    
    for c in [config.CARTELLA_IA, config.CARTELLA_SOPRALLUOGHI, config.CARTELLA_INTERVENTI, CARTELLA_TEMP]:
        os.makedirs(c, exist_ok=True)
    
    imposta_comandi_bot()
    df.sincronizza_condomini()
    offset = 0
    print(f"📡 In attesa di messaggi Telegram su bot token: {config.TOKEN_TELEGRAM[:10]}... (ID autorizzati: {len(config.ID_AUTORIZZATI) if config.ID_AUTORIZZATI else 'Tutti'})")
    
    while True:
        try:
            url_updates = f"https://api.telegram.org/bot{config.TOKEN_TELEGRAM}/getUpdates?timeout=10&offset={offset}"
            req = urllib.request.Request(url_updates)
            resp = urllib.request.urlopen(req, context=contesto_ssl, timeout=15)
            updates = json.loads(resp.read().decode('utf-8')).get("result", [])
            
            for item in updates:
                offset = item["update_id"] + 1
                msg = item.get("message", {})
                chat_id = str(msg.get("chat", {}).get("id", ""))
                if not chat_id or chat_id not in config.ID_AUTORIZZATI:
                    continue
                    
                testo_msg = (msg.get("text", "") or msg.get("caption", "")).strip()
                if chat_id not in stato_utenti:
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                
                # --- RESET / MENU PRINCIPALE ---
                if testo_msg in ["/start", "❌ Annulla", "/annulla", "🤖 Menù S.E.R.R.A."]:
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                    messaggio_benvenuto = (
                        "🤖 **MENU PRINCIPALE S.E.R.R.A.**\n"
                        "_*Sistema Esecutivo di Ricerca a Risposta Autonoma*_\n\n"
                        "Scegli un'operazione dal cruscotto o scrivi direttamente cosa ti serve:"
                    )
                    invia_messaggio(chat_id, messaggio_benvenuto, TASTIERA_PRINCIPALE)
                    continue

                # --- SELEZIONE MODULI CON SCELTA CONDOMINIO ---
                if testo_msg in ["📋 1. Sopralluogo", "🛠️ 2. Intervento", "🔎 3. Ricerca", "/sopralluogo", "/intervento", "/ricerca"]:
                    if testo_msg.startswith("/"):
                        tipo_scelto = testo_msg.replace("/", "").strip().lower()
                    else:
                        tipo_scelto = testo_msg.split(". ")[1].lower()
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": tipo_scelto}
                    nomi_condomini = [c.get("name", "")[:40].strip() for c in df.condomini_in_memoria]
                    pulsanti = [[{"text": n}] for n in nomi_condomini[:80]]
                    if tipo_scelto == "ricerca":
                        pulsanti.insert(0, [{"text": "📁 CARTELLA GENERICA"}])
                    pulsanti.insert(0, [{"text": "❌ Annulla"}])
                    invia_messaggio(chat_id, f"⚙️ *SEZIONE: {tipo_scelto.upper()}*\n\nSeleziona il Condominio:", {"keyboard": pulsanti, "resize_keyboard": True})
                    continue

                # --- AVVIO SEGRETERIA ---
                if testo_msg in ["👩💼 4. Segreteria", "/segreteria"]:
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": "segreteria"}
                    invia_messaggio(chat_id, "👩💼 *AGENTE SEGRETERIA*\n\nScrivi la richiesta (mail o sollecito) oppure invia la **foto** di un modulo anagrafico:", {"keyboard": [[{"text": "❌ Annulla"}]], "resize_keyboard": True})
                    continue

                # --- AVVIO PROMEMORIA ---
                if testo_msg in ["📌 5. Promemoria", "/promemoria"]:
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": "promemoria_oggetto"}
                    invia_messaggio(chat_id, "📌 *PROMEMORIA STAFF*\n\n**STEP 1:** Scrivi l'**Oggetto** dell'email:", {"keyboard": [[{"text": "❌ Annulla"}]], "resize_keyboard": True})
                    continue

                # --- AVVIO CALENDARIO ---
                if testo_msg in ["📅 6. Calendario", "/calendario"]:
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": "cal_titolo"}
                    invia_messaggio(chat_id, "📅 *GOOGLE CALENDAR*\n\n**STEP 1:** Titolo dell'appuntamento:", {"keyboard": [[{"text": "❌ Annulla"}]], "resize_keyboard": True})
                    continue

                # --- CHIUSURA REPORT SOPRALLUOGO / INTERVENTO ---
                if testo_msg == "✅ CHIUDI E GENERA DOC":
                    cond = stato_utenti[chat_id].get("condominio")
                    data = stato_utenti[chat_id].get("data")
                    tipo = stato_utenti[chat_id].get("tipo", "sopralluogo")
                    invia_messaggio(chat_id, "⏳ Generazione report tecnico in corso...", {"remove_keyboard": True})
                    
                    appunti = stato_utenti[chat_id].get("appunti", "")
                    foto_paths = stato_utenti[chat_id].get("foto", [])
                    testo_completo = appunti
                    for f in foto_paths:
                        if f["caption"]:
                            testo_completo += f" {f['caption']}"
                            
                    t_ia = genera_testo_ia(cond, testo_completo, data, tipo=tipo)
                    p_doc, p_pdf = crea_word_e_pdf(cond, t_ia, foto_paths, data, appunti, tipo=tipo)
                    
                    if p_doc:
                        invia_messaggio(chat_id, f"✅ **REPORT {tipo.upper()} SALVATO NEL CRM!**\n\n_Sintesi generata:_\n{t_ia}")
                    if p_pdf and os.path.exists(p_pdf):
                        invia_documento_telegram(chat_id, p_pdf, f"📄 Verbale {tipo.capitalize()} PDF - {cond}")
                    elif p_doc and os.path.exists(p_doc):
                        invia_documento_telegram(chat_id, p_doc, f"📄 Verbale {tipo.capitalize()} Word - {cond}")
                        
                    if tipo == "intervento":
                        df.apri_ticket_dettofatto(cond, t_ia, p_doc, data)
                        
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                    invia_messaggio(chat_id, "🤖 Operazione completata. I file DOCX e PDF sono consultabili anche nel CRM.", TASTIERA_PRINCIPALE)
                    continue

                # ==========================================
                # MACCHINA A STATI
                # ==========================================
                tipo_attuale = stato_utenti[chat_id].get("tipo")
                cond_attuale = stato_utenti[chat_id].get("condominio")

                # 1. SOPRALLUOGO / INTERVENTO
                if tipo_attuale in ["sopralluogo", "intervento"]:
                    data_attuale = stato_utenti[chat_id].get("data")
                    if cond_attuale is None:
                        stato_utenti[chat_id]["condominio"] = testo_msg
                        invia_messaggio(chat_id, f"✅ Condominio: *{testo_msg}*\nSeleziona o scrivi la data:", {"keyboard": [[{"text": "📅 Usa data di oggi"}], [{"text": "❌ Annulla"}]], "resize_keyboard": True})
                    elif data_attuale is None:
                        stato_utenti[chat_id]["data"] = datetime.now().strftime("%d/%m/%Y") if testo_msg == "📅 Usa data di oggi" else testo_msg
                        invia_messaggio(chat_id, f"✅ Data: *{stato_utenti[chat_id]['data']}*\n\nInvia ora **foto** (anche con didascalia) e **note testuali**. Quando hai finito premi il tasto qui sotto:", {"keyboard": [[{"text": "✅ CHIUDI E GENERA DOC"}], [{"text": "❌ Annulla"}]], "resize_keyboard": True})
                    else:
                        didascalia = testo_msg if testo_msg != "✅ CHIUDI E GENERA DOC" else ""
                        if "photo" in msg:
                            path = scarica_foto_telegram(msg["photo"][-1]["file_id"], CARTELLA_TEMP)
                            if path:
                                stato_utenti[chat_id]["foto"].append({"path": path, "caption": didascalia})
                                invia_messaggio(chat_id, f"📸 Foto acquisita ({len(stato_utenti[chat_id]['foto'])} totali).")
                        elif didascalia:
                            stato_utenti[chat_id]["appunti"] += f"\n- {didascalia}"
                            invia_messaggio(chat_id, "📝 Nota aggiunta al report.")
                    continue

                # 2. RICERCA ARCHIVIO
                elif tipo_attuale == "ricerca":
                    if cond_attuale is None:
                        stato_utenti[chat_id]["condominio"] = testo_msg
                        invia_messaggio(chat_id, f"🎯 Archivio: *{testo_msg}*\nScrivi la tua domanda:", {"keyboard": [[{"text": "❌ Annulla"}]], "resize_keyboard": True})
                    else:
                        invia_messaggio(chat_id, "🔎 Consultazione fascicoli in corso...", {"remove_keyboard": True})
                        risposta = ricerca_mirata_ia(cond_attuale, testo_msg)
                        invia_messaggio(chat_id, f"📚 **RISPOSTA:**\n\n{risposta}", TASTIERA_PRINCIPALE)
                        stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                    continue

                # 3. SEGRETERIA AI
                elif tipo_attuale == "segreteria":
                    invia_messaggio(chat_id, "👩💼 Elaborazione richiesta...", {"remove_keyboard": True})
                    percorso_foto = scarica_foto_telegram(msg["photo"][-1]["file_id"], CARTELLA_TEMP) if "photo" in msg else None
                    dati_agente_str = esegui_agente_segretario(testo_msg, percorso_foto)
                    try:
                        dati_agente = json.loads(dati_agente_str)
                        azione = dati_agente.get("azione")
                        if azione == "email":
                            invia_messaggio(chat_id, f"📧 **BOZZA EMAIL**\n**Oggetto:** {dati_agente.get('oggetto')}\n\n{dati_agente.get('testo')}", TASTIERA_PRINCIPALE)
                        elif azione == "anagrafica":
                            invia_messaggio(chat_id, f"📇 **DATI ANAGRAFICI ESTRATTI**\n\n{dati_agente.get('testo')}", TASTIERA_PRINCIPALE)
                        elif azione == "sollecito":
                            dest = dati_agente.get("destinatario", "Condomino")
                            testo_soll = dati_agente.get("testo", "")
                            doc = docx.Document()
                            doc.add_heading("STUDIO SERRA - AMMINISTRAZIONE", level=1)
                            doc.add_paragraph(f"Spett.le {dest},\nData: {datetime.now().strftime('%d/%m/%Y')}\n")
                            doc.add_heading("OGGETTO: Sollecito Pagamento", level=2)
                            doc.add_paragraph(testo_soll)
                            cartella_soll = os.path.join(config.CARTELLA_IA, "Solleciti")
                            os.makedirs(cartella_soll, exist_ok=True)
                            percorso_soll = os.path.join(cartella_soll, f"Sollecito_{dest.replace(' ', '_')}.docx")
                            doc.save(percorso_soll)
                            invia_messaggio(chat_id, f"⚖️ **SOLLECITO SALVATO IN ARCHIVIO!**\n\n_{testo_soll}_", TASTIERA_PRINCIPALE)
                    except Exception:
                        invia_messaggio(chat_id, "⚠️ Errore interpretazione Agente.", TASTIERA_PRINCIPALE)
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                    continue

                # 4. PROMEMORIA STAFF
                elif tipo_attuale == "promemoria_oggetto":
                    stato_utenti[chat_id]["appunti"] = testo_msg
                    stato_utenti[chat_id]["tipo"] = "promemoria_corpo"
                    invia_messaggio(chat_id, f"✅ **Oggetto:** {testo_msg}\n\n**STEP 2:** Scrivi il testo o **invia un messaggio vocale**:")
                    continue

                elif tipo_attuale == "promemoria_corpo":
                    invia_messaggio(chat_id, "⏳ Invio promemoria allo staff...", {"remove_keyboard": True})
                    oggetto_mail = stato_utenti[chat_id].get("appunti", "📌 S.E.R.R.A. - PROMEMORIA")
                    file_id_audio = msg["audio"]["file_id"] if "audio" in msg else (msg["voice"]["file_id"] if "voice" in msg else None)
                    
                    if file_id_audio:
                        path_audio = scarica_foto_telegram(file_id_audio, CARTELLA_TEMP)
                        testo_finale_mail = trascrivi_audio_con_whisper(path_audio) if path_audio else ""
                    else:
                        testo_finale_mail = testo_msg

                    if testo_finale_mail.strip() and "⚠️ Errore" not in testo_finale_mail:
                        if invia_email_promemoria(testo_finale_mail, oggetto_mail):
                            invia_messaggio(chat_id, f"🚀 **EMAIL INVIATA!**\n**Oggetto:** {oggetto_mail}\n**Testo:** _{testo_finale_mail}_", TASTIERA_PRINCIPALE)
                        else:
                            invia_messaggio(chat_id, "⚠️ Errore invio SMTP.", TASTIERA_PRINCIPALE)
                    else:
                        invia_messaggio(chat_id, "⚠️ Impossibile estrarre un testo valido.", TASTIERA_PRINCIPALE)
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                    continue

                # 5. CALENDARIO
                elif tipo_attuale == "cal_titolo":
                    stato_utenti[chat_id]["appunti"] = testo_msg
                    stato_utenti[chat_id]["tipo"] = "cal_data"
                    invia_messaggio(chat_id, f"✅ **Titolo:** {testo_msg}\n\n**STEP 2:** Inserisci data e ora (`GG/MM/AAAA HH:MM`):")
                    continue

                elif tipo_attuale == "cal_data":
                    try:
                        datetime.strptime(testo_msg, "%d/%m/%Y %H:%M")
                        stato_utenti[chat_id]["data"] = testo_msg
                        stato_utenti[chat_id]["tipo"] = "cal_durata"
                        tastiera_durata = {"keyboard": [[{"text": "30"}, {"text": "60"}], [{"text": "90"}, {"text": "120"}], [{"text": "❌ Annulla"}]], "resize_keyboard": True}
                        invia_messaggio(chat_id, f"✅ **Data/Ora:** {testo_msg}\n\n**STEP 3:** Durata in minuti:", tastiera_durata)
                    except ValueError:
                        invia_messaggio(chat_id, "⚠️ Formato errato. Usa `GG/MM/AAAA HH:MM` (es. `20/11/2026 15:30`):")
                    continue

                elif tipo_attuale == "cal_durata":
                    if not testo_msg.isdigit():
                        invia_messaggio(chat_id, "⚠️ Inserisci solo il numero di minuti (es. 60):")
                        continue
                    invia_messaggio(chat_id, "⏳ Verifica disponibilità su Google Calendar...", {"remove_keyboard": True})
                    _, messaggio_risposta = verifica_e_prenota_appuntamento(stato_utenti[chat_id]["appunti"], stato_utenti[chat_id]["data"], int(testo_msg))
                    invia_messaggio(chat_id, messaggio_risposta, TASTIERA_PRINCIPALE)
                    stato_utenti[chat_id] = {"condominio": None, "data": None, "foto": [], "appunti": "", "tipo": None}
                    continue

                # 6. MASTER AGENT (LINGUAGGIO LIBERO)
                else:
                    if testo_msg and not testo_msg.startswith("/"):
                        invia_messaggio(chat_id, "🤖 _Analisi richiesta con Master Agent..._", {"remove_keyboard": True})
                        risposta_json = esegui_master_agent(testo_msg)
                        try:
                            dati = json.loads(risposta_json)
                            azione = dati.get("azione")
                            p = dati.get("parametri", {})
                            
                            if azione == "calendario":
                                _, msg_cal = verifica_e_prenota_appuntamento(p.get("titolo"), p.get("data_ora"), p.get("durata_minuti", 60))
                                invia_messaggio(chat_id, msg_cal, TASTIERA_PRINCIPALE)
                            elif azione == "promemoria":
                                if invia_email_promemoria(p.get("testo"), p.get("oggetto")):
                                    invia_messaggio(chat_id, f"🚀 **EMAIL INVIATA!**\nOggetto: {p.get('oggetto')}", TASTIERA_PRINCIPALE)
                                else:
                                    invia_messaggio(chat_id, "⚠️ Errore invio email.", TASTIERA_PRINCIPALE)
                            elif azione == "ricerca":
                                risp_ricerca = ricerca_mirata_ia(p.get("condominio"), p.get("domanda"))
                                invia_messaggio(chat_id, f"📚 **RISPOSTA:**\n\n{risp_ricerca}", TASTIERA_PRINCIPALE)
                            else:
                                invia_messaggio(chat_id, f"🤖 {p.get('risposta', 'Fatto.')}", TASTIERA_PRINCIPALE)
                        except Exception as e:
                            invia_messaggio(chat_id, f"⚠️ Usa i pulsanti del menu oppure riformula la richiesta.\n({e})", TASTIERA_PRINCIPALE)

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
