from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.background_tasks import (
    task_absence_link_tasks,
    task_communication_queue,
    task_owner_workspace_max_sync,
    task_owner_workspace_notification_email_dispatch,
    task_owner_workspace_notification_web_push_dispatch,
    task_parent_weekly_digests,
    task_payment_overdue_tasks,
    task_payment_reminder_notifications,
    task_scheduled_messages,
    task_student_class_autopromo,
    task_tochka_auto_import,
)
from app.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


def _enqueue_fast_cycle_jobs() -> None:
    task_scheduled_messages.send()
    task_communication_queue.send()
    task_owner_workspace_notification_email_dispatch.send()
    task_owner_workspace_notification_web_push_dispatch.send()


def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.add_job(lambda: task_tochka_auto_import.send(), "interval", minutes=10, id="tochka_auto_import", max_instances=1)
    scheduler.add_job(lambda: task_payment_overdue_tasks.send(), "interval", days=1, id="payment_overdue_tasks", max_instances=1)
    scheduler.add_job(lambda: task_payment_reminder_notifications.send(), "cron", hour=9, minute=0, id="payment_reminder_notifications", max_instances=1)
    scheduler.add_job(lambda: task_parent_weekly_digests.send(), "interval", minutes=15, id="parent_weekly_digests", max_instances=1)
    scheduler.add_job(lambda: task_scheduled_messages.send(), "interval", minutes=1, id="scheduled_messages", max_instances=1)
    scheduler.add_job(lambda: task_communication_queue.send(), "interval", minutes=1, id="communication_queue", max_instances=1)
    scheduler.add_job(lambda: task_owner_workspace_max_sync.send(), "interval", minutes=30, id="owner_workspace_max_sync", max_instances=1)
    scheduler.add_job(lambda: task_owner_workspace_notification_email_dispatch.send(), "interval", minutes=1, id="owner_workspace_notification_email_dispatch", max_instances=1)
    scheduler.add_job(lambda: task_owner_workspace_notification_web_push_dispatch.send(), "interval", minutes=1, id="owner_workspace_notification_web_push_dispatch", max_instances=1)
    scheduler.add_job(lambda: task_student_class_autopromo.send(), "cron", month=9, day=1, hour=3, id="student_class_autopromo", max_instances=1)
    scheduler.add_job(lambda: task_absence_link_tasks.send(), "cron", hour=8, minute=0, id="absence_link_tasks", max_instances=1)
    logger.info("Starting background scheduler")
    _enqueue_fast_cycle_jobs()
    scheduler.start()


if __name__ == "__main__":
    main()
