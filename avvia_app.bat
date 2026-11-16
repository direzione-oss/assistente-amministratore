@echo off
title A-018 Assistente Amministratore - Studio Serra
echo ========================================================
echo   Avvio A-018 Assistente Amministratore (Studio Serra)
echo ========================================================
echo.

echo [1/2] Avvio Backend FastAPI su http://0.0.0.0:8018 ...
start "Backend A-018" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8018 --reload"

echo [2/2] Avvio Frontend React/Vite su http://localhost:5173 (e rete Wi-Fi) ...
start "Frontend A-018" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 >nul
start http://localhost:5173
echo.
echo App avviata su http://localhost:5173 !
echo Per usarla da cellulare (sotto lo stesso Wi-Fi), clicca sul pulsante "Usa da Cellulare (QR)" in alto a destra nell'app!

