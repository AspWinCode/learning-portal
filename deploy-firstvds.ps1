# Deploy learning-portal to FirstVDS (80.87.201.25)
# Run in PowerShell: .\deploy-firstvds.ps1
# You will be prompted for root password.

$VPS = "root@80.87.201.25"
# One-line command for SSH (semicolons for bash)
$Commands = "cd ~/learning-portal || cd /root/learning-portal; echo '--- git pull ---'; git pull origin main; echo '--- migrations ---'; docker compose run --rm backend python -m alembic upgrade head; echo '--- build and up ---'; docker compose up -d --build; docker compose ps; echo '--- done ---'"

Write-Host "Deploying to FirstVDS (80.87.201.25)..." -ForegroundColor Cyan
Write-Host "You may be prompted for root password." -ForegroundColor Yellow
& ssh $VPS $Commands
