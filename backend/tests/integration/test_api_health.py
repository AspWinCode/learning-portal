"""
Интеграционные тесты API (ТЗ: ключевые сценарии с тестовой БД).

Запуск: из корня backend выполнить
  python -m pytest tests/integration/ -v

Unit-тесты owner workspace (сортировка, ключи уведомлений):
  python -m pytest tests/unit/services/test_owner_workspace_task_order.py tests/unit/services/test_owner_workspace_notifications.py -v

Тесты, помеченные @pytest.mark.requires_db, требуют доступную БД (DATABASE_URL).
"""
import os

import pytest
from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    """GET /api/health возвращает 200 и status=ok (без БД)."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"


def test_root_returns_message(client: TestClient) -> None:
    """GET / возвращает приветственное сообщение API."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "API" in data.get("message", "")


@pytest.mark.requires_db
@pytest.mark.skipif(
    not (os.getenv("DATABASE_URL") and "user:password" not in (os.getenv("DATABASE_URL") or "")),
    reason="DATABASE_URL not set or placeholder — skip DB-dependent integration test",
)
def test_auth_login_invalid_returns_401(client: TestClient) -> None:
    """
    POST /api/auth/login с неверными данными возвращает 401.
    Требует доступную БД (иначе тест пропускается).
    """
    response = client.post(
        "/api/auth/login",
        data={"username": "nonexistent@test.local", "password": "wrong"},
    )
    assert response.status_code == 401
    data = response.json()
    assert "detail" in data
