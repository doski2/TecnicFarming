@echo off
setlocal
echo ====================================================
echo   TecnicFarming - Suite de Tests
echo ====================================================

echo [1/4] Ejecutando tests del Backend (Node.js)...
cd /d "%~dp0Dashboard\backend"
call npm test
if %errorlevel% neq 0 (
    echo [ERROR] Los tests del Backend fallaron.
    exit /b %errorlevel%
)

echo.
echo [2/4] Ejecutando tests del Frontend (Logic)...
cd /d "%~dp0"
node Tests\frontend_logic.test.js
if %errorlevel% neq 0 (
    echo [ERROR] Los tests del Frontend fallaron.
    exit /b %errorlevel%
)

echo.
echo [3/4] Ejecutando tests de telemetria (Scripts)...
node Scripts\test_telemetry.js
if %errorlevel% neq 0 (
    echo [ERROR] Los tests de telemetria fallaron.
    exit /b %errorlevel%
)

echo.
echo [4/4] Ejecutando tests de analisis de sesion (Python)...
python Scripts\test_analyze_session.py
if %errorlevel% neq 0 (
    echo [ERROR] Los tests de Python fallaron.
    exit /b %errorlevel%
)

echo.
echo ====================================================
echo   TODOS LOS TESTS PASARON CORRECTAMENTE
echo ====================================================
pause
