"""Lifecycle helpers for a student's group memberships."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import GroupStudent


def close_active_group_memberships(
    db: Session,
    student_id: int,
    closed_at: datetime | None = None,
) -> int:
    """Close current group memberships while preserving their history."""
    closed_at = closed_at or datetime.now(timezone.utc)
    return int(
        db.query(GroupStudent)
        .filter(
            GroupStudent.student_id == student_id,
            GroupStudent.left_at.is_(None),
        )
        .update({GroupStudent.left_at: closed_at}, synchronize_session=False)
        or 0
    )
