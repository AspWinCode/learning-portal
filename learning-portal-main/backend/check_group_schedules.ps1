# Диагностика: таблица group_schedules и миграции
# Запускать из папки learning-portal-main\learning-portal-main\backend с активированным venv и .env

$ErrorActionPreference = "Stop"
$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    Write-Host "DATABASE_URL не задан. Задайте в .env или: `$env:DATABASE_URL = 'postgresql://user:pass@localhost:5432/learning_portal'" -ForegroundColor Yellow
    exit 1
}
# Показать URL без пароля
$masked = $dbUrl -replace '(:[^:@]+)(@)', ':****$2'
Write-Host "DATABASE_URL (маскировано): $masked"
Write-Host ""

Write-Host "=== alembic current ===" -ForegroundColor Cyan
try {
    alembic current
} catch {
    Write-Host "Ошибка: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== alembic history (последние 5) ===" -ForegroundColor Cyan
alembic history 2>$null | Select-Object -First 15
Write-Host ""

Write-Host "Если текущая ревизия не 0025 или 0026, выполните: alembic upgrade head" -ForegroundColor Yellow
