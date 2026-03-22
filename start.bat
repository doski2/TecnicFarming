@echo off
REM ═══════════════════════════════════════════════════════
REM Script Inicio - Dashboard FS25
REM ═══════════════════════════════════════════════════════

echo.
echo ╔═══════════════════════════════════════════════════════╗
echo ║  🚀 Iniciando Dashboard FS25                         ║
echo ╚═══════════════════════════════════════════════════════╝
echo.

REM Cambiar a directorio backend
cd Dashboard\backend

REM Verificar .env
if not exist .env (
    echo ⚠️  No se encontró archivo .env
    echo.
    echo Creando desde .env.example...
    if exist .env.example (
        copy .env.example .env >nul
        echo ✓ .env creado
    ) else (
        echo ❌ Error: .env.example no encontrado
        pause
        exit /b 1
    )
)

echo.
echo Iniciando servidor backend...
echo.

REM Iniciar servidor en ventana separada
start "FS25 Dashboard Backend" cmd /k npm start

echo Esperando que el servidor arranque...
timeout /t 3 /nobreak >nul

echo Abriendo dashboard en el navegador...
start "" http://localhost:8080

echo.
echo ✓ Dashboard abierto en: http://localhost:8080
echo ✓ Mantén la ventana del backend abierta mientras usas el dashboard
echo.
echo ═══════════════════════════════════════════════════════
echo.

pause
