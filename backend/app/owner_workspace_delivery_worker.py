import os
import traceback

from apscheduler.schedulers.blocking import BlockingScheduler

from app.database import SessionLocal


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
                print(f"[owner-workspace-worker] sent email notifications: {sent}")
        finally:
            db.close()
    except Exception:
        traceback.print_exc()


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
                print(f"[owner-workspace-worker] sent web push notifications: {sent}")
        finally:
            db.close()
    except Exception:
        traceback.print_exc()


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
    print("[owner-workspace-worker] starting delivery scheduler")
    _dispatch_owner_workspace_notification_emails()
    _dispatch_owner_workspace_notification_web_push()
    scheduler.start()


if __name__ == "__main__":
    main()
