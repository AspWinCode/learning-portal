import importlib
import os
from datetime import timedelta
from types import SimpleNamespace

import pytest
import dotenv
from jose import jwt

import app.auth as auth


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


@pytest.fixture(autouse=True)
def restore_auth_module(monkeypatch):
    original_secret = os.environ.get("SECRET_KEY")
    yield
    monkeypatch.setenv("SECRET_KEY", original_secret or "x" * 32)
    importlib.reload(auth)


def test_validate_password_strength_rejects_short():
    with pytest.raises(ValueError):
        auth.validate_password_strength("1")


def test_validate_password_strength_rejects_letters_only():
    with pytest.raises(ValueError):
        auth.validate_password_strength("onlyletters")


def test_validate_password_strength_rejects_digits_only():
    with pytest.raises(ValueError):
        auth.validate_password_strength("12345678")


def test_validate_password_strength_accepts_strong_password():
    auth.validate_password_strength("Secure123")


def test_add_and_check_token_blacklist(monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)
    auth.add_token_to_blacklist("token-jti", 30)
    assert auth.is_token_blacklisted("token-jti") is True


def test_add_token_to_blacklist_ignores_empty_jti(monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)
    auth.add_token_to_blacklist("", 30)
    assert fake_redis.storage == {}


def test_add_token_to_blacklist_ignores_non_positive_ttl(monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)
    auth.add_token_to_blacklist("token-jti", 0)
    assert fake_redis.storage == {}


def test_blacklist_entry_expires_with_ttl(monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(auth, "get_redis_client", lambda: fake_redis)
    auth.add_token_to_blacklist("token-jti", 1)
    assert auth.is_token_blacklisted("token-jti") is True
    fake_redis.storage[auth._blacklist_key("token-jti")]["ttl"] = 0
    assert auth.is_token_blacklisted("token-jti") is False


def test_create_access_token_adds_jti():
    token = auth.create_access_token({"sub": "user@example.com", "role": "guest"})
    payload = auth.decode_access_token(token)
    assert isinstance(payload.get("jti"), str)
    assert payload["jti"]


def test_create_access_token_preserves_existing_jti():
    token = auth.create_access_token({"sub": "user@example.com", "role": "guest", "jti": "fixed-jti"})
    payload = auth.decode_access_token(token)
    assert payload["jti"] == "fixed-jti"


def test_guest_token_expiry_not_longer_than_24_hours():
    token = auth.create_access_token(
        {"sub": "guest", "role": "guest"},
        expires_delta=timedelta(hours=auth.GUEST_TOKEN_EXPIRE_HOURS),
    )
    payload = auth.decode_access_token(token)
    ttl = auth.get_token_ttl_seconds(payload)
    assert ttl <= auth.GUEST_TOKEN_EXPIRE_HOURS * 3600
    assert ttl > (auth.GUEST_TOKEN_EXPIRE_HOURS - 1) * 3600


def test_guest_user_id_is_rejected_for_db_queries():
    with pytest.raises(PermissionError):
        auth.ensure_persisted_user_id(auth.GUEST_USER_ID)


def test_ensure_persisted_user_id_accepts_regular_id():
    assert auth.ensure_persisted_user_id(42) == 42


def test_get_token_ttl_seconds_returns_zero_without_exp():
    assert auth.get_token_ttl_seconds({}) == 0


@pytest.mark.asyncio
async def test_get_current_user_rejects_token_without_jti():
    token = auth.create_access_token({"sub": "user@example.com", "role": "admin"})
    payload = auth.decode_access_token(token)
    payload.pop("jti", None)
    forged = jwt.encode(payload, auth.SECRET_KEY, algorithm=auth.ALGORITHM)

    with pytest.raises(auth.HTTPException) as exc:
        await auth.get_current_user(token=forged, db=SimpleNamespace())

    assert exc.value.status_code == 401


def test_import_without_secret_key_fails(monkeypatch):
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(KeyError):
        importlib.reload(auth)


def test_import_with_short_secret_key_fails(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "short")
    with pytest.raises(RuntimeError, match="SECRET_KEY must be at least 32 characters"):
        importlib.reload(auth)


def test_import_with_valid_secret_key_succeeds(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a" * 32)
    module = importlib.reload(auth)
    assert module.SECRET_KEY == "a" * 32


def test_assert_not_guest_raises_403_for_guest():
    from fastapi import HTTPException

    from app.dependencies import assert_not_guest

    guest = SimpleNamespace(id=auth.GUEST_USER_ID)
    with pytest.raises(HTTPException) as exc:
        assert_not_guest(guest)
    assert exc.value.status_code == 403


def test_assert_not_guest_passes_for_regular_user():
    from app.dependencies import assert_not_guest

    user = SimpleNamespace(id=42)
    assert_not_guest(user) is None


def test_get_password_hash_and_verify_password_roundtrip():
    hashed = auth.get_password_hash("Secure123")
    assert hashed != "Secure123"
    assert auth.verify_password("Secure123", hashed) is True
    assert auth.verify_password("Wrong123", hashed) is False


def test_get_user_by_email_returns_query_result():
    db = SimpleNamespace()
    query = SimpleNamespace()
    filter_result = SimpleNamespace()
    expected_user = SimpleNamespace(email="user@example.com")
    db.query = lambda model: query
    query.filter = lambda *args, **kwargs: filter_result
    filter_result.first = lambda: expected_user

    assert auth.get_user_by_email(db, "user@example.com") is expected_user


def test_authenticate_user_returns_none_when_user_missing(monkeypatch):
    monkeypatch.setattr(auth, "get_user_by_email", lambda db, email: None)
    assert auth.authenticate_user(SimpleNamespace(), "u@example.com", "Secure123") is None


def test_authenticate_user_returns_none_when_password_invalid(monkeypatch):
    user = SimpleNamespace(hashed_password="hash", is_active=True)
    monkeypatch.setattr(auth, "get_user_by_email", lambda db, email: user)
    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: False)
    assert auth.authenticate_user(SimpleNamespace(), "u@example.com", "Secure123") is None


def test_authenticate_user_returns_none_when_inactive(monkeypatch):
    user = SimpleNamespace(hashed_password="hash", is_active=False)
    monkeypatch.setattr(auth, "get_user_by_email", lambda db, email: user)
    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: True)
    assert auth.authenticate_user(SimpleNamespace(), "u@example.com", "Secure123") is None


