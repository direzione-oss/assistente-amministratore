import os
import sys
import json
import traceback
from datetime import datetime
from typing import Dict, Any, Optional, List

try:
    import docx
except ImportError:
    docx = None

try:
    import config
except ImportError:
    from .. import config

from .telegram_api import (
    invia_messaggio,
    scarica_foto_telegram,
    invia_documento_telegram,
    imposta_comandi_bot
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

# =====================================================================
# TASTIERE MENU TELEGRAM ORDINATE E PROFESSIONALI
# =====================================================================

TASTIERA_PRINCIPALE = {
    "keyboard": [
        [{"text": "📋 Da Fare"}, {"text": "🔥 Scadenze & CPI"}],
        [{"text": "🏢 Cruscotto CRM"}, {"text": "📋 Sopralluogo & Foto"}],
        [{"text": "🛠️ Ticket & Guasti"}, {"text": "📅 Agenda & Promemoria"}],
        [{"text": "👩‍💼 Segreteria AI"}, {"text": "🔎 Cerca nel CRM"}],
        [{"text": "❓ Guida & Comandi"}]
    ],
    "resize_keyboard": True
}

TASTIERA_CRM = {
    "keyboard": [
        [{"text": "📋 Da Fare"}, {"text": "🔥 Scadenze & CPI"}],
        [{"text": "📊 Riepilogo Studio"}, {"text": "🏢 Elenco Condomini"}],
        [{"text": "👥 Rubrica Fornitori"}, {"text": "🏛️ Assemblee in Programma"}],
        [{"text": "🔙 Menu Principale"}]
    ],
    "resize_keyboard": True
}

TASTIERA_TICKETS = {
    "keyboard": [
        [{"text": "📋 Tutti i Ticket Aperti"}, {"text": "➕ Apri Nuovo Ticket"}],
        [{"text": "🛠️ Intervento da Campo"}, {"text": "🔙 Menu Principale"}]
    ],
    "resize_keyboard": True
}

TASTIERA_SCADENZE = {
    "keyboard": [
        [{"text": "⏳ Scadenze Imminenti"}, {"text": "➕ Nuova Scadenza"}],
        [{"text": "🔙 Menu Principale"}]
    ],
    "resize_keyboard": True
}

TASTIERA_SEGRETERIA = {
    "keyboard": [
        [{"text": "✉️ Bozza Risposta Email"}, {"text": "⚖️ Sollecito Morosi (Word)"}],
        [{"text": "📇 OCR Anagrafica da Foto"}, {"text": "🔙 Menu Principale"}]
    ],
    "resize_keyboard": True
}

TASTIERA_AGENDA = {
    "keyboard": [
        [{"text": "📅 Prenota Google Calendar"}, {"text": "📌 Invia Promemoria Staff"}],
        [{"text": "🔙 Menu Principale"}]
    ],
    "resize_keyboard": True
}

TASTIERA_ANNULLA = {
    "keyboard": [[{"text": "❌ Annulla"}]],
    "resize_keyboard": True
}

stato_utenti: Dict[str, Dict[str, Any]] = {}

def get_stato_default() -> Dict[str, Any]:
    return {
        "tipo": None,
        "condominio": None,
        "data": None,
        "foto": [],
        "appunti": "",
        "temp_data": {}
    }

def invia_scheda_condominio(chat_id: str, cond: Dict[str, Any]):
    nome = cond.get("nome", "Condominio")
    codice = cond.get("codice_danea") or f"ID-{cond.get('id')}"
    indirizzo = cond.get("indirizzo") or "Indirizzo non presente"
    citta = cond.get("citta") or "Bergamo"
    cap = cond.get("cap") or ""
    unita = cond.get("numero_unita", 0)
    esercizio = cond.get("esercizio_in_corso") or "2026"
    fondo = cond.get("fondo_cassa", 0.0)
    morosita = cond.get("totale_morosita", 0.0)
    iban = cond.get("iban") or "Non impostato"
    cf = cond.get("codice_fiscale") or "Non impostato"
    rend_stato = cond.get("rendiconto_stato", "in_corso")
    scad_rend = cond.get("scadenza_rendiconto") or "Non definita"

    tks = cond.get("tickets", [])
    scs = cond.get("scadenze", [])

    msg = (
        f"🏢 *{nome}* (`{codice}`)\n"
        f"📍 {indirizzo}, {cap} {citta}\n"
        f"────────────────────────\n"
        f"🔢 Unità Immobiliari: *{unita}*\n"
        f"📅 Esercizio: *{esercizio}*\n"
        f"💰 Fondo Cassa: *€ {fondo:,.2f}*\n"
        f"⚠️ Morosità Totale: *€ {morosita:,.2f}*\n"
        f"🏦 IBAN: `{iban}`\n"
        f"📑 Cod. Fiscale: `{cf}`\n"
        f"📋 Stato Rendiconto: *{rend_stato.upper()}* (Scad. {scad_rend})\n"
    )

    if tks:
        msg += "\n🛠️ *Ticket Aperti:*\n"
        for t in tks[:3]:
            msg += f"• `{t.get('codice_dettofatto', 'TK')}`: {t.get('titolo', '')} ({t.get('priorita', 'Media')})\n"
    else:
        msg += "\n🛠️ *Ticket Aperti:* Nessun guasto segnalato\n"

    if scs:
        msg += "\n🔥 *Scadenze & Task:*\n"
        for s in scs[:3]:
            msg += f"• {s.get('data_scadenza', '')}: {s.get('titolo', '')}\n"

    pulsanti = [
        [{"text": f"📋 Sopralluogo: {nome[:25]}"}],
        [{"text": f"🛠️ Guasto: {nome[:25]}"}],
        [{"text": "🔙 Menu Principale"}]
    ]
    invia_messaggio(chat_id, msg, {"keyboard": pulsanti, "resize_keyboard": True})

def invia_briefing_studio(chat_id: str):
    b = crm_service.ottieni_briefing_crm()
    if not b.get("success"):
        invia_messaggio(chat_id, "⚠️ Impossibile comunicare con il database del CRM.", TASTIERA_CRM)
        return

    msg = (
        "🏢 *STUDIO SERRA — GESTIONE CONDOMINIALE*\n"
        "_*Cruscotto Direzionale CRM*_\n"
        "────────────────────────\n"
        f"📊 *Condomini Attivi:* {b['totale_condomini']}\n"
        f"💰 *Fondo Cassa Complessivo:* € {b['fondo_cassa_totale']:,.2f}\n"
        f"⚠️ *Morosità Complessiva:* € {b['morosita_totale']:,.2f}\n"
        f"🛠️ *Ticket Manutenzione Aperti:* {b['tickets_aperti']} (su {b['tickets_totali']} totali)\n"
        f"🔥 *Scadenze & CPI Attivi:* {b['scadenze_attive']}\n"
        f"👥 *Fornitori Censiti:* {b['fornitori_totali']}\n"
        f"🏛️ *Assemblee Programmate:* {b['assemblee_programmate']}\n"
        "────────────────────────\n"
        "Usa i pulsanti sotto o digita il nome di un condominio per la scheda dettagliata:"
    )
    invia_messaggio(chat_id, msg, TASTIERA_CRM)

def invia_elenco_tickets(chat_id: str):
    tks = crm_service.elenca_ticket_crm(solo_aperti=True, limite=10)
    if not tks:
        invia_messaggio(chat_id, "✅ *Nessun ticket di manutenzione aperto.* Tutti gli impianti risultano regolari!", TASTIERA_TICKETS)
        return
    msg = f"🛠️ *TICKET DI MANUTENZIONE APERTI NEL CRM ({len(tks)} visualizzati)*\n────────────────────────\n"
    for idx, t in enumerate(tks, start=1):
        cond = t.get("condominio_nome") or "Generale"
        cod = t.get("codice_dettofatto") or f"TK-{t.get('id')}"
        prio = t.get("priorita") or "Media"
        stato = t.get("stato") or "Aperto"
        titolo = t.get("titolo") or "Senza titolo"
        msg += f"*{idx}.* `{cod}` | *{cond}*\n   📌 {titolo}\n   🚨 Priorità: _{prio}_ | Stato: *{stato}*\n\n"
    invia_messaggio(chat_id, msg, TASTIERA_TICKETS)

def invia_elenco_dafare(chat_id: str):
    dfs = crm_service.elenca_dafare_crm(limite=10)
    if not dfs:
        invia_messaggio(chat_id, "✅ *Nessun compito Da Fare aperto.* Tutti gli incarichi sono completati!", TASTIERA_PRINCIPALE)
        return
    msg = f"📋 *COMPITI DA FARE DELLO STUDIO ({len(dfs)} visualizzati)*\n────────────────────────\n"
    for idx, d in enumerate(dfs, start=1):
        cond = d.get("condominio_nome") or "Generale"
        prio = d.get("priorita") or "P2"
        prio_icon = "🔴" if prio == "P1" else "🟡"
        scad = d.get("data_scadenza") or "N.D."
        titolo = d.get("titolo") or "Compito"
        stato = d.get("stato") or "Nuova"
        forn = d.get("fornitore") or "Studio Serra"
        msg += f"*{idx}.* {prio_icon} `[{prio}]` *{cond}*\n   📌 {titolo}\n   📅 Scadenza/Piano: *{scad}* | Stato: _{stato}_\n   👤 Assegnato: _{forn}_\n\n"
    invia_messaggio(chat_id, msg, TASTIERA_PRINCIPALE)

def invia_elenco_scadenze(chat_id: str):
    scs = crm_service.elenca_scadenze_crm(solo_attive=True, limite=12)
    if not scs:
        invia_messaggio(chat_id, "✅ *Nessuna scadenza imminente.* Tutti gli adempimenti e CPI sono in regola!", TASTIERA_SCADENZE)
        return
    msg = f"🔥 *SCADENZARIO & RINNOVI CPI CRM ({len(scs)})*\n────────────────────────\n"
    for idx, s in enumerate(scs, start=1):
        cond = s.get("condominio_nome") or "Studio"
        titolo = s.get("titolo") or "Attività"
        tipo = s.get("tipo") or "CPI"
        dt = s.get("data_scadenza") or "N.D."
        giorni = s.get("giorni_rimasti")
        badge = f" (tra {giorni} gg)" if giorni is not None and giorni >= 0 else (f" (⚠️ SCADUTA da {abs(giorni)} gg)" if giorni is not None else "")
        forn = s.get("fornitore") or "Da assegnare"
        msg += f"*{idx}.* 📅 *{dt}*{badge} — *{tipo}*\n   🏢 *{cond}*\n   📌 {titolo}\n   🔧 Ditta/Tecnico: _{forn}_\n\n"
    invia_messaggio(chat_id, msg, TASTIERA_SCADENZE)

def invia_elenco_fornitori(chat_id: str, filtro: Optional[str] = None):
    fns = crm_service.elenca_fornitori_crm(filtro=filtro, limite=12)
    if not fns:
        invia_messaggio(chat_id, f"🔍 Nessun fornitore trovato per '{filtro or ''}'.", TASTIERA_CRM)
        return
    msg = "👥 *RUBRICA FORNITORI & MANUTENTORI CRM*\n────────────────────────\n"
    for idx, f in enumerate(fns, start=1):
        nome = f.get("ragione_sociale") or "Fornitore"
        cat = f.get("categoria") or "Generale"
        tel = f.get("telefono") or "N.D."
        email = f.get("email") or ""
        ref = f.get("referente") or ""
        msg += f"*{idx}. {nome}* ({cat})\n"
        if ref:
            msg += f"   👤 Ref: {ref}\n"
        msg += f"   📞 Tel: `{tel}`\n"
        if email:
            msg += f"   ✉️ Email: `{email}`\n"
        msg += "\n"
    invia_messaggio(chat_id, msg, TASTIERA_CRM)

def invia_elenco_assemblee(chat_id: str):
    ass = crm_service.elenca_assemblee_crm(limite=8)
    if not ass:
        invia_messaggio(chat_id, "🏛️ Nessuna assemblea straordinaria programmata a breve termine.", TASTIERA_CRM)
        return
    msg = f"🏛️ *ASSEMBLEE IN PROGRAMMA ({len(ass)})*\n────────────────────────\n"
    for idx, a in enumerate(ass, start=1):
        cond = a.get("condominio_nome") or "Condominio"
        titolo = a.get("titolo") or "Assemblea"
        dt = a.get("data_assemblea") or "Data da definire"
        ora = a.get("ora_assemblea") or ""
        luogo = a.get("luogo_sala") or "Presso Studio Serra"
        stato = a.get("stato") or "In organizzazione"
        msg += f"*{idx}. {cond}*\n   📋 {titolo}\n   📅 {dt} {ora}\n   📍 {luogo}\n   📌 Stato: _{stato}_\n\n"
    invia_messaggio(chat_id, msg, TASTIERA_CRM)


# =====================================================================
# GESTORE CENTRALE AGGIORNAMENTI TELEGRAM (POLLING + WEBHOOK)
# =====================================================================

def gestisci_update_telegram(item: dict) -> bool:
    """
    Gestisce un update Telegram (messaggio testuale, foto, vocale o comando)
    garantendo interazione bidirezionale nativa con il CRM Studio Serra.
    Ritorna True se gestito, False altrimenti.
    """
    try:
        msg = item.get("message") or item.get("edited_message")
        if not msg:
            return False

        chat_id = str(msg.get("chat", {}).get("id", ""))
        if not chat_id or chat_id not in config.ID_AUTORIZZATI:
            return False

        testo_msg = (msg.get("text", "") or msg.get("caption", "")).strip()
        has_photo = bool(msg.get("photo"))
        has_voice = bool(msg.get("voice") or msg.get("audio"))
        has_doc = bool(msg.get("document"))

        if chat_id not in stato_utenti:
            stato_utenti[chat_id] = get_stato_default()

        cartella_temp = os.path.join(config.BASE_DIR, "foto_telegram_temp")
        os.makedirs(cartella_temp, exist_ok=True)

        low = testo_msg.lower()

        # -------------------------------------------------------------
        # 1. RESET / MENU PRINCIPALE / ANNULLA
        # -------------------------------------------------------------
        if testo_msg in ["/start", "/menu", "❌ Annulla", "/annulla", "🔙 Menu Principale", "🤖 Menù S.E.R.R.A.", "menù s.e.r.r.a."]:
            stato_utenti[chat_id] = get_stato_default()
            b = crm_service.ottieni_briefing_crm()
            cond_count = b.get("totale_condomini", 79)
            tk_count = b.get("tickets_aperti", 0)
            sc_count = b.get("scadenze_attive", 0)

            benvenuto = (
                "🤖 *S.E.R.R.A. MOBILE & CRM FIELD ASSISTANT*\n"
                "_*Studio Serra — Amministrazione Condominiale*_\n"
                "────────────────────────\n"
                f"🏢 *{cond_count}* Condomini collegati nel CRM\n"
                f"🛠️ *{tk_count}* Ticket di manutenzione aperti\n"
                f"🔥 *{sc_count}* Scadenze/Task operativi attivi\n\n"
                "Seleziona un'operazione dal cruscotto o scrivi liberamente:"
            )
            invia_messaggio(chat_id, benvenuto, TASTIERA_PRINCIPALE)
            return True

        # -------------------------------------------------------------
        # 2. GUIDA & COMANDI
        # -------------------------------------------------------------
        if testo_msg in ["❓ Guida & Comandi", "/help", "/guida"]:
            guida = (
                "📖 *GUIDA OPERATIVA BOT ASSISTENTE STUDIO SERRA*\n"
                "────────────────────────\n"
                "🔹 *🏢 Cruscotto CRM*: Panoramica saldi, condomini, fornitori, assemblee.\n"
                "🔹 *📋 Sopralluogo & Foto*: Crea verbali con foto, sintesi tecnica IA, Word e PDF inviati in chat e archiviati nel CRM.\n"
                "🔹 *🛠️ Ticket & Guasti*: Consulta ticket aperti, creane di nuovi nel CRM o apri intervento rapido.\n"
                "🔹 *🔥 Scadenze & CPI*: Visualizza adempimenti e aggiungi scadenze.\n"
                "🔹 *👩‍💼 Segreteria AI*: Bozza email, solleciti morosi formali, OCR anagrafiche da foto.\n"
                "🔹 *📅 Agenda & Promemoria*: Appuntamenti Google Calendar e invio promemoria email/vocali allo staff (`operativo@serrastudio.it`).\n\n"
                "💡 *Comandi rapidi supportati:*\n"
                "`/crm` • `/condomini` • `/tickets` • `/scadenze` • `/fornitori` • `/assemblee` • `/sopralluogo` • `/intervento` • `/promemoria` • `/calendario` • `/annulla`\n\n"
                "🗣️ _Puoi anche parlare o scrivere in linguaggio naturale (es. 'Qual è il fondo cassa di Betulla?' oppure 'Chiama l'idraulico')!_"
            )
            invia_messaggio(chat_id, guida, TASTIERA_PRINCIPALE)
            return True

        # -------------------------------------------------------------
        # 3. NAVIGAZIONE CRUSCOTTO CRM
        # -------------------------------------------------------------
        if testo_msg in ["🏢 Cruscotto CRM", "/crm", "🏢 crm", "📊 Riepilogo Studio", "/stato"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_briefing_studio(chat_id)
            return True

        if testo_msg in ["🏢 Elenco Condomini", "/condomini", "/condominio"]:
            stato_utenti[chat_id] = get_stato_default()
            conds = crm_service.cerca_condomini("", limite=40)
            pulsanti = [[{"text": f"🏢 {c['nome'][:30]}"}] for c in conds]
            pulsanti.insert(0, [{"text": "🔙 Menu Principale"}])
            invia_messaggio(
                chat_id,
                f"🏢 *ELENCO CONDOMINI STUDIO SERRA ({len(conds)} mostrati)*\n\nSeleziona un condominio per visualizzarne la scheda tecnica, saldo cassa, morosità e ticket:",
                {"keyboard": pulsanti, "resize_keyboard": True}
            )
            stato_utenti[chat_id]["tipo"] = "attesa_scelta_condominio"
            return True

        if testo_msg in ["👥 Rubrica Fornitori", "/fornitori", "/fornitore"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_elenco_fornitori(chat_id)
            return True

        if testo_msg in ["🏛️ Assemblee in Programma", "🏛️ Assemblee", "/assemblee"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_elenco_assemblee(chat_id)
            return True

        # -------------------------------------------------------------
        # 4. GESTIONE TICKET CRM
        # -------------------------------------------------------------
        if testo_msg in ["🛠️ Ticket & Guasti", "/tickets", "/ticket", "/guasti"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_elenco_tickets(chat_id)
            return True

        if testo_msg in ["📋 Tutti i Ticket Aperti"]:
            invia_elenco_tickets(chat_id)
            return True

        if testo_msg in ["➕ Apri Nuovo Ticket", "/nuovoticket"]:
            stato_utenti[chat_id] = get_stato_default()
            stato_utenti[chat_id]["tipo"] = "ticket_condo"
            conds = [c.get("name", "")[:35].strip() for c in df.condomini_in_memoria][:50]
            pulsanti = [[{"text": n}] for n in conds]
            pulsanti.insert(0, [{"text": "❌ Annulla"}])
            invia_messaggio(
                chat_id,
                "🛠️ *NUOVO TICKET NEL CRM — STEP 1 di 3*\n\nSeleziona il Condominio associato al guasto:",
                {"keyboard": pulsanti, "resize_keyboard": True}
            )
            return True

        # -------------------------------------------------------------
        # 4b. GESTIONE DA FARE & PRATICHE CRM
        # -------------------------------------------------------------
        if testo_msg in ["📋 Da Fare", "/dafare", "/compiti", "/pratiche", "da fare", "dafare"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_elenco_dafare(chat_id)
            return True

        # -------------------------------------------------------------
        # 5. GESTIONE SCADENZE & CPI CRM
        # -------------------------------------------------------------
        if testo_msg in ["🔥 Scadenze & CPI", "/scadenze", "/cpi"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_elenco_scadenze(chat_id)
            return True

        if testo_msg in ["⏳ Scadenze Imminenti"]:
            invia_elenco_scadenze(chat_id)
            return True

        if testo_msg in ["➕ Nuova Scadenza", "/nuovascadenza"]:
            stato_utenti[chat_id] = get_stato_default()
            stato_utenti[chat_id]["tipo"] = "scadenza_condo"
            conds = [c.get("name", "")[:35].strip() for c in df.condomini_in_memoria][:50]
            pulsanti = [[{"text": n}] for n in conds]
            pulsanti.insert(0, [{"text": "❌ Annulla"}])
            invia_messaggio(
                chat_id,
                "🔥 *NUOVA SCADENZA CRM — STEP 1 di 3*\n\nSeleziona il Condominio per la scadenza/task:",
                {"keyboard": pulsanti, "resize_keyboard": True}
            )
            return True

        # -------------------------------------------------------------
        # 6. SEGRETERIA AI
        # -------------------------------------------------------------
        if testo_msg in ["👩‍💼 Segreteria AI", "👩💼 4. Segreteria", "👩‍💼 4. Segreteria", "/segreteria"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_messaggio(
                chat_id,
                "👩‍💼 *AGENTE SEGRETERIA STUDIO SERRA*\n────────────────────────\n"
                "Scegli cosa desideri generare oppure invia direttamente la foto di un modulo cartaceo / scrivi la richiesta:",
                TASTIERA_SEGRETERIA
            )
            return True

        if testo_msg in ["✉️ Bozza Risposta Email", "⚖️ Sollecito Morosi (Word)", "📇 OCR Anagrafica da Foto"]:
            stato_utenti[chat_id]["tipo"] = "segreteria_azione"
            stato_utenti[chat_id]["temp_data"]["azione_segreteria"] = testo_msg
            if "Sollecito" in testo_msg:
                invia_messaggio(chat_id, "⚖️ *SOLLECITO MOROSI*\n\nIndica il nome del condomino moroso, il condominio e l'importo dovuto:", TASTIERA_ANNULLA)
            elif "OCR" in testo_msg:
                invia_messaggio(chat_id, "📇 *OCR ANAGRAFICA*\n\nInvia ora la **FOTO** del modulo anagrafico o foglio da trascrivere:", TASTIERA_ANNULLA)
            else:
                invia_messaggio(chat_id, "✉️ *BOZZA EMAIL*\n\nDescrivi la situazione o incolla il messaggio a cui rispondere:", TASTIERA_ANNULLA)
            return True

        # -------------------------------------------------------------
        # 7. AGENDA & PROMEMORIA
        # -------------------------------------------------------------
        if testo_msg in ["📅 Agenda & Promemoria", "📅 6. Calendario", "/agenda"]:
            stato_utenti[chat_id] = get_stato_default()
            invia_messaggio(
                chat_id,
                "📅 *AGENDA & PROMEMORIA STUDIO SERRA*\n────────────────────────\n"
                "• *Google Calendar*: prenota appuntamenti e sopralluoghi sincronizzati.\n"
                "• *Promemoria Staff*: invia una nota/vocale via email a `operativo@serrastudio.it`.",
                TASTIERA_AGENDA
            )
            return True

        if testo_msg in ["📅 Prenota Google Calendar", "/calendario"]:
            stato_utenti[chat_id] = get_stato_default()
            stato_utenti[chat_id]["tipo"] = "cal_titolo"
            invia_messaggio(chat_id, "📅 *GOOGLE CALENDAR — STEP 1 di 3*\n\nTitolo dell'appuntamento (es. _Sopralluogo Betulla per ascensore_):", TASTIERA_ANNULLA)
            return True

        if testo_msg in ["📌 Invia Promemoria Staff", "📌 5. Promemoria", "/promemoria"]:
            stato_utenti[chat_id] = get_stato_default()
            stato_utenti[chat_id]["tipo"] = "promemoria_oggetto"
            invia_messaggio(chat_id, "📌 *PROMEMORIA STAFF — STEP 1 di 2*\n\nScrivi l'**Oggetto** dell'email allo staff:", TASTIERA_ANNULLA)
            return True

        # -------------------------------------------------------------
        # 8. CERCA NEL CRM
        # -------------------------------------------------------------
        if testo_msg in ["🔎 Cerca nel CRM", "🔎 3. Ricerca", "/ricerca", "/cerca"]:
            stato_utenti[chat_id] = get_stato_default()
            stato_utenti[chat_id]["tipo"] = "cerca_crm"
            invia_messaggio(chat_id, "🔎 *RICERCA NEL CRM E ARCHIVIO*\n\nDigita il nome di un **condominio**, un **fornitore** o una parola chiave:", TASTIERA_ANNULLA)
            return True

        # -------------------------------------------------------------
        # 9. AVVIO SOPRALLUOGO / INTERVENTO DA CAMPO
        # -------------------------------------------------------------
        if testo_msg.startswith("📋 Sopralluogo: ") or testo_msg.startswith("🛠️ Guasto: "):
            nome_cond = testo_msg.split(": ", 1)[1].strip()
            tipo_rilievo = "sopralluogo" if testo_msg.startswith("📋") else "intervento"
            stato_utenti[chat_id] = {
                "tipo": tipo_rilievo,
                "condominio": nome_cond,
                "data": datetime.now().strftime("%d/%m/%Y"),
                "foto": [],
                "appunti": "",
                "temp_data": {}
            }
            invia_messaggio(
                chat_id,
                f"✅ Avvio *{tipo_rilievo.upper()}* su *{nome_cond}*!\nData: *{datetime.now().strftime('%d/%m/%Y')}*\n\n"
                "📸 Invia ora **foto** (con eventuale didascalia) e **note testuali/vocali**.\nQuando hai terminato, premi:",
                {"keyboard": [[{"text": "✅ CHIUDI E GENERA DOC"}], [{"text": "❌ Annulla"}]], "resize_keyboard": True}
            )
            return True

        if testo_msg in ["📋 Sopralluogo & Foto", "📋 1. Sopralluogo", "🛠️ Intervento da Campo", "🛠️ 2. Intervento", "/sopralluogo", "/intervento"]:
            tipo_rilievo = "intervento" if ("intervento" in low or "guasto" in low) else "sopralluogo"
            stato_utenti[chat_id] = {
                "tipo": tipo_rilievo,
                "condominio": None,
                "data": None,
                "foto": [],
                "appunti": "",
                "temp_data": {}
            }
            nomi_condomini = [c.get("name", "")[:35].strip() for c in df.condomini_in_memoria][:60]
            pulsanti = [[{"text": n}] for n in nomi_condomini]
            pulsanti.insert(0, [{"text": "❌ Annulla"}])
            invia_messaggio(
                chat_id,
                f"⚙️ *MODULO {tipo_rilievo.upper()} DA CAMPO*\n\nSeleziona il Condominio oggetto del sopralluogo:",
                {"keyboard": pulsanti, "resize_keyboard": True}
            )
            return True

        # -------------------------------------------------------------
        # 10. CHIUSURA REPORT SOPRALLUOGO / INTERVENTO
        # -------------------------------------------------------------
        if testo_msg == "✅ CHIUDI E GENERA DOC":
            cond = stato_utenti[chat_id].get("condominio") or "Condominio Studio Serra"
            data = stato_utenti[chat_id].get("data") or datetime.now().strftime("%d/%m/%Y")
            tipo = stato_utenti[chat_id].get("tipo", "sopralluogo")
            if tipo not in ["sopralluogo", "intervento"]:
                tipo = "sopralluogo"

            invia_messaggio(chat_id, "⏳ _Elaborazione report tecnico con IA e generazione documenti in corso..._", {"remove_keyboard": True})

            appunti = stato_utenti[chat_id].get("appunti", "")
            foto_paths = stato_utenti[chat_id].get("foto", [])
            testo_completo = appunti
            for f in foto_paths:
                if f.get("caption"):
                    testo_completo += f" {f['caption']}"

            t_ia = genera_testo_ia(cond, testo_completo, data, tipo=tipo)
            p_doc, p_pdf = crea_word_e_pdf(cond, t_ia, foto_paths, data, appunti, tipo=tipo)

            # Invia verbale su Telegram
            if p_pdf and os.path.exists(p_pdf):
                invia_documento_telegram(chat_id, p_pdf, f"📄 Verbale {tipo.capitalize()} PDF - {cond}")
            elif p_doc and os.path.exists(p_doc):
                invia_documento_telegram(chat_id, p_doc, f"📄 Verbale {tipo.capitalize()} Word - {cond}")

            # Se è intervento, registra il ticket nel CRM e sincronizza
            tk_creato = None
            if tipo == "intervento":
                tk_creato = crm_service.crea_ticket_crm(
                    cond,
                    titolo=f"Intervento Campo: {cond}",
                    descrizione=f"{t_ia}\n\nReport generato: {os.path.basename(p_doc) if p_doc else ''}",
                    priorita="Alta",
                    segnalante="S.E.R.R.A. Mobile"
                )
                df.apri_ticket_dettofatto(cond, t_ia, p_doc, data)

            msg_fine = f"✅ *REPORT {tipo.upper()} COMPLETATO E ARCHIVIATO NEL CRM!*\n\n*Condominio:* {cond}\n*Data:* {data}\n"
            if tk_creato:
                msg_fine += f"🛠️ *Nuovo Ticket CRM:* `{tk_creato.get('codice')}` (Stato: Aperto)\n"
            msg_fine += f"\n_Sintesi Tecnica:_\n{t_ia}\n\n📁 I file DOCX e PDF sono consultabili subito nella sezione *Rilievi & Sopralluoghi* del CRM."

            stato_utenti[chat_id] = get_stato_default()
            invia_messaggio(chat_id, msg_fine, TASTIERA_PRINCIPALE)
            return True

        # =============================================================
        # MACCHINA A STATI
        # =============================================================
        tipo_attuale = stato_utenti[chat_id].get("tipo")

        # -------------------------------------------------------------
        # S1. Flusso Sopralluogo / Intervento
        # -------------------------------------------------------------
        if tipo_attuale in ["sopralluogo", "intervento"]:
            cond_attuale = stato_utenti[chat_id].get("condominio")
            data_attuale = stato_utenti[chat_id].get("data")

            if cond_attuale is None:
                stato_utenti[chat_id]["condominio"] = testo_msg.replace("🏢 ", "").strip()
                invia_messaggio(
                    chat_id,
                    f"✅ Condominio: *{stato_utenti[chat_id]['condominio']}*\n\nSeleziona la data del rilievo:",
                    {"keyboard": [[{"text": "📅 Usa data di oggi"}], [{"text": "❌ Annulla"}]], "resize_keyboard": True}
                )
                return True
            elif data_attuale is None:
                stato_utenti[chat_id]["data"] = datetime.now().strftime("%d/%m/%Y") if testo_msg == "📅 Usa data di oggi" else testo_msg
                invia_messaggio(
                    chat_id,
                    f"✅ Data: *{stato_utenti[chat_id]['data']}*\n\n"
                    "📸 Invia ora le **foto** (puoi allegare didascalie) e scrivi **note/appunti**.\n"
                    "Quando hai terminato, premi il pulsante verde:",
                    {"keyboard": [[{"text": "✅ CHIUDI E GENERA DOC"}], [{"text": "❌ Annulla"}]], "resize_keyboard": True}
                )
                return True
            else:
                didascalia = testo_msg if testo_msg != "✅ CHIUDI E GENERA DOC" else ""
                if has_photo:
                    path = scarica_foto_telegram(msg["photo"][-1]["file_id"], cartella_temp)
                    if path:
                        stato_utenti[chat_id]["foto"].append({"path": path, "caption": didascalia})
                        n_tot = len(stato_utenti[chat_id]["foto"])
                        invia_messaggio(chat_id, f"📸 Foto {n_tot} acquisita e aggiunta al report.")
                elif didascalia:
                    stato_utenti[chat_id]["appunti"] += f"\n- {didascalia}"
                    invia_messaggio(chat_id, "📝 Nota salvata per il verbale.")
                return True

        # -------------------------------------------------------------
        # S2. Flusso Ricerca CRM
        # -------------------------------------------------------------
        if tipo_attuale == "cerca_crm":
            invia_messaggio(chat_id, f"🔎 _Ricerca in corso per '{testo_msg}'..._", {"remove_keyboard": True})
            # 1. Cerca nei condomini
            conds = crm_service.cerca_condomini(testo_msg, limite=3)
            # 2. Cerca nei fornitori
            fns = crm_service.elenca_fornitori_crm(filtro=testo_msg, limite=3)

            trovato = False
            if conds:
                trovato = True
                for c in conds:
                    invia_scheda_condominio(chat_id, crm_service.ottieni_dettaglio_condominio(c["id"]) or c)

            if fns:
                trovato = True
                invia_elenco_fornitori(chat_id, filtro=testo_msg)

            if not trovato:
                # Prova ricerca fascicoli IA
                risp_ia = ricerca_mirata_ia("CARTELLA GENERICA", testo_msg)
                invia_messaggio(chat_id, f"📚 *RISULTATO ARCHIVIO FASCICOLI:*\n\n{risp_ia}", TASTIERA_PRINCIPALE)

            stato_utenti[chat_id] = get_stato_default()
            return True

        # -------------------------------------------------------------
        # S3. Flusso Creazione Nuovo Ticket CRM
        # -------------------------------------------------------------
        if tipo_attuale == "ticket_condo":
            stato_utenti[chat_id]["temp_data"]["condominio"] = testo_msg
            stato_utenti[chat_id]["tipo"] = "ticket_titolo"
            invia_messaggio(
                chat_id,
                f"✅ Condominio: *{testo_msg}*\n\n**STEP 2 di 3:** Scrivi l'oggetto o titolo del guasto (es. _Infiltrazione vano scale_):",
                TASTIERA_ANNULLA
            )
            return True

        if tipo_attuale == "ticket_titolo":
            stato_utenti[chat_id]["temp_data"]["titolo"] = testo_msg
            stato_utenti[chat_id]["tipo"] = "ticket_priorita"
            tast_prio = {
                "keyboard": [
                    [{"text": "🚨 Urgente"}, {"text": "🟠 Alta"}],
                    [{"text": "🟡 Media"}, {"text": "🟢 Bassa"}],
                    [{"text": "❌ Annulla"}]
                ],
                "resize_keyboard": True
            }
            invia_messaggio(
                chat_id,
                f"✅ Titolo: *{testo_msg}*\n\n**STEP 3 di 3:** Seleziona la priorità del ticket:",
                tast_prio
            )
            return True

        if tipo_attuale == "ticket_priorita":
            prio = testo_msg.replace("🚨 ", "").replace("🟠 ", "").replace("🟡 ", "").replace("🟢 ", "").strip()
            cond_scelto = stato_utenti[chat_id]["temp_data"].get("condominio", "Generale")
            titolo_tk = stato_utenti[chat_id]["temp_data"].get("titolo", "Guasto")

            res_tk = crm_service.crea_ticket_crm(
                cond_scelto,
                titolo=titolo_tk,
                descrizione=f"Ticket inserito tramite Bot Telegram. Priorità: {prio}",
                priorita=prio,
                segnalante="Bot Telegram Studio Serra"
            )

            stato_utenti[chat_id] = get_stato_default()
            if res_tk:
                msg_ok = (
                    "🎉 *TICKET REGISTRATO CON SUCCESSO NEL CRM!*\n"
                    "────────────────────────\n"
                    f"🛠️ *Codice:* `{res_tk['codice']}`\n"
                    f"🏢 *Condominio:* {res_tk['condominio']}\n"
                    f"📌 *Titolo:* {res_tk['titolo']}\n"
                    f"🚨 *Priorità:* {res_tk['priorita']} | *Stato:* Aperto\n\n"
                    "Il ticket è subito visibile nella dashboard e gestione interventi dello Studio."
                )
                invia_messaggio(chat_id, msg_ok, TASTIERA_TICKETS)
            else:
                invia_messaggio(chat_id, "⚠️ Errore nel salvataggio del ticket nel database CRM.", TASTIERA_TICKETS)
            return True

        # -------------------------------------------------------------
        # S4. Flusso Creazione Nuova Scadenza CRM
        # -------------------------------------------------------------
        if tipo_attuale == "scadenza_condo":
            stato_utenti[chat_id]["temp_data"]["condominio"] = testo_msg
            stato_utenti[chat_id]["tipo"] = "scadenza_titolo"
            invia_messaggio(
                chat_id,
                f"✅ Condominio: *{testo_msg}*\n\n**STEP 2 di 3:** Scrivi il titolo dell'adempimento (es. _Rinnovo CPI Centrale Termica_):",
                TASTIERA_ANNULLA
            )
            return True

        if tipo_attuale == "scadenza_titolo":
            stato_utenti[chat_id]["temp_data"]["titolo"] = testo_msg
            stato_utenti[chat_id]["tipo"] = "scadenza_data"
            invia_messaggio(
                chat_id,
                f"✅ Titolo: *{testo_msg}*\n\n**STEP 3 di 3:** Inserisci la data di scadenza (`GG/MM/AAAA` o `AAAA-MM-GG`):",
                TASTIERA_ANNULLA
            )
            return True

        if tipo_attuale == "scadenza_data":
            dt_scad = testo_msg.strip()
            cond_scelto = stato_utenti[chat_id]["temp_data"].get("condominio", "Generale")
            titolo_scad = stato_utenti[chat_id]["temp_data"].get("titolo", "Scadenza")

            res_sc = crm_service.crea_scadenza_crm(
                cond_scelto,
                titolo=titolo_scad,
                data_scadenza=dt_scad,
                tipo="Manutenzione",
                priorita="Media"
            )

            stato_utenti[chat_id] = get_stato_default()
            if res_sc:
                invia_messaggio(
                    chat_id,
                    f"🔥 *SCADENZA REGISTRATA NEL CRM!*\n\n🏢 Condominio: *{cond_scelto}*\n📝 Titolo: *{titolo_scad}*\n📅 Data: *{dt_scad}*",
                    TASTIERA_SCADENZE
                )
            else:
                invia_messaggio(chat_id, "⚠️ Impossibile registrare la scadenza.", TASTIERA_SCADENZE)
            return True

        # -------------------------------------------------------------
        # S5. Flusso Segreteria AI
        # -------------------------------------------------------------
        if tipo_attuale == "segreteria_azione":
            invia_messaggio(chat_id, "👩‍💼 _Elaborazione con Segreteria AI in corso..._", {"remove_keyboard": True})
            foto_path = scarica_foto_telegram(msg["photo"][-1]["file_id"], cartella_temp) if has_photo else None
            dati_agente_str = esegui_agente_segretario(testo_msg, foto_path)
            try:
                dati_agente = json.loads(dati_agente_str)
                az = dati_agente.get("azione")
                if az == "email":
                    invia_messaggio(chat_id, f"📧 *BOZZA RISPOSTA EMAIL*\n**Oggetto:** {dati_agente.get('oggetto')}\n\n{dati_agente.get('testo')}", TASTIERA_SEGRETERIA)
                elif az == "anagrafica":
                    invia_messaggio(chat_id, f"📇 *DATI ANAGRAFICI ESTRATTI (OCR)*\n\n{dati_agente.get('testo')}", TASTIERA_SEGRETERIA)
                elif az == "sollecito":
                    dest = dati_agente.get("destinatario", "Condomino Moroso")
                    testo_soll = dati_agente.get("testo", "")
                    if docx:
                        doc = docx.Document()
                        doc.add_heading("STUDIO SERRA — AMMINISTRAZIONE CONDOMINIALE", level=1)
                        doc.add_paragraph(f"Spett.le {dest},\nData: {datetime.now().strftime('%d/%m/%Y')}\n")
                        doc.add_heading("OGGETTO: Sollecito Pagamento Quote Condominiali", level=2)
                        doc.add_paragraph(testo_soll)
                        cartella_soll = getattr(config, "CARTELLA_SOLLECITI", os.path.join(config.CARTELLA_IA, "Solleciti"))
                        os.makedirs(cartella_soll, exist_ok=True)
                        doc_path = os.path.join(cartella_soll, f"Sollecito_{dest.replace(' ', '_')}.docx")
                        doc.save(doc_path)
                    invia_messaggio(chat_id, f"⚖️ *SOLLECITO SALVATO NEL CRM!*\n\nDestinatario: *{dest}*\n\n_{testo_soll}_", TASTIERA_SEGRETERIA)
                else:
                    invia_messaggio(chat_id, f"👩‍💼 *Risposta:*\n\n{dati_agente.get('testo', dati_agente_str)}", TASTIERA_SEGRETERIA)
            except Exception:
                invia_messaggio(chat_id, f"👩‍💼 *Risposta Segreteria:*\n\n{dati_agente_str}", TASTIERA_SEGRETERIA)
            stato_utenti[chat_id] = get_stato_default()
            return True

        # -------------------------------------------------------------
        # S6. Flusso Promemoria Staff
        # -------------------------------------------------------------
        if tipo_attuale == "promemoria_oggetto":
            stato_utenti[chat_id]["appunti"] = testo_msg
            stato_utenti[chat_id]["tipo"] = "promemoria_corpo"
            invia_messaggio(chat_id, f"✅ **Oggetto:** {testo_msg}\n\n**STEP 2 di 2:** Scrivi il messaggio o **invia una nota vocale**:")
            return True

        if tipo_attuale == "promemoria_corpo":
            invia_messaggio(chat_id, "⏳ _Invio promemoria allo staff operativo..._", {"remove_keyboard": True})
            oggetto_mail = stato_utenti[chat_id].get("appunti", "📌 S.E.R.R.A. - PROMEMORIA")
            file_id_audio = msg["audio"]["file_id"] if "audio" in msg else (msg["voice"]["file_id"] if "voice" in msg else None)
            if file_id_audio:
                path_audio = scarica_foto_telegram(file_id_audio, cartella_temp)
                testo_finale_mail = trascrivi_audio_con_whisper(path_audio) if path_audio else ""
            else:
                testo_finale_mail = testo_msg

            if testo_finale_mail.strip() and "⚠️ Errore" not in testo_finale_mail:
                if invia_email_promemoria(testo_finale_mail, oggetto_mail):
                    invia_messaggio(chat_id, f"🚀 *EMAIL INVIATA ALLO STAFF!*\n**Oggetto:** {oggetto_mail}\n**Testo:** _{testo_finale_mail}_", TASTIERA_AGENDA)
                else:
                    invia_messaggio(chat_id, "⚠️ Errore durante l'invio via SMTP.", TASTIERA_AGENDA)
            else:
                invia_messaggio(chat_id, "⚠️ Impossibile ricavare un testo valido.", TASTIERA_AGENDA)
            stato_utenti[chat_id] = get_stato_default()
            return True

        # -------------------------------------------------------------
        # S7. Flusso Calendario
        # -------------------------------------------------------------
        if tipo_attuale == "cal_titolo":
            stato_utenti[chat_id]["appunti"] = testo_msg
            stato_utenti[chat_id]["tipo"] = "cal_data"
            invia_messaggio(chat_id, f"✅ **Titolo:** {testo_msg}\n\n**STEP 2:** Inserisci data e ora (`GG/MM/AAAA HH:MM`):")
            return True

        if tipo_attuale == "cal_data":
            try:
                datetime.strptime(testo_msg, "%d/%m/%Y %H:%M")
                stato_utenti[chat_id]["data"] = testo_msg
                stato_utenti[chat_id]["tipo"] = "cal_durata"
                tast_durata = {
                    "keyboard": [[{"text": "30"}, {"text": "60"}], [{"text": "90"}, {"text": "120"}], [{"text": "❌ Annulla"}]],
                    "resize_keyboard": True
                }
                invia_messaggio(chat_id, f"✅ **Data/Ora:** {testo_msg}\n\n**STEP 3:** Durata appuntamento in minuti:", tast_durata)
            except ValueError:
                invia_messaggio(chat_id, "⚠️ Formato non valido. Usa `GG/MM/AAAA HH:MM` (es. `21/11/2026 15:30`):")
            return True

        if tipo_attuale == "cal_durata":
            if not testo_msg.isdigit():
                invia_messaggio(chat_id, "⚠️ Inserisci solo i minuti (es. 60):")
                return True
            invia_messaggio(chat_id, "⏳ _Verifica disponibilità su Google Calendar..._", {"remove_keyboard": True})
            _, msg_risposta = verifica_e_prenota_appuntamento(
                stato_utenti[chat_id]["appunti"],
                stato_utenti[chat_id]["data"],
                int(testo_msg)
            )
            invia_messaggio(chat_id, msg_risposta, TASTIERA_AGENDA)
            stato_utenti[chat_id] = get_stato_default()
            return True

        # -------------------------------------------------------------
        # S8. Selezione diretta da elenco condomini
        # -------------------------------------------------------------
        if tipo_attuale == "attesa_scelta_condominio" or testo_msg.startswith("🏢 "):
            nome_pulito = testo_msg.replace("🏢 ", "").strip()
            cond_info = crm_service.ottieni_dettaglio_condominio(nome_pulito)
            if cond_info:
                invia_scheda_condominio(chat_id, cond_info)
                stato_utenti[chat_id] = get_stato_default()
                return True

        # -------------------------------------------------------------
        # S9. Foto o Vocale inviati fuori sessione
        # -------------------------------------------------------------
        if has_photo:
            path = scarica_foto_telegram(msg["photo"][-1]["file_id"], cartella_temp)
            stato_utenti[chat_id] = {
                "tipo": "sopralluogo",
                "condominio": None,
                "data": datetime.now().strftime("%d/%m/%Y"),
                "foto": [{"path": path, "caption": testo_msg}] if path else [],
                "appunti": testo_msg if not path else "",
                "temp_data": {}
            }
            nomi = [c.get("name", "")[:35].strip() for c in df.condomini_in_memoria][:50]
            pulsanti = [[{"text": n}] for n in nomi]
            pulsanti.insert(0, [{"text": "❌ Annulla"}])
            invia_messaggio(
                chat_id,
                "📸 *FOTO RICEVUTA!*\nAvvio acquisizione **Sopralluogo Tecnico** (Foto 1 salvata).\n\nSeleziona il Condominio associato:",
                {"keyboard": pulsanti, "resize_keyboard": True}
            )
            return True

        if has_voice:
            file_id_audio = msg["audio"]["file_id"] if "audio" in msg else (msg["voice"]["file_id"] if "voice" in msg else None)
            if file_id_audio:
                path_audio = scarica_foto_telegram(file_id_audio, cartella_temp)
                trascritto = trascrivi_audio_con_whisper(path_audio) if path_audio else ""
                if trascritto and "⚠️ Errore" not in trascritto:
                    testo_msg = trascritto
                    invia_messaggio(chat_id, f"🎙️ _Vocale trascritto:_ \"{testo_msg}\"")
                else:
                    invia_messaggio(chat_id, "⚠️ Impossibile trascrivere il messaggio vocale.")
                    return True

        # -------------------------------------------------------------
        # S10. Linguaggio Naturale & Master Agent integrato con il CRM
        # -------------------------------------------------------------
        if testo_msg:
            # Controllo immediato per match esatto o quasi su nome condominio
            c_match = crm_service.cerca_condomini(testo_msg, limite=1)
            if c_match and c_match[0]["nome"].lower() == testo_msg.lower():
                invia_scheda_condominio(chat_id, crm_service.ottieni_dettaglio_condominio(c_match[0]["id"]) or c_match[0])
                return True

            invia_messaggio(chat_id, "🤖 _Consultazione CRM e Assistente IA..._", {"remove_keyboard": True})
            risp_raw = esegui_master_agent(testo_msg)
            try:
                dati = json.loads(risp_raw)
                azione = dati.get("azione")
                p = dati.get("parametri", {})

                if azione == "crm_briefing":
                    invia_briefing_studio(chat_id)
                    return True
                elif azione == "crm_condominio":
                    nome_c = p.get("condominio", testo_msg)
                    c_info = crm_service.ottieni_dettaglio_condominio(nome_c)
                    if c_info:
                        invia_scheda_condominio(chat_id, c_info)
                    else:
                        invia_messaggio(chat_id, f"🔍 Condominio '{nome_c}' non trovato nel database.", TASTIERA_PRINCIPALE)
                    return True
                elif azione == "crm_ticket":
                    invia_elenco_tickets(chat_id)
                    return True
                elif azione == "crm_scadenze":
                    invia_elenco_scadenze(chat_id)
                    return True
                elif azione == "crm_fornitore":
                    invia_elenco_fornitori(chat_id, filtro=p.get("categoria") or p.get("nome"))
                    return True
                elif azione == "calendario":
                    _, msg_cal = verifica_e_prenota_appuntamento(p.get("titolo"), p.get("data_ora"), p.get("durata_minuti", 60))
                    invia_messaggio(chat_id, msg_cal, TASTIERA_AGENDA)
                    return True
                elif azione == "promemoria":
                    if invia_email_promemoria(p.get("testo"), p.get("oggetto")):
                        invia_messaggio(chat_id, f"🚀 *EMAIL INVIATA ALLO STAFF!*\nOggetto: {p.get('oggetto')}", TASTIERA_AGENDA)
                    else:
                        invia_messaggio(chat_id, "⚠️ Errore invio email.", TASTIERA_AGENDA)
                    return True
                elif azione == "ricerca":
                    r_ia = ricerca_mirata_ia(p.get("condominio", "CARTELLA GENERICA"), p.get("domanda", testo_msg))
                    invia_messaggio(chat_id, f"📚 *RISULTATO FASCICOLO:*\n\n{r_ia}", TASTIERA_PRINCIPALE)
                    return True
                else:
                    risp_chat = p.get("risposta") or risp_raw
                    invia_messaggio(chat_id, f"🤖 {risp_chat}", TASTIERA_PRINCIPALE)
                    return True
            except Exception:
                invia_messaggio(chat_id, f"🤖 {risp_raw}", TASTIERA_PRINCIPALE)
                return True

        return False
    except Exception as exc:
        print(f"⚠️ Errore in gestisci_update_telegram: {exc}")
        traceback.print_exc()
        return False
