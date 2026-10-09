"""Lessons security regression tests (TRAINER role rework, checklist items
21-31): lessons.manual_create vs lessons.mark_attendance/manage_roster split,
object-level scoping of regular-group attendance and of CustomLesson by
trainer_id. Real HTTP through TestClient + a real JWT, real DB.
"""
import uuid
from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import _is_db_configured

pytestmark = pytest.mark.skipif(not _is_db_configured(), reason="Integration tests require a configured DATABASE_URL")

LESSON_DATE = date(2026, 2, 2)  # понедельник


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
    from app.models import User

    user = User(
        email=f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        full_name=f"Test {prefix}",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _delete_user(db, user):
    from app.models import ActionLog, User

    # log_action() на create/update/delete ручного урока пишет ActionLog от
    # имени actor'а — без этого delete(user) падает по FK (user_id nullable,
    # но без ondelete).
    db.query(ActionLog).filter(ActionLog.user_id == user.id).delete(synchronize_session=False)
    db.delete(db.get(User, user.id))
    db.commit()


@pytest.fixture
def owner_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.OWNER, "lp_owner")
    yield user
    _delete_user(db, user)


@pytest.fixture
def manager_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.MANAGER, "lp_manager")
    yield user
    _delete_user(db, user)


@pytest.fixture
def methodist_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.METHODIST, "lp_methodist")
    yield user
    _delete_user(db, user)


@pytest.fixture
def trainer_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.TRAINER, "lp_trainer")
    yield user
    _delete_user(db, user)


@pytest.fixture
def other_trainer(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.TRAINER, "lp_other_trainer")
    yield user
    _delete_user(db, user)


@pytest.fixture
def group(db, trainer_user):
    from app.models import Group, GroupStatus

    g = Group(name=f"LP Test Group {uuid.uuid4().hex[:6]}", trainer_id=trainer_user.id, status=GroupStatus.ACTIVE)
    db.add(g)
    db.commit()
    db.refresh(g)
    yield g
    db.delete(db.get(Group, g.id))
    db.commit()


@pytest.fixture
def other_group(db, other_trainer):
    from app.models import Group, GroupStatus

    g = Group(name=f"LP Other Group {uuid.uuid4().hex[:6]}", trainer_id=other_trainer.id, status=GroupStatus.ACTIVE)
    db.add(g)
    db.commit()
    db.refresh(g)
    yield g
    db.delete(db.get(Group, g.id))
    db.commit()


@pytest.fixture
def student(db):
    from app.models import Student

    s = Student(full_name=f"LP Student {uuid.uuid4().hex[:6]}")
    db.add(s)
    db.commit()
    db.refresh(s)
    yield s

    from app.models import StudentActivityLog
    db.query(StudentActivityLog).filter(StudentActivityLog.student_id == s.id).delete(synchronize_session=False)
    db.delete(db.get(Student, s.id))
    db.commit()


def _client_for(user):
    from app import auth
    from app.main import app

    client = TestClient(app)
    token = auth.create_access_token({"sub": user.email})
    return client, {"Authorization": f"Bearer {token}"}


class TestManualLessonCreatePermission:
    """lessons.manual_create — только Owner/Admin/Methodist/Manager (п.3, 25-28)."""

    def test_trainer_cannot_create_manual_lesson(self, db, trainer_user):
        client, headers = _client_for(trainer_user)
        r = client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Hack lesson", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [],
            },
            headers=headers,
        )
        assert r.status_code == 403

    def test_owner_can_create_manual_lesson(self, db, owner_user, trainer_user):
        client, headers = _client_for(owner_user)
        r = client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Owner lesson", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [],
            },
            headers=headers,
        )
        assert r.status_code == 201
        _delete_custom_lesson(db, r.json()["id"])

    def test_manager_can_create_manual_lesson(self, db, manager_user, trainer_user):
        client, headers = _client_for(manager_user)
        r = client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Manager lesson", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [],
            },
            headers=headers,
        )
        assert r.status_code == 201
        _delete_custom_lesson(db, r.json()["id"])

    def test_methodist_can_create_manual_lesson(self, db, methodist_user, trainer_user):
        client, headers = _client_for(methodist_user)
        r = client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Methodist lesson", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [],
            },
            headers=headers,
        )
        assert r.status_code == 201
        _delete_custom_lesson(db, r.json()["id"])

    def test_trainer_cannot_edit_or_delete_custom_lesson(self, db, owner_user, trainer_user):
        owner_client, owner_headers = _client_for(owner_user)
        r = owner_client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Edit target", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [],
            },
            headers=owner_headers,
        )
        lesson_id = r.json()["id"]

        trainer_client, trainer_headers = _client_for(trainer_user)
        r_put = trainer_client.put(
            f"/api/v1/sales/custom-lessons/{lesson_id}", json={"title": "Hacked"}, headers=trainer_headers,
        )
        assert r_put.status_code == 403
        r_delete = trainer_client.delete(f"/api/v1/sales/custom-lessons/{lesson_id}", headers=trainer_headers)
        assert r_delete.status_code == 403

        _delete_custom_lesson(db, lesson_id)


