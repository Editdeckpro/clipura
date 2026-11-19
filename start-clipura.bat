@echo off
title Clipura launcher
set "ROOT=%~dp0"
set "CF=%ROOT%tools\cloudflared.exe"

REM Run the backend in production mode so rate limits are on. Your API keys,
REM ACCESS_CODE, DAILY_PROCESSING_MINUTES and FRONTEND_URL come from backend\.env
set "NODE_ENV=production"

if not exist "%ROOT%tools" mkdir "%ROOT%tools"

REM One-time: install backend dependencies if they are missing.
if not exist "%ROOT%backend\node_modules" (
  echo First-time setup: installing backend dependencies...
  pushd "%ROOT%backend"
  call npm install
  popd
)

REM One-time: download the secure tunnel tool (Cloudflare).
if not exist "%CF%" (
  echo One-time setup: downloading the secure tunnel tool...
  powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%' } catch { Write-Host $_.Exception.Message }"
  if not exist "%CF%" (
    echo.
    echo Could not download the tunnel tool. Check your internet and run this again.
    pause
    exit /b 1
  )
)

echo Starting the Clipura backend...
start "Clipura backend" /d "%ROOT%backend" cmd /k node server.js

echo Waiting a few seconds for the backend to be ready...
timeout /t 5 >nul

echo Starting the secure tunnel...
start "Clipura tunnel" /d "%ROOT%tools" cmd /k cloudflared.exe tunnel --url http://localhost:3001

echo.
echo ================================================================
echo  Clipura is starting. Two windows just opened:
echo    1) "Clipura backend"  - the engine (leave it open)
echo    2) "Clipura tunnel"   - the connection (leave it open)
echo.
echo  In the TUNNEL window, find a line like:
echo      https://something-random.trycloudflare.com
echo  That is your CURRENT backend address.
echo.
echo  If it is DIFFERENT from last time, update it in Vercel
echo  (see RUN-ON-MY-PC.md) so the website can reach your PC.
echo.
echo  To stop Clipura: close both of those windows.
echo ================================================================
echo.
pause
