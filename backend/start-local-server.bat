@echo off
cd /d "%~dp0"
echo Starting Datacom Inventory System local server...
echo.
echo Keep this window open while users are using the system.
echo Other users should open http://SERVER_IP:3000 in their browser.
echo.
npm start
pause
