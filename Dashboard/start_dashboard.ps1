#!/usr/bin/env powershell
# Redirige al launcher principal (sin rutas hardcodeadas)
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& "$root\start.bat"
