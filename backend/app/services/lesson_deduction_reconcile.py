from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import List

from sqlalchemy.orm import Session

from app.models import (
    LessonAttendance,
    Student,
    StudentAccountTransaction,
    StudentFreeze,
    User,
    UserRole,
)

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 14


def find_missing_deduction_attendances(db: Session, lookback_days: int = LOOKBACK_DAYS) -> List[LessonAttendance]:
    """Занятия, за которые ни разу не пыталось списаться (нет ни одной проводки),
    хотя у ученика сейчас есть абонемент. Типичная причина — урок отметили раньше,
    чем ученику назначили абонемент, и списание тогда не могло рассчитаться.
    """
    since = date.today() - timedelta(days=lookback_days)
    candidates = (
        db.query(LessonAttendance)
        .join(Student, Student.id == LessonAttendance.student_id)
        .filter(
            LessonAttendance.lesson_date >= since,
            Student.abonement_id.isnot(None),
        )
        .all()
    )
    missing: List[LessonAttendance] = []
    for att in candidates:
        has_tx = (
            db.query(StudentAccountTransaction.id)
            .filter(StudentAccountTransaction.lesson_attendance_id == att.id)
            .first()
        )
        if has_tx:
            continue
        in_freeze = (
            db.query(StudentFreeze)
            .filter(
                StudentFreeze.student_id == att.student_id,
                StudentFreeze.freeze_start <= att.lesson_date,
                StudentFreeze.freeze_end >= att.lesson_date,
            )
            .first()
        )
        if in_freeze:
            continue
        missing.append(att)
    return missing


async def reconcile_missing_lesson_deductions(db: Session) -> int:
    """Пересохраняет посещаемость по занятиям без списания, чтобы штатная логика
    save_attendance пересчитала и создала пропущенную проводку по текущему абонементу.
    """
    from app.routers.trainer_lessons import save_attendance
    from app.schemas.groups import LessonAttendanceItem, LessonAttendanceSave

    system_actor = (
        db.query(User).filter(User.role == UserRole.OWNER).first()
        or db.query(User).filter(User.role == UserRole.ADMIN).first()
    )
    if not system_actor:
        logger.warning("lesson_deduction_reconcile: no owner/admin user found, skipping")
        return 0

    attendances = find_missing_deduction_attendances(db)
    fixed = 0
    for att in attendances:
        payload = LessonAttendanceSave(
            group_id=att.group_id,
            lesson_date=att.lesson_date,
            start_time=att.lesson_start_time.strftime("%H:%M") if att.lesson_start_time else None,
            end_time=att.lesson_end_time.strftime("%H:%M") if att.lesson_end_time else None,
            attendances=[
                LessonAttendanceItem(
                    student_id=att.student_id,
                    attended=att.attended,
                    late=att.late,
                    absence_reason=att.absence_reason,
                    absence_comment=att.absence_comment,
                )
            ],
        )
        try:
            await save_attendance(payload, db, system_actor)
            fixed += 1
        except Exception:
            logger.exception(
                "lesson_deduction_reconcile: failed for lesson_attendance_id=%s", att.id
            )
    if fixed:
        logger.info("lesson_deduction_reconcile: reconciled %s lesson(s)", fixed)
    return fixed
