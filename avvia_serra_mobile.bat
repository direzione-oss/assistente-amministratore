@echo off
title S.E.R.R.A. Mobile - Studio Serra (Operativita da Campo)
echo ================================================================
echo   Avvio S.E.R.R.A. Mobile & Field Edition (Studio Serra)
echo ================================================================
echo.
cd /d "%~dp0"
if exist "backend\.venv\Scripts\python.exe" (
    "backend\.venv\Scripts\python.exe" "SERRA_Mobile\main.py"
) else (
    python "SERRA_Mobile\main.py"
)
pause
