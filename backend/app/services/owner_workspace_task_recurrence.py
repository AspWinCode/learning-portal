"""Automatic rollover for overdue recurring owner-workspace tasks."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceTask


OWNER_WORKSPACE_TIMEZONE = ZoneInfo("Asia/Irkutsk")


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _next_deadline(task: OwnerWorkspaceTask, base: datetime) -> datetime:
    frequency = getattr(task, "repeat_frequency", None) or "daily"
    interval = max(1, int(getattr(task, "repeat_interval", 1) or 1))
    if frequency == "weekly":
        return base + relativedelta(weeks=interval)
    if frequency == "monthly":
        return base + relativedelta(months=interval)
    return base + relativedelta(days=interval)


def _can_repeat(task: OwnerWorkspaceTask, repeat_count: int, deadline: datetime) -> bool:
    end_type = getattr(task, "repeat_end_type", None) or "never"
    if end_type == "after_count":
        maximum = getattr(task, "repeat_end_after_count", None)
        return maximum is None or repeat_count < maximum
    if end_type == "until_date":
        until = getattr(task, "repeat_end_until", None)
        return until is None or deadline <= _as_utc(until)
    return True


def _copy_checklist(checklist):
    if not checklist:
        return checklist
    return [dict(item, done=False) for item in checklist]


def rollover_overdue_recurring_tasks(db: Session) -> int:
    """Close overdue active recurring tasks and create one current instance.

    The comparison is by the academy's local calendar date, not by 24 hours.
    This makes a daily task due yesterday roll over after midnight and prevents
    a backlog of active copies when nobody manually closes it.
    """
    now = datetime.now(timezone.utc)
    today = now.astimezone(OWNER_WORKSPACE_TIMEZONE).date()
    rows = (
        db.query(OwnerWorkspaceTask)
        .filter(
            OwnerWorkspaceTask.repeat_enabled.is_(True),
            OwnerWorkspaceTask.status.in_(("new", "in_progress", "waiting")),
            OwnerWorkspaceTask.deadline_at.isnot(None),
        )
        .all()
    )
    rolled_over = 0

    for row in rows:
        deadline = _as_utc(row.deadline_at)
        if deadline.astimezone(OWNER_WORKSPACE_TIMEZONE).date() >= today:
            continue

        row.status = "completed"
        row.completed_at = now
        repeat_count = int(getattr(row, "repeat_count", 0) or 0)
        next_deadline = deadline
        next_count = repeat_count
        while next_deadline.astimezone(OWNER_WORKSPACE_TIMEZONE).date() < today:
            next_count += 1
            candidate = _next_deadline(row, next_deadline)
            if not _can_repeat(row, next_count, candidate):
                next_deadline = None
                break
            next_deadline = candidate

        if next_deadline is None:
            rolled_over += 1
            continue

        new_task = OwnerWorkspaceTask(
            title=row.title,
            description=row.description,
            status="new",
            priority=row.priority,
            deadline_at=next_deadline,
            start_at=None,
            assignee_id=row.assignee_id,
            creator_id=row.creator_id,
            project_id=row.project_id,
            contact_id=row.contact_id,
            counterparty_id=row.counterparty_id,
            tags=row.tags,
            checklist=_copy_checklist(row.checklist),
            attachments=row.attachments,
            repeat_enabled=True,
            repeat_frequency=row.repeat_frequency,
            repeat_interval=row.repeat_interval,
            repeat_days=row.repeat_days,
            repeat_end_type=row.repeat_end_type,
            repeat_end_after_count=row.repeat_end_after_count,
            repeat_end_until=row.repeat_end_until,
            repeat_count=next_count,
            previous_task_id=row.id,
            reminder_at=None,
            reminder_sent=False,
        )
        db.add(new_task)
        rolled_over += 1

    if rolled_over:
        db.commit()
    return rolled_over
