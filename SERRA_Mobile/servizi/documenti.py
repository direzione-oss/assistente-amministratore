import os
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

try:
    import docx
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    docx = None

try:
    import config
except ImportError:
    from .. import config

def clean_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>| ]', '_', name.strip())

def crea_word_e_pdf(cond, t_ia, foto_paths, data, appunti, tipo="sopralluogo") -> str:
    """
    Genera un report Word (.docx) impaginato professionalmente per Studio Serra.
    Include sintesi tecnica IA, note di campo e rilievo fotografico con didascalie.
    """
    if not docx:
        print("⚠️ python-docx non installato.")
        return ""

    doc = docx.Document()

    # Intestazione Studio
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_studio = title_p.add_run("STUDIO SERRA — GESTIONE CONDOMINIALE\n")
    run_studio.font.size = Pt(16)
    run_studio.font.bold = True
    run_studio.font.color.rgb = RGBColor(30, 58, 138)

    titolo_doc = (
        "VERBALE DI SOPRALLUOGO TECNICO"
        if tipo == "sopralluogo"
        else "RICHIESTA DI INTERVENTO MANUTENTIVO"
    )
    run_titolo = title_p.add_run(f"{titolo_doc}\n")
    run_titolo.font.size = Pt(13)
    run_titolo.font.bold = True
    run_titolo.font.color.rgb = RGBColor(71, 85, 105)

    doc.add_paragraph("—" * 45)

    # Dati Generali
    dati_table = doc.add_table(rows=3, cols=2)
    dati_table.autofit = True
    
    dati_table.cell(0, 0).paragraphs[0].add_run("Condominio:").bold = True
    dati_table.cell(0, 1).paragraphs[0].add_run(str(cond))
    
    dati_table.cell(1, 0).paragraphs[0].add_run("Data Rilevazione:").bold = True
    dati_table.cell(1, 1).paragraphs[0].add_run(str(data))
    
    dati_table.cell(2, 0).paragraphs[0].add_run("Rilevatore:").bold = True
    dati_table.cell(2, 1).paragraphs[0].add_run("Studio Tecnico Serra (Rilevamento da campo)")

    doc.add_paragraph()

    # Sezione 1: Sintesi Tecnica IA
    h1 = doc.add_heading("1. Sintesi Tecnica dell'Ispezione", level=2)
    h1.paragraph_format.space_before = Pt(12)
    p_ia = doc.add_paragraph(t_ia)
    p_ia.paragraph_format.line_spacing = 1.15

    # Sezione 2: Note e Appunti di Campo
    if appunti and appunti.strip():
        h2 = doc.add_heading("2. Appunti Operativi Rilevati sul Campo", level=2)
        h2.paragraph_format.space_before = Pt(12)
        doc.add_paragraph(appunti.strip())

    # Sezione 3: Rilievo Fotografico
    if foto_paths:
        h3 = doc.add_heading("3. Rilievo Fotografico", level=2)
        h3.paragraph_format.space_before = Pt(12)
        
        for idx, f_item in enumerate(foto_paths, start=1):
            f_path = f_item.get("path") if isinstance(f_item, dict) else f_item
            f_cap = f_item.get("caption") if isinstance(f_item, dict) else ""
            
            if f_path and os.path.exists(f_path):
                try:
                    p_img = doc.add_paragraph()
                    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_img.paragraph_format.space_before = Pt(8)
                    doc.add_picture(f_path, width=Inches(5.2))
                    
                    p_cap = doc.add_paragraph()
                    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    didattica = f"Foto {idx}: {f_cap}" if f_cap else f"Foto {idx}: Rilievo in loco ({cond})"
                    run_cap = p_cap.add_run(didattica)
                    run_cap.italic = True
                    run_cap.font.size = Pt(9.5)
                    run_cap.font.color.rgb = RGBColor(100, 116, 139)
                    p_cap.paragraph_format.space_after = Pt(14)
                except Exception as e_img:
                    print(f"⚠️ Errore inserimento foto {f_path}: {e_img}")

    # Chiusura e Firma
    doc.add_paragraph()
    p_foot = doc.add_paragraph()
    p_foot.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run_firm = p_foot.add_run(f"Studio Serra — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    run_firm.italic = True
    run_firm.font.size = Pt(9)

    # Salvataggio
    cartella_dest = (
        config.CARTELLA_SOPRALLUOGHI
        if tipo == "sopralluogo"
        else config.CARTELLA_INTERVENTI
    )
    os.makedirs(cartella_dest, exist_ok=True)
    
    clean_cond = clean_filename(str(cond))
    clean_dt = clean_filename(str(data))
    filename = f"Report_{tipo.capitalize()}_{clean_cond}_{clean_dt}_{int(datetime.now().timestamp())}.docx"
    filepath = os.path.join(cartella_dest, filename)
    doc.save(filepath)
    print(f"✅ [REPORT] Salvato: {filepath}")
    return filepath

def invia_email_promemoria(testo, oggetto="📌 Promemoria Staff da S.E.R.R.A.") -> bool:
    """
    Invia via SMTP una nota o messaggio vocale trascritto allo staff di Studio Serra.
    """
    try:
        msg = MIMEMultipart()
        msg["From"] = config.EMAIL_MITTENTE
        msg["To"] = config.EMAIL_DESTINATARIO_STAFF
        msg["Subject"] = oggetto

        corpo_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b;">
            <div style="background-color: #1e3a8a; color: white; padding: 12px 16px; border-radius: 6px 6px 0 0;">
                <h3 style="margin: 0;">📌 S.E.R.R.A. Mobile — Promemoria Staff</h3>
            </div>
            <div style="border: 1px solid #cbd5e1; border-top: none; padding: 16px; border-radius: 0 0 6px 6px;">
                <p><strong>Oggetto:</strong> {oggetto}</p>
                <p><strong>Data/Ora:</strong> {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
                <p style="white-space: pre-wrap; font-size: 15px; line-height: 1.5; color: #0f172a;">{testo}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
                <small style="color: #64748b;">Inviato da S.E.R.R.A. Mobile (Studio Serra)</small>
            </div>
        </div>
        """
        msg.attach(MIMEText(corpo_html, "html", "utf-8"))

        with smtplib.SMTP(config.SMTP_SERVER, config.SMTP_PORT, timeout=15) as s:
            if config.SMTP_USE_TLS:
                s.starttls()
            if config.PASSWORD_EMAIL:
                s.login(config.EMAIL_MITTENTE, config.PASSWORD_EMAIL)
            s.sendmail(config.EMAIL_MITTENTE, [config.EMAIL_DESTINATARIO_STAFF], msg.as_string())
            print(f"✅ [EMAIL] Promemoria inviato a {config.EMAIL_DESTINATARIO_STAFF}")
            return True
    except Exception as e:
        print(f"⚠️ Errore invio email promemoria: {e}")
        return False
