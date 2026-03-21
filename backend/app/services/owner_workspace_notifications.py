"""In-app уведомления owner workspace по дедлайнам (исполнитель задачи)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceNotification, OwnerWorkspaceTask

KIND_TASK_OVERDUE = "task_overdue"
KIND_TASK_DUE_SOON = "task_due_soon"

ACTIVE_STATUSES = ("new", "in_progress", "waiting")


def overdue_dedupe_key(task_id: int) -> str:
    return f"ow:overdue:{task_id}"


def due_soon_dedupe_key(task_id: int, deadline_at: datetime) -> str:
    """Один ключ на задачу на календарную дату дедлайна (UTC)."""
    day = deadline_at.astimezone(timezone.utc).date().isoformat()
    return f"ow:due_soon:{task_id}:{day}"


def refresh_deadline_notifications_for_user(
    db: Session,
    user_id: int,
    *,
    due_soon_hours: int = 24,
) -> int:
    """
    Создаёт недостающие уведомления для задач, назначенных на user_id:
    - просроченные активные;
    - дедлайн в ближайшие due_soon_hours (не просрочено).

    Дедупликация по (user_id, dedupe_key). Возвращает число новых записей.
    """
    if due_soon_hours < 1 or due_soon_hours > 336:
        due_soon_hours = 24

    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=due_soon_hours)
    created = 0

    def _exists(dedupe_key: str) -> bool:
        return (
            db.query(OwnerWorkspaceNotification)
            .filter(
                OwnerWorkspaceNotification.user_id == user_id,
                OwnerWorkspaceNotification.dedupe_key == dedupe_key,
            )
            .first()
            is not None
        )

    overdue_tasks = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.assignee_id == user_id,
            OwnerWorkspaceTask.status.in_(ACTIVE_STATUSES),
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at < now,
        )
        .all()
    )
    for t in overdue_tasks:
        dk = overdue_dedupe_key(t.id)
        if _exists(dk):
            continue
        title = "Просрочена задача"
        body = t.title[:500] if t.title else f"Задача #{t.id}"
        db.add(
            OwnerWorkspaceNotification(
                user_id=user_id,
                kind=KIND_TASK_OVERDUE,
                title=title,
                body=body,
                task_id=t.id,
                dedupe_key=dk,
            )
        )
        created += 1

    due_soon_tasks = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.assignee_id == user_id,
            OwnerWorkspaceTask.status.in_(ACTIVE_STATUSES),
            OwnerWorkspaceTask.deadline_at.isnot(None),
            OwnerWorkspaceTask.deadline_at >= now,
            OwnerWorkspaceTask.deadline_at <= horizon,
        )
        .all()
    )
    for t in due_soon_tasks:
        assert t.deadline_at is not None
        dk = due_soon_dedupe_key(t.id, t.deadline_at)
        if _exists(dk):
            continue
        title = f"Дедлайн в ближайшие {due_soon_hours} ч"
        body = t.title[:500] if t.title else f"Задача #{t.id}"
        db.add(
            OwnerWorkspaceNotification(
                user_id=user_id,
                kind=KIND_TASK_DUE_SOON,
                title=title,
                body=body,
                task_id=t.id,
                dedupe_key=dk,
            )
        )
        created += 1

    if created:
        db.commit()
    return created
