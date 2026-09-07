@echo off
setlocal EnableDelayedExpansion
title Kahoot Bot Manager
cd /d "%~dp0"

set "NODE_TLS_REJECT_UNAUTHORIZED="
set "FORCE_COLOR=1"
if defined NODE_OPTIONS (
    set "NODE_OPTIONS=--use-system-ca !NODE_OPTIONS!"
) else (
    set "NODE_OPTIONS=--use-system-ca"
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

if not exist "node_modules\kahoot.js-latest" (
    echo Installing dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)

cls
node index.js
pause
exit /b %errorlevel%