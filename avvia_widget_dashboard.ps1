# Script di avvio automatico del Riquadro Widget Dashboard - Studio Serra (A-018)
$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = "c:\Progetti\A-018 Assistente Amministratore"
$BackendDir  = Join-Path $ProjectRoot "backend"
$IconPath    = Join-Path $ProjectRoot "logo_studio_serra.ico"

function Test-PortListening($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

# 1. Avvia il Backend FastAPI + Frontend compilato (dist) sulla porta 8018 se non è già attivo
if (-not (Test-PortListening 8018)) {
    $VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
    if (Test-Path $VenvPython) {
        Start-Process -FilePath $VenvPython `
            -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8018" `
            -WorkingDirectory $BackendDir `
            -WindowStyle Hidden
    }
}

# 2. Attendi che il server sulla porta 8018 risponda alle richieste HTTP
$WidgetUrl = "http://localhost:8018/?widget=1"
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

# 3. Calcola la posizione sul lato destro del Desktop
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$Screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$WinWidth  = 450
$WinHeight = [Math]::Min(860, $Screen.Height - 30)
$PosX      = [Math]::Max(0, $Screen.Right - $WinWidth - 14)
$PosY      = [Math]::Max(10, $Screen.Top + 14)

# Profilo dedicato per permettere a Chrome/Edge di posizionare e ridimensionare il riquadro con la nuova icona
$WidgetProfileDir = Join-Path $env:LOCALAPPDATA "StudioSerra_WidgetProfile_v4"

# 4. Cerca Chrome o Edge per aprire il riquadro in modalità App senza barre degli strumenti
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
        "--app=$WidgetUrl",
        "--user-data-dir=`"$WidgetProfileDir`"",
        "--window-size=$WinWidth,$WinHeight",
        "--window-position=$PosX,$PosY",
        "--no-first-run",
        "--no-default-browser-check"
    )
    $proc = Start-Process -FilePath $BrowserExe -ArgumentList ($ArgsList -join " ") -WindowStyle Normal -PassThru

    # 5. Forza l'icona Studio Serra sulla finestra della Barra delle Applicazioni (WM_SETICON)
    if (Test-Path $IconPath) {
        $Win32Def = @"
using System;
using System.Runtime.InteropServices;
public class Win32IconHelper {
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
        $hIconSmall = [Win32IconHelper]::LoadImage([IntPtr]::Zero, $IconPath, $IMAGE_ICON, 32, 32, $LR_LOADFROMFILE)
        $hIconBig   = [Win32IconHelper]::LoadImage([IntPtr]::Zero, $IconPath, $IMAGE_ICON, 256, 256, $LR_LOADFROMFILE)

        for ($w = 0; $w -lt 16; $w++) {
            Start-Sleep -Milliseconds 500
            $procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*Studio Serra*" -and $_.MainWindowHandle -ne 0 }
            if ($procs) {
                foreach ($p in $procs) {
                    if ($hIconSmall -ne [IntPtr]::Zero) {
                        [void][Win32IconHelper]::SendMessage($p.MainWindowHandle, $WM_SETICON, [IntPtr]0, $hIconSmall)
                    }
                    if ($hIconBig -ne [IntPtr]::Zero) {
                        [void][Win32IconHelper]::SendMessage($p.MainWindowHandle, $WM_SETICON, [IntPtr]1, $hIconBig)
                    }
                }
            }
        }
    }
} else {
    Start-Process $WidgetUrl
}
