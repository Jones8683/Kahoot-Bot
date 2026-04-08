@echo off
setlocal EnableDelayedExpansion
title Kahoot Bot Launcher
cd /d "%~dp0"

for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "PURPLE=%ESC%[95m"
set "RESET=%ESC%[0m"

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

echo.
echo %PURPLE%=========================================%RESET%
echo %PURPLE%          Kahoot Bot Launcher%RESET%
echo %PURPLE%=========================================%RESET%
echo.
echo [1] Numbered names    example: hit 1, hit 2, hit 3
echo [2] Custom names list example: lucas,mia,noah
echo.
set /p "mode=Choose mode [1 or 2]: "

if not "!mode!"=="1" if not "!mode!"=="2" (
    echo Invalid mode. Use 1 or 2.
    pause
    exit /b 1
)

set /p "pin=Game PIN: "

if "!pin!"=="" (
    echo PIN is required.
    pause
    exit /b 1
)

for /f "delims=0123456789" %%a in ("!pin!") do (
    echo PIN must be a number.
    pause
    exit /b 1
)

if "!mode!"=="2" (
    set /p "names=Names comma-separated: "
    if "!names!"=="" (
        echo Names are required.
        pause
        exit /b 1
    )
    echo.
    echo Starting: node index.js !pin! --names "!names!"
    node index.js !pin! --names "!names!"
    pause
    exit /b %errorlevel%
)

set /p "count=How many bots: "
set /p "base=Base name: "

if "!count!"=="" (
    echo Count is required.
    pause
    exit /b 1
)

for /f "delims=0123456789" %%a in ("!count!") do (
    echo Count must be a number.
    pause
    exit /b 1
)

if "!base!"=="" (
    echo Base name is required.
    pause
    exit /b 1
)

echo.
echo Starting: node index.js !pin! !count! "!base!"
node index.js !pin! !count! "!base!"
pause
exit /b %errorlevel%