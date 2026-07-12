"""Owner workspace notifications: in-app rows plus queued email delivery."""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional, Set

from sqlalchemy import func as sqla_func
from sqlalchemy.orm import Session

from app.models import (
    AppSetting,
    OwnerWorkspaceMessage,
    OwnerWorkspaceNotification,
    OwnerWorkspaceProject,
    OwnerWorkspaceProjectContact,
    OwnerWorkspaceProjectParticipant,
    OwnerWorkspaceTask,
    OwnerWorkspaceTaskWatcher,
    OwnerWorkspaceWebPushSubscription,
    User,
)
from app.services.email_sender import is_email_configured, send_email
from app.services.owner_workspace_access import user_can_see_owner_workspace_task
from app.services.owner_workspace_preferences import get_preferences_for_user

KIND_TASK_OVERDUE = "task_overdue"
KIND_TASK_DUE_SOON = "task_due_soon"
KIND_TASK_ASSIGNED = "task_assigned"
KIND_TASK_COMMENT = "task_comment"
KIND_TASK_UPDATED = "task_updated"
KIND_CONTACT_INCOMING_MESSAGE = "contact_incoming_message"
KIND_TASK_MENTION = "task_mention"
KIND_TASK_DAILY_DIGEST = "task_daily_digest"

ACTIVE_STATUSES = ("new", "in_progress", "waiting")
EMAIL_STATUS_DISABLED = "disabled"
EMAIL_STATUS_PENDING = "pending"
EMAIL_STATUS_SENT = "sent"
EMAIL_STATUS_FAILED = "failed"
MAX_EMAIL_ATTEMPTS = 5
WEB_PUSH_STATUS_DISABLED = "disabled"
WEB_PUSH_STATUS_PENDING = "pending"
WEB_PUSH_STATUS_SENT = "sent"
WEB_PUSH_STATUS_FAILED = "failed"
MAX_WEB_PUSH_ATTEMPTS = 5

RE_MENTION_USER_ID = re.compile(r"@(\d{1,12})\b")
RE_MENTION_EMAIL = re.compile(r"@([A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")

KIND_TO_PREFERENCE_KEY = {
    KIND_TASK_OVERDUE: "notify_task_overdue",
    KIND_TASK_DUE_SOON: "notify_task_due_soon",
    KIND_TASK_ASSIGNED: "notify_task_assigned",
    KIND_TASK_COMMENT: "notify_task_comment",
    KIND_TASK_UPDATED: "notify_task_updated",
    KIND_CONTACT_INCOMING_MESSAGE: "notify_contact_incoming_message",
    KIND_TASK_MENTION: "notify_task_mention",
    KIND_TASK_DAILY_DIGEST: "notify_task_daily_digest",
}
NOTIFICATION_CONFIG_KEY = "owner_workspace_notification_config"
DEFAULT_NOTIFICATION_CONFIG = {
    "task_overdue": {"label": "Просрочка", "enabled": True},
    "task_due_soon": {"label": "Скоро дедлайн", "enabled": True},
    "task_assigned": {"label": "Назначение", "enabled": True},
    "task_comment": {"label": "Комментарий", "enabled": True},
    "task_updated": {"label": "Обновление задачи", "enabled": True},
    "contact_incoming_message": {"label": "Сообщение по контакту", "enabled": True},
    "task_mention": {"label": "Упоминание", "enabled": True},
    "task_daily_digest": {"label": "Дайджест задач на сегодня (утром)", "enabled": True},
}


def get_owner_workspace_notification_config(db: Session) -> dict[str, dict]:
    setting = db.query(AppSetting).filter(AppSetting.key == NOTIFICATION_CONFIG_KEY).first()
    if not setting or not (setting.value or "").strip():
        return DEFAULT_NOTIFICATION_CONFIG
    try:
        import json

        raw = json.loads(setting.value)
    except Exception:
        return DEFAULT_NOTIFICATION_CONFIG
    items = raw.get("items") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return DEFAULT_NOTIFICATION_CONFIG
    config = dict(DEFAULT_NOTIFICATION_CONFIG)
    for item in items:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if key not in config:
            continue
        label = str(item.get("label") or config[key]["label"]).strip() or config[key]["label"]
        enabled = bool(item.get("enabled", config[key]["enabled"]))
        config[key] = {"label": label[:120], "enabled": enabled}
    return config


