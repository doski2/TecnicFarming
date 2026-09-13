@echo off
chcp 65001 >nul 2>&1
REM Dashboard + simulador (pruebas sin FS25)

cd /d "%~dp0"
cd Dashboard\backend

if not exist .env (
    if exist .env.example copy .env.example .env >nul
)

REM Cerrar backend anterior en 8080 (misma logica que start.bat)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr LISTENING') do (
    echo [INFO] Cerrando backend anterior PID %%a...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

start "FS25 Dashboard Backend" cmd /k npm start
timeout /t 4 /nobreak >nul
cd /d "%~dp0"
start "FS25 Mock Telemetry" cmd /k node Tests\mock_telemetry_provider.js
start "" http://localhost:8080

echo.
echo [OK] Dashboard + simulador en marcha
echo [OK] Para FS25 real: cierra el mock y usa start.bat
echo.
pause
