from fastapi.testclient import TestClient

from app.routers import auth as auth_router


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"


def test_root_returns_message(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "API" in data.get("message", "")


def test_auth_login_invalid_returns_401(client: TestClient, monkeypatch) -> None:
    def _fake_authenticate_user(db, username: str, password: str):
        return None

    monkeypatch.setattr(auth_router.auth, "authenticate_user", _fake_authenticate_user)

    response = client.post(
        "/api/auth/login",
        data={"username": "nonexistent@example.com", "password": "wrong"},
    )
    assert response.status_code == 401
    data = response.json()
    assert "detail" in data