def test_authenticate_user_returns_user_when_valid(monkeypatch):
    user = SimpleNamespace(hashed_password="hash", is_active=True)
    monkeypatch.setattr(auth, "get_user_by_email", lambda db, email: user)
    monkeypatch.setattr(auth, "verify_password", lambda plain, hashed: True)
    assert auth.authenticate_user(SimpleNamespace(), "u@example.com", "Secure123") is user


def test_blacklist_token_adds_token_with_remaining_ttl(monkeypatch):
    token = auth.create_access_token({"sub": "user@example.com", "role": "admin"})
    captured = {}

    def _capture(jti, ttl):
        captured["jti"] = jti
        captured["ttl"] = ttl

    monkeypatch.setattr(auth, "add_token_to_blacklist", _capture)
    auth.blacklist_token(token)
    assert captured["jti"]
    assert captured["ttl"] > 0


@pytest.mark.asyncio
async def test_get_current_user_returns_guest_user(monkeypatch):
    monkeypatch.setattr(auth, "is_token_blacklisted", lambda jti: False)
    token = auth.create_access_token({"sub": "guest", "role": "guest"})

    user = await auth.get_current_user(token=token, db=SimpleNamespace())

    assert user.id == auth.GUEST_USER_ID
    assert user.role == auth.UserRole.GUEST


@pytest.mark.asyncio
async def test_get_current_user_returns_persisted_user(monkeypatch):
    persisted = SimpleNamespace(email="user@example.com", is_active=True)
    monkeypatch.setattr(auth, "is_token_blacklisted", lambda jti: False)
    monkeypatch.setattr(auth, "get_user_by_email", lambda db, email: persisted)
    token = auth.create_access_token({"sub": "user@example.com", "role": "admin"})

    user = await auth.get_current_user(token=token, db=SimpleNamespace())

    assert user is persisted


