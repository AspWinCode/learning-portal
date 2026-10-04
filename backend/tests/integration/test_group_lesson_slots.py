"""
Интеграционные тесты разового слота группы (GroupLessonSlot) против реальной БД (DATABASE_URL).

Разовый урок — самостоятельная запись расписания: создаётся без учеников, не создаёт посещаемость,
показывается на своей дате, поддерживает несколько слотов одной группы в день, подмену тренера,
отмену/восстановление и перенос. Посещаемость появляется только при сохранении отметок.

Календарь: январь 2026. 2026-01-05 — понедельник, 2026-01-07 — среда, 2026-01-08 — четверг.
"""
import uuid
from datetime import date, datetime, time, timezone

import pytest
from fastapi import HTTPException

from tests.integration.conftest import _is_db_configured


pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")

MON = date(2026, 1, 5)
WED = date(2026, 1, 7)
THU = date(2026, 1, 8)


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
        email=f"test_owner_group_slot_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x", full_name="Test Owner", role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def trainer_user(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_trainer_group_slot_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x", full_name="Test Trainer", role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def substitute_trainer(db):
    from app.models import User, UserRole

    user = User(
        email=f"test_sub_group_slot_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x", full_name="Substitute", role=UserRole.TRAINER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user


@pytest.fixture
def abonement(db):
    from app.models import Abonement

    ab = Abonement(name="Test abonement group slot", price=8000.0, lessons_count=8, base_hours=8)
    db.add(ab)
    db.commit()
    db.refresh(ab)
    yield ab
    db.delete(ab)
    db.commit()


class _Ctx:
    def __init__(self):
        self.group = None
        self.students = []


def _make_group(db, trainer, schedules):
    from app.models import Group, GroupSchedule, GroupStatus

    group = Group(
        name=f"Group slot test {uuid.uuid4().hex[:6]}",
        trainer_id=trainer.id,
        status=GroupStatus.ACTIVE,
        duration_minutes=120,
        lesson_format="group",
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    for dow, st, et in schedules:
        db.add(GroupSchedule(group_id=group.id, day_of_week=dow, start_time=st, end_time=et))
    db.commit()
    return group


def _make_student(db, abonement):
    from app.models import Student, StudentAccount

    student = Student(full_name=f"Group slot student {uuid.uuid4().hex[:4]}", abonement_id=abonement.id)
    db.add(student)
    db.commit()
    db.refresh(student)
    db.add(StudentAccount(student_id=student.id, name="Основной", balance=0.0))
    db.commit()
    return student


def _enroll(db, group, student, left=False):
    from app.models import GroupStudent

    gs = GroupStudent(group_id=group.id, student_id=student.id)
    if left:
        gs.left_at = datetime.now(timezone.utc)
    db.add(gs)
    db.commit()
    return gs


def _cleanup(db, ctx):
    from app.models import (
        AbsenceFollowUp,
        Group,
        GroupLessonSlot,
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
        db.query(GroupLessonSlot).filter(GroupLessonSlot.group_id == gid).delete(synchronize_session=False)
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

async def _create_slot(db, owner, group, lesson_date, st, et):
    from app.routers.trainer_lessons import create_lesson_slot
    from app.schemas.groups import CreateLessonSlotPayload

    return await create_lesson_slot(
        CreateLessonSlotPayload(group_id=group.id, lesson_date=lesson_date, start_time=st, end_time=et),
        db=db, current_user=owner,
    )


async def _slots(db, owner, group, lesson_date):
    from app.routers.trainer_lessons import get_lessons_for_date

    all_slots = await get_lessons_for_date(lesson_date=lesson_date, db=db, current_user=owner)
    return [s for s in all_slots if s.group_id == group.id]


async def _cancel(db, owner, group, lesson_date, st, et):
    from app.routers.trainer_lessons import cancel_lesson
    from app.schemas.groups import CancelLessonPayload

    return await cancel_lesson(
        CancelLessonPayload(group_id=group.id, lesson_date=lesson_date, start_time=st, end_time=et),
        db=db, current_user=owner,
    )


async def _restore(db, owner, group, lesson_date, st, et):
    from app.routers.trainer_lessons import restore_lesson
    from app.schemas.groups import RestoreLessonPayload

    return await restore_lesson(
        RestoreLessonPayload(group_id=group.id, lesson_date=lesson_date, start_time=st, end_time=et),
        db=db, current_user=owner,
    )


async def _save_attendance(db, owner, group, lesson_date, student_ids, st, et):
    from app.routers.trainer_lessons import save_attendance
    from app.schemas.groups import LessonAttendanceItem, LessonAttendanceSave

    await save_attendance(
        LessonAttendanceSave(
            group_id=group.id,
            lesson_date=lesson_date,
            start_time=st,
            end_time=et,
            attendances=[LessonAttendanceItem(student_id=sid, attended=True) for sid in student_ids],
        ),
        db=db, current_user=owner,
    )


def _by_time(slots):
    return {(s.start_time, s.end_time): s for s in slots}


# --- тесты -----------------------------------------------------------------

@pytest.mark.asyncio
async def test_one_off_slot_on_date_without_regular_schedule_is_visible_on_that_date(db, owner_user, trainer_user, abonement, ctx):
    from app.models import GroupLessonSlot, LessonAttendance

    ctx.group = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    ctx.students.append(_make_student(db, abonement))
    _enroll(db, ctx.group, ctx.students[0])

    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    slots = await _slots(db, owner_user, ctx.group, WED)
    assert len(slots) == 1
    assert (slots[0].start_time, slots[0].end_time) == (time(18, 0), time(19, 0))
    assert slots[0].is_cancelled is False
    assert db.query(GroupLessonSlot).filter(GroupLessonSlot.group_id == ctx.group.id).count() == 1
    # Создание урока не порождает посещаемость.
    assert db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id).count() == 0


@pytest.mark.asyncio
async def test_group_without_students_can_have_planned_one_off_lesson(db, owner_user, trainer_user, ctx):
    ctx.group = _make_group(db, trainer_user, [])

    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    slots = await _slots(db, owner_user, ctx.group, WED)
    assert len(slots) == 1
    assert slots[0].students == []


@pytest.mark.asyncio
async def test_roster_shows_all_active_students_not_only_the_first(db, owner_user, trainer_user, abonement, ctx):
    ctx.group = _make_group(db, trainer_user, [])
    active = [_make_student(db, abonement) for _ in range(4)]
    left = _make_student(db, abonement)
    ctx.students.extend(active + [left])
    for s in active:
        _enroll(db, ctx.group, s)
    _enroll(db, ctx.group, left, left=True)

    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    slots = await _slots(db, owner_user, ctx.group, WED)
    assert {s["id"] for s in slots[0].students} == {s.id for s in active}


@pytest.mark.asyncio
async def test_two_slots_of_one_group_on_one_day_are_both_shown_and_saved_independently(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance

    ctx.group = _make_group(db, trainer_user, [])
    s1, s2 = _make_student(db, abonement), _make_student(db, abonement)
    ctx.students.extend([s1, s2])
    _enroll(db, ctx.group, s1)
    _enroll(db, ctx.group, s2)

    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")
    await _create_slot(db, owner_user, ctx.group, WED, "20:00", "21:00")
    by_time = _by_time(await _slots(db, owner_user, ctx.group, WED))
    assert set(by_time) == {(time(18, 0), time(19, 0)), (time(20, 0), time(21, 0))}

    # Посещаемость каждого слота сохраняется отдельно — второй урок не перетирает первый.
    await _save_attendance(db, owner_user, ctx.group, WED, [s1.id], "18:00", "19:00")
    await _save_attendance(db, owner_user, ctx.group, WED, [s2.id], "20:00", "21:00")

    rows = db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id, LessonAttendance.lesson_date == WED).all()
    assert sorted((r.student_id, r.lesson_start_time) for r in rows) == sorted([
        (s1.id, time(18, 0)), (s2.id, time(20, 0)),
    ])
    # Состав каждого слота — все активные ученики группы; посещаемость задаёт только отметки.
    by_time = _by_time(await _slots(db, owner_user, ctx.group, WED))
    assert {s["id"] for s in by_time[(time(18, 0), time(19, 0))].students} == {s1.id, s2.id}
    assert {s["id"] for s in by_time[(time(20, 0), time(21, 0))].students} == {s1.id, s2.id}


@pytest.mark.asyncio
async def test_exact_duplicate_of_one_off_or_regular_slot_is_rejected(db, owner_user, trainer_user, ctx):
    ctx.group = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])

    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")
    with pytest.raises(HTTPException) as exc:
        await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")
    assert exc.value.status_code == 400

    # Точный дубль регулярного слота (Пн 10–12) тоже запрещён.
    with pytest.raises(HTTPException) as exc:
        await _create_slot(db, owner_user, ctx.group, MON, "10:00", "12:00")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_regular_and_one_off_on_same_day_do_not_duplicate_cards(db, owner_user, trainer_user, ctx):
    ctx.group = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])

    await _create_slot(db, owner_user, ctx.group, MON, "15:00", "17:00")

    slots = await _slots(db, owner_user, ctx.group, MON)
    assert sorted((s.start_time, s.end_time) for s in slots) == [
        (time(10, 0), time(12, 0)), (time(15, 0), time(17, 0)),
    ]


