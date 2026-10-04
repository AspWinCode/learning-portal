"""
Интеграционные тесты жизненного цикла отмены/переноса занятия и восстановления
(POST /trainer-lessons/cancel, /restore, /move) против реальной БД (DATABASE_URL).

Хендлеры вызываются напрямую с ролью OWNER, как в test_group_duration_billing.py.
Каждый тест создаёт свою группу/учеников и удаляет их в teardown.

Календарь: январь 2026. 2026-01-05 — понедельник, 2026-01-07 — среда, 2026-01-09 — пятница.
"""
import uuid
from datetime import date, time

import pytest
from fastapi import HTTPException

from tests.integration.conftest import _is_db_configured


pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")

MON = date(2026, 1, 5)
WED = date(2026, 1, 7)
FRI_9 = date(2026, 1, 9)
WED_21 = date(2026, 1, 21)


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
        email=f"test_owner_lesson_restore_{uuid.uuid4().hex[:8]}@example.com",
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
        email=f"test_trainer_lesson_restore_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Test Trainer",
        role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def other_trainer(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_trainer2_lesson_restore_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name="Substitute Trainer",
        role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def abonement(db):
    from app.models import Abonement

    ab = Abonement(name="Test abonement restore", price=8000.0, lessons_count=8, base_hours=8)
    db.add(ab)
    db.commit()
    db.refresh(ab)
    yield ab
    db.delete(ab)
    db.commit()


class _Ctx:
    """Группа и созданные ей строки, которые нужно очистить в teardown."""

    def __init__(self):
        self.group = None
        self.students = []


def _make_group(db, trainer, schedules, lesson_format="group"):
    from app.models import Group, GroupSchedule, GroupStatus

    group = Group(
        name=f"Restore Test {uuid.uuid4().hex[:6]}",
        trainer_id=trainer.id,
        status=GroupStatus.ACTIVE,
        duration_minutes=120,
        lesson_format=lesson_format,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    scheds = []
    for dow, st, et in schedules:
        s = GroupSchedule(group_id=group.id, day_of_week=dow, start_time=st, end_time=et)
        db.add(s)
        scheds.append(s)
    db.commit()
    for s in scheds:
        db.refresh(s)
    return group, scheds


def _make_student(db, abonement, training_start_date=None):
    from app.models import Student, StudentAccount

    student = Student(full_name=f"Restore Student {uuid.uuid4().hex[:4]}", abonement_id=abonement.id,
                      training_start_date=training_start_date)
    db.add(student)
    db.commit()
    db.refresh(student)
    db.add(StudentAccount(student_id=student.id, name="Основной", balance=0.0))
    db.commit()
    return student


def _enroll(db, group, student, restricted_to=None):
    from app.models import GroupStudent, GroupStudentSchedule

    gs = GroupStudent(group_id=group.id, student_id=student.id)
    db.add(gs)
    db.commit()
    db.refresh(gs)
    for sched in restricted_to or []:
        db.add(GroupStudentSchedule(group_student_id=gs.id, group_schedule_id=sched.id))
    db.commit()
    return gs


def _cleanup(db, ctx):
    from app.models import (
        AbsenceFollowUp,
        GroupSchedule,
        GroupStudent,
        GroupStudentSchedule,
        LessonAttendance,
        LessonCancellation,
        LessonTrainerOverride,
        Group,
        Student,
        StudentAccount,
        StudentAccountTransaction,
        StudentActivityLog,
        StudentCard,
    )

    if ctx.group is not None:
        gid = ctx.group.id
        db.query(StudentAccountTransaction).filter(
            StudentAccountTransaction.account_id.in_(
                db.query(StudentAccount.id).filter(StudentAccount.student_id.in_([s.id for s in ctx.students]))
            )
        ).delete(synchronize_session=False)
        db.query(AbsenceFollowUp).filter(AbsenceFollowUp.group_id == gid).delete(synchronize_session=False)
        db.query(LessonAttendance).filter(LessonAttendance.group_id == gid).delete(synchronize_session=False)
        db.query(LessonCancellation).filter(LessonCancellation.group_id == gid).delete(synchronize_session=False)
        db.query(LessonTrainerOverride).filter(LessonTrainerOverride.group_id == gid).delete(synchronize_session=False)
        db.query(GroupStudentSchedule).filter(
            GroupStudentSchedule.group_student_id.in_(
                db.query(GroupStudent.id).filter(GroupStudent.group_id == gid)
            )
        ).delete(synchronize_session=False)
        db.query(GroupStudent).filter(GroupStudent.group_id == gid).delete(synchronize_session=False)
        db.query(GroupSchedule).filter(GroupSchedule.group_id == gid).delete(synchronize_session=False)
        db.query(Group).filter(Group.id == gid).delete(synchronize_session=False)
    for s in ctx.students:
        db.query(StudentAccount).filter(StudentAccount.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentCard).filter(StudentCard.student_id == s.id).delete(synchronize_session=False)
        db.query(StudentActivityLog).filter(StudentActivityLog.student_id == s.id).delete(synchronize_session=False)
        db.query(Student).filter(Student.id == s.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture
def ctx(db):
    c = _Ctx()
    yield c
    db.rollback()
    _cleanup(db, c)


# --- вызовы хендлеров -------------------------------------------------------

async def _cancel(db, owner, group, lesson_date, st, et):
    from app.routers.trainer_lessons import cancel_lesson
    from app.schemas.groups import CancelLessonPayload

    return await cancel_lesson(
        CancelLessonPayload(group_id=group.id, lesson_date=lesson_date, start_time=st, end_time=et),
        db=db,
        current_user=owner,
    )


async def _restore(db, owner, group, lesson_date, st, et):
    from app.routers.trainer_lessons import restore_lesson
    from app.schemas.groups import RestoreLessonPayload

    return await restore_lesson(
        RestoreLessonPayload(group_id=group.id, lesson_date=lesson_date, start_time=st, end_time=et),
        db=db,
        current_user=owner,
    )


async def _slots(db, owner, group, lesson_date):
    from app.routers.trainer_lessons import get_lessons_for_date

    all_slots = await get_lessons_for_date(lesson_date=lesson_date, db=db, current_user=owner)
    return [s for s in all_slots if s.group_id == group.id]


async def _save_attendance(db, owner, group, lesson_date, student_ids, st="10:00", et="12:00"):
    from app.routers.trainer_lessons import save_attendance
    from app.schemas.groups import LessonAttendanceSave, LessonAttendanceItem

    payload = LessonAttendanceSave(
        group_id=group.id,
        lesson_date=lesson_date,
        start_time=st,
        end_time=et,
        attendances=[LessonAttendanceItem(student_id=sid, attended=True) for sid in student_ids],
    )
    await save_attendance(payload, db=db, current_user=owner)


def _allowed_in_january(db, group_id):
    from app.models import LessonCancellation
    from app.routers.trainer_lessons import _first_n_slots_per_group_in_month

    cancellations = db.query(LessonCancellation).filter(
        LessonCancellation.group_id == group_id,
        LessonCancellation.lesson_date >= date(2026, 1, 1),
        LessonCancellation.lesson_date <= date(2026, 1, 31),
    ).all()
    allowed, _ = _first_n_slots_per_group_in_month(db, [group_id], 2026, 1, cancellations)
    return allowed


# --- тесты -----------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_regular_lesson_marks_slot_cancelled(db, owner_user, trainer_user, abonement, ctx):
    ctx.group, _ = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    ctx.students.append(_make_student(db, abonement))
    _enroll(db, ctx.group, ctx.students[0])

    await _cancel(db, owner_user, ctx.group, MON, "10:00", "12:00")

    slots = await _slots(db, owner_user, ctx.group, MON)
    assert len(slots) == 1
    assert slots[0].is_cancelled is True
    assert slots[0].students == []


@pytest.mark.asyncio
async def test_restore_brings_back_regular_lesson_and_deletes_cancellation(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonCancellation

    ctx.group, _ = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)

    await _cancel(db, owner_user, ctx.group, MON, "10:00", "12:00")
    await _restore(db, owner_user, ctx.group, MON, "10:00", "12:00")

    slots = await _slots(db, owner_user, ctx.group, MON)
    assert len(slots) == 1
    assert slots[0].is_cancelled is False
    assert [s["id"] for s in slots[0].students] == [student.id]
    assert db.query(LessonCancellation).filter(LessonCancellation.group_id == ctx.group.id).count() == 0


@pytest.mark.asyncio
async def test_repeated_restore_is_clear_error_and_creates_no_duplicates(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance

    ctx.group, _ = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    ctx.students.append(_make_student(db, abonement))
    _enroll(db, ctx.group, ctx.students[0])

    await _cancel(db, owner_user, ctx.group, MON, "10:00", "12:00")
    await _restore(db, owner_user, ctx.group, MON, "10:00", "12:00")
    with pytest.raises(HTTPException) as exc:
        await _restore(db, owner_user, ctx.group, MON, "10:00", "12:00")
    assert exc.value.status_code == 404

    assert db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id).count() == 0
    assert len(await _slots(db, owner_user, ctx.group, MON)) == 1


@pytest.mark.asyncio
async def test_restore_respects_group_student_schedule_restrictions(db, owner_user, trainer_user, abonement, ctx):
    morning, evening = None, None
    ctx.group, (morning, evening) = _make_group(
        db, trainer_user, [(0, time(10, 0), time(12, 0)), (0, time(14, 0), time(16, 0))]
    )
    restricted = _make_student(db, abonement)
    open_student = _make_student(db, abonement)
    late_start = _make_student(db, abonement, training_start_date=date(2026, 1, 12))
    ctx.students.extend([restricted, open_student, late_start])
    _enroll(db, ctx.group, restricted, restricted_to=[evening])
    _enroll(db, ctx.group, open_student)
    _enroll(db, ctx.group, late_start)

    await _cancel(db, owner_user, ctx.group, MON, "14:00", "16:00")
    await _restore(db, owner_user, ctx.group, MON, "14:00", "16:00")

    by_time = {(s.start_time, s.end_time): s for s in await _slots(db, owner_user, ctx.group, MON)}
    evening_ids = {s["id"] for s in by_time[(time(14, 0), time(16, 0))].students}
    morning_ids = {s["id"] for s in by_time[(time(10, 0), time(12, 0))].students}
    assert evening_ids == {restricted.id, open_student.id}
    assert morning_ids == {open_student.id}
    assert late_start.id not in evening_ids | morning_ids


@pytest.mark.asyncio
async def test_restore_uses_trainer_override_for_slot(db, owner_user, trainer_user, other_trainer, abonement, ctx):
    from app.models import LessonTrainerOverride

    ctx.group, (morning, evening) = _make_group(
        db, trainer_user, [(0, time(10, 0), time(12, 0)), (0, time(14, 0), time(16, 0))]
    )
    ctx.students.append(_make_student(db, abonement))
    _enroll(db, ctx.group, ctx.students[0])
    db.add(LessonTrainerOverride(
        group_id=ctx.group.id, lesson_date=MON, start_time=time(14, 0), end_time=time(16, 0),
        trainer_id=other_trainer.id,
    ))
    db.commit()

    await _cancel(db, owner_user, ctx.group, MON, "14:00", "16:00")
    await _restore(db, owner_user, ctx.group, MON, "14:00", "16:00")

    by_time = {(s.start_time, s.end_time): s for s in await _slots(db, owner_user, ctx.group, MON)}
    assert by_time[(time(14, 0), time(16, 0))].trainer_id == other_trainer.id
    assert by_time[(time(10, 0), time(12, 0))].trainer_id == trainer_user.id


@pytest.mark.asyncio
async def test_first_eight_limit_stays_consistent_after_cancel_and_restore(db, owner_user, trainer_user, abonement, ctx):
    # Пн/Ср/Пт в январе 2026 дают 13 занятий; лимит 8 берёт первые 8 по дате.
    ctx.group, _ = _make_group(
        db, trainer_user,
        [(0, time(10, 0), time(12, 0)), (2, time(10, 0), time(12, 0)), (4, time(10, 0), time(12, 0))],
    )
    ctx.students.append(_make_student(db, abonement))
    _enroll(db, ctx.group, ctx.students[0])

    # Занятие №9 по дате (Ср 21.01) изначально вне лимита.
    assert (ctx.group.id, WED_21, time(10, 0), time(12, 0)) not in _allowed_in_january(db, ctx.group.id)

    # Отмена №4 (Пт 09.01) — занятие №9 «входит» в первые 8.
    await _cancel(db, owner_user, ctx.group, FRI_9, "10:00", "12:00")
    allowed_cancelled = _allowed_in_january(db, ctx.group.id)
    assert (ctx.group.id, WED_21, time(10, 0), time(12, 0)) in allowed_cancelled
    assert len(allowed_cancelled) == 8

    # После восстановления №4 — снова ровно 8 слотов, и №9 из лимита выпадает.
    await _restore(db, owner_user, ctx.group, FRI_9, "10:00", "12:00")
    allowed_restored = _allowed_in_january(db, ctx.group.id)
    assert (ctx.group.id, FRI_9, time(10, 0), time(12, 0)) in allowed_restored
    assert (ctx.group.id, WED_21, time(10, 0), time(12, 0)) not in allowed_restored
    assert len(allowed_restored) == 8
    assert len(await _slots(db, owner_user, ctx.group, WED_21)) == 0


@pytest.mark.asyncio
async def test_restore_blocked_when_it_would_displace_attended_lesson_over_limit(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance, LessonCancellation

    ctx.group, _ = _make_group(
        db, trainer_user,
        [(0, time(10, 0), time(12, 0)), (2, time(10, 0), time(12, 0)), (4, time(10, 0), time(12, 0))],
    )
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)

    await _cancel(db, owner_user, ctx.group, FRI_9, "10:00", "12:00")
    # Пока №4 отменено, занятие №9 (Ср 21.01) уже проведено и отмечено.
    db.add(LessonAttendance(
        group_id=ctx.group.id, lesson_date=WED_21, student_id=student.id, attended=True,
        lesson_start_time=time(10, 0), lesson_end_time=time(12, 0),
    ))
    db.commit()

    with pytest.raises(HTTPException) as exc:
        await _restore(db, owner_user, ctx.group, FRI_9, "10:00", "12:00")
    assert exc.value.status_code == 409
    # Отмена не снята, посещаемость не тронута.
    assert db.query(LessonCancellation).filter(LessonCancellation.group_id == ctx.group.id).count() == 1
    assert db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id).count() == 1


@pytest.mark.asyncio
async def test_moved_lesson_is_not_restored_as_plain_cancellation(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance, LessonCancellation
    from app.routers.trainer_lessons import move_lesson
    from app.schemas.groups import MoveLessonPayload

    ctx.group, _ = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)
    db.add(LessonAttendance(
        group_id=ctx.group.id, lesson_date=MON, student_id=student.id, attended=True,
        lesson_start_time=time(10, 0), lesson_end_time=time(12, 0),
    ))
    db.commit()

    await move_lesson(
        MoveLessonPayload(group_id=ctx.group.id, from_date=MON, to_date=date(2026, 1, 6)),
        db=db, current_user=owner_user,
    )

    with pytest.raises(HTTPException) as exc:
        await _restore(db, owner_user, ctx.group, MON, "10:00", "12:00")
    assert exc.value.status_code == 409

    marker = db.query(LessonCancellation).filter(LessonCancellation.group_id == ctx.group.id).one()
    assert marker.moved_to_date == date(2026, 1, 6)
    # Посещаемость остаётся на новой дате: перенос не откатывается случайно.
    moved = db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id).all()
    assert [a.lesson_date for a in moved] == [date(2026, 1, 6)]


@pytest.mark.asyncio
async def test_restore_does_not_bill_and_billing_happens_once_on_save(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance, StudentAccount, StudentAccountTransaction, StudentAccountTransactionKind

    ctx.group, _ = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)

    await _cancel(db, owner_user, ctx.group, MON, "10:00", "12:00")
    await _restore(db, owner_user, ctx.group, MON, "10:00", "12:00")

    account = db.query(StudentAccount).filter(StudentAccount.student_id == student.id).one()
    deductions = lambda: db.query(StudentAccountTransaction).filter(
        StudentAccountTransaction.account_id == account.id,
        StudentAccountTransaction.kind == StudentAccountTransactionKind.LESSON_DEDUCTION,
    ).count()
    assert deductions() == 0  # restore сам не списывает
    assert db.query(StudentAccount).get(account.id).balance == 0.0

    await _save_attendance(db, owner_user, ctx.group, MON, [student.id])
    db.expire_all()
    assert deductions() == 1
    balance_after_first_save = db.query(StudentAccount).get(account.id).balance
    assert balance_after_first_save < 0

    # Повторное сохранение не создаёт второе списание и не создаёт вторую посещаемость.
    await _save_attendance(db, owner_user, ctx.group, MON, [student.id])
    db.expire_all()
    assert deductions() == 1
    assert db.query(StudentAccount).get(account.id).balance == balance_after_first_save
    assert db.query(LessonAttendance).filter(
        LessonAttendance.group_id == ctx.group.id,
        LessonAttendance.lesson_date == MON,
        LessonAttendance.student_id == student.id,
    ).count() == 1
