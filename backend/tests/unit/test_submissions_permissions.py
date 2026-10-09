"""submissions.access/submissions.review — OR-семантика с codelab.access
(см. app/routers/codelab.py::_submissions_view/_submissions_review).

Пример: кастомная роль с одним только submissions.access (без codelab.access)
должна проходить просмотр, но не решение по работе; кастомная роль с одним
только codelab.access должна проходить оба (обратная совместимость).
"""
import pytest
from fastapi import HTTPException

from app.models import Role, User, UserRole
from app.routers.codelab import _submissions_review, _submissions_view


def _user_with_custom_permissions(permissions: list[str]) -> User:
    user = User(role=UserRole.TRAINER, is_active=True)
    user.custom_role = Role(
        key="custom_submissions_tester",
        name="Custom",
        base_role=UserRole.TRAINER,
        permissions=permissions,
        is_system=False,
        is_active=True,
    )
    return user


def test_trainer_default_has_both_view_and_review() -> None:
    trainer = User(role=UserRole.TRAINER, is_active=True)
    assert _submissions_view(trainer) is trainer
    assert _submissions_review(trainer) is trainer


def test_only_submissions_access_grants_view_not_review() -> None:
    user = _user_with_custom_permissions(["submissions.access"])
    assert _submissions_view(user) is user
    with pytest.raises(HTTPException) as exc:
        _submissions_review(user)
    assert exc.value.status_code == 403


def test_only_submissions_review_grants_review_not_bare_view_alone() -> None:
    # submissions.review без submissions.access/codelab.access: решение можно,
    # просмотр списком — нет (так и задумано: review уже подразумевает, что
    # конкретную сдачу показали через другой канал; это фиксирует текущее
    # поведение, не рекомендация для реальной роли).
    user = _user_with_custom_permissions(["submissions.review"])
    assert _submissions_review(user) is user
    with pytest.raises(HTTPException):
        _submissions_view(user)


def test_only_codelab_access_still_grants_both_for_backward_compat() -> None:
    user = _user_with_custom_permissions(["codelab.access"])
    assert _submissions_view(user) is user
    assert _submissions_review(user) is user


def test_neither_permission_is_forbidden() -> None:
    # Пустой permissions=[] на кастомной роли трактуется auth.get_user_permissions
    # как "явно не задано" и откатывается на дефолты базовой роли (см.
    # `base = explicit_permissions or default_permissions`) — поэтому для
    # реальной проверки "ничего нет" нужно непустое, но нерелевантное право.
    user = _user_with_custom_permissions(["tasks.access"])
    with pytest.raises(HTTPException) as exc:
        _submissions_view(user)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        _submissions_review(user)
