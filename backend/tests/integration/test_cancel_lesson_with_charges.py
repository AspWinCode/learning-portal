"""
Отмена занятия (POST /trainer-lessons/cancel → cancel_lesson) при уже списанной посещаемости.

Если по посещаемости слота есть StudentAccountTransaction (FK lesson_attendance_id без ON DELETE),
удаление LessonAttendance упало бы с IntegrityError (500). Ожидаем 409 с понятным текстом,
и при этом ничего не меняется: ни посещаемость, ни проводки, ни баланс, ни LessonCancellation.

Работают против реальной БД из DATABASE_URL, вызывают роутер напрямую с ролью OWNER (без JWT),
по образцу test_group_duration_billing.py.
"""
import uuid
from datetime import date, time

import pytest
from fastapi import HTTPException

from tests.integration.conftest import _is_db_configured


pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")

LESSON_DATE = date(2026, 1, 5)
START = "10:00"
END = "12:00"


@pytest.fixture
def db():
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def owner_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_owner_cancel_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Owner",
        role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def trainer_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_trainer_cancel_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Trainer",
        role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def abonement(db):
    from app.models import Abonement

    ab = Abonement(name="Test abonement cancel", price=8000.0, lessons_count=8)
    db.add(ab)
    db.commit()
    db.refresh(ab)
    yield ab


def _make_group(db, trainer):
    from app.models import Group, GroupStatus

    group = Group(
        name="Test Cancel Group",
        trainer_id=trainer.id,
        status=GroupStatus.ACTIVE,
        duration_minutes=120,
        lesson_format="group",
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def _make_student(db, abonement):
    from app.models import Student, StudentAccount

    student = Student(full_name="Test Student Cancel", abonement_id=abonement.id)
    db.add(student)
    db.commit()
    db.refresh(student)

    account = StudentAccount(student_id=student.id, name="Основной", balance=0.0)
    db.add(account)
    db.commit()
    return student


def _cleanup(db, group, students):
    from app.models import (
        AbsenceFollowUp,
        GroupStudent,
        LessonAttendance,
        LessonCancellation,
        Group as GroupModel,
        Student,
        StudentAccount,
        StudentAccountTransaction,
        StudentActivityLog,
        StudentCard,
    )

    db.query(LessonCancellation).filter(LessonCancellation.group_id == group.id).delete(synchronize_session=False)
    for s in students:
        db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.account_id.in_(
                db.query(StudentAccount.id).filter(StudentAccount.student_id == s.id)
            )
        ).delete(synchronize_session=False)
        db.query(StudentAccount).filter(StudentAccount.student_id == s.id).delete(synchronize_session=False)
        db.query(AbsenceFollowUp).filter(AbsenceFollowUp.student_id == s.id).delete(synchronize_session=False)
        db.query(LessonAttendance).filter(LessonAttendance.student_id == s.id).delete(synchronize_session=False)
        db.query(GroupStudent).filter(GroupStudent.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentCard).filter(StudentCard.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentActivityLog).filter(StudentActivityLog.student_id == s.id).delete(synchronize_session=False)
        db.query(Student).filter(Student.id == s.id).delete(synchronize_session=False)
    db.query(GroupModel).filter(GroupModel.id == group.id).delete(synchronize_session=False)
    db.commit()


async def _save_attendance(db, owner_user, group, student_ids):
    from app.routers.trainer_lessons import save_attendance
    from app.schemas.groups import LessonAttendanceItem, LessonAttendanceSave

    payload = LessonAttendanceSave(
        group_id=group.id,
        lesson_date=LESSON_DATE,
        start_time=START,
        end_time=END,
        attendances=[LessonAttendanceItem(student_id=sid, attended=True) for sid in student_ids],
    )
    await save_attendance(payload, db=db, current_user=owner_user)


async def _cancel(db, owner_user, group):
    from app.routers.trainer_lessons import cancel_lesson
    from app.schemas.groups import CancelLessonPayload

    payload = CancelLessonPayload(
        group_id=group.id,
        lesson_date=LESSON_DATE,
        start_time=START,
        end_time=END,
    )
    return await cancel_lesson(payload, db=db, current_user=owner_user)


@pytest.mark.asyncio
async def test_cancel_lesson_with_charged_attendance_returns_409_and_keeps_data(db, owner_user, abonement, trainer_user):
    from app.models import LessonAttendance, LessonCancellation, StudentAccount, StudentAccountTransaction

    group = _make_group(db, trainer_user)
    student = _make_student(db, abonement)
    try:
        await _save_attendance(db, owner_user, group, [student.id])

        att = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.student_id == student.id
        ).one()
        tx = db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.lesson_attendance_id == att.id
        ).one()
        account = db.query(StudentAccount).filter(StudentAccount.student_id == student.id).one()
        balance_before = account.balance
        tx_amount_before = tx.amount

        with pytest.raises(HTTPException) as exc:
            await _cancel(db, owner_user, group)
        db.rollback()

        assert exc.value.status_code == 409
        assert "списания" in exc.value.detail

        # Ничего не изменилось: посещаемость и проводка на месте, баланс не тронут, отмена не записана.
        assert db.query(LessonAttendance).filter(LessonAttendance.id == att.id).count() == 1
        db.refresh(tx)
        assert tx.lesson_attendance_id == att.id
        assert tx.amount == tx_amount_before
        db.refresh(account)
        assert account.balance == balance_before
        assert db.query(LessonCancellation).filter(LessonCancellation.group_id == group.id).count() == 0
    finally:
        _cleanup(db, group, [student])


@pytest.mark.asyncio
async def test_cancel_lesson_without_charges_removes_attendance(db, owner_user, abonement, trainer_user):
    from app.models import LessonAttendance, LessonCancellation

    group = _make_group(db, trainer_user)
    student = _make_student(db, abonement)
    try:
        # Посещаемость есть, но проводок нет (например, ученик отмечен без списания).
        db.add(LessonAttendance(
            group_id=group.id,
            lesson_date=LESSON_DATE,
            student_id=student.id,
            attended=True,
            lesson_start_time=time(10, 0),
            lesson_end_time=time(12, 0),
        ))
        db.commit()

        result = await _cancel(db, owner_user, group)
        assert result == {"ok": True}

        assert db.query(LessonAttendance).filter(LessonAttendance.group_id == group.id).count() == 0
        assert db.query(LessonCancellation).filter(LessonCancellation.group_id == group.id).count() == 1
    finally:
        _cleanup(db, group, [student])
