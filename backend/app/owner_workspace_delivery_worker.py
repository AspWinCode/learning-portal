import os
import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.database import SessionLocal
from app.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


def _env_enabled(name: str, default: str = "1") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")


def _dispatch_owner_workspace_notification_emails() -> None:
    try:
        if not _env_enabled("OWNER_WORKSPACE_EMAIL_DISPATCH_ENABLED", "1"):
            return
        from app.services.owner_workspace_notifications import (
            dispatch_pending_owner_workspace_notification_emails,
        )

        db = SessionLocal()
        try:
            sent = dispatch_pending_owner_workspace_notification_emails(db, limit=100)
            if sent:
                logger.info("Sent owner-workspace email notifications: %s", sent)
        finally:
            db.close()
    except Exception:
        logger.exception("Owner workspace email dispatch failed")


def _dispatch_owner_workspace_notification_web_push() -> None:
    try:
        if not _env_enabled("OWNER_WORKSPACE_WEB_PUSH_DISPATCH_ENABLED", "1"):
            return
        from app.services.owner_workspace_notifications import (
            dispatch_pending_owner_workspace_notification_web_push,
        )

        db = SessionLocal()
        try:
            sent = dispatch_pending_owner_workspace_notification_web_push(db, limit=100)
            if sent:
                logger.info("Sent owner-workspace web push notifications: %s", sent)
        finally:
            db.close()
    except Exception:
        logger.exception("Owner workspace web push dispatch failed")


def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.add_job(
        _dispatch_owner_workspace_notification_emails,
        "interval",
        minutes=1,
        id="owner_workspace_notification_email_dispatch",
        max_instances=1,
    )
    scheduler.add_job(
        _dispatch_owner_workspace_notification_web_push,
        "interval",
        minutes=1,
        id="owner_workspace_notification_web_push_dispatch",
        max_instances=1,
    )
    logger.info("Starting owner workspace delivery scheduler")
    _dispatch_owner_workspace_notification_emails()
    _dispatch_owner_workspace_notification_web_push()
    scheduler.start()


if __name__ == "__main__":
    main()
