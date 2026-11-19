# Avvio Rapido S.E.R.R.A. Mobile & Field Edition (Studio Serra)
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
$MobileMain = Join-Path $ProjectRoot "SERRA_Mobile\main.py"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "🚀 AVVIO S.E.R.R.A. MOBILE (Operatività da Campo & Fuori Studio)" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Cartella Progetto : $ProjectRoot"
Write-Host "Python Venv       : $VenvPython"
Write-Host "Script Mobile     : $MobileMain"
Write-Host ""

if (-not (Test-Path $VenvPython)) {
    Write-Host "Python Venv non trovato in $VenvPython, fallback su 'python' di sistema..." -ForegroundColor Yellow
    $VenvPython = "python"
}

& $VenvPython $MobileMain
