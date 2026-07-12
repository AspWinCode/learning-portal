#!/usr/bin/env bash
# Daily PostgreSQL backup — runs on the server via cron.
# Saves a gzip-compressed pg_dump to /root/backups/ and purges files older than KEEP_DAYS.
set -euo pipefail

BACKUP_DIR="/root/backups"
COMPOSE_DIR="/root/learning-portal"
KEEP_DAYS=30
DATE=$(date +%Y-%m-%d_%H%M)
FILE="${BACKUP_DIR}/${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] Starting backup → ${FILE}"

docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T db \
    pg_dump -U learning_user learning_portal \
    | gzip > "${FILE}"

SIZE=$(du -sh "${FILE}" | cut -f1)
echo "[$(date '+%F %T')] Done: ${DATE}.sql.gz (${SIZE})"

# Remove backups older than KEEP_DAYS days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${KEEP_DAYS}" -delete
