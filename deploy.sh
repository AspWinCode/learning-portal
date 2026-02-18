#!/usr/bin/env bash
set -euo pipefail

# Simple deployment script for Docker-based production.
# Usage (on server):
#   cd /root/learning-portal
#   ./deploy.sh

echo "[deploy] Checking out main and pulling latest code..."
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[deploy] Building and restarting Docker services..."
docker compose up -d --build

echo "[deploy] Running database migrations..."
docker compose exec backend alembic upgrade head

echo "[deploy] Done."

