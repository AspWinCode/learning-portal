"""LEGO API: backend-проверка прав на уровне HTTP (без реальной БД: зависимости подменяются)."""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.database import get_db
from app.main import app
from app.models import Role, User, UserRole


def _user(user_id: int, role: UserRole, permissions=None) -> User:
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


@pytest.fixture
def as_user():
    """Подменяет текущего пользователя и сессию БД; сессия — заглушка без данных."""
    def _set(user: User):
        app.dependency_overrides[auth.get_current_active_user] = lambda: user
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        db.query.return_value.filter.return_value.first.return_value = None
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    yield _set
    app.dependency_overrides.pop(auth.get_current_active_user, None)
    app.dependency_overrides.pop(get_db, None)


def test_trainer_without_lego_grant_gets_403_on_module(as_user) -> None:
    client = as_user(_user(3, UserRole.TRAINER))
    assert client.get("/api/v1/lego/dashboard").status_code == 403
    assert client.get("/api/v1/lego/students").status_code == 403
    assert client.get("/api/v1/lego/debts").status_code == 403


def test_trainer_without_payments_permission_cannot_register_payment(as_user) -> None:
    client = as_user(_user(3, UserRole.TRAINER, permissions=["lego.access", "lego.attendance"]))
    response = client.post("/api/v1/lego/students/1/payments", json={"amount": 3000})
    assert response.status_code == 403


def test_trainer_without_payments_permission_cannot_change_plan(as_user) -> None:
    client = as_user(_user(3, UserRole.TRAINER, permissions=["lego.access", "lego.attendance"]))
    response = client.put("/api/v1/lego/students/1/payment-plan", json={"payment_amount": 1})
    assert response.status_code == 403


def test_trainer_without_manage_cannot_create_group(as_user) -> None:
    client = as_user(_user(3, UserRole.TRAINER, permissions=["lego.access", "lego.attendance"]))
    response = client.post("/api/v1/lego/groups", json={"name": "Новая"})
    assert response.status_code == 403


def test_trainer_with_access_cannot_see_payment_summary(as_user) -> None:
    client = as_user(_user(3, UserRole.TRAINER, permissions=["lego.access"]))
    assert client.get("/api/v1/lego/payment-summary").status_code == 403
    assert client.get("/api/v1/lego/payments").status_code == 403


def test_academy_student_role_gets_403_on_lego(as_user) -> None:
    client = as_user(_user(4, UserRole.PARENT))
    assert client.get("/api/v1/lego/dashboard").status_code == 403
