#!/usr/bin/env bash
# Run once on the server to install the daily backup cron job.
set -euo pipefail

SCRIPT="/root/learning-portal/deploy/backup/backup.sh"
LOG="/var/log/db_backup.log"

chmod +x "$SCRIPT"

# Replace existing entry (if any) and add fresh one — runs at 03:00 every day
(crontab -l 2>/dev/null | grep -v "backup.sh"; \
 echo "0 3 * * * $SCRIPT >> $LOG 2>&1") | crontab -

echo "Cron job installed:"
crontab -l | grep backup
echo ""
echo "Backups will be saved to /root/backups/ and log to $LOG"
echo "To run a backup right now: bash $SCRIPT"
