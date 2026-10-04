"""LEGO: права доступа. Проверка на бэкенде (auth/permissions), а не скрытие пунктов меню."""
import pytest
from fastapi import HTTPException

from app import auth
from app.auth import DEFAULT_ROLE_PERMISSIONS
from app.models import LegoGroup, Role, User, UserRole
from app.permissions import PERMISSION_CATALOG, VALID_PERMISSION_KEYS
from app.services import lego_service

LEGO_KEYS = {
    "lego.access",
    "lego.manage",
    "lego.students_manage",
    "lego.attendance",
    "lego.payments_manage",
}


def _user(role: UserRole, user_id: int = 1, permissions=None) -> User:
    user = User(email=f"u{user_id}@example.com", hashed_password="x", full_name="U", role=role, is_active=True)
    user.id = user_id
    if permissions is not None:
        user.custom_role = Role(
            key=f"custom_{user_id}",
            name="Custom",
            base_role=UserRole.TRAINER,
            permissions=permissions,
            is_system=False,
            is_active=True,
        )
    return user


def test_lego_permissions_are_registered_in_catalog() -> None:
    assert LEGO_KEYS <= VALID_PERMISSION_KEYS
    lego_keys = {item["key"] for item in PERMISSION_CATALOG if item["module"] == "lego"}
    assert lego_keys == LEGO_KEYS


def test_owner_has_full_lego_access() -> None:
    owner = _user(UserRole.OWNER)
    for key in LEGO_KEYS:
        assert auth.has_permission(owner, key), key


def test_trainer_without_grant_gets_403() -> None:
    trainer = _user(UserRole.TRAINER)
    for key in LEGO_KEYS:
        assert not auth.has_permission(trainer, key), key
    with pytest.raises(HTTPException) as exc:
        auth.ensure_permission(trainer, "lego.access")
    assert exc.value.status_code == 403


def test_trainer_with_lego_access_sees_module_but_cannot_manage_money() -> None:
    trainer = _user(UserRole.TRAINER, permissions=["lego.access"])
    assert auth.has_permission(trainer, "lego.access")
    assert not auth.has_permission(trainer, "lego.payments_manage")
    assert not auth.has_permission(trainer, "lego.manage")


def test_attendance_grant_does_not_allow_payment_edit() -> None:
    trainer = _user(UserRole.TRAINER, permissions=["lego.access", "lego.attendance"])
    assert auth.has_permission(trainer, "lego.attendance")
    assert not auth.has_permission(trainer, "lego.students_manage")
    with pytest.raises(HTTPException):
        auth.ensure_permission(trainer, "lego.payments_manage")


def test_trainer_sees_only_assigned_groups() -> None:
    trainer = _user(UserRole.TRAINER, user_id=7, permissions=["lego.access"])
    own = LegoGroup(name="Своя", trainer_id=7)
    foreign = LegoGroup(name="Чужая", trainer_id=8)
    assert lego_service.can_see_group(trainer, own)
    assert not lego_service.can_see_group(trainer, foreign)


def test_owner_and_lego_manage_see_every_group() -> None:
    owner = _user(UserRole.OWNER, user_id=1)
    manager = _user(UserRole.TRAINER, user_id=2, permissions=["lego.access", "lego.manage"])
    foreign = LegoGroup(name="Чужая", trainer_id=99)
    assert lego_service.can_see_group(owner, foreign)
    assert lego_service.can_see_group(manager, foreign)


def test_trainer_role_is_not_granted_lego_by_default() -> None:
    trainer_defaults = DEFAULT_ROLE_PERMISSIONS[UserRole.TRAINER.value]
    assert not any(key.startswith("lego.") for key in trainer_defaults)