@pytest.mark.asyncio
async def test_trainer_override_applies_to_one_off_slot(db, owner_user, trainer_user, substitute_trainer, ctx):
    from app.models import LessonTrainerOverride
    from app.routers.trainer_lessons import set_lesson_trainer
    from app.schemas.groups import SetLessonTrainerPayload

    ctx.group = _make_group(db, trainer_user, [])
    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    await set_lesson_trainer(
        SetLessonTrainerPayload(group_id=ctx.group.id, lesson_date=WED, start_time="18:00", end_time="19:00",
                                trainer_id=substitute_trainer.id),
        db=db, current_user=owner_user,
    )

    assert db.query(LessonTrainerOverride).filter(LessonTrainerOverride.group_id == ctx.group.id).count() == 1
    slots = await _slots(db, owner_user, ctx.group, WED)
    assert slots[0].trainer_id == substitute_trainer.id


@pytest.mark.asyncio
async def test_cancel_and_restore_one_off_slot_keeps_single_card(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance

    ctx.group = _make_group(db, trainer_user, [])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)
    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    await _cancel(db, owner_user, ctx.group, WED, "18:00", "19:00")
    cancelled = await _slots(db, owner_user, ctx.group, WED)
    assert len(cancelled) == 1 and cancelled[0].is_cancelled is True

    await _restore(db, owner_user, ctx.group, WED, "18:00", "19:00")
    restored = await _slots(db, owner_user, ctx.group, WED)
    assert len(restored) == 1 and restored[0].is_cancelled is False
    assert [s["id"] for s in restored[0].students] == [student.id]
    assert db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id).count() == 0


