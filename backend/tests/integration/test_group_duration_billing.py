"""
Интеграционные тесты списания с абонемента по продолжительности занятия
(Group.duration_minutes / GroupStudent.custom_duration_minutes) вместо юнитов.

Работают против реальной БД, заданной DATABASE_URL (как остальные integration-тесты
в этом пакете), и вызывают save_attendance() напрямую (без HTTP/JWT) с ролью OWNER,
чтобы не зависеть от системы прав. Каждый тест создаёт свои строки и удаляет их
в конце (без фикстуры транзакции — соответствует остальным тестам пакета).
"""
import uuid
from datetime import date, time

import pytest

from tests.integration.conftest import _is_db_configured


pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")


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
    # Пользователь намеренно не удаляется в teardown: удаление потянуло бы за собой
    # десятки FK (action_logs, student_activity_log и т.п.) на dev-БД. Дев-БД одноразовая,
    # уникальный email на запуск исключает конфликт между прогонами.
    from app.models import User, UserRole

    user = User(
        email=f"test_owner_duration_billing_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Owner",
        role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def abonement(db):
    from app.models import Abonement

    ab = Abonement(name="Test abonement", price=8000.0, lessons_count=8)
    db.add(ab)
    db.commit()
    db.refresh(ab)
    yield ab
    db.delete(ab)
    db.commit()


@pytest.fixture
def trainer_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_trainer_duration_billing_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Trainer",
        role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


def _make_group(db, trainer, duration_minutes):
    from app.models import Group, GroupStatus

    group = Group(
        name="Test Duration Group",
        trainer_id=trainer.id,
        status=GroupStatus.ACTIVE,
        duration_minutes=duration_minutes,
        lesson_format="group",
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def _make_student(db, abonement):
    from app.models import Student, StudentAccount

    student = Student(full_name="Test Student", abonement_id=abonement.id)
    db.add(student)
    db.commit()
    db.refresh(student)

    account = StudentAccount(student_id=student.id, name="Основной", balance=0.0)
    db.add(account)
    db.commit()
    return student


async def _run_save_attendance(db, owner_user, group, lesson_date, attendances, start_time="10:00", end_time="12:00"):
    from app.routers.trainer_lessons import save_attendance
    from app.schemas.groups import LessonAttendanceSave, LessonAttendanceItem

    payload = LessonAttendanceSave(
        group_id=group.id,
        lesson_date=lesson_date,
        start_time=start_time,
        end_time=end_time,
        attendances=[LessonAttendanceItem(student_id=sid, attended=True) for sid in attendances],
    )
    await save_attendance(payload, db=db, current_user=owner_user)


def _cleanup(db, group, students):
    from app.models import (
        LessonAttendance,
        GroupStudent,
        StudentAccountTransaction,
        StudentAccount,
        Student,
        Group,
        StudentCard,
        StudentActivityLog,
    )

    for s in students:
        db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.account_id.in_(
                db.query(StudentAccount.id).filter(StudentAccount.student_id == s.id)
            )
        ).delete(synchronize_session=False)
        db.query(StudentAccount).filter(StudentAccount.student_id == s.id).delete(synchronize_session=False)
        db.query(LessonAttendance).filter(LessonAttendance.student_id == s.id).delete(synchronize_session=False)
        db.query(GroupStudent).filter(GroupStudent.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentCard).filter(StudentCard.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentActivityLog).filter(StudentActivityLog.student_id == s.id).delete(synchronize_session=False)
        db.query(Student).filter(Student.id == s.id).delete(synchronize_session=False)
    db.query(Group).filter(Group.id == group.id).delete(synchronize_session=False)
    db.commit()


@pytest.mark.asyncio
async def test_group_duration_minutes_120_gives_2_base_units(db, owner_user, abonement, trainer_user):
    group = _make_group(db, trainer_user, duration_minutes=120)
    student = _make_student(db, abonement)
    try:
        await _run_save_attendance(db, owner_user, group, date(2026, 1, 5), [student.id])

        from app.models import LessonAttendance
        att = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.student_id == student.id
        ).first()
        assert att.base_units_applied == 2.0
        assert att.extra_units_applied == 0.0
    finally:
        _cleanup(db, group, [student])


@pytest.mark.asyncio
async def test_custom_duration_override_60_gives_1_base_unit(db, owner_user, abonement, trainer_user):
    from app.models import GroupStudent

    group = _make_group(db, trainer_user, duration_minutes=120)
    student_override = _make_student(db, abonement)
    student_full = _make_student(db, abonement)

    db.add(GroupStudent(group_id=group.id, student_id=student_override.id, custom_duration_minutes=60))
    db.add(GroupStudent(group_id=group.id, student_id=student_full.id))
    db.commit()

    try:
        await _run_save_attendance(db, owner_user, group, date(2026, 1, 5), [student_override.id, student_full.id])

        from app.models import LessonAttendance
        att_override = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.student_id == student_override.id
        ).first()
        att_full = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.student_id == student_full.id
        ).first()

        assert att_override.base_units_applied == 1.0
        assert att_full.base_units_applied == 2.0
    finally:
        _cleanup(db, group, [student_override, student_full])


@pytest.mark.asyncio
async def test_custom_duration_90_minutes_gives_fractional_1_5(db, owner_user, abonement, trainer_user):
    from app.models import GroupStudent

    group = _make_group(db, trainer_user, duration_minutes=120)
    student = _make_student(db, abonement)
    db.add(GroupStudent(group_id=group.id, student_id=student.id, custom_duration_minutes=90))
    db.commit()

    try:
        await _run_save_attendance(db, owner_user, group, date(2026, 1, 5), [student.id])

        from app.models import LessonAttendance
        att = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.student_id == student.id
        ).first()
        assert att.base_units_applied == 1.5
    finally:
        _cleanup(db, group, [student])


@pytest.mark.asyncio
async def test_resaving_attendance_after_duration_change_corrects_existing_transaction(db, owner_user, abonement, trainer_user):
    """Пересчёт задним числом: повторный save_attendance после смены длительности группы
    должен скорректировать уже созданную проводку (не задублировать её)."""
    from app.models import LessonAttendance, StudentAccountTransaction, StudentAccount

    group = _make_group(db, trainer_user, duration_minutes=60)
    student = _make_student(db, abonement)
    try:
        await _run_save_attendance(db, owner_user, group, date(2026, 1, 5), [student.id])

        att = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.student_id == student.id
        ).first()
        assert att.base_units_applied == 1.0

        account = db.query(StudentAccount).filter(StudentAccount.student_id == student.id).first()
        balance_before = account.balance
        price_per_hour = abonement.price / 8

        # Группа стала занимать 120 минут — пересохраняем то же занятие.
        group.duration_minutes = 120
        db.commit()
        await _run_save_attendance(db, owner_user, group, date(2026, 1, 5), [student.id])

        db.refresh(att)
        assert att.base_units_applied == 2.0

        txs = db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.lesson_attendance_id == att.id
        ).all()
        assert len(txs) == 1  # скорректирована та же проводка, не создана вторая

        db.refresh(account)
        expected_diff = -round(price_per_hour * 2.0, 2) - (-round(price_per_hour * 1.0, 2))
        assert round(account.balance - balance_before, 2) == round(expected_diff, 2)
    finally:
        _cleanup(db, group, [student])
