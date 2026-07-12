"""Утренний дайджест задач на сегодня для Owner Workspace."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceTask, OwnerWorkspaceWebPushSubscription, User
from app.services.owner_workspace_notifications import (
    KIND_TO_PREFERENCE_KEY,
    WEB_PUSH_STATUS_DISABLED,
    WEB_PUSH_STATUS_PENDING,
    _send_web_push,
    get_owner_workspace_notification_config,
    is_web_push_configured,
)
from app.services.owner_workspace_preferences import get_preferences_for_user

logger = logging.getLogger(__name__)

KIND_TASK_DAILY_DIGEST = "task_daily_digest"
ACTIVE_STATUSES = ("new", "in_progress", "waiting")


def dispatch_daily_task_digest(db: Session) -> int:
    """Sends morning digest of today's tasks to each subscribed user. Returns count of pushes sent."""
    if not is_web_push_configured():
        return 0

    config = get_owner_workspace_notification_config(db)
    if not config.get(KIND_TASK_DAILY_DIGEST, {}).get("enabled", True):
        return 0

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)

    # Users who have at least one push subscription
    subscribed_user_ids = [
        row[0]
        for row in db.query(OwnerWorkspaceWebPushSubscription.user_id).distinct().all()
    ]
    if not subscribed_user_ids:
        return 0

    sent = 0
    for user_id in subscribed_user_ids:
        try:
            prefs = get_preferences_for_user(db, user_id)
            if not bool(prefs.get("notify_web_push_enabled", False)):
                continue
            pref_key = KIND_TO_PREFERENCE_KEY.get(KIND_TASK_DAILY_DIGEST)
            if pref_key and not bool(prefs.get(pref_key, True)):
                continue

            tasks = (
                db.query(OwnerWorkspaceTask)
                .filter(
                    OwnerWorkspaceTask.assignee_id == user_id,
                    OwnerWorkspaceTask.status.in_(ACTIVE_STATUSES),
                    OwnerWorkspaceTask.deadline_at >= today_start,
                    OwnerWorkspaceTask.deadline_at < today_end,
                )
                .order_by(OwnerWorkspaceTask.deadline_at.asc())
                .limit(10)
                .all()
            )

            if not tasks:
                continue

            titles = [t.title or f"#{t.id}" for t in tasks[:3]]
            body_parts = ", ".join(t[:60] for t in titles)
            if len(tasks) > 3:
                body_parts += f" и ещё {len(tasks) - 3}"

            payload = {
                "title": f"📋 Задач на сегодня: {len(tasks)}",
                "body": body_parts,
                "kind": KIND_TASK_DAILY_DIGEST,
                "url": "/owner-workspace/tasks",
            }

            subscriptions = (
                db.query(OwnerWorkspaceWebPushSubscription)
                .filter(OwnerWorkspaceWebPushSubscription.user_id == user_id)
                .all()
            )
            for sub in subscriptions:
                try:
                    _send_web_push(sub, payload)
                    sent += 1
                except Exception:
                    logger.exception("Failed to send daily digest push to user %s sub %s", user_id, sub.id)
        except Exception:
            logger.exception("Error in daily digest for user %s", user_id)

    logger.info("Daily task digest: sent %d push notifications", sent)
    return sent
