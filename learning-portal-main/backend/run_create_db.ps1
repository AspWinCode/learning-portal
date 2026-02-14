# Один раз создаёт пользователя learning_user и базу learning_portal.
# Запуск: в PowerShell из папки backend выполнить: .\run_create_db.ps1

$pgPass = Read-Host "Введите пароль пользователя postgres" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPass)
$plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

$env:PGPASSWORD = $plainPass
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -v ON_ERROR_STOP=0 -f "$scriptDir\create_db_and_user.sql"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Write-Host "Готово. Если ошибок нет — выполните: .\venv\Scripts\Activate.ps1; alembic upgrade head"
Write-Host "Путь к psql может отличаться (например PostgreSQL\16). При ошибке отредактируйте путь в этом скрипте."
