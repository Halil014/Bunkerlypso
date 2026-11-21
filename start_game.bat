@echo off
title BUNKERLYPSO - 2D Zombie Survival
echo ========================================================
echo  BUNKERLYPSO - 2D ZOMBIE SURVIVAL
echo ========================================================
echo.

:: Check which Python launcher is available.
set "PYTHON_CMD="
where python >nul 2>&1
if not errorlevel 1 set "PYTHON_CMD=python"

if not defined PYTHON_CMD (
    where py >nul 2>&1
    if not errorlevel 1 set "PYTHON_CMD=py"
)

if not defined PYTHON_CMD (
    echo Python not found. Opening directly in default browser...
    start "" "index.html"
    goto :end
)

echo Python found. Starting local server...
echo Opening browser: http://localhost:8000

:: Start the server first, give it a moment to bind the port, then open the browser.
start "Bunkerlypso Server" /min %PYTHON_CMD% -m http.server 8000
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000"

echo.
echo Server running in background. Close that window to terminate.
echo You may close this window.

:end
pause
