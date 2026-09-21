"""ANA-003: активность учеников группы по курсу — кто не приступил, кто
отстаёт от графика (дедлайн - дата выдачи против пройденной доли), у кого
дедлайн уже прошёл. Использует данные, которые LMS и так уже хранит
(StudentCourseProgress синкается вебхуком с внешних площадок, deadline_at —
из выдачи доступа) — отдельного похода на внешнюю площадку не требуется.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import GroupStudent, Student, StudentCourseAccess, StudentCourseProgress

# Насколько отставание от линейного графика (доля прошедшего времени минус
# доля выполненной работы) считается "отстаёт", а не просто "в процессе".
BEHIND_THRESHOLD = 0.15


def compute_group_activity(db: Session, group_id: int, catalog_item_id: int) -> list[dict]:
    student_ids = [
        row[0]
        for row in db.query(GroupStudent.student_id)
        .filter(GroupStudent.group_id == group_id, GroupStudent.left_at.is_(None))
        .all()
    ]
    if not student_ids:
        return []

    students = {s.id: s for s in db.query(Student).filter(Student.id.in_(student_ids)).all()}
    accesses = {
        a.student_id: a
        for a in db.query(StudentCourseAccess).filter(
            StudentCourseAccess.student_id.in_(student_ids),
            StudentCourseAccess.catalog_item_id == catalog_item_id,
        )
    }
    progresses = {
        p.student_id: p
        for p in db.query(StudentCourseProgress).filter(
            StudentCourseProgress.student_id.in_(student_ids),
            StudentCourseProgress.catalog_item_id == catalog_item_id,
        )
    }

    now = datetime.now(timezone.utc)
    rows = []
    for sid in student_ids:
        student = students.get(sid)
        if not student:
            continue
        access = accesses.get(sid)
        progress = progresses.get(sid)
        cases_solved = progress.cases_solved if progress else 0
        cases_total = progress.cases_total if progress else 0
        percent = round(100 * cases_solved / cases_total, 1) if cases_total else 0.0
        completed = bool(cases_total) and cases_solved >= cases_total

        deadline_at = access.deadline_at if access else None
        granted_at = access.granted_at if access else None

        rows.append({
            "student_id": sid,
            "full_name": student.full_name,
            "status": _classify(now, completed, cases_solved, percent, granted_at, deadline_at),
            "percent_complete": percent,
            "cases_solved": cases_solved,
            "cases_total": cases_total,
            "granted_at": granted_at,
            "deadline_at": deadline_at,
            "updated_at": progress.updated_at if progress else None,
        })
    return rows


def _classify(
    now: datetime,
    completed: bool,
    cases_solved: int,
    percent: float,
    granted_at: Optional[datetime],
    deadline_at: Optional[datetime],
) -> str:
    if completed:
        return "completed"
    if deadline_at and deadline_at < now:
        return "overdue"
    if cases_solved == 0:
        return "not_started"
    if deadline_at and granted_at and deadline_at > granted_at:
        elapsed_fraction = (now - granted_at).total_seconds() / (deadline_at - granted_at).total_seconds()
        elapsed_fraction = max(0.0, min(1.0, elapsed_fraction))
        if elapsed_fraction - (percent / 100) > BEHIND_THRESHOLD:
            return "behind"
    return "in_progress"
