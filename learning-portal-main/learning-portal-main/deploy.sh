#!/bin/bash
# Deploy webhook handler script
# Place this script on your server at: /root/learning-portal/deploy.sh
# Make executable: chmod +x /root/learning-portal/deploy.sh

set -e

PROJECT_DIR="/root/learning-portal"
LOG_FILE="/var/log/learning-portal-deploy.log"

echo "$(date): Starting deployment..." >> "$LOG_FILE"

cd "$PROJECT_DIR"

# Pull latest code
echo "$(date): Pulling latest code from GitHub..." >> "$LOG_FILE"
git pull origin main 2>&1 >> "$LOG_FILE"

# Rebuild and restart containers
echo "$(date): Building and restarting containers..." >> "$LOG_FILE"
docker compose build 2>&1 >> "$LOG_FILE"
docker compose up -d 2>&1 >> "$LOG_FILE"

# Optional: Run migrations if needed
# docker compose run --rm backend python -m alembic upgrade head 2>&1 >> "$LOG_FILE"

echo "$(date): Deployment completed successfully!" >> "$LOG_FILE"

# Clean up old images
docker image prune -f 2>&1 >> "$LOG_FILE"
