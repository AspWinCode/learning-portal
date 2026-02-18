# Локальный запуск backend + frontend
# Запуск: правый клик -> "Выполнить с помощью PowerShell" или: powershell -ExecutionPolicy Bypass -File run_local.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Write-Host "=== Learning Portal: локальный запуск ===" -ForegroundColor Cyan

# Освобождаем порты 8000 и 3000 (опционально — раскомментируйте следующие 4 строки, если порты заняты)
# foreach ($port in 8000, 3000) {
#     $p = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
#     if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
# }

# Backend
Write-Host "`n[1/2] Запуск backend (http://127.0.0.1:8000)..." -ForegroundColor Yellow
$backendCmd = @"
Set-Location '$backend'
if (Test-Path .\venv\Scripts\Activate.ps1) { .\venv\Scripts\Activate.ps1 }
Write-Host 'Backend: Uvicorn на порту 8000. Закройте окно для остановки.' -ForegroundColor Green
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 3

# Frontend
Write-Host "[2/2] Запуск frontend (http://localhost:3000)..." -ForegroundColor Yellow
$frontendCmd = @"
Set-Location '$frontend'
Write-Host 'Frontend: npm start. Закройте окно для остановки.' -ForegroundColor Green
npm start
pause
"@
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host "`nОкна открыты: backend (8000), frontend (3000)." -ForegroundColor Green
Write-Host "Если порт занят: закройте старые терминалы с uvicorn/npm или раскомментируйте блок освобождения портов в run_local.ps1" -ForegroundColor Gray
