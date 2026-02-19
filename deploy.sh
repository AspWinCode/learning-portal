#!/usr/bin/env bash
set -euo pipefail

# Simple deployment script for Docker-based production.
# Usage (on server):
#   cd /root/learning-portal
#   ./deploy.sh                # deploy default branch (main)
#   ./deploy.sh work           # deploy specific branch

if [ -f .env ]; then
  # optional local config (e.g. DEPLOY_BRANCH)
  # shellcheck disable=SC1091
  source .env
fi

DEPLOY_BRANCH="${1:-${DEPLOY_BRANCH:-main}}"

if [ ! -f docker-compose.yml ]; then
  echo "[deploy] ERROR: docker-compose.yml not found. Run script from repo root." >&2
  exit 1
fi

echo "[deploy] Checking out ${DEPLOY_BRANCH} and pulling latest code..."
git fetch origin "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git pull --ff-only origin "${DEPLOY_BRANCH}"

CURRENT_COMMIT="$(git rev-parse --short HEAD)"
echo "[deploy] Target commit: ${CURRENT_COMMIT}"

echo "[deploy] Building and restarting Docker services..."
docker compose up -d --build

echo "[deploy] Running database migrations..."
docker compose exec backend alembic upgrade head

echo "[deploy] Done. Branch=${DEPLOY_BRANCH}, commit=${CURRENT_COMMIT}"
