from datetime import datetime

import pytest

from app import auth, schemas
from app.permissions import VALID_PERMISSION_KEYS
from app.models import Role, User, UserRole


def test_resolve_effective_role_uses_active_custom_role_base_role() -> None:
    user = User(
        email="manager@example.com",
        hashed_password="x",
        full_name="Manager",
        role=UserRole.TRAINER,
        is_active=True,
    )
    user.custom_role = Role(
        key="sales_manager",
        name="Sales Manager",
        base_role=UserRole.SALES,
        permissions=["sales.access"],
        is_system=False,
        is_active=True,
    )

    assert auth.resolve_effective_role(user) == UserRole.SALES


def test_resolve_effective_role_falls_back_when_custom_role_inactive() -> None:
    user = User(
        email="trainer@example.com",
        hashed_password="x",
        full_name="Trainer",
        role=UserRole.TRAINER,
        is_active=True,
    )
    user.custom_role = Role(
        key="archived_role",
        name="Archived",
        base_role=UserRole.SALES,
        permissions=[],
        is_system=False,
        is_active=False,
    )

    assert auth.resolve_effective_role(user) == UserRole.TRAINER


def test_role_schema_normalizes_permissions_and_key() -> None:
    payload = schemas.RoleCreate(
        key=" Sales_Manager ",
        name="Sales Manager",
        description="Custom sales role",
        base_role=schemas.UserRole.SALES,
        permissions=["sales.access", "sales.access", " tasks.access "],
    )

    assert payload.key == "sales_manager"
    assert payload.permissions == ["sales.access", "tasks.access"]


def test_role_schema_rejects_invalid_key() -> None:
    with pytest.raises(ValueError):
        schemas.RoleCreate(
            key="Sales Manager!",
            name="Sales Manager",
            description=None,
            base_role=schemas.UserRole.SALES,
            permissions=[],
        )


def test_role_schema_rejects_unknown_permission() -> None:
    with pytest.raises(ValueError):
        schemas.RoleCreate(
            key="sales_manager",
            name="Sales Manager",
            description=None,
            base_role=schemas.UserRole.SALES,
            permissions=["sales.leads.read"],
        )


def test_role_response_tolerates_legacy_permission_keys() -> None:
    role = Role(
        id=7,
        key="ops_manager",
        name="Ops Manager",
        base_role=UserRole.SALES,
        permissions=["sales.access", "admin_tools.manage", "sales.access"],
        is_system=False,
        is_active=True,
        created_at=datetime(2026, 1, 1),
    )

    response = schemas.RoleResponse.model_validate(role)

    assert response.permissions == ["sales.access", "admin_tools.manage"]


def test_has_permission_uses_default_role_permissions_without_custom_role() -> None:
    user = User(
        email="sales@example.com",
        hashed_password="x",
        full_name="Sales",
        role=UserRole.SALES,
        is_active=True,
    )

    assert auth.has_permission(user, "sales.access") is True
    assert auth.has_permission(user, "finance.access") is True
    assert auth.has_permission(user, "tasks.access") is True
    assert auth.has_permission(user, "projects.access") is True
    assert auth.has_permission(user, "owner_workspace.access") is True


def test_has_permission_uses_explicit_custom_role_permissions_when_present() -> None:
    user = User(
        email="assistant@example.com",
        hashed_password="x",
        full_name="Assistant",
        role=UserRole.SALES,
        is_active=True,
    )
    user.custom_role = Role(
        key="assistant_sales",
        name="Assistant Sales",
        base_role=UserRole.SALES,
        permissions=["tasks.access"],
        is_system=False,
        is_active=True,
    )

    assert auth.has_permission(user, "tasks.access") is True
    assert auth.has_permission(user, "sales.access") is False


def test_owner_custom_role_does_not_keep_implicit_wildcard_access() -> None:
    user = User(
        email="owner-assistant@example.com",
        hashed_password="x",
        full_name="Owner Assistant",
        role=UserRole.TRAINER,
        is_active=True,
    )
    user.custom_role = Role(
        key="owner_assistant",
        name="Owner Assistant",
        base_role=UserRole.OWNER,
        permissions=["reports.access"],
        is_system=False,
        is_active=True,
    )

    assert auth.has_permission(user, "reports.access") is True
    assert auth.has_permission(user, "settings.manage") is False
    assert auth.has_permission(user, "owner_calculations.access") is False


def test_trainer_defaults_keep_tasks_and_projects_access() -> None:
    user = User(
        email="trainer@example.com",
        hashed_password="x",
        full_name="Trainer",
        role=UserRole.TRAINER,
        is_active=True,
    )

    assert auth.has_permission(user, "tasks.access") is True
    assert auth.has_permission(user, "projects.access") is True
    assert auth.has_permission(user, "owner_workspace.access") is True


def test_permission_catalog_includes_communication_hub_keys() -> None:
    assert "communications.access" in VALID_PERMISSION_KEYS
    assert "communications.manage" in VALID_PERMISSION_KEYS


def test_communication_template_schema_accepts_channel_and_subject() -> None:
    payload = schemas.CommunicationTemplateCreate(
        name="Parent absence email",
        category="attendance",
        event_key="student_absent",
        channel="email",
        subject="Пропуск занятия: {student_name}",
        text="Ученик {student_name} отсутствовал на уроке.",
        active=True,
    )

    assert payload.channel == "email"
    assert payload.subject == "Пропуск занятия: {student_name}"