def notification_kind_enabled(db: Session, kind: str) -> bool:
    return bool(get_owner_workspace_notification_config(db).get(kind, {}).get("enabled", True))


def notifications_enabled_for_user(db: Session, user_id: int, kind: str) -> bool:
    if not notification_kind_enabled(db, kind):
        return False
    pref_key = KIND_TO_PREFERENCE_KEY.get(kind)
    if not pref_key:
        return True
    prefs = get_preferences_for_user(db, user_id)
    return bool(prefs.get(pref_key, True))


def email_delivery_enabled_for_user(db: Session, user_id: int, kind: str) -> bool:
    if not is_email_configured():
        return False
    if not notification_kind_enabled(db, kind):
        return False
    prefs = get_preferences_for_user(db, user_id)
    if not bool(prefs.get("notify_email_enabled", False)):
        return False
    pref_key = KIND_TO_PREFERENCE_KEY.get(kind)
    if pref_key and not bool(prefs.get(pref_key, True)):
        return False
    user = db.query(User).filter(User.id == user_id).first()
    return bool(user and getattr(user, "email", None))


def get_web_push_public_key() -> str | None:
    value = (os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY") or "").strip()
    return value or None


def is_web_push_configured() -> bool:
    public_key = (os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY") or "").strip()
    private_key = (os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY") or "").strip()
    subject = (os.getenv("WEB_PUSH_VAPID_SUBJECT") or "").strip()
    return bool(public_key and private_key and subject)


def web_push_delivery_enabled_for_user(db: Session, user_id: int, kind: str) -> bool:
    if not is_web_push_configured():
        return False
    if not notification_kind_enabled(db, kind):
        return False
    prefs = get_preferences_for_user(db, user_id)
    if not bool(prefs.get("notify_web_push_enabled", False)):
        return False
    pref_key = KIND_TO_PREFERENCE_KEY.get(kind)
    if pref_key and not bool(prefs.get(pref_key, True)):
        return False
    has_subscription = (
        db.query(OwnerWorkspaceWebPushSubscription.id)
        .filter(OwnerWorkspaceWebPushSubscription.user_id == user_id)
        .first()
    )
    return bool(has_subscription)


def queue_notification(
    db: Session,
    *,
    user_id: int,
    kind: str,
    title: str,
    body: str | None,
    dedupe_key: str,
    task_id: int | None = None,
    contact_id: int | None = None,
) -> OwnerWorkspaceNotification:
    notification = OwnerWorkspaceNotification(
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        task_id=task_id,
        contact_id=contact_id,
        dedupe_key=dedupe_key,
        email_delivery_status=(
            EMAIL_STATUS_PENDING
            if email_delivery_enabled_for_user(db, user_id, kind)
            else EMAIL_STATUS_DISABLED
        ),
        email_attempts=0,
        email_last_error=None,
        email_last_attempt_at=None,
        email_sent_at=None,
        web_push_delivery_status=(
            WEB_PUSH_STATUS_PENDING
            if web_push_delivery_enabled_for_user(db, user_id, kind)
            else WEB_PUSH_STATUS_DISABLED
        ),
        web_push_attempts=0,
        web_push_last_error=None,
        web_push_last_attempt_at=None,
        web_push_sent_at=None,
    )
    db.add(notification)
    return notification


def build_notification_target_path(notification: OwnerWorkspaceNotification) -> str:
    if notification.task_id:
        return f"/owner-workspace/tasks/{notification.task_id}"
    if notification.contact_id:
        return f"/owner-workspace/counterparties/{notification.contact_id}"
    return "/owner-workspace/notifications"


def _send_web_push(subscription: OwnerWorkspaceWebPushSubscription, payload: dict) -> None:
    from pywebpush import webpush

    private_key = (os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY") or "").strip()
    subject = (os.getenv("WEB_PUSH_VAPID_SUBJECT") or "").strip()
    webpush(
        subscription_info={
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        },
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=private_key,
        vapid_claims={"sub": subject},
    )


def dispatch_pending_owner_workspace_notification_web_push(db: Session, limit: int = 100) -> int:
    pending_rows = (
        db.query(OwnerWorkspaceNotification)
        .filter(
            OwnerWorkspaceNotification.web_push_delivery_status.in_(
                (WEB_PUSH_STATUS_PENDING, WEB_PUSH_STATUS_FAILED)
            ),
            OwnerWorkspaceNotification.web_push_attempts < MAX_WEB_PUSH_ATTEMPTS,
        )
        .order_by(OwnerWorkspaceNotification.created_at.asc(), OwnerWorkspaceNotification.id.asc())
        .limit(limit)
        .all()
    )
    if not pending_rows:
        return 0

    sent_count = 0
    now = datetime.now(timezone.utc)

    for notification in pending_rows:
        notification.web_push_last_attempt_at = now
        notification.web_push_attempts = int(notification.web_push_attempts or 0) + 1

        if not web_push_delivery_enabled_for_user(db, notification.user_id, notification.kind):
            notification.web_push_delivery_status = WEB_PUSH_STATUS_DISABLED
            notification.web_push_last_error = None
            notification.web_push_sent_at = None
            continue

        subscriptions = (
            db.query(OwnerWorkspaceWebPushSubscription)
            .filter(OwnerWorkspaceWebPushSubscription.user_id == notification.user_id)
            .all()
        )
        if not subscriptions:
            notification.web_push_delivery_status = WEB_PUSH_STATUS_DISABLED
            notification.web_push_last_error = None
            notification.web_push_sent_at = None
            continue

        payload = {
            "title": notification.title,
            "body": notification.body or notification.title,
            "kind": notification.kind,
            "task_id": notification.task_id,
            "contact_id": notification.contact_id,
            "notification_id": notification.id,
            "url": build_notification_target_path(notification),
        }

        delivered = False
        last_error: str | None = None
        stale_ids: list[int] = []

        for subscription in subscriptions:
            try:
                _send_web_push(subscription, payload)
                delivered = True
            except Exception as exc:
                last_error = str(exc)[:500]
                response = getattr(exc, "response", None)
                status_code = getattr(response, "status_code", None)
                if status_code in (404, 410):
                    stale_ids.append(int(subscription.id))

        if stale_ids:
            (
                db.query(OwnerWorkspaceWebPushSubscription)
                .filter(OwnerWorkspaceWebPushSubscription.id.in_(stale_ids))
                .delete(synchronize_session=False)
            )

        if delivered:
            notification.web_push_delivery_status = WEB_PUSH_STATUS_SENT
            notification.web_push_sent_at = now
            notification.web_push_last_error = None
            sent_count += 1
        else:
            notification.web_push_delivery_status = WEB_PUSH_STATUS_FAILED
            notification.web_push_last_error = last_error or "web push delivery failed"

    db.commit()
    return sent_count


def overdue_dedupe_key(task_id: int) -> str:
    return f"ow:overdue:{task_id}"


def due_soon_dedupe_key(task_id: int, deadline_at: datetime) -> str:
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
    for match in RE_MENTION_USER_ID.finditer(text):
        try:
            ids.add(int(match.group(1)))
        except ValueError:
            continue
    for match in RE_MENTION_EMAIL.finditer(text):
        email = match.group(1).strip().lower()
        user = db.query(User).filter(sqla_func.lower(User.email) == email).first()
        if user:
            ids.add(int(user.id))
    return ids


def notify_task_comment_mentions(
    db: Session,
    task: OwnerWorkspaceTask,
    *,
    comment_id: int,
    author_id: int,
    comment_text: str,
) -> None:
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
    task_title = (task.title or f"#{task.id}")[:120]
    body = f'"{task_title}" · {author_name}: {preview}'[:900]
    for user_id in mentioned:
        if user_id == author_id:
            continue
        if not user_can_see_owner_workspace_task(db, user_id, task):
            continue
        if user_id in recipients_comment:
            continue
        if not notifications_enabled_for_user(db, user_id, KIND_TASK_MENTION):
            continue
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_TASK_MENTION,
            title="Упоминание в комментарии",
            body=body,
            task_id=task.id,
            dedupe_key=mention_dedupe_key(comment_id, user_id),
        )


def task_updated_dedupe_key(task_id: int, actor_id: int, ts_ms: int, recipient_id: int) -> str:
    return f"ow:task_upd:{task_id}:{actor_id}:{ts_ms}:u{recipient_id}"


def collect_user_ids_for_contact_notifications(db: Session, contact_id: int) -> Set[int]:
    ids: Set[int] = set()
    for (assignee_id,) in (
        db.query(OwnerWorkspaceTask.assignee_id)
        .filter(
            OwnerWorkspaceTask.contact_id == contact_id,
            OwnerWorkspaceTask.assignee_id.isnot(None),
            OwnerWorkspaceTask.status.in_(ACTIVE_STATUSES),
        )
        .distinct()
        .all()
    ):
        ids.add(int(assignee_id))
    project_ids = [
        row[0]
        for row in db.query(OwnerWorkspaceProjectContact.project_id)
        .filter(OwnerWorkspaceProjectContact.contact_id == contact_id)
        .all()
    ]
    for project_id in project_ids:
        project = db.query(OwnerWorkspaceProject).filter(OwnerWorkspaceProject.id == project_id).first()
        if project and project.owner_id:
            ids.add(int(project.owner_id))
        for (user_id,) in (
            db.query(OwnerWorkspaceProjectParticipant.user_id)
            .filter(OwnerWorkspaceProjectParticipant.project_id == project_id)
            .all()
        ):
            ids.add(int(user_id))
    return ids


def notify_task_updated(
    db: Session,
    task: OwnerWorkspaceTask,
    *,
    actor_id: int,
    changed_fields: dict,
) -> None:
    if not changed_fields:
        return
    if set(changed_fields.keys()) <= {"assignee_id"}:
        return
    actor = db.query(User).filter(User.id == actor_id).first()
    actor_name = (actor.full_name or actor.email or str(actor_id)) if actor else str(actor_id)
    keys = sorted(changed_fields.keys())
    preview = ", ".join(keys[:8])
    if len(keys) > 8:
        preview += "..."
    task_title = (task.title or f"#{task.id}")[:200]
    body = f'"{task_title}" · {actor_name}: {preview}'[:900]
    recipients: Set[int] = set()
    if task.assignee_id and int(task.assignee_id) != actor_id:
        recipients.add(int(task.assignee_id))
    if task.creator_id and int(task.creator_id) != actor_id:
        recipients.add(int(task.creator_id))
    # Наблюдатели
    for w in db.query(OwnerWorkspaceTaskWatcher).filter(OwnerWorkspaceTaskWatcher.task_id == task.id).all():
        if w.user_id != actor_id:
            recipients.add(w.user_id)
    if not recipients:
        return
    ts_ms = int(time.time() * 1000)
    contact_id = int(task.contact_id) if task.contact_id is not None else None
    for user_id in recipients:
        if not notifications_enabled_for_user(db, user_id, KIND_TASK_UPDATED):
            continue
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_TASK_UPDATED,
            title="Задача обновлена",
            body=body,
            task_id=task.id,
            contact_id=contact_id,
            dedupe_key=task_updated_dedupe_key(task.id, actor_id, ts_ms, user_id),
        )


def notify_incoming_contact_message(
    db: Session,
    message: OwnerWorkspaceMessage,
    *,
    contact_name: str,
    exclude_user_ids: Optional[Iterable[int]] = None,
) -> None:
    excluded = {int(value) for value in (exclude_user_ids or ()) if value is not None}
    recipients = collect_user_ids_for_contact_notifications(db, message.contact_id) - excluded
    preview = (message.text or "").strip()[:300]
    body = (f"{contact_name}: {preview}" if preview else contact_name)[:900]
    for user_id in recipients:
        if not notifications_enabled_for_user(db, user_id, KIND_CONTACT_INCOMING_MESSAGE):
            continue
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_CONTACT_INCOMING_MESSAGE,
            title="Новое сообщение по контакту",
            body=body,
            contact_id=message.contact_id,
            dedupe_key=f"ow:msg_in:{message.id}:u{user_id}",
        )


def notify_task_assigned(
    db: Session,
    task: OwnerWorkspaceTask,
    new_assignee_id: Optional[int],
    actor_id: int,
) -> None:
    if new_assignee_id is None or new_assignee_id == actor_id:
        return
    if not notifications_enabled_for_user(db, new_assignee_id, KIND_TASK_ASSIGNED):
        return
    ts_ms = int(time.time() * 1000)
    body = (task.title or f"Задача #{task.id}")[:500]
    queue_notification(
        db,
        user_id=new_assignee_id,
        kind=KIND_TASK_ASSIGNED,
        title="Вам назначена задача",
        body=body,
        task_id=task.id,
        dedupe_key=assign_dedupe_key(task.id, new_assignee_id, ts_ms),
    )


def notify_task_comment_added(
    db: Session,
    task: OwnerWorkspaceTask,
    *,
    comment_id: int,
    author_id: int,
    comment_text: str,
) -> None:
    author = db.query(User).filter(User.id == author_id).first()
    author_name = (author.full_name or author.email or str(author_id)) if author else f"#{author_id}"
    preview = (comment_text or "").strip()[:400]
    line = f"{author_name}: {preview}" if preview else author_name
    task_title = (task.title or f"#{task.id}")[:120]
    body = f'"{task_title}" · {line}'[:900]

    recipients: Set[int] = set()
    if task.assignee_id and task.assignee_id != author_id:
        recipients.add(task.assignee_id)
    if task.creator_id and task.creator_id != author_id:
        recipients.add(task.creator_id)
    # Наблюдатели
    for w in db.query(OwnerWorkspaceTaskWatcher).filter(OwnerWorkspaceTaskWatcher.task_id == task.id).all():
        if w.user_id != author_id:
            recipients.add(w.user_id)

    for user_id in recipients:
        if not notifications_enabled_for_user(db, user_id, KIND_TASK_COMMENT):
            continue
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_TASK_COMMENT,
            title="Комментарий к задаче",
            body=body,
            task_id=task.id,
            dedupe_key=comment_dedupe_key(comment_id, user_id),
        )


