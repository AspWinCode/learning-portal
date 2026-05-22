from fastapi.testclient import TestClient

from app.routers import auth as auth_router


def test_protected_endpoint_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/students")
    assert response.status_code == 401


def test_login_brute_force_rate_limited(client: TestClient, monkeypatch) -> None:
    def _fake_authenticate_user(db, username: str, password: str):
        return None

    monkeypatch.setattr(auth_router.auth, "authenticate_user", _fake_authenticate_user)

    last_response = None
    for _ in range(11):
        last_response = client.post(
            "/api/auth/login",
            data={"username": "rate-limit@example.com", "password": "wrong"},
        )

    assert last_response is not None
    assert last_response.status_code == 429


def test_password_reset_request_rate_limited(client: TestClient, monkeypatch) -> None:
    async def _fake_password_reset_request_impl(payload, db):
        return {"message": "ok"}

    monkeypatch.setattr(auth_router, "_password_reset_request_impl", _fake_password_reset_request_impl)

    last_response = None
    for _ in range(6):
        last_response = client.post(
            "/api/auth/password-reset/request",
            json={"email": "rate-limit@example.com"},
        )

    assert last_response is not None
    assert last_response.status_code == 429
