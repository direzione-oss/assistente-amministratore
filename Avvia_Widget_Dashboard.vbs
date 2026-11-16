Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\Progetti\A-018 Assistente Amministratore\avvia_widget_dashboard.ps1""", 0, False
Set WshShell = Nothing
