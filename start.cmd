@echo off
cd /d "%~dp0"
echo Saebyeok Mart - http://127.0.0.1:4173
echo Leave this window open while playing. Press Ctrl+C to stop.
node scripts\server.mjs
pause
