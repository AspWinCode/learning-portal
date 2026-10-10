"""Постоянная смена тренера группы (Group.trainer_id) должна действовать
немедленно для текущего/будущего владения группой, но НЕ переписывать
историю (LessonAttendance.trainer_id/Grade.trainer_id остаются с реальным
тренером, который вёл урок). Прямые вызовы роутеров с реальной БД — без
HTTP/lifespan, чтобы не требовать поднятого Redis (см. app/main.py
FastAPICache.init, кэш списка групп тестами не проверяется этим путём,
см. test_update_group_invalidates_groups_cache ниже с подменой функции).
"""
import asyncio
import uuid
from datetime import date, time, timedelta

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


def _make_user(db, role, prefix):
    from app.models import User, UserRole
    user = User(
        email=f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name=f"Test {prefix}",
        role=role if isinstance(role, UserRole) else UserRole(role),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _delete_user(db, user):
    from app.models import ActionLog, User
    db.query(ActionLog).filter(ActionLog.user_id == user.id).delete(synchronize_session=False)
    db.delete(db.get(User, user.id))
    db.commit()


@pytest.fixture
def owner_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.OWNER, "reassign_owner")
    yield user
    _delete_user(db, user)


@pytest.fixture
def trainer_a(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.TRAINER, "reassign_trainer_a")
    yield user
    _delete_user(db, user)


@pytest.fixture
def trainer_b(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.TRAINER, "reassign_trainer_b")
    yield user
    _delete_user(db, user)


@pytest.fixture
def group(db, trainer_a, trainer_b):
    # trainer_b как явная зависимость фикстуры — чтобы pytest гарантированно
    # удалил Group (с её возможным trainer_id=trainer_b после переназначения
    # в тесте) раньше, чем снесёт самого trainer_b (иначе NOT NULL violation
    # на groups.trainer_id при teardown, независимо от порядка объявления).
    from app.models import Group, GroupSchedule

    weekday = date.today().weekday()
    g = Group(
        name=f"Reassign Test Group {uuid.uuid4().hex[:6]}",
        trainer_id=trainer_a.id,
        lesson_format="individual",  # исключает группу из месячной квоты 8 занятий — не мешает тесту
        start_date=date.today() - timedelta(days=365),
    )
    db.add(g)
    db.flush()
    db.add(GroupSchedule(group_id=g.id, day_of_week=weekday, start_time=time(10, 0), end_time=time(11, 0)))
    db.commit()
    db.refresh(g)
    yield g

    from app.models import ActionLog, GroupSchedule as GS, LessonAttendance
    db.query(LessonAttendance).filter(LessonAttendance.group_id == g.id).delete(synchronize_session=False)
    db.query(GS).filter(GS.group_id == g.id).delete(synchronize_session=False)
    db.query(ActionLog).filter(ActionLog.entity_type == "group", ActionLog.entity_id == g.id).delete(synchronize_session=False)
    # Bulk delete (не db.delete(obj)) — не триггерит ORM-каскад на
    # Group.messenger_links (несвязанная фича MAX-интеграции), который
    # требует таблицу group_messenger_links независимо от этого теста.
    db.query(Group).filter(Group.id == g.id).delete(synchronize_session=False)
    db.commit()


def _groups_visible_to(db, user) -> list:
    """Та же логика, что и у GET /groups/paginated (не кэшируется, в отличие
    от GET /groups/) — прямой вызов роутера с реальной БД."""
    from app.routers import groups as groups_router
    resp = asyncio.run(groups_router.read_groups_paginated(skip=0, limit=200, db=db, current_user=user))
    return resp["items"]


def _lessons_for(db, user, lesson_date: date) -> list:
    from app.routers import trainer_lessons as trainer_lessons_router
    return asyncio.run(trainer_lessons_router.get_lessons_for_date(lesson_date=lesson_date, db=db, current_user=user))


