@echo off
title DomusPilot AI - Assistente Amministratore di Condominio
echo ===================================================================
echo   Avvio di DomusPilot AI (CRM + Segretario Amministratore)
echo   Connessioni: Danea Domustudio ^| DettoFatto ^| Google Workspace
echo ===================================================================

start "DomusPilot Backend (FastAPI :8018)" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8018 --reload"
start "DomusPilot Frontend (React :5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 >nul
start http://localhost:5173
echo Web App avviata su http://localhost:5173 (clicca su "Usa da Cellulare" per il QR Code Wi-Fi)

