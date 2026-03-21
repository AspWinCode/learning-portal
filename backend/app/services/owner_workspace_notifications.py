"""In-app уведомления owner workspace: дедлайны, назначение, комментарии."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceNotification, OwnerWorkspaceTask, User

KIND_TASK_OVERDUE = "task_overdue"
KIND_TASK_DUE_SOON = "task_due_soon"
KIND_TASK_ASSIGNED = "task_assigned"
KIND_TASK_COMMENT = "task_comment"

ACTIVE_STATUSES = ("new", "in_progress", "waiting")


def overdue_dedupe_key(task_id: int) -> str:
    return f"ow:overdue:{task_id}"


def due_soon_dedupe_key(task_id: int, deadline_at: datetime) -> str:
    """Один ключ на задачу на календарную дату дедлайна (UTC)."""
    day = deadline_at.astimezone(timezone.utc).date().isoformat()
    return f"ow:due_soon:{task_id}:{day}"


def assign_dedupe_key(task_id: int, assignee_id: int, ts_ms: int) -> str:
    return f"ow:assign:{task_id}:{assignee_id}:{ts_ms}"


def comment_dedupe_key(comment_id: int, user_id: int) -> str:
    return f"ow:comment:{comment_id}:u{user_id}"


def notify_task_assigned(
    db: Session,
    task: OwnerWorkspaceTask,
    new_assignee_id: Optional[int],
    actor_id: int,
) -> None:
    """Уведомить нового исполнителя (если он не сам себя назначил). Не делает commit."""
    if new_assignee_id is None or new_assignee_id == actor_id:
        return
    ts_ms = int(time.time() * 1000)
    dk = assign_dedupe_key(task.id, new_assignee_id, ts_ms)
    body = (task.title or f"Задача #{task.id}")[:500]
    db.add(
        OwnerWorkspaceNotification(
            user_id=new_assignee_id,
            kind=KIND_TASK_ASSIGNED,
            title="Вам назначена задача",
            body=body,
            task_id=task.id,
            dedupe_key=dk,
        )
    )


def notify_task_comment_added(
    db: Session,
    task: OwnerWorkspaceTask,
    *,
    comment_id: int,
    author_id: int,
    comment_text: str,
) -> None:
    """Уведомить исполнителя и автора задачи о новом комментарии. Не делает commit."""
    author = db.query(User).filter(User.id == author_id).first()
    author_name = (
        (author.full_name or author.email or str(author_id)) if author else f"#{author_id}"
    )
    preview = (comment_text or "").strip()[:400]
    line = f"{author_name}: {preview}" if preview else author_name
    ttitle = (task.title or f"#{task.id}")[:120]
    body = f"«{ttitle}» · {line}"[:900]

    recipients = set()
    if task.assignee_id and task.assignee_id != author_id:
        recipients.add(task.assignee_id)
    if task.creator_id and task.creator_id != author_id:
        recipients.add(task.creator_id)

    for uid in recipients:
        db.add(
            OwnerWorkspaceNotification(
                user_id=uid,
                kind=KIND_TASK_COMMENT,
                title="Комментарий к задаче",
                body=body,
                task_id=task.id,
                dedupe_key=comment_dedupe_key(comment_id, uid),
            )
        )


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
