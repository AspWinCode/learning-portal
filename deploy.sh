#!/usr/bin/env bash
set -euo pipefail

# Simple deployment script for Docker-based production.
# Usage (on server):
#   cd /root/learning-portal
#   ./deploy.sh
#
# Берёт тот же flock, что и cron-автодеплой (deploy/autodeploy.sh), чтобы два
# `docker compose up` не пересеклись и не оставили контейнеры с префиксом-хэшем
# (<id>_learning-portal-backend-1).

LOCK="/tmp/learning-portal-deploy.lock"
exec 200>"$LOCK"
echo "[deploy] Waiting for deploy lock ($LOCK)..."
flock -w 600 200

echo "[deploy] Checking out main and pulling latest code..."
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[deploy] Bringing up db/redis and running migrations..."
docker compose up -d --build db redis
docker compose run --rm migrator

echo "[deploy] Building and restarting Docker services..."
docker compose up -d --build --remove-orphans

echo "[deploy] Normalising container names after recreate..."
for svc in backend app_worker app_scheduler app_delivery_worker web; do
  want="learning-portal-${svc}-1"
  cid=$(docker ps -aq --filter "label=com.docker.compose.project=learning-portal" \
                      --filter "label=com.docker.compose.service=${svc}" | head -n1)
  [ -z "$cid" ] && continue
  have=$(docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##')
  if [ -n "$have" ] && [ "$have" != "$want" ]; then
    echo "[deploy]   rename $have -> $want"
    docker rm -f "$want" 2>/dev/null || true
    docker rename "$have" "$want"
  fi
done

docker compose ps
echo "[deploy] Done."
