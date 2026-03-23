"""In-app уведомления owner workspace: дедлайны, назначение, комментарии, обновление задачи, входящие."""

from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional, Set

from sqlalchemy import func as sqla_func
from sqlalchemy.orm import Session

from app.models import (
    OwnerWorkspaceMessage,
    OwnerWorkspaceNotification,
    OwnerWorkspaceProject,
    OwnerWorkspaceProjectContact,
    OwnerWorkspaceProjectParticipant,
    OwnerWorkspaceTask,
    User,
)
from app.services.owner_workspace_access import user_can_see_owner_workspace_task

KIND_TASK_OVERDUE = "task_overdue"
KIND_TASK_DUE_SOON = "task_due_soon"
KIND_TASK_ASSIGNED = "task_assigned"
KIND_TASK_COMMENT = "task_comment"
KIND_TASK_UPDATED = "task_updated"
KIND_CONTACT_INCOMING_MESSAGE = "contact_incoming_message"
KIND_TASK_MENTION = "task_mention"

ACTIVE_STATUSES = ("new", "in_progress", "waiting")

# Упоминания: @123 (id пользователя) или @email@domain.ru
RE_MENTION_USER_ID = re.compile(r"@(\d{1,12})\b")
RE_MENTION_EMAIL = re.compile(r"@([A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")


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


def mention_dedupe_key(comment_id: int, recipient_id: int) -> str:
    return f"ow:mention:{comment_id}:u{recipient_id}"


def extract_mentioned_user_ids(db: Session, text: str) -> Set[int]:
    ids: Set[int] = set()
    if not text:
        return ids
    for m in RE_MENTION_USER_ID.finditer(text):
        try:
            ids.add(int(m.group(1)))
        except ValueError:
            continue
    for m in RE_MENTION_EMAIL.finditer(text):
        email = m.group(1).strip().lower()
        u = db.query(User).filter(sqla_func.lower(User.email) == email).first()
        if u:
            ids.add(int(u.id))
    return ids


def notify_task_comment_mentions(
    db: Session,
    task: OwnerWorkspaceTask,
    *,
    comment_id: int,
    author_id: int,
    comment_text: str,
) -> None:
    """
    Уведомить упомянутых в комментарии (не дублируем исполнителя/автора, им уже уходит task_comment).
    Не делает commit.
    """
    mentioned = extract_mentioned_user_ids(db, comment_text or "")
    if not mentioned:
        return
    recipients_comment: Set[int] = set()
    if task.assignee_id and task.assignee_id != author_id:
        recipients_comment.add(int(task.assignee_id))
    if task.creator_id and task.creator_id != author_id:
        recipients_comment.add(int(task.creator_id))
    author = db.query(User).filter(User.id == author_id).first()
    author_name = (author.full_name or author.email or str(author_id)) if author else str(author_id)
    preview = (comment_text or "").strip()[:400]
    ttitle = (task.title or f"#{task.id}")[:120]
    for uid in mentioned:
        if uid == author_id:
            continue
        if not user_can_see_owner_workspace_task(db, uid, task):
            continue
        if uid in recipients_comment:
            continue
        body = f"«{ttitle}» · {author_name}: {preview}"[:900]
        db.add(
            OwnerWorkspaceNotification(
                user_id=uid,
                kind=KIND_TASK_MENTION,
                title="Упоминание в комментарии",
                body=body,
                task_id=task.id,
                dedupe_key=mention_dedupe_key(comment_id, uid),
            )
        )


def task_updated_dedupe_key(task_id: int, actor_id: int, ts_ms: int, recipient_id: int) -> str:
    return f"ow:task_upd:{task_id}:{actor_id}:{ts_ms}:u{recipient_id}"


def collect_user_ids_for_contact_notifications(db: Session, contact_id: int) -> Set[int]:
    """Исполнители активных задач по контакту + владельцы и участники связанных проектов."""
    ids: Set[int] = set()
    for (aid,) in (
        db.query(OwnerWorkspaceTask.assignee_id)
        .filter(
            OwnerWorkspaceTask.contact_id == contact_id,
            OwnerWorkspaceTask.assignee_id.isnot(None),
            OwnerWorkspaceTask.status.in_(ACTIVE_STATUSES),
        )
        .distinct()
        .all()
    ):
        ids.add(int(aid))
    proj_ids = [
        r[0]
        for r in db.query(OwnerWorkspaceProjectContact.project_id)
        .filter(OwnerWorkspaceProjectContact.contact_id == contact_id)
        .all()
    ]
    for pid in proj_ids:
        p = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == pid).first()
        if p and p.owner_id:
            ids.add(int(p.owner_id))
        for (uid,) in (
            db.query(OwnerWorkspaceProjectParticipant.user_id)
            .filter(OwnerWorkspaceProjectParticipant.project_id == pid)
            .all()
        ):
            ids.add(int(uid))
    return ids


def notify_task_updated(
    db: Session,
    task: OwnerWorkspaceTask,
    *,
    actor_id: int,
    changed_fields: dict,
) -> None:
    """Уведомить исполнителя и/или автора, если кто-то другой изменил поля (кроме только смены assignee)."""
    if not changed_fields:
        return
    if set(changed_fields.keys()) <= {"assignee_id"}:
        return
    actor = db.query(User).filter(User.id == actor_id).first()
    actor_name = (actor.full_name or actor.email or str(actor_id)) if actor else str(actor_id)
    keys = sorted(changed_fields.keys())
    preview = ", ".join(keys[:8])
    if len(keys) > 8:
        preview += "…"
    ttitle = (task.title or f"#{task.id}")[:200]
    body = f"«{ttitle}» · {actor_name}: {preview}"[:900]
    recipients: Set[int] = set()
    if task.assignee_id and int(task.assignee_id) != actor_id:
        recipients.add(int(task.assignee_id))
    if task.creator_id and int(task.creator_id) != actor_id:
        recipients.add(int(task.creator_id))
    if not recipients:
        return
    ts_ms = int(time.time() * 1000)
    cid = int(task.contact_id) if task.contact_id is not None else None
    for uid in recipients:
        db.add(
            OwnerWorkspaceNotification(
                user_id=uid,
                kind=KIND_TASK_UPDATED,
                title="Задача обновлена",
                body=body,
                task_id=task.id,
                contact_id=cid,
                dedupe_key=task_updated_dedupe_key(task.id, actor_id, ts_ms, uid),
            )
        )


def notify_incoming_contact_message(
    db: Session,
    message: OwnerWorkspaceMessage,
    *,
    contact_name: str,
    exclude_user_ids: Optional[Iterable[int]] = None,
) -> None:
    """Входящее сообщение: уведомить вовлечённых по контакту (кроме exclude, напр. автора записи)."""
    excluded = {int(x) for x in (exclude_user_ids or ()) if x is not None}
    recipients = collect_user_ids_for_contact_notifications(db, message.contact_id) - excluded
    preview = (message.text or "").strip()[:300]
    line = f"{contact_name}: {preview}" if preview else contact_name
    body = line[:900]
    for uid in recipients:
        db.add(
            OwnerWorkspaceNotification(
                user_id=uid,
                kind=KIND_CONTACT_INCOMING_MESSAGE,
                title="Новое сообщение по контакту",
                body=body,
                task_id=None,
                contact_id=message.contact_id,
                dedupe_key=f"ow:msg_in:{message.id}:u{uid}",
            )
        )


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
