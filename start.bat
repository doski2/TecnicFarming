@echo off
chcp 65001 >nul 2>&1
REM Script Inicio - Dashboard FS25

echo.
echo ============================================================
echo   Iniciando Dashboard FS25
echo ============================================================
echo.

cd /d "%~dp0Dashboard\backend"

if not exist .env (
    echo [AVISO] No se encontro archivo .env
    echo Creando desde .env.example...
    if exist .env.example (
        copy .env.example .env >nul
        echo [OK] .env creado
    ) else (
        echo [ERROR] .env.example no encontrado
        pause
        exit /b 1
    )
)

REM Si hay un backend anterior en 8080, cerrarlo (evita EADDRINUSE y pipe duplicada)
set STOPPED=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr LISTENING') do (
    echo [INFO] Cerrando backend anterior en puerto 8080 ^(PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
    set STOPPED=1
)
if "%STOPPED%"=="1" (
    echo [INFO] Esperando liberacion del puerto...
    timeout /t 2 /nobreak >nul
)

echo.
echo Iniciando servidor backend...
echo.

start "FS25 Dashboard Backend" cmd /k npm start

echo Esperando que el servidor arranque...
timeout /t 3 /nobreak >nul

echo Abriendo dashboard en el navegador...
start "" http://localhost:8080

echo.
echo [OK] Dashboard: http://localhost:8080
echo [OK] Manten la ventana del backend abierta
echo [OK] FS25 real: activa SHTelemetry en el juego
echo [OK] Pruebas sin juego: start_with_mock.bat
echo.
echo ============================================================
echo.

pause