def refresh_deadline_notifications_for_user(
    db: Session,
    user_id: int,
    *,
    due_soon_hours: int = 24,
) -> int:
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
    for task in overdue_tasks:
        dedupe_key = overdue_dedupe_key(task.id)
        if _exists(dedupe_key):
            continue
        if not notifications_enabled_for_user(db, user_id, KIND_TASK_OVERDUE):
            break
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_TASK_OVERDUE,
            title="Просрочена задача",
            body=task.title[:500] if task.title else f"Задача #{task.id}",
            task_id=task.id,
            dedupe_key=dedupe_key,
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
    for task in due_soon_tasks:
        assert task.deadline_at is not None
        if not notifications_enabled_for_user(db, user_id, KIND_TASK_DUE_SOON):
            break
        dedupe_key = due_soon_dedupe_key(task.id, task.deadline_at)
        if _exists(dedupe_key):
            continue
        queue_notification(
            db,
            user_id=user_id,
            kind=KIND_TASK_DUE_SOON,
            title=f"Дедлайн в ближайшие {due_soon_hours} ч",
            body=task.title[:500] if task.title else f"Задача #{task.id}",
            task_id=task.id,
            dedupe_key=dedupe_key,
        )
        created += 1
    return created


def dispatch_pending_owner_workspace_notification_emails(db: Session, limit: int = 100) -> int:
    pending_rows = (
        db.query(OwnerWorkspaceNotification)
        .filter(
            OwnerWorkspaceNotification.email_delivery_status.in_(
                (EMAIL_STATUS_PENDING, EMAIL_STATUS_FAILED)
            ),
            OwnerWorkspaceNotification.email_attempts < MAX_EMAIL_ATTEMPTS,
        )
        .order_by(OwnerWorkspaceNotification.created_at.asc(), OwnerWorkspaceNotification.id.asc())
        .limit(limit)
        .all()
    )
    if not pending_rows:
        return 0

    sent_count = 0
    now = datetime.now(timezone.utc)

    for notification in pending_rows:
        notification.email_last_attempt_at = now
        notification.email_attempts = int(notification.email_attempts or 0) + 1

        user = db.query(User).filter(User.id == notification.user_id).first()
        if (
            not user
            or not getattr(user, "email", None)
            or not email_delivery_enabled_for_user(db, notification.user_id, notification.kind)
        ):
            notification.email_delivery_status = EMAIL_STATUS_DISABLED
            notification.email_last_error = None
            notification.email_sent_at = None
            continue

        try:
            send_email(
                to_email=user.email,
                subject=f"Owner Workspace: {notification.title}",
                body=notification.body or notification.title,
            )
            notification.email_delivery_status = EMAIL_STATUS_SENT
            notification.email_sent_at = now
            notification.email_last_error = None
            sent_count += 1
        except Exception as exc:
            notification.email_delivery_status = EMAIL_STATUS_FAILED
            notification.email_last_error = str(exc)[:500]

    db.commit()
    return sent_count
