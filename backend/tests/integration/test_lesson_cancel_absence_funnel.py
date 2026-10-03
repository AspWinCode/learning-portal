"""
Интеграционные тесты: отмена слота не должна терять воронку пропусков (AbsenceFollowUp).

Покрывают:
1. Отмена слота отвязывает пропуск от удаляемой посещаемости, а не удаляет его
   (стадия и данные для sales сохраняются).
2. Повторная отмена того же слота не ломает воронку.
3. Восстановление слота и повторная отметка пропуска возвращают ту же запись воронки
   (без дубликатов и без потери стадии).
4. Восстановление слота с присутствием не создаёт новых пропусков и не трогает старую запись.
5. Цикл «отмена → восстановление → отмена» остаётся консистентным.

Тесты работают с реальной БД (схема из alembic, см. миграцию 0211) и реальной логикой роутера.
Нужен DATABASE_URL на PostgreSQL с применёнными миграциями (`alembic upgrade head`).
Каждый тест откатывает свои изменения, данные в БД не остаются.
"""
import os
from datetime import date

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.main import app
from app.models import (
    AbsenceFollowUp,
    Group,
    GroupStudent,
    LessonAttendance,
    Student,
    User,
    UserRole,
)

pytestmark = pytest.mark.requires_db

LESSON_DATE = date(2026, 9, 7)
START = "10:00"
END = "11:00"
API = "/api/v1/trainer-lessons"


def _is_db_configured() -> bool:
    url = (os.getenv("DATABASE_URL") or "").strip()
    return bool(url) and "user:password" not in url and "YOUR_PASSWORD" not in url


@pytest.fixture
def db_session():
    if not _is_db_configured():
        pytest.skip("Integration tests require a configured DATABASE_URL")
    engine = sa.create_engine(os.environ["DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    # Сессия работает внутри внешней транзакции: commit роутера уходит в SAVEPOINT,
    # а откат внешней транзакции в конце теста убирает все данные.
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()


@pytest.fixture
def seed(db_session):
    admin = User(email="admin@example.com", hashed_password="x", full_name="Admin", role=UserRole.ADMIN)
    trainer = User(email="trainer@example.com", hashed_password="x", full_name="Trainer", role=UserRole.TRAINER)
    db_session.add_all([admin, trainer])
    db_session.flush()
    group = Group(name="Группа 1", trainer_id=trainer.id)
    student = Student(full_name="Ученик")
    db_session.add_all([group, student])
    db_session.flush()
    db_session.add(GroupStudent(group_id=group.id, student_id=student.id))
    db_session.commit()
    return {"admin": admin, "group": group, "student": student}


@pytest.fixture
def client(db_session, seed):
    def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[auth.get_current_active_user] = lambda: seed["admin"]
    yield TestClient(app)
    app.dependency_overrides = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slot_payload(seed):
    return {"group_id": seed["group"].id, "lesson_date": LESSON_DATE.isoformat(), "start_time": START, "end_time": END}


def _mark_absent(client, seed, reason="sick"):
    resp = client.post(
        f"{API}/attendance",
        json={
            "group_id": seed["group"].id,
            "lesson_date": LESSON_DATE.isoformat(),
            "start_time": START,
            "end_time": END,
            "attendances": [
                {"student_id": seed["student"].id, "attended": False, "absence_reason": reason},
            ],
        },
    )
    assert resp.status_code == 200, resp.text


def _cancel(client, seed):
    resp = client.post(f"{API}/cancel", json=_slot_payload(seed))
    assert resp.status_code == 200, resp.text


def _restore_slot(client, seed):
    resp = client.post(f"{API}/create-slot", json=_slot_payload(seed))
    assert resp.status_code == 200, resp.text


def _funnel_rows(db, seed):
    return (
        db.query(AbsenceFollowUp)
        .filter(
            AbsenceFollowUp.student_id == seed["student"].id,
            AbsenceFollowUp.group_id == seed["group"].id,
            AbsenceFollowUp.lesson_date == LESSON_DATE,
        )
        .all()
    )


def _slot_attendances(db, seed):
    return (
        db.query(LessonAttendance)
        .filter(
            LessonAttendance.group_id == seed["group"].id,
            LessonAttendance.lesson_date == LESSON_DATE,
        )
        .all()
    )


def _absent_and_assign(client, db, seed):
    """Пропуск отмечен и продвинут sales до стадии «assigned»; возвращает id записи воронки."""
    _mark_absent(client, seed)
    row = _funnel_rows(db, seed)[0]
    row.stage = "assigned"
    row.makeup_lesson_date = date(2026, 9, 14)
    db.commit()
    return row.id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_cancel_keeps_absence_follow_up_detached(client, db_session, seed):
    absence_id = _absent_and_assign(client, db_session, seed)

    _cancel(client, seed)

    rows = _funnel_rows(db_session, seed)
    assert len(rows) == 1
    assert rows[0].id == absence_id
    assert rows[0].lesson_attendance_id is None
    assert rows[0].stage == "assigned"
    assert rows[0].makeup_lesson_date == date(2026, 9, 14)
    assert _slot_attendances(db_session, seed) == []


def test_repeated_cancel_does_not_break_funnel(client, db_session, seed):
    absence_id = _absent_and_assign(client, db_session, seed)

    _cancel(client, seed)
    _cancel(client, seed)

    rows = _funnel_rows(db_session, seed)
    assert [r.id for r in rows] == [absence_id]
    assert rows[0].lesson_attendance_id is None
    assert rows[0].stage == "assigned"


def test_restore_and_mark_absent_reattaches_same_absence(client, db_session, seed):
    absence_id = _absent_and_assign(client, db_session, seed)
    _cancel(client, seed)

    _restore_slot(client, seed)
    _mark_absent(client, seed)

    rows = _funnel_rows(db_session, seed)
    assert [r.id for r in rows] == [absence_id]
    new_att = _slot_attendances(db_session, seed)[0]
    assert rows[0].lesson_attendance_id == new_att.id
    assert rows[0].stage == "assigned"


def test_restore_present_leaves_orphan_absence_untouched(client, db_session, seed):
    absence_id = _absent_and_assign(client, db_session, seed)
    _cancel(client, seed)

    _restore_slot(client, seed)

    rows = _funnel_rows(db_session, seed)
    assert [r.id for r in rows] == [absence_id]
    assert rows[0].lesson_attendance_id is None
    assert rows[0].stage == "assigned"


def test_cancel_restore_cancel_cycle_stays_consistent(client, db_session, seed):
    absence_id = _absent_and_assign(client, db_session, seed)

    _cancel(client, seed)
    _restore_slot(client, seed)
    _mark_absent(client, seed)
    _cancel(client, seed)

    rows = _funnel_rows(db_session, seed)
    assert [r.id for r in rows] == [absence_id]
    assert rows[0].lesson_attendance_id is None
    assert rows[0].stage == "assigned"
    assert _slot_attendances(db_session, seed) == []


def test_cancel_without_absence_creates_no_funnel_rows(client, db_session, seed):
    resp = client.post(f"{API}/create-slot", json=_slot_payload(seed))
    assert resp.status_code == 200, resp.text

    _cancel(client, seed)

    assert _funnel_rows(db_session, seed) == []
    assert _slot_attendances(db_session, seed) == []
