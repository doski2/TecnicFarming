@echo off
chcp 65001 >nul 2>&1
REM Detiene el backend en el puerto 8080

set PORT=8080
set FOUND=0

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  echo Cerrando proceso PID %%a en puerto %PORT%...
  taskkill /PID %%a /F >nul 2>&1
  if not errorlevel 1 set FOUND=1
)

if "%FOUND%"=="1" (
  echo [OK] Backend detenido. Puedes ejecutar start.bat
) else (
  echo No hay ningun proceso escuchando en el puerto %PORT%.
)

pause
