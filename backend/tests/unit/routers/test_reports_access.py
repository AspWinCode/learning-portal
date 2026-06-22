from types import SimpleNamespace

import pytest

from app.models import UserRole
from app.routers.reports import require_reports_access, require_reports_export


def _user(role: UserRole, permissions=None):
    return SimpleNamespace(
        role=role,
        custom_role=None,
        role_permissions=permissions or [],
    )


@pytest.mark.asyncio
async def test_admin_can_access_reports_without_explicit_permission():
    user = _user(UserRole.ADMIN)

    assert await require_reports_access(user) is user


@pytest.mark.asyncio
async def test_owner_can_export_reports_without_explicit_permission():
    user = _user(UserRole.OWNER)

    assert await require_reports_export(user) is user


@pytest.mark.asyncio
async def test_non_admin_without_reports_permission_is_forbidden():
    with pytest.raises(Exception) as exc:
        await require_reports_access(_user(UserRole.SALES))

    assert getattr(exc.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_non_admin_with_reports_permission_can_access_reports():
    user = _user(UserRole.SALES, ["reports.access"])

    assert await require_reports_access(user) is user