@pytest.mark.asyncio
async def test_get_current_user_rejects_blacklisted_token(monkeypatch):
    monkeypatch.setattr(auth, "is_token_blacklisted", lambda jti: True)
    token = auth.create_access_token({"sub": "user@example.com", "role": "admin"})

    with pytest.raises(auth.HTTPException) as exc:
        await auth.get_current_user(token=token, db=SimpleNamespace())

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_rejects_missing_user(monkeypatch):
    monkeypatch.setattr(auth, "is_token_blacklisted", lambda jti: False)
    monkeypatch.setattr(auth, "get_user_by_email", lambda db, email: None)
    token = auth.create_access_token({"sub": "user@example.com", "role": "admin"})

    with pytest.raises(auth.HTTPException) as exc:
        await auth.get_current_user(token=token, db=SimpleNamespace())

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_active_user_rejects_inactive():
    with pytest.raises(auth.HTTPException) as exc:
        await auth.get_current_active_user(SimpleNamespace(is_active=False))
    assert exc.value.status_code == 400


def test_resolve_effective_role_prefers_active_custom_role_enum():
    user = SimpleNamespace(
        role=auth.UserRole.PARENT,
        custom_role=SimpleNamespace(is_active=True, base_role=auth.UserRole.SALES),
    )
    assert auth.resolve_effective_role(user) == auth.UserRole.SALES


def test_resolve_effective_role_prefers_active_custom_role_string():
    user = SimpleNamespace(
        role=auth.UserRole.PARENT,
        custom_role=SimpleNamespace(is_active=True, base_role="trainer"),
    )
    assert auth.resolve_effective_role(user) == auth.UserRole.TRAINER


def test_normalize_permission_values_filters_empty_and_duplicates():
    result = auth._normalize_permission_values(["sales.access", " ", "sales.access", None, "reports.access"])
    assert result == {"sales.access", "reports.access"}


def test_get_user_permissions_uses_default_role_permissions():
    user = SimpleNamespace(role=auth.UserRole.SALES, custom_role=None, role_permissions=[])
    perms = auth.get_user_permissions(user)
    assert "sales.access" in perms


def test_get_user_permissions_prefers_explicit_permissions_for_custom_role():
    user = SimpleNamespace(
        role=auth.UserRole.PARENT,
        custom_role=SimpleNamespace(is_active=True, base_role=auth.UserRole.SALES),
        role_permissions=["reports.access"],
    )
    perms = auth.get_user_permissions(user)
    assert perms == {"reports.access"}


def test_has_permission_supports_wildcard():
    user = SimpleNamespace(role=auth.UserRole.ADMIN, custom_role=None, role_permissions=["finance.*"])
    assert auth.has_permission(user, "finance.access") is True
    assert auth.has_permission(user, "finance.manage") is True


def test_ensure_permission_raises_for_missing_permission():
    user = SimpleNamespace(role=auth.UserRole.PARENT, custom_role=None, role_permissions=[])
    with pytest.raises(auth.HTTPException) as exc:
        auth.ensure_permission(user, "finance.access")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_role_allows_owner_for_admin(monkeypatch):
    checker = auth.require_role(["admin"])
    user = SimpleNamespace(role=auth.UserRole.OWNER, custom_role=None, role_permissions=["*"])
    result = await checker(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_require_role_checks_sales_permission(monkeypatch):
    checker = auth.require_role(["sales"])
    user = SimpleNamespace(role=auth.UserRole.SALES, custom_role=None, role_permissions=[])
    called = {}

    def _ensure_permission(current_user, permission):
        called["user"] = current_user
        called["permission"] = permission

    monkeypatch.setattr(auth, "ensure_permission", _ensure_permission)
    result = await checker(current_user=user)
    assert result is user
    assert called["user"] is user
    assert called["permission"] == "sales.access"


@pytest.mark.asyncio
async def test_require_permission_checker_allows_user():
    checker = auth.require_permission("sales.access")
    user = SimpleNamespace(role=auth.UserRole.SALES, custom_role=None, role_permissions=["sales.access"])
    result = await checker(current_user=user)
    assert result is user
