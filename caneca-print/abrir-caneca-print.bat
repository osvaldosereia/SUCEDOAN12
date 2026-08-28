@echo off
setlocal
set "URL=https://donaantonia.com.br/caneca-print/?kiosk=1&mode=queue"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto abrir
set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto abrir
set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto abrir

echo Google Chrome nao foi encontrado.
echo Instale o Chrome ou ajuste o caminho neste arquivo.
pause
exit /b 1

:abrir
start "Caneca Print" "%CHROME%" --app="%URL%" --kiosk-printing --start-maximized --disable-session-crashed-bubble
exit /b 0
