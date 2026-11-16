Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\Progetti\A-018 Assistente Amministratore\avvia_programma_completo.ps1""", 0, False
Set WshShell = Nothing
