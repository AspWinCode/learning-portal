"""
Фикстуры для интеграционных тестов (ТЗ: тесты с тестовой БД / API).
На Python 3.8 app не загружается (аннотации 3.9+), фикстуры делают skip.
"""
import os
import sys

import pytest

if sys.version_info >= (3, 8):
    from fastapi.testclient import TestClient
    from app.main import app
else:
    app = None
    TestClient = None


def _is_db_configured() -> bool:
    """Проверка, что задана реальная БД (не плейсхолдер)."""
    url = (os.getenv("DATABASE_URL") or "").strip()
    return bool(url) and "user:password" not in url and "YOUR_PASSWORD" not in url


@pytest.fixture
def client():
    """HTTP-клиент для вызова API без поднятия сервера."""
    if app is None:
        pytest.skip("Integration tests require Python 3.8+")
    if not _is_db_configured():
        pytest.skip("Integration tests require a configured DATABASE_URL")
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """
    Опционально: токен гостя для запросов, требующих авторизации.
    Использовать в тестах, где нужен любой залогиненный пользователь.
    """
    response = client.post("/api/v1/auth/guest", json={})
    if response.status_code != 200:
        return {}
    data = response.json()
    token = data.get("access_token")
    return {"Authorization": f"Bearer {token}"} if token else {}
