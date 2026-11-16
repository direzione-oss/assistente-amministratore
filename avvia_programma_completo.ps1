# Script di avvio del Programma Completo - Studio Serra Gestione Rendiconti (A-018)
$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = "c:\Progetti\A-018 Assistente Amministratore"
$BackendDir  = Join-Path $ProjectRoot "backend"
$IconPath    = Join-Path $ProjectRoot "logo_studio_serra.ico"

function Test-PortListening($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

# 1. Avvia il Backend FastAPI + Frontend compilato (dist) sulla porta 8018 se non è già attivo
if (-not (Test-PortListening 8018)) {
    if (Test-Path $VenvPython) {
        Start-Process -FilePath $VenvPython `
            -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8018" `
            -WorkingDirectory $BackendDir `
            -WindowStyle Hidden
    }
}

# 2. Avvia anche il server sulla porta 8502 (per collegamento rapido Wi-Fi / QR da cellulare) se non è già attivo
if (-not (Test-PortListening 8502)) {
    if (Test-Path $VenvPython) {
        Start-Process -FilePath $VenvPython `
            -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8502" `
            -WorkingDirectory $BackendDir `
            -WindowStyle Hidden
    }
}

# 3. Attendi che il server sulla porta 8018 risponda alle richieste HTTP
$AppUrl = "http://localhost:8018"
for ($i = 0; $i -lt 30; $i++) {
    if (Test-PortListening 8018) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8018/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                break
            }
        } catch {
            # Attendi ancora che uvicorn completi lo startup
        }
    }
    Start-Sleep -Milliseconds 400
}

# 4. Apri il programma completo in una finestra dedicata a schermo intero con icona Studio Serra
Add-Type -AssemblyName System.Windows.Forms
$Screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$WinWidth  = [Math]::Max(1100, $Screen.Width - 60)
$WinHeight = [Math]::Max(750, $Screen.Height - 40)
$PosX      = [Math]::Max(0, $Screen.Left + 30)
$PosY      = [Math]::Max(0, $Screen.Top + 20)

$MainProfileDir = Join-Path $env:LOCALAPPDATA "StudioSerra_MainAppProfile_v3"

$BrowserPaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$BrowserExe = $null
foreach ($p in $BrowserPaths) {
    if (Test-Path $p) {
        $BrowserExe = $p
        break
    }
}

if ($BrowserExe) {
    $ArgsList = @(
        "--app=$AppUrl",
        "--user-data-dir=`"$MainProfileDir`"",
        "--window-size=$WinWidth,$WinHeight",
        "--window-position=$PosX,$PosY",
        "--no-first-run",
        "--no-default-browser-check"
    )
    Start-Process -FilePath $BrowserExe -ArgumentList ($ArgsList -join " ") -WindowStyle Normal

    # Applica l'icona Studio Serra alla finestra sulla Barra delle Applicazioni
    if (Test-Path $IconPath) {
        $Win32Def = @"
using System;
using System.Runtime.InteropServices;
public class Win32IconHelperMain {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);
}
"@
        Add-Type -TypeDefinition $Win32Def -ErrorAction SilentlyContinue
        $LR_LOADFROMFILE = 0x00000010
        $IMAGE_ICON = 1
        $WM_SETICON = 0x0080
        $hIconSmall = [Win32IconHelperMain]::LoadImage([IntPtr]::Zero, $IconPath, $IMAGE_ICON, 32, 32, $LR_LOADFROMFILE)
        $hIconBig   = [Win32IconHelperMain]::LoadImage([IntPtr]::Zero, $IconPath, $IMAGE_ICON, 256, 256, $LR_LOADFROMFILE)

        for ($w = 0; $w -lt 16; $w++) {
            Start-Sleep -Milliseconds 500
            $procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*Studio Serra*" -and $_.MainWindowHandle -ne 0 }
            if ($procs) {
                foreach ($p in $procs) {
                    if ($hIconSmall -ne [IntPtr]::Zero) {
                        [void][Win32IconHelperMain]::SendMessage($p.MainWindowHandle, $WM_SETICON, [IntPtr]0, $hIconSmall)
                    }
                    if ($hIconBig -ne [IntPtr]::Zero) {
                        [void][Win32IconHelperMain]::SendMessage($p.MainWindowHandle, $WM_SETICON, [IntPtr]1, $hIconBig)
                    }
                }
            }
        }
    }
} else {
    Start-Process $AppUrl
}
