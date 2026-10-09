"""student_portal.view_student / student_portal.analytics — узкие права
тренера взамен прежнего полного student_portal.manage (аудит: ни один
эндпоинт student_portal.py не проверял принадлежность ученика/группы
тренеру). Real HTTP через TestClient + реальный JWT, реальная БД.
"""
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

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

    db.query(ActionLog).filter(ActionLog.user_id == user.id).delete(synchronize_session=False)
    db.delete(db.get(User, user.id))
    db.commit()


@pytest.fixture
def owner_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.OWNER, "sp_owner")
    yield user
    _delete_user(db, user)


@pytest.fixture
def trainer_user(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.TRAINER, "sp_trainer")
    yield user
    _delete_user(db, user)


@pytest.fixture
def other_trainer(db):
    from app.models import UserRole
    user = _make_user(db, UserRole.TRAINER, "sp_other_trainer")
    yield user
    _delete_user(db, user)


@pytest.fixture
def group(db, trainer_user):
    from app.models import Group, GroupStatus

    g = Group(name=f"SP Group {uuid.uuid4().hex[:6]}", trainer_id=trainer_user.id, status=GroupStatus.ACTIVE)
    db.add(g)
    db.commit()
    db.refresh(g)
    yield g
    db.delete(db.get(Group, g.id))
    db.commit()


@pytest.fixture
def other_group(db, other_trainer):
    from app.models import Group, GroupStatus

    g = Group(name=f"SP Other Group {uuid.uuid4().hex[:6]}", trainer_id=other_trainer.id, status=GroupStatus.ACTIVE)
    db.add(g)
    db.commit()
    db.refresh(g)
    yield g
    db.delete(db.get(Group, g.id))
    db.commit()


@pytest.fixture
def student_in_group(db, group):
    from app.models import GroupStudent, Student, StudentActivityLog

    s = Student(full_name=f"SP Student {uuid.uuid4().hex[:6]}")
    db.add(s)
    db.commit()
    db.refresh(s)
    gs = GroupStudent(group_id=group.id, student_id=s.id)
    db.add(gs)
    db.commit()
    yield s
    db.query(GroupStudent).filter(GroupStudent.id == gs.id).delete(synchronize_session=False)
    db.query(StudentActivityLog).filter(StudentActivityLog.student_id == s.id).delete(synchronize_session=False)
    db.delete(db.get(Student, s.id))
    db.commit()


@pytest.fixture
def student_in_other_group(db, other_group):
    from app.models import GroupStudent, Student, StudentActivityLog

    s = Student(full_name=f"SP Other Student {uuid.uuid4().hex[:6]}")
    db.add(s)
    db.commit()
    db.refresh(s)
    gs = GroupStudent(group_id=other_group.id, student_id=s.id)
    db.add(gs)
    db.commit()
    yield s
    db.query(GroupStudent).filter(GroupStudent.id == gs.id).delete(synchronize_session=False)
    db.query(StudentActivityLog).filter(StudentActivityLog.student_id == s.id).delete(synchronize_session=False)
    db.delete(db.get(Student, s.id))
    db.commit()


def _client_for(user):
    from app import auth
    from app.main import app

    client = TestClient(app)
    token = auth.create_access_token({"sub": user.email})
    return client, {"Authorization": f"Bearer {token}"}


class TestViewStudentScoping:
    def test_trainer_sees_own_student_portal_view(self, db, trainer_user, student_in_group):
        client, headers = _client_for(trainer_user)
        r = client.get(f"/api/v1/student-portal/admin/students/{student_in_group.id}", headers=headers)
        assert r.status_code == 200

    def test_trainer_cannot_see_other_students_portal_view(self, db, trainer_user, student_in_other_group):
        client, headers = _client_for(trainer_user)
        r = client.get(f"/api/v1/student-portal/admin/students/{student_in_other_group.id}", headers=headers)
        assert r.status_code == 403

    def test_owner_sees_any_student_portal_view(self, db, owner_user, student_in_other_group):
        client, headers = _client_for(owner_user)
        r = client.get(f"/api/v1/student-portal/admin/students/{student_in_other_group.id}", headers=headers)
        assert r.status_code == 200

    def test_trainer_cannot_create_credential_view_only(self, db, trainer_user, student_in_group):
        client, headers = _client_for(trainer_user)
        r = client.post(
            "/api/v1/student-portal/admin/credentials",
            json={"student_id": student_in_group.id, "login": "hack", "password": "hack12345"},
            headers=headers,
        )
        assert r.status_code == 403


class TestAnalyticsScoping:
    def test_trainer_sees_own_group_activity(self, db, trainer_user, group):
        client, headers = _client_for(trainer_user)
        r = client.get(
            "/api/v1/student-portal/admin/analytics/group-activity",
            params={"group_id": group.id, "catalog_item_id": 999999},
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["rows"] == []

    def test_trainer_cannot_see_other_group_activity(self, db, trainer_user, other_group):
        client, headers = _client_for(trainer_user)
        r = client.get(
            "/api/v1/student-portal/admin/analytics/group-activity",
            params={"group_id": other_group.id, "catalog_item_id": 999999},
            headers=headers,
        )
        assert r.status_code == 403

    def test_owner_sees_any_group_activity(self, db, owner_user, other_group):
        client, headers = _client_for(owner_user)
        r = client.get(
            "/api/v1/student-portal/admin/analytics/group-activity",
            params={"group_id": other_group.id, "catalog_item_id": 999999},
            headers=headers,
        )
        assert r.status_code == 200
