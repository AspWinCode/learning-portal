from __future__ import annotations

from app import dramatiq_broker as _dramatiq_broker  # noqa: F401 - configure Redis broker before actors are declared.
import dramatiq

from app.background_jobs import (
    run_absence_link_tasks,
    run_communication_queue,
    run_daily_task_digest,
    run_owner_workspace_max_sync,
    run_owner_workspace_notification_email_dispatch,
    run_owner_workspace_notification_web_push_dispatch,
    run_owner_workspace_task_reminders,
    run_parent_weekly_digests,
    run_payment_overdue_tasks,
    run_payment_reminder_notifications,
    run_scheduled_messages,
    run_student_class_autopromo,
    run_tochka_auto_import,
    run_transcription,
)
from app.services.email_broadcast_service import send_broadcast as _send_broadcast


@dramatiq.actor(queue_name="periodic")
def task_tochka_auto_import() -> None:
    run_tochka_auto_import()


@dramatiq.actor(queue_name="periodic")
def task_payment_overdue_tasks() -> None:
    run_payment_overdue_tasks()


@dramatiq.actor(queue_name="periodic")
def task_payment_reminder_notifications() -> None:
    run_payment_reminder_notifications()


@dramatiq.actor(queue_name="periodic")
def task_parent_weekly_digests() -> None:
    run_parent_weekly_digests()


@dramatiq.actor(queue_name="periodic")
def task_student_class_autopromo() -> None:
    run_student_class_autopromo()


@dramatiq.actor(queue_name="periodic")
def task_absence_link_tasks() -> None:
    run_absence_link_tasks()


@dramatiq.actor(queue_name="delivery")
def task_scheduled_messages() -> None:
    run_scheduled_messages()


@dramatiq.actor(queue_name="delivery")
def task_communication_queue() -> None:
    run_communication_queue()


@dramatiq.actor(queue_name="delivery")
def task_owner_workspace_max_sync() -> None:
    run_owner_workspace_max_sync()


@dramatiq.actor(queue_name="delivery")
def task_owner_workspace_notification_email_dispatch() -> None:
    run_owner_workspace_notification_email_dispatch()


@dramatiq.actor(queue_name="delivery")
def task_owner_workspace_notification_web_push_dispatch() -> None:
    run_owner_workspace_notification_web_push_dispatch()


@dramatiq.actor(queue_name="periodic")
def task_owner_workspace_task_reminders() -> None:
    run_owner_workspace_task_reminders()


@dramatiq.actor(queue_name="periodic")
def task_daily_task_digest() -> None:
    run_daily_task_digest()


@dramatiq.actor(queue_name="delivery", max_retries=0)
def task_transcribe_audio(transcription_id: int) -> None:
    run_transcription(transcription_id)


@dramatiq.actor(queue_name="delivery", max_retries=0)
def task_send_email_broadcast(broadcast_id: int) -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        _send_broadcast(db, broadcast_id)
    finally:
        db.close()