def _delete_custom_lesson(db, lesson_id):
    from app.models import CustomLesson, CustomLessonStudent

    db.query(CustomLessonStudent).filter(CustomLessonStudent.lesson_id == lesson_id).delete(synchronize_session=False)
    db.query(CustomLesson).filter(CustomLesson.id == lesson_id).delete(synchronize_session=False)
    db.commit()


class TestRegularAttendanceScoping:
    """lessons.mark_attendance + object-level trainer_id == group.trainer_id (п.22-24)."""

    def test_trainer_can_save_attendance_for_own_group(self, db, trainer_user, group, student):
        from app.models import GroupStudent

        gs = GroupStudent(group_id=group.id, student_id=student.id)
        db.add(gs)
        db.commit()

        client, headers = _client_for(trainer_user)
        r = client.post(
            "/api/v1/trainer-lessons/attendance",
            json={
                "group_id": group.id, "lesson_date": str(LESSON_DATE),
                "attendances": [{"student_id": student.id, "attended": True}],
            },
            headers=headers,
        )
        assert r.status_code == 200

        db.query(GroupStudent).filter(GroupStudent.id == gs.id).delete(synchronize_session=False)
        db.commit()

    def test_trainer_cannot_save_attendance_for_other_group(self, db, trainer_user, other_group, student):
        from app.models import GroupStudent

        gs = GroupStudent(group_id=other_group.id, student_id=student.id)
        db.add(gs)
        db.commit()

        client, headers = _client_for(trainer_user)
        r = client.post(
            "/api/v1/trainer-lessons/attendance",
            json={
                "group_id": other_group.id, "lesson_date": str(LESSON_DATE),
                "attendances": [{"student_id": student.id, "attended": True}],
            },
            headers=headers,
        )
        assert r.status_code == 403

        db.query(GroupStudent).filter(GroupStudent.id == gs.id).delete(synchronize_session=False)
        db.commit()


class TestCustomLessonTrainerScoping:
    """CustomLesson.trainer_id — тренер видит и отмечает только свой (п.29-31)."""

    def test_trainer_sees_only_assigned_custom_lesson(self, db, owner_user, trainer_user, other_trainer):
        owner_client, owner_headers = _client_for(owner_user)
        r_mine = owner_client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Mine", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [],
            },
            headers=owner_headers,
        )
        r_other = owner_client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Not mine", "lesson_date": str(LESSON_DATE), "start_time": "16:00",
                "trainer_id": other_trainer.id, "students": [],
            },
            headers=owner_headers,
        )
        mine_id, other_id = r_mine.json()["id"], r_other.json()["id"]

        trainer_client, trainer_headers = _client_for(trainer_user)
        r_list = trainer_client.get("/api/v1/trainer-lessons/custom-lessons", headers=trainer_headers)
        assert r_list.status_code == 200
        seen_ids = {row["id"] for row in r_list.json()}
        assert mine_id in seen_ids
        assert other_id not in seen_ids

        _delete_custom_lesson(db, mine_id)
        _delete_custom_lesson(db, other_id)

    def test_trainer_can_mark_attendance_on_own_assigned_lesson_not_on_others(
        self, db, owner_user, trainer_user, other_trainer, student,
    ):
        owner_client, owner_headers = _client_for(owner_user)
        r_mine = owner_client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Mine", "lesson_date": str(LESSON_DATE), "start_time": "15:00",
                "trainer_id": trainer_user.id, "students": [{"student_id": student.id}],
            },
            headers=owner_headers,
        )
        mine_id = r_mine.json()["id"]
        lesson_student_id = r_mine.json()["students"][0]["id"]

        r_other = owner_client.post(
            "/api/v1/sales/custom-lessons",
            json={
                "title": "Not mine", "lesson_date": str(LESSON_DATE), "start_time": "16:00",
                "trainer_id": other_trainer.id, "students": [{"student_id": student.id}],
            },
            headers=owner_headers,
        )
        other_id = r_other.json()["id"]
        other_lesson_student_id = r_other.json()["students"][0]["id"]

        trainer_client, trainer_headers = _client_for(trainer_user)

        r_mark_own = trainer_client.post(
            "/api/v1/trainer-lessons/custom-lessons/attendance",
            json={"lesson_id": mine_id, "items": [{"lesson_student_id": lesson_student_id, "attended": True}]},
            headers=trainer_headers,
        )
        assert r_mark_own.status_code == 200

        r_mark_other = trainer_client.post(
            "/api/v1/trainer-lessons/custom-lessons/attendance",
            json={"lesson_id": other_id, "items": [{"lesson_student_id": other_lesson_student_id, "attended": True}]},
            headers=trainer_headers,
        )
        assert r_mark_other.status_code == 403

        _delete_custom_lesson(db, mine_id)
        _delete_custom_lesson(db, other_id)
