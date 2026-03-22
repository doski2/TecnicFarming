@echo off
REM ═══════════════════════════════════════════════════════
REM Script de Instalación - Dashboard FS25
REM ═══════════════════════════════════════════════════════

echo.
echo ╔═══════════════════════════════════════════════════════╗
echo ║  Dashboard Telemetria - Farming Simulator 25         ║
echo ║  Script de Instalación Automática                   ║
echo ╚═══════════════════════════════════════════════════════╝
echo.

REM Verificar si Node.js está instalado
echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js no está instalado
    echo.
    echo Descargalo desde: https://nodejs.org/
    echo Luego ejecuta este script nuevamente
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js %NODE_VERSION% encontrado
echo.

REM Cambiar a directorio backend
cd Dashboard\backend

REM Instalar dependencias
echo [2/4] Instalando dependencias npm...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo ❌ Error instalando dependencias
    pause
    exit /b 1
)
echo.
echo ✓ Dependencias instaladas
echo.

REM Crear archivo .env
echo [3/4] Configurando variables de entorno...
if exist .env (
    echo ✓ .env ya existe
) else (
    if exist .env.example (
        copy .env.example .env >nul
        echo ✓ Archivo .env creado
    ) else (
        echo ⚠️  No se encontró .env.example
    )
)
echo.

REM Resumen
echo [4/4] Resumen de configuración
echo.
echo ═══════════════════════════════════════════════════════
echo  ✓ Node.js: %NODE_VERSION%
echo  ✓ npm: %npm version%
echo  ✓ Dependencias: OK
echo  ✓ Configuración: OK
echo ═══════════════════════════════════════════════════════
echo.
echo 🚀 Próximos pasos:
echo.
echo    1. Abre una terminal en: Dashboard\backend
echo    2. Ejecuta: npm start
echo    3. Abre en navegador: http://localhost:8080
echo.
echo 📖 Documentación: Docs\Setup\INSTALACION.md
echo.
pause
