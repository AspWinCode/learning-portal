import pytest
from fastapi import HTTPException

from app.models import AiWorkspace, AiWorkspaceAccess, Role, User, UserRole
from app.services.ai_studio import access


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


def _user(role=UserRole.TRAINER, extra_roles=None, permissions=None):
    # role_permissions — read-only property, производная от custom_role,
    # поэтому права в тестах задаём через настоящую (не персистентную) Role,
    # а не напрямую через атрибут.
    u = User()
    u.id = 1
    u.role = role
    u.extra_roles = extra_roles or []
    if permissions is not None:
        u.custom_role = Role(key="test_role", name="Test", base_role=role, permissions=permissions, is_active=True)
    return u


def _workspace(code="kodarena", workspace_id=2):
    w = AiWorkspace()
    w.id = workspace_id
    w.code = code
    return w


def test_owner_can_access_any_workspace():
    owner = _user(role=UserRole.OWNER)
    db = _DB(rows=[])
    assert access.can_access_workspace(db, owner, _workspace("kodarena")) is True
    assert access.can_access_workspace(db, owner, _workspace("academy")) is True


def test_academy_workspace_gated_by_legacy_permission_only():
    # Пользователь без ai_studio.access, но с academy_ai.access — не должен
    # потерять доступ к Академии из-за того, что AI Studio появился в коде.
    user = _user(permissions=["academy_ai.access"])
    db = _DB(rows=[])
    assert access.can_access_workspace(db, user, _workspace("academy")) is True

    # И наоборот: ai_studio.access без academy_ai.access не открывает Академию.
    user2 = _user(permissions=["ai_studio.access"])
    assert access.can_access_workspace(db, user2, _workspace("academy")) is False


def test_generic_workspace_requires_ai_studio_access():
    user = _user(permissions=[])
    db = _DB(rows=[])
    assert access.can_access_workspace(db, user, _workspace("kodarena")) is False

    user2 = _user(permissions=["ai_studio.access"])
    assert access.can_access_workspace(db, user2, _workspace("kodarena")) is True


def test_generic_workspace_open_when_no_access_rows_configured():
    user = _user(permissions=["ai_studio.access"])
    db = _DB(rows=[])
    assert access.can_access_workspace(db, user, _workspace("kodarena")) is True


def test_generic_workspace_restricted_once_rows_exist():
    user = _user(permissions=["ai_studio.access"])
    other_user_row = AiWorkspaceAccess(workspace_id=2, user_id=999, role=None)
    db = _DB(rows=[other_user_row])
    assert access.can_access_workspace(db, user, _workspace("kodarena")) is False

    role_row = AiWorkspaceAccess(workspace_id=2, user_id=None, role=UserRole.TRAINER.value)
    db_role = _DB(rows=[role_row])
    assert access.can_access_workspace(db_role, user, _workspace("kodarena")) is True


def test_ensure_workspace_access_raises_403():
    user = _user(permissions=[])
    db = _DB(rows=[])
    with pytest.raises(HTTPException) as exc:
        access.ensure_workspace_access(db, user, _workspace("kodarena"))
    assert exc.value.status_code == 403
