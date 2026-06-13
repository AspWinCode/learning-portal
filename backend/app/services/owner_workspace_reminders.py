"""Сервис напоминаний о задачах Owner Workspace.

Ищет задачи с reminder_at <= now и reminder_sent=False,
отправляет уведомления исполнителю и наблюдателям, помечает как отправленные.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceTask, OwnerWorkspaceTaskWatcher
from app.services.owner_workspace_notifications import queue_notification

logger = logging.getLogger(__name__)

KIND_TASK_REMINDER = "task_reminder"


def dispatch_task_reminders(db: Session) -> int:
    """Отправляет просроченные напоминания. Возвращает количество отправленных."""
    now = datetime.now(timezone.utc)
    tasks = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.reminder_at.isnot(None),
            OwnerWorkspaceTask.reminder_at <= now,
            OwnerWorkspaceTask.reminder_sent == False,  # noqa: E712
            OwnerWorkspaceTask.status.notin_(["completed", "cancelled"]),
        )
        .all()
    )

    sent = 0
    for task in tasks:
        try:
            _send_reminder(db, task)
            task.reminder_sent = True
            sent += 1
        except Exception:
            logger.exception("Failed to send reminder for task %s", task.id)

    if sent:
        db.commit()
        logger.info("Task reminders dispatched: %d", sent)
    return sent


def _send_reminder(db: Session, task: OwnerWorkspaceTask) -> None:
    task_title = (task.title or f"#{task.id}")[:200]
    deadline_str = ""
    if task.deadline_at:
        deadline_str = f" · Дедлайн: {task.deadline_at.strftime('%d.%m %H:%M')}"
    body = f'"{task_title}"{deadline_str}'[:900]

    recipients: set[int] = set()
    if task.assignee_id:
        recipients.add(task.assignee_id)
    if task.creator_id:
        recipients.add(task.creator_id)
    # Наблюдатели
    for w in db.query(OwnerWorkspaceTaskWatcher).filter(OwnerWorkspaceTaskWatcher.task_id == task.id).all():
        recipients.add(w.user_id)

    for user_id in recipients:
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_TASK_REMINDER,
            title="⏰ Напоминание о задаче",
            body=body,
            task_id=task.id,
            dedupe_key=f"ow:reminder:{task.id}:u{user_id}",
        )