@pytest.mark.asyncio
async def test_restore_without_one_off_slot_is_not_found(db, owner_user, trainer_user, ctx):
    ctx.group = _make_group(db, trainer_user, [])

    with pytest.raises(HTTPException) as exc:
        await _restore(db, owner_user, ctx.group, WED, "18:00", "19:00")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_move_one_off_slot_to_another_date(db, owner_user, trainer_user, abonement, ctx):
    from app.models import GroupLessonSlot, LessonCancellation
    from app.routers.trainer_lessons import move_lesson
    from app.schemas.groups import MoveLessonPayload

    ctx.group = _make_group(db, trainer_user, [])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)
    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    await move_lesson(
        MoveLessonPayload(group_id=ctx.group.id, from_date=WED, to_date=THU, from_start_time="18:00", from_end_time="19:00"),
        db=db, current_user=owner_user,
    )

    old = await _slots(db, owner_user, ctx.group, WED)
    assert len(old) == 1 and old[0].is_cancelled is True and old[0].moved_to_date == THU
    new = await _slots(db, owner_user, ctx.group, THU)
    assert len(new) == 1 and new[0].is_cancelled is False
    assert [s["id"] for s in new[0].students] == [student.id]
    assert db.query(GroupLessonSlot).filter(
        GroupLessonSlot.group_id == ctx.group.id, GroupLessonSlot.lesson_date == THU,
    ).count() == 1
    assert db.query(LessonCancellation).filter(LessonCancellation.group_id == ctx.group.id).count() == 1