class TestGroupTrainerReassignment:
    def test_trainer_a_sees_group_before_reassignment(self, db, group, trainer_a, trainer_b):
        visible_to_a = {g.id for g in _groups_visible_to(db, trainer_a)}
        visible_to_b = {g.id for g in _groups_visible_to(db, trainer_b)}
        assert group.id in visible_to_a
        assert group.id not in visible_to_b

    def test_db_stores_new_trainer_after_update(self, db, group, trainer_a, trainer_b, owner_user):
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate
        from app.models import Group

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        refreshed = db.query(Group).filter(Group.id == group.id).first()
        assert refreshed.trainer_id == trainer_b.id

    def test_trainer_b_sees_group_immediately_after_reassignment_no_relogin(self, db, group, trainer_a, trainer_b, owner_user):
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        # Никакого re-login/нового токена не эмулируется — тот же db-session,
        # тот же объект trainer_b, просто новый запрос. "Logout/login не
        # требуется" и "Refresh страницы показывает группу" (п.13/14) сводятся
        # именно к этому: следующий запрос видит текущее состояние БД.
        visible_to_b = {g.id for g in _groups_visible_to(db, trainer_b)}
        assert group.id in visible_to_b

    def test_trainer_a_no_longer_sees_group_after_reassignment(self, db, group, trainer_a, trainer_b, owner_user):
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        visible_to_a = {g.id for g in _groups_visible_to(db, trainer_a)}
        assert group.id not in visible_to_a

    def test_trainer_b_sees_future_lesson_after_reassignment(self, db, group, trainer_a, trainer_b, owner_user):
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        future_date = date.today() + timedelta(days=7)  # тот же weekday, что в schedule
        slots = _lessons_for(db, trainer_b, future_date)
        assert len(slots) == 1
        assert slots[0].trainer_id == trainer_b.id

    def test_trainer_a_does_not_see_future_lesson_after_reassignment(self, db, group, trainer_a, trainer_b, owner_user):
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        future_date = date.today() + timedelta(days=7)
        slots = _lessons_for(db, trainer_a, future_date)
        assert slots == []

    def test_historical_lesson_keeps_the_trainer_who_actually_taught_it(self, db, group, trainer_a, trainer_b, owner_user):
        """Урок, проведённый Trainer A ДО переназначения, должен продолжать
        показывать Trainer A и после того, как группа перешла к Trainer B —
        LessonAttendance.trainer_id не переписывается."""
        from app.models import LessonAttendance, Student
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        student = Student(full_name="Historical Student", status="active")
        db.add(student)
        db.flush()

        past_date = date.today() - timedelta(days=7)  # тот же weekday, что в schedule
        db.add(LessonAttendance(
            group_id=group.id,
            lesson_date=past_date,
            student_id=student.id,
            attended=True,
            trainer_id=trainer_a.id,  # фактически провёл Trainer A
            lesson_start_time=time(10, 0),
            lesson_end_time=time(11, 0),
        ))
        db.commit()

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        # Trainer B — текущий владелец группы, видит прошлый урок через
        # собственный "занятия на дату", но trainer_id в ответе — старый.
        slots = _lessons_for(db, trainer_b, past_date)
        assert len(slots) == 1
        assert slots[0].trainer_id == trainer_a.id

        row = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == group.id, LessonAttendance.lesson_date == past_date,
        ).first()
        assert row.trainer_id == trainer_a.id  # не перезаписан

        db.query(LessonAttendance).filter(LessonAttendance.id == row.id).delete()
        db.delete(db.get(Student, student.id))
        db.commit()

    def test_reassignment_is_logged_with_old_and_new_trainer(self, db, group, trainer_a, trainer_b, owner_user):
        from app.models import ActionLog
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        entry = (
            db.query(ActionLog)
            .filter(
                ActionLog.entity_type == "group",
                ActionLog.entity_id == group.id,
                ActionLog.action_type == "reassign_trainer",
            )
            .order_by(ActionLog.id.desc())
            .first()
        )
        assert entry is not None
        assert entry.user_id == owner_user.id  # changed_by
        assert entry.created_at is not None  # changed_at
        assert entry.details["old_trainer_id"] == trainer_a.id
        assert entry.details["new_trainer_id"] == trainer_b.id

    def test_update_group_invalidates_groups_cache(self, db, group, trainer_a, trainer_b, owner_user, monkeypatch):
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        calls = []

        async def _spy(namespace):
            calls.append(namespace)

        monkeypatch.setattr(groups_router, "invalidate_namespace", _spy)
        asyncio.run(groups_router.update_group(group.id, GroupUpdate(trainer_id=trainer_b.id), db, owner_user))

        assert groups_router.CACHE_NS_GROUPS in calls

    def test_no_op_update_without_trainer_change_does_not_log_reassignment(self, db, group, trainer_a, owner_user):
        from app.models import ActionLog
        from app.routers import groups as groups_router
        from app.schemas.groups import GroupUpdate

        asyncio.run(groups_router.update_group(group.id, GroupUpdate(name="Renamed only"), db, owner_user))

        entry = (
            db.query(ActionLog)
            .filter(
                ActionLog.entity_type == "group",
                ActionLog.entity_id == group.id,
                ActionLog.action_type == "reassign_trainer",
            )
            .first()
        )
        assert entry is None
