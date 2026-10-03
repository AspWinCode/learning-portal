"""
Интеграционные тесты save_attendance (POST /trainer-lessons/attendance) для отменённого слота.

Отменённый слот (LessonCancellation без moved_to_date) не принимает посещаемость: 409,
иначе списание пройдёт, а слот в расписании не виден. Перенесённый слот (moved_to_date задан)
и обычная отметка проведённого урока работают как раньше.

Хендлер вызывается напрямую с ролью OWNER, как в test_group_duration_billing.py.
Каждый тест создаёт свою группу/ученика и удаляет их в teardown.

Календарь: 2026-01-05 — понедельник.
"""
import uuid
from datetime import date, time

import pytest
from fastapi import HTTPException

from tests.integration.conftest import _is_db_configured


pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")

MON = date(2026, 1, 5)
ST, ET = time(10, 0), time(12, 0)


def _get_session():
    from app.database import SessionLocal
    return SessionLocal()


@pytest.fixture
def db():
    session = _get_session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def owner_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_owner_attendance_cancel_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Owner",
        role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def ctx(db, owner_user):
    """Группа с одним ученика и расписанием на понедельник 10:00–12:00."""
    from app.models import Group, GroupSchedule, GroupStatus, GroupStudent, Student

    group = Group(
        name=f"Attendance Cancel Test {uuid.uuid4().hex[:6]}",
        trainer_id=owner_user.id,
        status=GroupStatus.ACTIVE,
        duration_minutes=120,
        lesson_format="group",
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    db.add(GroupSchedule(group_id=group.id, day_of_week=MON.weekday(), start_time=ST, end_time=ET))
    student = Student(full_name=f"Attendance Cancel Student {uuid.uuid4().hex[:4]}")
    db.add(student)
    db.commit()
    db.refresh(student)
    db.add(GroupStudent(group_id=group.id, student_id=student.id))
    db.commit()
    state = {"group": group, "student": student}
    yield state

    from app.models import (
        AbsenceFollowUp,
        Group,
        GroupSchedule,
        GroupStudent,
        LessonAttendance,
        LessonCancellation,
        LessonTrainerOverride,
        Student,
        StudentAccount,
        StudentAccountTransaction,
        StudentActivityLog,
        StudentCard,
    )

    gid = group.id
    sid = student.id
    account_ids = db.query(StudentAccount.id).filter(StudentAccount.student_id == sid)
    db.query(StudentAccountTransaction).filter(
        StudentAccountTransaction.account_id.in_(account_ids)
    ).delete(synchronize_session=False)
    db.query(AbsenceFollowUp).filter(AbsenceFollowUp.group_id == gid).delete(synchronize_session=False)
    db.query(LessonAttendance).filter(LessonAttendance.group_id == gid).delete(synchronize_session=False)
    db.query(LessonCancellation).filter(LessonCancellation.group_id == gid).delete(synchronize_session=False)
    db.query(LessonTrainerOverride).filter(LessonTrainerOverride.group_id == gid).delete(synchronize_session=False)
    db.query(GroupStudent).filter(GroupStudent.group_id == gid).delete(synchronize_session=False)
    db.query(GroupSchedule).filter(GroupSchedule.group_id == gid).delete(synchronize_session=False)
    db.query(Group).filter(Group.id == gid).delete(synchronize_session=False)
    db.query(StudentAccount).filter(StudentAccount.student_id == sid).delete(synchronize_session=False)
    db.query(StudentCard).filter(StudentCard.student_id == sid).delete(synchronize_session=False)
    db.query(StudentActivityLog).filter(StudentActivityLog.student_id == sid).delete(synchronize_session=False)
    db.query(Student).filter(Student.id == sid).delete(synchronize_session=False)
    db.commit()


def _add_cancellation(db, group, moved_to_date=None):
    from app.models import LessonCancellation

    db.add(LessonCancellation(
        group_id=group.id,
        lesson_date=MON,
        start_time=ST,
        end_time=ET,
        moved_to_date=moved_to_date,
    ))
    db.commit()


async def _save(db, owner, group, student_id):
    from app.routers.trainer_lessons import save_attendance
    from app.schemas.groups import LessonAttendanceItem, LessonAttendanceSave

    payload = LessonAttendanceSave(
        group_id=group.id,
        lesson_date=MON,
        start_time="10:00",
        end_time="12:00",
        attendances=[LessonAttendanceItem(student_id=student_id, attended=True)],
    )
    return await save_attendance(payload, db=db, current_user=owner)


def _attendance_count(db, group):
    from app.models import LessonAttendance

    return db.query(LessonAttendance).filter(
        LessonAttendance.group_id == group.id,
        LessonAttendance.lesson_date == MON,
    ).count()


@pytest.mark.asyncio
async def test_attendance_rejected_for_cancelled_slot(db, owner_user, ctx):
    group, student = ctx["group"], ctx["student"]
    _add_cancellation(db, group)

    with pytest.raises(HTTPException) as exc:
        await _save(db, owner_user, group, student.id)

    assert exc.value.status_code == 409
    assert "отменено" in exc.value.detail
    assert _attendance_count(db, group) == 0


@pytest.mark.asyncio
async def test_attendance_allowed_for_moved_slot(db, owner_user, ctx):
    # Перенос: строка с moved_to_date — не «чистая» отмена, отметку не блокируем.
    group, student = ctx["group"], ctx["student"]
    _add_cancellation(db, group, moved_to_date=date(2026, 1, 7))

    await _save(db, owner_user, group, student.id)

    assert _attendance_count(db, group) == 1


@pytest.mark.asyncio
async def test_attendance_saved_for_regular_lesson(db, owner_user, ctx):
    # Обычная отметка проведённого урока (без отмены) не сломана.
    group, student = ctx["group"], ctx["student"]

    await _save(db, owner_user, group, student.id)

    assert _attendance_count(db, group) == 1
