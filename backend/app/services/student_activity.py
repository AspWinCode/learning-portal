from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models import StudentActivityLog


def log_student_activity(
    db: Session,
    *,
    student_id: int,
    activity_type: str,
    title: str,
    description: Optional[str] = None,
    created_by: Optional[int] = None,
    payload_json: Optional[Dict[str, Any]] = None,
) -> StudentActivityLog:
    activity = StudentActivityLog(
        student_id=student_id,
        type=activity_type,
        title=title,
        description=description,
        created_by=created_by,
        payload_json=payload_json,
    )
    db.add(activity)
    return activity
