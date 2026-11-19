@echo off
title Clipura - restart backend only
set "ROOT=%~dp0"
set "NODE_ENV=production"

echo Stopping the current backend on port 3001...
echo (The tunnel is LEFT RUNNING, so your trycloudflare address stays the same.)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 >nul

echo Starting the backend again (reads backend\.env)...
start "Clipura backend" /d "%ROOT%backend" cmd /k node server.js

echo.
echo Done. The tunnel address did NOT change, so you do not need to touch Vercel.
echo If you changed the access code, give testers the new one.
pause
