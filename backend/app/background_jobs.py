from __future__ import annotations

import os
import logging
from datetime import date, timedelta
from typing import Callable

from app.database import SessionLocal
from app.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


def _env_enabled(name: str, default: str = "1") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")


def _run_db_job(job_name: str, fn: Callable) -> None:
    try:
        db = SessionLocal()
        try:
            fn(db)
        finally:
            db.close()
    except Exception:
        logger.exception("Background job failed: %s", job_name)


def run_tochka_auto_import() -> None:
    try:
        from app.services.tochka_client import is_configured

        if not is_configured():
            return
        account_id = (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
        if not account_id:
            return
        date_to = date.today()
        date_from = date_to - timedelta(days=14)
        db = SessionLocal()
        try:
            from app.routers.sales import do_tochka_import_and_apply

            do_tochka_import_and_apply(db, account_id, date_from, date_to, actor_user_id=None)
        finally:
            db.close()
    except Exception:
        logger.exception("Background job failed: tochka_auto_import")


def run_payment_overdue_tasks() -> None:
    from app.services.payment_overdue_tasks import create_payment_overdue_tasks

    _run_db_job("payment_overdue_tasks", create_payment_overdue_tasks)


def run_payment_reminder_notifications() -> None:
    from app.services.payment_reminder_notifications import enqueue_upcoming_payment_reminders

    _run_db_job("payment_reminder_notifications", enqueue_upcoming_payment_reminders)


def run_parent_weekly_digests() -> None:
    from app.services.parent_weekly_digest import enqueue_parent_weekly_digests

    _run_db_job("parent_weekly_digests", enqueue_parent_weekly_digests)


def run_student_class_autopromo() -> None:
    from app.services.student_class_autopromo import auto_promote_student_classes

    _run_db_job("student_class_autopromo", auto_promote_student_classes)


def run_absence_link_tasks() -> None:
    from app.services.absence_link_tasks import create_morning_link_tasks

    def _job(db) -> None:
        create_morning_link_tasks(db)
        db.commit()

    _run_db_job("absence_link_tasks", _job)


def run_scheduled_messages() -> None:
    from app.services.scheduled_messages import dispatch_scheduled_messages

    _run_db_job("scheduled_messages", dispatch_scheduled_messages)


def run_communication_queue() -> None:
    from app.services.communication_hub import CommunicationService

    def _job(db) -> None:
        CommunicationService.dispatch_pending(db, limit=100)

    _run_db_job("communication_queue", _job)


def run_owner_workspace_max_sync() -> None:
    if not _env_enabled("OWNER_WORKSPACE_AUTO_SYNC_MAX", "0"):
        return

    from app.services.owner_workspace_max_sync import sync_max_messages_into_owner_workspace

    def _job(db) -> None:
        sync_max_messages_into_owner_workspace(db, limit=400)

    _run_db_job("owner_workspace_max_sync", _job)


def run_owner_workspace_notification_email_dispatch() -> None:
    if not _env_enabled("OWNER_WORKSPACE_EMAIL_DISPATCH_ENABLED", "1"):
        return

    from app.services.owner_workspace_notifications import (
        dispatch_pending_owner_workspace_notification_emails,
    )

    def _job(db) -> None:
        sent = dispatch_pending_owner_workspace_notification_emails(db, limit=100)
        if sent:
            logger.info("Sent owner-workspace email notifications: %s", sent)

    _run_db_job("owner_workspace_notification_email_dispatch", _job)


def run_owner_workspace_notification_web_push_dispatch() -> None:
    if not _env_enabled("OWNER_WORKSPACE_WEB_PUSH_DISPATCH_ENABLED", "1"):
        return

    from app.services.owner_workspace_notifications import (
        dispatch_pending_owner_workspace_notification_web_push,
    )

    def _job(db) -> None:
        sent = dispatch_pending_owner_workspace_notification_web_push(db, limit=100)
        if sent:
            logger.info("Sent owner-workspace web push notifications: %s", sent)

    _run_db_job("owner_workspace_notification_web_push_dispatch", _job)


def run_owner_workspace_task_reminders() -> None:
    from app.services.owner_workspace_reminders import dispatch_task_reminders
    _run_db_job("owner_workspace_task_reminders", dispatch_task_reminders)
