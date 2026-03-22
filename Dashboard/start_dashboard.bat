@echo off
REM FS25 Telemetry Dashboard Launcher
REM Quick start script for Windows

cls
echo.
echo ========================================
echo   FS25 Telemetry Dashboard Launcher
echo ========================================
echo.

setlocal enabledelayedexpansion

set "BACKEND_PATH=c:\Users\doski\TecnicFarming\Dashboard\backend"

echo Choose mode:
echo [1] Backend Mode - real data from FS25
echo [2] Backend Server Only
echo.

set /p choice="Enter choice (1-2): "

if "%choice%"=="1" (
    echo.
    echo Starting Backend Server...
    echo This will open a new window...
    echo.
    
    if exist "!BACKEND_PATH!\server.js" (
        cd /d "!BACKEND_PATH!"
        start cmd /k npm start
        
        echo Waiting 3 seconds for server to initialize...
        timeout /t 3 /nobreak
        
        echo Opening Dashboard in Browser...
        start "" http://localhost:8080
        
        echo Dashboard opened successfully!
        echo.
        echo Tip: Keep backend window open while using dashboard
        echo.
    ) else (
        echo Error: Server not found at !BACKEND_PATH!\server.js
        echo Please ensure backend files are in place.
        echo.
    )
) else if "%choice%"=="2" (
    echo.
    echo Starting Backend Server...
    echo.
    echo Dashboard will be available at: http://localhost:8080
    echo Keep this window open...
    echo.
    
    if exist "!BACKEND_PATH!\server.js" (
        cd /d "!BACKEND_PATH!"
        call npm start
    ) else (
        echo Error: Server not found at !BACKEND_PATH!\server.js
    )
    echo.
) else (
    echo Invalid choice. Please enter 1 or 2.
    echo.
)

echo ========================================
echo.

pause
