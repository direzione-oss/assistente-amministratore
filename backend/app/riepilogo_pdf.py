import os
import re
from datetime import datetime
from typing import Any, Dict, List
from fpdf import FPDF


def _clean_text(text: Any) -> str:
    if text is None:
        return ""
    s = str(text)
    replacements = {
        "🎯": "[100%] ",
        "🏛️": "[Post-Assemblea] ",
        "🏛": "[Post-Assemblea] ",
        "✓": "[OK]",
        "✔": "[OK]",
        "✗": "[NO]",
        "⚠️": "[!] ",
        "⚠": "[!] ",
        "•": "-",
        "→": "->",
        "←": "<-",
        "↔": "<->",
        "—": "-",
        "–": "-",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "…": "...",
        "\u00a0": " ",
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    # Rimuovi emoji residui fuori dal BMP per evitare problemi con font standard
    s = re.sub(r"[\U00010000-\U0010ffff]", "", s)
    return s.strip()


def _extract_step_extra_summary(passo: Dict[str, Any], docs_allegati: List[Dict[str, Any]]) -> List[str]:
    """Estrae in formato leggibile tutti i campi compilati di un singolo passo."""
    cod = str(passo.get("numero_codice") or "").strip()
    extra: Dict[str, Any] = passo.get("campi_extra") or {}
    if not isinstance(extra, dict):
        return []

    lines: List[str] = []

    # Passo 6: Assemblee straordinarie
    if cod == "6":
        idx_set = {1}
        for k in extra.keys():
            m1 = re.match(r"^Data assemblea straord\.(?:\s+(\d+))?$", k)
            if m1:
                idx_set.add(int(m1.group(1)) if m1.group(1) else 1)
            m2 = re.match(r"^Oggetto(?:\s+(\d+))?$", k)
            if m2:
                idx_set.add(int(m2.group(1)) if m2.group(1) else 1)
        for pos, idx in enumerate(sorted(idx_set), start=1):
            d_key = "Data assemblea straord." if idx == 1 else f"Data assemblea straord. {idx}"
            o_key = "Oggetto" if idx == 1 else f"Oggetto {idx}"
            d_val = _clean_text(extra.get(d_key, ""))
            o_val = _clean_text(extra.get(o_key, ""))
            if d_val or o_val:
                lines.append(f"Assemblea Straord. #{pos}: Data {d_val or '-'} | Oggetto: {o_val or '-'}")
        return lines

    # Passo 8: Gestione inquilini
    if cod == "8":
        u_val = _clean_text(extra.get("N. unità con gestione inquilino", ""))
        q_val = _clean_text(extra.get("Quota gestione per unità (€)", "35"))
        c_val = _clean_text(extra.get("Compenso Gestione Inquilini (€)", ""))
        if u_val or c_val:
            lines.append(
                f"Unita con gestione inquilino: {u_val or '0'} | Quota unitaria: EUR {q_val or '35'} | Compenso Fattura: EUR {c_val or '0,00'}"
            )
        return lines

    # Passo 24: Spese personali / ricorrenti
    if cod == "24":
        idx_set = set()
        for k in extra.keys():
            m1 = re.match(r"^Voce spesa personale(?:\s+(\d+))?$", k)
            if m1:
                idx_set.add(int(m1.group(1)) if m1.group(1) else 1)
        for pos, idx in enumerate(sorted(idx_set), start=1):
            v_key = (
                "Voce spesa personale"
                if idx == 1 and "Voce spesa personale" in extra and "Voce spesa personale 1" not in extra
                else f"Voce spesa personale {idx}"
            )
            d_key = (
                "Eseguito"
                if idx == 1 and "Eseguito" in extra and "Eseguito 1" not in extra
                else f"Eseguito {idx}"
            )
            voce = _clean_text(extra.get(v_key, ""))
            done = str(extra.get(d_key, "")).lower() == "true"
            if voce:
                stato_voce = "ESEGUITO" if done else "DA ESEGUIRE"
                lines.append(f"Spesa personale #{pos}: {voce} [{stato_voce}]")
        return lines

    # Passo 33: Fondi condominiali
    if cod == "33":
        idx_set = {1}
        for k in extra.keys():
            m1 = re.match(r"^Importo Fondo \(€\)(?:\s+(\d+))?$", k)
            if m1:
                idx_set.add(int(m1.group(1)) if m1.group(1) else 1)
            m2 = re.match(r"^Natura Fondo(?:\s+(\d+))?$", k)
            if m2:
                idx_set.add(int(m2.group(1)) if m2.group(1) else 1)
        for pos, idx in enumerate(sorted(idx_set), start=1):
            i_key = "Importo Fondo (€)" if idx == 1 else f"Importo Fondo (€) {idx}"
            n_key = "Natura Fondo" if idx == 1 else f"Natura Fondo {idx}"
            imp = _clean_text(extra.get(i_key, ""))
            nat = _clean_text(extra.get(n_key, ""))
            if (imp and imp not in ("0", "0,00", "0.00")) or nat:
                lines.append(f"Fondo #{pos}: EUR {imp or '0,00'} - Natura: {nat or '-'}")
        return lines

    # Passo 39: Sinistri
    if cod == "39":
        idx_set = {1}
        for k in extra.keys():
            m1 = re.match(r"^Data sinistro(?:\s+(\d+))?$", k)
            if m1:
                idx_set.add(int(m1.group(1)) if m1.group(1) else 1)
            m2 = re.match(r"^Oggetto sinistro(?:\s+(\d+))?$", k)
            if m2:
                idx_set.add(int(m2.group(1)) if m2.group(1) else 1)
        for pos, idx in enumerate(sorted(idx_set), start=1):
            d_key = "Data sinistro" if idx == 1 else f"Data sinistro {idx}"
            o_key = "Oggetto sinistro" if idx == 1 else f"Oggetto sinistro {idx}"
            d_val = _clean_text(extra.get(d_key, ""))
            o_val = _clean_text(extra.get(o_key, ""))
            if idx == 1 and not o_val and extra.get("Data e Oggetto sinistri"):
                o_val = _clean_text(extra.get("Data e Oggetto sinistri", ""))
            if d_val or (o_val and o_val != "Nessun sinistro aperto"):
                lines.append(f"Sinistro #{pos}: Data {d_val or '-'} | Oggetto: {o_val or '-'}")
        return lines

    # Passo 48: Documenti predisposti
    if cod == "48":
        inclusi = [d for d in docs_allegati if d.get("incluso")]
        done_docs = [
            d for d in inclusi if str(extra.get(f"__doc_predisposto_{d.get('id_riga')}", "")).lower() == "true"
        ]
        if inclusi:
            lines.append(f"Documenti fascicolo predisposti: {len(done_docs)}/{len(inclusi)}")
        for k, v in extra.items():
            if not k.startswith("__") and _clean_text(v):
                lines.append(f"{_clean_text(k)}: {_clean_text(v)}")
        return lines

    # Campi generici per tutti gli altri passi
    for k, v in extra.items():
        if k.startswith("__prompt_") or k.startswith("__doc_predisposto_"):
            continue
        val_str = _clean_text(v)
        if not val_str or val_str == "false":
            continue
        lines.append(f"{_clean_text(k)}: {val_str}")

    return lines


class RiepilogoProceduraPDF(FPDF):
    def __init__(self, condominio_nome: str, gestione: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.condominio_nome = _clean_text(condominio_nome)
        self.gestione = _clean_text(gestione)
        self.set_auto_page_break(auto=True, margin=14)

        win_fonts = r"C:\Windows\Fonts"
        if os.path.exists(os.path.join(win_fonts, "segoeui.ttf")):
            self.add_font("SegoeUI", "", os.path.join(win_fonts, "segoeui.ttf"))
            self.add_font("SegoeUI", "B", os.path.join(win_fonts, "segoeuib.ttf"))
            self.add_font("SegoeUI", "I", os.path.join(win_fonts, "segoeuii.ttf"))
            self.font_main = "SegoeUI"
        else:
            self.font_main = "Helvetica"

    def header(self):
        self.set_font(self.font_main, "B", 8)
        self.set_text_color(100, 116, 139)
        self.cell(
            0,
            5,
            f"STUDIO SERRA • RIEPILOGO PROCEDURA 002 (MODELLO 5) • {self.condominio_nome} ({self.gestione})",
            new_x="RIGHT",
            new_y="TOP",
            align="L",
        )
        self.cell(
            0,
            5,
            f"Stampato il {datetime.now().strftime('%d/%m/%Y %H:%M')}",
            new_x="LMARGIN",
            new_y="NEXT",
            align="R",
        )
        self.set_draw_color(203, 213, 225)
        self.set_line_width(0.2)
        self.line(10, 15, 200, 15)
        self.ln(3)

    def footer(self):
        self.set_y(-11)
        self.set_draw_color(203, 213, 225)
        self.set_line_width(0.2)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(1.5)
        self.set_font(self.font_main, "I", 8)
        self.set_text_color(100, 116, 139)
        self.cell(
            0,
            5,
            f"Foglio di Riassunto Procedura Rendiconto - {self.condominio_nome} - Pagina {self.page_no()}/{{nb}}",
            align="C",
        )

    def section_banner(self, title: str, r: int = 30, g: int = 41, b: int = 59):
        if self.get_y() > 260:
            self.add_page()
        self.ln(2)
        self.set_fill_color(r, g, b)
        self.set_text_color(255, 255, 255)
        self.set_font(self.font_main, "B", 10)
        self.cell(0, 7.5, f"  {_clean_text(title)}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.5)


def build_riepilogo_procedura_pdf(scheda: Dict[str, Any]) -> bytes:
    cond_nome = _clean_text(scheda.get("condominio_nome") or "Condominio")
    cod_danea = _clean_text(scheda.get("condominio_codice_danea") or "-")
    gestione = _clean_text(scheda.get("gestione") or "-")
    iban = _clean_text(scheda.get("condominio_iban") or "-")
    fatto_il = _clean_text(scheda.get("fatto_il") or "In lavorazione")
    operatore = _clean_text(scheda.get("chi_lo_fa_default") or "MS")
    note_testata = _clean_text(scheda.get("note_intestazione") or "")
    pct_fatto = float(scheda.get("percentuale_fatto") or 0.0)
    passi_comp = int(scheda.get("passi_completati") or 0)
    tot_passi = int(scheda.get("totale_passi") or 58)
    post_comp = int(scheda.get("post_assemblea_completati") or 0)
    post_tot = int(scheda.get("post_assemblea_totale") or 5)
    in_attesa = bool(scheda.get("in_attesa_assemblea"))
    tot_pagine = int(scheda.get("totale_pagine_fascicolo") or 0)

    passi: List[Dict[str, Any]] = scheda.get("passi") or []
    docs_allegati: List[Dict[str, Any]] = scheda.get("documenti_allegati") or []
    nota_checks: List[Dict[str, Any]] = scheda.get("nota_esplicativa_checks") or []
    calc_acqua: Dict[str, Any] = scheda.get("calcolatore_acqua") or {}

    pdf = RiepilogoProceduraPDF(condominio_nome=cond_nome, gestione=gestione)
    pdf.alias_nb_pages()
    pdf.add_page()

    # =========================================================================
    # INTESTAZIONE PRINCIPALE DEL FOGLIO DI RIASSUNTO
    # =========================================================================
    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(pdf.font_main, "B", 13)
    pdf.cell(
        0,
        9,
        f"  FOGLIO DI RIASSUNTO PROCEDURA BILANCIO: {cond_nome.upper()}",
        fill=True,
        new_x="LMARGIN",
        new_y="NEXT",
    )

    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(203, 213, 225)
    pdf.set_text_color(15, 23, 42)
    pdf.set_font(pdf.font_main, "B", 9.5)

    stato_pre_str = (
        f"100% ESEGUITO ({passi_comp}/{tot_passi})"
        if pct_fatto >= 100
        else f"{pct_fatto:.1f}% ({passi_comp}/{tot_passi})"
    )
    stato_post_str = (
        f"In Attesa Assemblea ({post_comp}/{post_tot} svolti)"
        if in_attesa
        else f"Completata ({post_comp}/{post_tot})"
        if (pct_fatto >= 100 and post_comp >= post_tot)
        else f"{post_comp}/{post_tot} svolti"
    )

    pdf.cell(95, 6.5, f"  Condominio: {cond_nome} (Cod. Danea: {cod_danea})", border=1, fill=True)
    pdf.cell(95, 6.5, f"  Esercizio / Gestione: {gestione}", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(95, 6.5, f"  Avanzamento Pre-Assemblea (Passi 1-57): {stato_pre_str}", border=1, fill=True)
    pdf.cell(95, 6.5, f"  Fase Post-Assemblea (Passi 58-62): {stato_post_str}", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(65, 6.5, f"  Chiusura (Fatto il): {fatto_il}", border=1, fill=True)
    pdf.cell(55, 6.5, f"  Operatore: {operatore}", border=1, fill=True)
    pdf.cell(70, 6.5, f"  Totale Fascicolo: {tot_pagine} pagine", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    if iban and iban != "-":
        pdf.cell(190, 6.5, f"  IBAN Condominio (Passo 38): {iban}", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    if note_testata:
        pdf.set_fill_color(254, 243, 199)
        pdf.set_text_color(120, 53, 15)
        pdf.set_font(pdf.font_main, "B", 9)
        pdf.multi_cell(190, 6, f"  NOTE DI TESTATA SUL BILANCIO: {note_testata}", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)

    # =========================================================================
    # SEZIONE 1: QUADRO SINTETICO DATI CHIAVE, FONDI, SINISTRI E ASSEMBLEA
    # =========================================================================
    pdf.section_banner("1. QUADRO SINTETICO DATI IMMESSI E VERIFICHE PRINCIPALI", 30, 58, 138)

    by_code = {str(p.get("numero_codice") or "").strip(): p for p in passi}

    # Assemblea Ordinaria (Passi 51-53)
    p51 = by_code.get("51", {})
    p52 = by_code.get("52", {})
    p53 = by_code.get("53", {})
    luogo_ass = _clean_text((p51.get("campi_extra") or {}).get("Presso") or "")
    data_ass = _clean_text(
        (p51.get("campi_extra") or {}).get("Data riunione")
        or (p52.get("campi_extra") or {}).get("Data assemblea")
        or ""
    )
    ora_ass = _clean_text(
        (p51.get("campi_extra") or {}).get("Ora riunione")
        or (p53.get("campi_extra") or {}).get("Ora assemblea")
        or ""
    )

    pdf.set_font(pdf.font_main, "B", 9)
    pdf.set_text_color(15, 23, 42)
    pdf.set_fill_color(238, 242, 255)
    pdf.cell(
        190,
        6,
        f"  CONVOCAZIONE ASSEMBLEA (Passi 51-53): Data: {data_ass or 'Non indicata'} | Ora: {ora_ass or 'Non indicata'} | Luogo: {luogo_ass or 'Non indicato'}",
        border=1,
        fill=True,
        new_x="LMARGIN",
        new_y="NEXT",
    )

    # Raccogli i punti sintetici dai passi speciali (6, 8, 24, 30, 31, 33, 36, 39, 43)
    key_codes = ["6", "8", "24", "30", "31", "33", "36", "38", "39", "43"]
    has_key_items = False
    for kc in key_codes:
        p_obj = by_code.get(kc)
        if not p_obj:
            continue
        extra_lines = _extract_step_extra_summary(p_obj, docs_allegati)
        nota_p = _clean_text(p_obj.get("note_passo") or "")
        if extra_lines or nota_p:
            has_key_items = True
            pdf.set_font(pdf.font_main, "B", 8.5)
            pdf.set_text_color(30, 41, 59)
            stato_k = "FATTO" if p_obj.get("fatto") else "DA FARE"
            pdf.multi_cell(
                190,
                5,
                f"Passo #{kc} [{stato_k}] - {_clean_text(p_obj.get('descrizione') or '')[:95]}",
                new_x="LMARGIN",
                new_y="NEXT",
            )
            pdf.set_font(pdf.font_main, "", 8.5)
            pdf.set_text_color(51, 65, 85)
            for ln in extra_lines:
                pdf.multi_cell(190, 4.8, f"    • {ln}", new_x="LMARGIN", new_y="NEXT")
            if nota_p:
                pdf.set_font(pdf.font_main, "I", 8.5)
                pdf.set_text_color(124, 45, 18)
                pdf.multi_cell(190, 4.8, f"    Nota Passo #{kc}: {nota_p}", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.8)

    # Calcolatore Acqua (Passo 15b)
    cons_cont = float(calc_acqua.get("consumo_contabilizzatori") or 0)
    mc_fatt = float(calc_acqua.get("mc_fatture") or 0)
    costo_h2o = float(calc_acqua.get("costo_fatture_h2o") or 0)
    mc_oltre = float(calc_acqua.get("mc_oltre_letture") or 0)
    costo_mc = float(calc_acqua.get("costo_al_mc") or 0)
    quota_ecc = float(calc_acqua.get("quota_acqua_eccedente") or 0)
    if cons_cont > 0 or mc_fatt > 0 or costo_h2o > 0 or quota_ecc != 0:
        has_key_items = True
        pdf.set_fill_color(240, 249, 255)
        pdf.set_font(pdf.font_main, "B", 8.5)
        pdf.set_text_color(12, 74, 110)
        pdf.multi_cell(
            190,
            5.5,
            f"  CALCOLATORE ACQUA ECCEDENTE (Passo 15b): Contabilizzatori: {cons_cont:.2f} mc | Fatture: {mc_fatt:.2f} mc | Costo H2O: EUR {costo_h2o:.2f} | Eccedenza: {mc_oltre:.2f} mc (EUR {costo_mc:.4f}/mc) -> Quota Eccedente: EUR {quota_ecc:.2f}",
            border=1,
            fill=True,
            new_x="LMARGIN",
            new_y="NEXT",
        )

    if not has_key_items:
        pdf.set_font(pdf.font_main, "I", 8.5)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(190, 5, "  Nessun dato speciale aggiuntivo registrato nei passi chiave.", new_x="LMARGIN", new_y="NEXT")

    # =========================================================================
    # SEZIONE 2: TUTTE LE NOTE OPERATIVE E I DATI IMMESSI NEI 63 PASSAGGI
    # =========================================================================
    pdf.section_banner("2. ELENCO COMPLETO DEI 63 PASSAGGI CON STATO, DATI IMMESSI E NOTE", 6, 95, 70)

    current_sezione = None
    post_banner_shown = False

    for p in passi:
        cod = _clean_text(p.get("numero_codice") or "")
        ordine = int(p.get("ordine") or 0)
        is_post = cod in ("58", "59", "60", "61", "62") or ordine >= 59

        if is_post and not post_banner_shown:
            post_banner_shown = True
            if pdf.get_y() > 250:
                pdf.add_page()
            pdf.ln(1.5)
            pdf.set_fill_color(109, 40, 217)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font(pdf.font_main, "B", 9.5)
            pdf.cell(
                190,
                6.5,
                "  FASE POST-ASSEMBLEA (PASSI 58-62 • DA ESEGUIRE DOPO L'ASSEMBLEA • ESCLUSI DAL 100%)",
                fill=True,
                new_x="LMARGIN",
                new_y="NEXT",
            )
            pdf.ln(1)

        sez = _clean_text(p.get("sezione") or "Procedura")
        if sez != current_sezione and not is_post:
            current_sezione = sez
            if pdf.get_y() > 255:
                pdf.add_page()
            pdf.ln(1)
            pdf.set_fill_color(226, 232, 240)
            pdf.set_text_color(15, 23, 42)
            pdf.set_font(pdf.font_main, "B", 8.5)
            pdf.cell(190, 5.5, f"  {sez.upper()}", fill=True, new_x="LMARGIN", new_y="NEXT")

        fatto = bool(p.get("fatto"))
        data_spunta = _clean_text(p.get("data_spunta") or "")
        chi = _clean_text(p.get("chi_lo_fa") or operatore)
        descr = _clean_text(p.get("descrizione") or "")
        ha_pag = bool(p.get("ha_pagine"))
        num_pag = int(p.get("num_pagine") or 0)
        nota_passo = _clean_text(p.get("note_passo") or "")
        extra_lines = _extract_step_extra_summary(p, docs_allegati)

        if pdf.get_y() > 265:
            pdf.add_page()

        # Riga principale del passo
        stato_tag = "[OK]" if fatto else "[DA FARE]"
        spunta_info = f" ({data_spunta})" if (fatto and data_spunta) else ""
        pag_info = f" | All.: {num_pag} pag." if ha_pag else ""
        step_57_tag = " [TRAGUARDO 100% PRE-ASSEMBLEA]" if cod == "57" else ""

        if fatto:
            pdf.set_text_color(6, 95, 70)
        elif is_post:
            pdf.set_text_color(91, 33, 182)
        else:
            pdf.set_text_color(153, 27, 27)

        pdf.set_font(pdf.font_main, "B", 8.5)
        header_line = f"#{cod} {stato_tag}{spunta_info} [Op: {chi}]{pag_info}{step_57_tag} - "
        pdf.write(4.6, header_line)

        pdf.set_font(pdf.font_main, "", 8.5)
        pdf.set_text_color(15, 23, 42)
        pdf.multi_cell(0, 4.6, descr, new_x="LMARGIN", new_y="NEXT")

        # Box Dati Extra e Note del Passo (se presenti)
        if extra_lines or nota_passo:
            pdf.set_fill_color(248, 250, 252)
            pdf.set_draw_color(203, 213, 225)
            for el in extra_lines:
                pdf.set_font(pdf.font_main, "B", 8)
                pdf.set_text_color(30, 64, 175)
                pdf.multi_cell(190, 4.4, f"      > Dato immesso: {el}", fill=True, new_x="LMARGIN", new_y="NEXT")
            if nota_passo:
                pdf.set_fill_color(254, 252, 232)
                pdf.set_font(pdf.font_main, "B", 8)
                pdf.set_text_color(146, 64, 14)
                pdf.multi_cell(
                    190,
                    4.6,
                    f"      * NOTA PASSO #{cod}: {nota_passo}",
                    fill=True,
                    new_x="LMARGIN",
                    new_y="NEXT",
                )

        # Linea sottile separatrice
        pdf.set_draw_color(241, 245, 249)
        pdf.line(10, pdf.get_y() + 0.5, 200, pdf.get_y() + 0.5)
        pdf.ln(1.2)

    # =========================================================================
    # SEZIONE 3: DOCUMENTI DA ALLEGARE AL RENDICONTO E PAGINE (PASSO 48)
    # =========================================================================
    inclusi_docs = [d for d in docs_allegati if d.get("incluso")]
    if inclusi_docs:
        pdf.section_banner(
            f"3. PROSPETTO FASCICOLO E DOCUMENTI ALLEGATI ({len(inclusi_docs)} allegati • Totale {tot_pagine} pagine)",
            67,
            56,
            202,
        )
        p48_extra = (by_code.get("48") or {}).get("campi_extra") or {}

        pdf.set_fill_color(30, 41, 59)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font(pdf.font_main, "B", 8)
        pdf.cell(16, 6, "All. #", border=1, fill=True, align="C")
        pdf.cell(24, 6, "Predisposto", border=1, fill=True, align="C")
        pdf.cell(96, 6, "Titolo Documento Allegato", border=1, fill=True)
        pdf.cell(24, 6, "Rif. Passo", border=1, fill=True, align="C")
        pdf.cell(15, 6, "1a Pag.", border=1, fill=True, align="C")
        pdf.cell(15, 6, "N. Pag.", border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font(pdf.font_main, "", 8)
        pdf.set_text_color(15, 23, 42)
        for d in inclusi_docs:
            if pdf.get_y() > 268:
                pdf.add_page()
            pred = str(p48_extra.get(f"__doc_predisposto_{d.get('id_riga')}", "")).lower() == "true"
            pdf.set_fill_color(236, 253, 245) if pred else pdf.set_fill_color(255, 255, 255)
            pdf.cell(16, 5.5, str(d.get("numero_allegato") or "-"), border=1, fill=True, align="C")
            pdf.cell(24, 5.5, "SI [OK]" if pred else "Da fare", border=1, fill=True, align="C")
            pdf.cell(96, 5.5, f" {_clean_text(d.get('titolo') or '')[:55]}", border=1, fill=True)
            pdf.cell(24, 5.5, _clean_text(d.get("riferimento_passo") or ""), border=1, fill=True, align="C")
            pdf.cell(15, 5.5, str(d.get("prima_pagina") or "-"), border=1, fill=True, align="C")
            pdf.cell(
                15,
                5.5,
                str(d.get("pagine_documento") or 0),
                border=1,
                fill=True,
                align="C",
                new_x="LMARGIN",
                new_y="NEXT",
            )

    # =========================================================================
    # SEZIONE 4: VERIFICHE NOTA ESPLICATIVA (PASSO 47)
    # =========================================================================
    if nota_checks:
        done_checks = sum(1 for c in nota_checks if c.get("fatto"))
        pdf.section_banner(
            f"4. VERIFICHE NOTA ESPLICATIVA - PASSO 47 ({done_checks}/{len(nota_checks)} controlli spuntati)",
            180,
            83,
            9,
        )
        for c in nota_checks:
            if pdf.get_y() > 268:
                pdf.add_page()
            c_fatto = bool(c.get("fatto"))
            c_tit = _clean_text(c.get("titolo") or "")
            c_grp = _clean_text(c.get("gruppo") or "")
            c_note = _clean_text(c.get("note") or "")
            mark = "[OK]" if c_fatto else "[  ]"
            pdf.set_font(pdf.font_main, "B" if c_note else "", 8)
            pdf.set_text_color(6, 95, 70) if c_fatto else pdf.set_text_color(71, 85, 105)
            line_txt = f"  {mark} [{c_grp}] {c_tit}"
            if c_note:
                line_txt += f"  --> NOTA: {c_note}"
            pdf.multi_cell(190, 4.6, line_txt, new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
