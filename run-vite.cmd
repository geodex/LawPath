@echo off
cd /d "%~dp0"
echo Starting LawPath SA at http://localhost:4173/
echo Leave this window open while using the app.
echo.
"D:\nodejs\node.exe" node_modules\vite\bin\vite.js --host 127.0.0.1 --port 4173
echo.
echo The server stopped. Press any key to close this window.
pause > nul
