from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app
from app.routers import auth as auth_router


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
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
        "/api/v1/auth/login",
        data={"username": "nonexistent@example.com", "password": "wrong"},
    )
    assert response.status_code == 401
    data = response.json()
    assert "detail" in data


def test_unhandled_error_is_redacted_in_production(monkeypatch) -> None:
    path = f"/api/v1/test-error-{uuid4().hex}"
    initial_routes = len(app.router.routes)

    async def _boom() -> None:
        raise RuntimeError("intentional production boom")

    app.add_api_route(path, _boom, methods=["GET"])
    app.openapi_schema = None

    try:
        monkeypatch.setenv("APP_ENV", "production")
        test_client = TestClient(app, raise_server_exceptions=False)
        response = test_client.get(path)
    finally:
        del app.router.routes[initial_routes:]
        app.openapi_schema = None

    assert response.status_code == 500
    data = response.json()
    assert data["detail"] == "Internal server error"
    assert "Traceback" not in data["detail"]
    assert "RuntimeError" not in data["detail"]


def test_unhandled_error_includes_traceback_in_development(monkeypatch) -> None:
    path = f"/api/v1/test-error-{uuid4().hex}"
    initial_routes = len(app.router.routes)

    async def _boom() -> None:
        raise RuntimeError("intentional development boom")

    app.add_api_route(path, _boom, methods=["GET"])
    app.openapi_schema = None

    try:
        monkeypatch.setenv("APP_ENV", "development")
        test_client = TestClient(app, raise_server_exceptions=False)
        response = test_client.get(path)
    finally:
        del app.router.routes[initial_routes:]
        app.openapi_schema = None

    assert response.status_code == 500
    data = response.json()
    assert "RuntimeError" in data["detail"] or "Traceback" in data["detail"]


def test_legacy_health_redirects_to_v1(client: TestClient) -> None:
    response = client.get("/api/health", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/api/v1/health"
