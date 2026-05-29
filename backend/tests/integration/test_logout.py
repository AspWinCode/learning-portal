from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from jose import jwt

from app import auth


class FakeRedis:
    def __init__(self):
        self.storage = {}

    def setex(self, key, ttl, value):
        self.storage[key] = {"ttl": ttl, "value": value}

    def exists(self, key):
        entry = self.storage.get(key)
        if not entry:
            return 0
        return 1 if entry["ttl"] > 0 else 0


def test_logout_invalidates_token(client: TestClient, monkeypatch) -> None:
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)

    login_response = client.post("/api/v1/auth/guest", json={})
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    logout_response = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_response.status_code == 200

    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 401


def test_token_without_jti_is_rejected(client: TestClient, monkeypatch) -> None:
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)

    token = jwt.encode(
        {
            "sub": "guest",
            "role": "guest",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        auth.SECRET_KEY,
        algorithm=auth.ALGORITHM,
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_new_token_after_logout_works(client: TestClient, monkeypatch) -> None:
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)

    first = client.post("/api/v1/auth/guest", json={})
    first_token = first.json()["access_token"]
    first_headers = {"Authorization": f"Bearer {first_token}"}
    client.post("/api/v1/auth/logout", headers=first_headers)

    second = client.post("/api/v1/auth/guest", json={})
    second_token = second.json()["access_token"]
    second_headers = {"Authorization": f"Bearer {second_token}"}

    response = client.get("/api/v1/auth/me", headers=second_headers)
    assert response.status_code == 200
