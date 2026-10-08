import pytest
from fastapi import HTTPException

from app.models import Role, SmmProject, SmmProjectAccess, User, UserRole
from app.services.smm_projects import access


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def all(self):
        return self._rows


class _DB:
    def __init__(self, rows):
        self._rows = rows

    def query(self, model):
        return _Query(self._rows)


def _user(role=UserRole.TRAINER, permissions=None):
    u = User()
    u.id = 1
    u.role = role
    u.extra_roles = []
    if permissions is not None:
        u.custom_role = Role(key="test_role", name="Test", base_role=role, permissions=permissions, is_active=True)
    return u


def _project(project_id=1):
    p = SmmProject()
    p.id = project_id
    p.code = "test_project"
    return p


def test_owner_can_access_any_project():
    owner = _user(role=UserRole.OWNER)
    db = _DB(rows=[])
    assert access.can_access_project(db, owner, _project()) is True


def test_requires_smm_projects_access_permission():
    user = _user(permissions=[])
    db = _DB(rows=[])
    assert access.can_access_project(db, user, _project()) is False

    user2 = _user(permissions=["smm_projects.access"])
    assert access.can_access_project(db, user2, _project()) is True


def test_open_when_no_access_rows_configured():
    user = _user(permissions=["smm_projects.access"])
    db = _DB(rows=[])
    assert access.can_access_project(db, user, _project()) is True


def test_restricted_once_rows_exist():
    user = _user(permissions=["smm_projects.access"])
    other_user_row = SmmProjectAccess(project_id=1, user_id=999, role=None)
    db = _DB(rows=[other_user_row])
    assert access.can_access_project(db, user, _project()) is False

    role_row = SmmProjectAccess(project_id=1, user_id=None, role=UserRole.TRAINER.value)
    db_role = _DB(rows=[role_row])
    assert access.can_access_project(db_role, user, _project()) is True


def test_ensure_project_access_raises_403():
    user = _user(permissions=[])
    db = _DB(rows=[])
    with pytest.raises(HTTPException) as exc:
        access.ensure_project_access(db, user, _project())
    assert exc.value.status_code == 403