@pytest.mark.asyncio
async def test_move_only_moves_selected_slot_when_day_has_two_lessons(db, owner_user, trainer_user, abonement, ctx):
    from app.models import LessonAttendance
    from app.routers.trainer_lessons import move_lesson
    from app.schemas.groups import MoveLessonPayload

    ctx.group = _make_group(db, trainer_user, [])
    s1, s2 = _make_student(db, abonement), _make_student(db, abonement)
    ctx.students.extend([s1, s2])
    _enroll(db, ctx.group, s1)
    _enroll(db, ctx.group, s2)
    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")
    await _create_slot(db, owner_user, ctx.group, WED, "20:00", "21:00")
    await _save_attendance(db, owner_user, ctx.group, WED, [s1.id], "18:00", "19:00")
    await _save_attendance(db, owner_user, ctx.group, WED, [s2.id], "20:00", "21:00")

    with pytest.raises(HTTPException) as exc:
        await move_lesson(
            MoveLessonPayload(group_id=ctx.group.id, from_date=WED, to_date=THU),
            db=db, current_user=owner_user,
        )
    assert exc.value.status_code == 400  # два урока в день: без явного времени не угадываем

    await move_lesson(
        MoveLessonPayload(group_id=ctx.group.id, from_date=WED, to_date=THU, from_start_time="18:00", from_end_time="19:00"),
        db=db, current_user=owner_user,
    )
    on_wed = db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id, LessonAttendance.lesson_date == WED).all()
    on_thu = db.query(LessonAttendance).filter(LessonAttendance.group_id == ctx.group.id, LessonAttendance.lesson_date == THU).all()
    assert [(a.student_id, a.lesson_start_time) for a in on_wed] == [(s2.id, time(20, 0))]
    assert [(a.student_id, a.lesson_start_time) for a in on_thu] == [(s1.id, time(18, 0))]


@pytest.mark.asyncio
async def test_add_student_to_second_slot_of_same_day_is_allowed(db, owner_user, trainer_user, abonement, ctx):
    from app.routers.trainer_lessons import add_student_to_lesson
    from app.schemas.groups import AddStudentToLessonPayload

    ctx.group = _make_group(db, trainer_user, [])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)
    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")
    await _create_slot(db, owner_user, ctx.group, WED, "20:00", "21:00")
    await _save_attendance(db, owner_user, ctx.group, WED, [student.id], "18:00", "19:00")

    await add_student_to_lesson(
        AddStudentToLessonPayload(group_id=ctx.group.id, lesson_date=WED, student_id=student.id,
                                  start_time="20:00", end_time="21:00"),
        db=db, current_user=owner_user,
    )
    by_time = _by_time(await _slots(db, owner_user, ctx.group, WED))
    assert [s["id"] for s in by_time[(time(20, 0), time(21, 0))].students] == [student.id]
    with pytest.raises(HTTPException) as exc:
        await add_student_to_lesson(
            AddStudentToLessonPayload(group_id=ctx.group.id, lesson_date=WED, student_id=student.id,
                                      start_time="20:00", end_time="21:00"),
            db=db, current_user=owner_user,
        )
    assert exc.value.status_code == 400


async def _remove_student(db, owner, group, lesson_date, student_id, st, et):
    from app.routers.trainer_lessons import remove_student_from_lesson
    from app.schemas.groups import RemoveStudentFromLessonPayload

    return await remove_student_from_lesson(
        RemoveStudentFromLessonPayload(group_id=group.id, lesson_date=lesson_date, student_id=student_id,
                                       start_time=st, end_time=et),
        db=db, current_user=owner,
    )


@pytest.mark.asyncio
async def test_adding_one_student_does_not_collapse_roster(db, owner_user, trainer_user, abonement, ctx):
    from app.routers.trainer_lessons import add_student_to_lesson
    from app.schemas.groups import AddStudentToLessonPayload

    ctx.group = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    students = [_make_student(db, abonement) for _ in range(3)]
    ctx.students.extend(students)
    for s in students:
        _enroll(db, ctx.group, s)

    await add_student_to_lesson(
        AddStudentToLessonPayload(group_id=ctx.group.id, lesson_date=WED, student_id=students[0].id,
                                  start_time="10:00", end_time="12:00"),
        db=db, current_user=owner_user,
    )

    slots = await _slots(db, owner_user, ctx.group, WED)
    assert {s["id"] for s in slots[0].students} == {s.id for s in students}


