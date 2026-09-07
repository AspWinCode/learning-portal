#!/bin/bash
# Автодеплой learning-portal по cron (каждую минуту):
#   * * * * * /root/learning-portal/deploy/autodeploy.sh
#
# Держит боевой хост в актуальном состоянии с origin/main и «самолечит»
# упавшие контейнеры. Разработан так, чтобы НИКОГДА не пересекаться с ручным
# деплоем (scripts/remote_deploy.py, deploy.sh) — все они берут один и тот же
# flock. Одновременные `docker compose up` прерывают recreate и оставляют
# контейнеры с префиксом-хэшем `<id>_learning-portal-backend-1`.

set -u

REPO_DIR="${REPO_DIR:-/root/learning-portal}"
LOCKFILE="/tmp/learning-portal-deploy.lock"
LOG="${AUTODEPLOY_LOG:-/var/log/learning-portal-autodeploy.log}"
COMPOSE_PROJECT="learning-portal"
# Долгоживущие сервисы, для которых чиним имя после сорванного recreate.
SERVICES="backend app_worker app_scheduler app_delivery_worker web"

log() { echo "$(date '+%F %T') $*" >>"$LOG"; }

# --- единый лок для cron и ручных деплоев -----------------------------------
exec 200>"$LOCKFILE"
if ! flock -n 200; then
  exit 0   # уже идёт деплой (cron или человек) — тихо выходим
fi

cd "$REPO_DIR" || { log "FATAL: no $REPO_DIR"; exit 1; }

git fetch origin main --quiet 2>>"$LOG"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

compose() { docker compose "$@" >>"$LOG" 2>&1; }

run_migrations() {
  log "migrations: alembic upgrade head"
  compose run --rm migrator
}

# --- чиним контейнеры, которым compose не вернул нормальное имя --------------
fix_renamed_containers() {
  for svc in $SERVICES; do
    want="${COMPOSE_PROJECT}-${svc}-1"
    cid=$(docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" \
                        --filter "label=com.docker.compose.service=${svc}" | head -n1)
    [ -z "$cid" ] && continue
    have=$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')
    if [ -n "$have" ] && [ "$have" != "$want" ]; then
      log "renaming stale container $have -> $want"
      docker rm -f "$want" >>"$LOG" 2>&1 || true
      docker rename "$have" "$want" >>"$LOG" 2>&1 || true
    fi
  done
}

if [ "$LOCAL" != "$REMOTE" ]; then
  log "deploying $REMOTE"
  git pull --ff-only origin main >>"$LOG" 2>&1
  compose up -d --build db redis
  run_migrations
  compose up -d --build --remove-orphans
  fix_renamed_containers
  compose ps >>"$LOG" 2>&1
  log "done $REMOTE"
else
  # Самолечение: поднять всё, что упало/в Created/Exited. Дёшево, когда всё ок.
  # Без --remove-orphans: этот путь не должен трогать одноразовый `migrator`.
  compose up -d
  fix_renamed_containers
fi
