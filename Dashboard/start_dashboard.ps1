#!/usr/bin/env powershell

# Quick Launcher for FS25 Telemetry Dashboard
# Opens dashboard immediately in demo mode or connects to backend

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  FS25 Telemetry Dashboard Launcher" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

# Paths
$backendPath = "c:\Users\doski\TecnicFarming\Dashboard\backend"

# Menu
Write-Host "Choose mode:" -ForegroundColor Yellow
Write-Host "[1] Backend Mode (real data from FS25)" -ForegroundColor Cyan
Write-Host "[2] Open Backend Server Only" -ForegroundColor Blue
Write-Host ""

$choice = Read-Host "Enter choice (1-2)"

switch($choice) {
    "1" {
        Write-Host "`n▶ Starting Backend Server..." -ForegroundColor Green
        Write-Host "  Location: $backendPath`n" -ForegroundColor Gray
        
        if (Test-Path "$backendPath\server.js") {
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm start"
            
            Write-Host "✅ Backend starting in new window..." -ForegroundColor Green
            Write-Host "⏳ Waiting 3 seconds for server to initialize..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
            
            Write-Host "▶ Opening Dashboard in Browser..." -ForegroundColor Green
            Start-Process "http://localhost:8080"
            
            Write-Host "✅ Dashboard opened!" -ForegroundColor Green
            Write-Host "💡 Tip: Keep backend window open while using dashboard`n" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Server not found at: $backendPath\server.js" -ForegroundColor Red
            Write-Host "   Please ensure backend files are in place.`n" -ForegroundColor Red
        }
    }
    
    "2" {
        Write-Host "`n▶ Starting Backend Server..." -ForegroundColor Green
        Write-Host "  Location: $backendPath`n" -ForegroundColor Gray
        
        if (Test-Path "$backendPath\server.js") {
            Write-Host "Dashboard will be available at: http://localhost:8080" -ForegroundColor Cyan
            Write-Host "`n"
            
            Set-Location $backendPath
            npm start
        } else {
            Write-Host "❌ Server not found at: $backendPath\server.js" -ForegroundColor Red
        }
    }
    
    default {
        Write-Host "`n❌ Invalid choice. Please enter 1 or 2.`n" -ForegroundColor Red
    }
}

Write-Host "========================================`n" -ForegroundColor Cyan
