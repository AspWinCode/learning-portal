# Ставит пароль learning_user = localdev123 (как в .env)
# Запуск: .\run_fix_password.ps1
$pgPass = Read-Host "Enter postgres user password" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPass)
$plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
$env:PGPASSWORD = $plainPass
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -f "$scriptDir\fix_learning_user_password.sql"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Write-Host 'Done. Next run: .\venv\Scripts\Activate.ps1; alembic upgrade head; python create_admin_fixed.py'
