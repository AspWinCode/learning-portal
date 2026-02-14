# Deploy via Docker Compose (Windows)
# 1) Copy .env.example to .env and set: POSTGRES_PASSWORD, SECRET_KEY, CORS_ORIGINS, DOMAIN
# 2) Run: .\deploy.ps1

$ErrorActionPreference = "Stop"
if (-not (Test-Path ".env")) {
    Write-Host "Create .env from .env.example and set POSTGRES_PASSWORD, SECRET_KEY, CORS_ORIGINS, DOMAIN"
    if (Test-Path ".env.example") { Copy-Item ".env.example" ".env" }
    exit 1
}
docker compose up -d --build
Write-Host "Done. Check: https://your-domain or http://localhost (if DOMAIN=localhost)"