@pytest.mark.asyncio
async def test_removed_student_stays_out_until_explicitly_added_back(db, owner_user, trainer_user, abonement, ctx):
    from app.routers.trainer_lessons import add_student_to_lesson
    from app.schemas.groups import AddStudentToLessonPayload

    ctx.group = _make_group(db, trainer_user, [])
    s1, s2, s3 = (_make_student(db, abonement) for _ in range(3))
    ctx.students.extend([s1, s2, s3])
    for s in (s1, s2, s3):
        _enroll(db, ctx.group, s)
    await _create_slot(db, owner_user, ctx.group, WED, "18:00", "19:00")

    await _remove_student(db, owner_user, ctx.group, WED, s2.id, "18:00", "19:00")
    assert {s["id"] for s in (await _slots(db, owner_user, ctx.group, WED))[0].students} == {s1.id, s3.id}

    # Сохранение посещаемости не возвращает удалённого ученика в урок.
    await _save_attendance(db, owner_user, ctx.group, WED, [s1.id, s3.id], "18:00", "19:00")
    assert {s["id"] for s in (await _slots(db, owner_user, ctx.group, WED))[0].students} == {s1.id, s3.id}

    await add_student_to_lesson(
        AddStudentToLessonPayload(group_id=ctx.group.id, lesson_date=WED, student_id=s2.id,
                                  start_time="18:00", end_time="19:00"),
        db=db, current_user=owner_user,
    )
    assert {s["id"] for s in (await _slots(db, owner_user, ctx.group, WED))[0].students} == {s1.id, s2.id, s3.id}


@pytest.mark.asyncio
async def test_notification_failure_does_not_break_cancel(db, owner_user, trainer_user, abonement, ctx, monkeypatch):
    from app.models import LessonCancellation
    from app.routers import trainer_lessons

    ctx.group = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)

    def _broken_send(*args, **kwargs):
        raise ValueError("Communication message is empty")

    monkeypatch.setattr(trainer_lessons.CommunicationService, "send", _broken_send)

    await _cancel(db, owner_user, ctx.group, MON, "10:00", "12:00")

    assert db.query(LessonCancellation).filter(LessonCancellation.group_id == ctx.group.id).count() == 1
    slots = await _slots(db, owner_user, ctx.group, MON)
    assert slots[0].is_cancelled is True


@pytest.mark.asyncio
async def test_billing_two_lessons_same_day_each_deducted_once(db, owner_user, trainer_user, abonement, ctx):
    from app.models import StudentAccount, StudentAccountTransaction, StudentAccountTransactionKind

    ctx.group = _make_group(db, trainer_user, [(0, time(10, 0), time(12, 0))])
    student = _make_student(db, abonement)
    ctx.students.append(student)
    _enroll(db, ctx.group, student)
    await _create_slot(db, owner_user, ctx.group, MON, "15:00", "17:00")

    # Абонемент 8 000 за 8 ч базы = 1 000/ч; урок группы 2 ч → 2 000 за урок.
    await _save_attendance(db, owner_user, ctx.group, MON, [student.id], "10:00", "12:00")
    await _save_attendance(db, owner_user, ctx.group, MON, [student.id], "15:00", "17:00")
    await _save_attendance(db, owner_user, ctx.group, MON, [student.id], "15:00", "17:00")  # повторное сохранение

    account = db.query(StudentAccount).filter(StudentAccount.student_id == student.id).one()
    db.expire_all()
    deductions = db.query(StudentAccountTransaction).filter(
        StudentAccountTransaction.account_id == account.id,
        StudentAccountTransaction.kind == StudentAccountTransactionKind.LESSON_DEDUCTION,
    ).count()
    assert deductions == 2
    assert db.query(StudentAccount).get(account.id).balance == -4000.0
