"""
Unit-тесты сервиса parent_invite (создание родителя с приглашением).
"""
import hashlib
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.services.parent_invite import (
    _hash_invite_token,
    create_invite_for_existing_parent,
    create_parent_user_no_invite,
    create_parent_with_invite,
)
from app.models import UserRole


# ---------------------------------------------------------------------------
# _hash_invite_token
# ---------------------------------------------------------------------------

def test_hash_invite_token_is_deterministic():
    """Одинаковые аргументы -> одинаковый хеш."""
    h1 = _hash_invite_token("secret", "token123")
    h2 = _hash_invite_token("secret", "token123")
    assert h1 == h2


def test_hash_invite_token_different_secrets_produce_different_hashes():
    """Разные секреты -> разные хеши."""
    h1 = _hash_invite_token("secret1", "token")
    h2 = _hash_invite_token("secret2", "token")
    assert h1 != h2


def test_hash_invite_token_different_tokens_produce_different_hashes():
    """Разные токены -> разные хеши."""
    h1 = _hash_invite_token("secret", "tokenA")
    h2 = _hash_invite_token("secret", "tokenB")
    assert h1 != h2


def test_hash_invite_token_returns_sha256_hex():
    """Хеш — 64-символьная hex-строка (SHA-256)."""
    result = _hash_invite_token("secret", "token")
    assert len(result) == 64
    assert all(c in "0123456789abcdef" for c in result)


# ---------------------------------------------------------------------------
# create_invite_for_existing_parent
# ---------------------------------------------------------------------------

def test_create_invite_for_existing_parent_sets_token_hash_and_expiry():
    """Обновляет invite_token_hash и invite_token_expires_at у пользователя."""
    db = MagicMock()
    user = MagicMock()

    with patch("app.services.parent_invite.secrets.token_urlsafe", return_value="rawtoken"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "test_secret"):
        create_invite_for_existing_parent(db, user)

    assert user.invite_token_hash is not None
    assert user.invite_token_hash != "rawtoken"  # должен быть хешем
    assert user.invite_token_expires_at is not None
    db.add.assert_called_once_with(user)


def test_create_invite_for_existing_parent_token_expires_in_7_days():
    """Токен истекает через ~7 дней."""
    db = MagicMock()
    user = MagicMock()

    before = datetime.utcnow()
    with patch("app.services.parent_invite.auth.SECRET_KEY", "test_secret"):
        create_invite_for_existing_parent(db, user)
    after = datetime.utcnow()

    expires = user.invite_token_expires_at
    assert before + timedelta(days=6, hours=23) < expires < after + timedelta(days=7, hours=1)


def test_create_invite_for_existing_parent_returns_correct_link():
    """Возвращает ссылку с токеном."""
    db = MagicMock()
    user = MagicMock()

    with patch("app.services.parent_invite.secrets.token_urlsafe", return_value="mytesttoken"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "s"), \
         patch("app.services.parent_invite.os.getenv", return_value="https://app.example.com"):
        link = create_invite_for_existing_parent(db, user)

    assert link == "https://app.example.com/set-password?token=mytesttoken"


def test_create_invite_for_existing_parent_uses_default_url_when_env_missing():
    """Если FRONTEND_URL не задан, использует http://localhost:3000."""
    db = MagicMock()
    user = MagicMock()

    with patch("app.services.parent_invite.secrets.token_urlsafe", return_value="tok"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "s"), \
         patch("app.services.parent_invite.os.getenv", return_value=None):
        link = create_invite_for_existing_parent(db, user)

    assert link.startswith("http://localhost:3000/set-password?token=")


# ---------------------------------------------------------------------------
# create_parent_user_no_invite
# ---------------------------------------------------------------------------

def test_create_parent_user_no_invite_raises_if_email_exists():
    """Email уже занят -> ValueError."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=MagicMock()):
        with pytest.raises(ValueError, match="уже зарегистрирован"):
            create_parent_user_no_invite(db, "Existing@Mail.RU", "Имя")


def test_create_parent_user_no_invite_normalizes_email():
    """Email приводится к нижнему регистру и обрезается."""
    db = MagicMock()
    created_users = []

    def capture_add(obj):
        created_users.append(obj)

    db.add.side_effect = capture_add

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"):
        create_parent_user_no_invite(db, "  PARENT@EXAMPLE.COM  ", "Родитель")

    assert created_users[0].email == "parent@example.com"


def test_create_parent_user_no_invite_creates_parent_role():
    """Создаётся пользователь с ролью PARENT и is_active=True."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"):
        user = create_parent_user_no_invite(db, "new@example.com", "Новый Родитель")

    assert user.role == UserRole.PARENT
    assert user.is_active is True
    db.add.assert_called_once_with(user)


def test_create_parent_user_no_invite_uses_default_full_name_when_empty():
    """Пустое имя заменяется на 'Родитель'."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"):
        user = create_parent_user_no_invite(db, "p@example.com", "")

    assert user.full_name == "Родитель"


# ---------------------------------------------------------------------------
# create_parent_with_invite
# ---------------------------------------------------------------------------

def test_create_parent_with_invite_raises_if_email_exists():
    """Email уже занят -> ValueError."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=MagicMock()):
        with pytest.raises(ValueError, match="уже зарегистрирован"):
            create_parent_with_invite(db, "taken@mail.com", "Имя")


def test_create_parent_with_invite_returns_user_and_link():
    """Возвращает кортеж (user, invite_link)."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"), \
         patch("app.services.parent_invite.secrets.token_urlsafe", return_value="invitetok"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "s"), \
         patch("app.services.parent_invite.os.getenv", return_value="https://app.test"):
        user, link = create_parent_with_invite(db, "new@example.com", "Родитель")

    assert user is not None
    assert link == "https://app.test/set-password?token=invitetok"


def test_create_parent_with_invite_sets_invite_token_on_user():
    """Созданный пользователь имеет invite_token_hash и invite_token_expires_at."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "secret"):
        user, link = create_parent_with_invite(db, "x@example.com", "Тест")

    assert user.invite_token_hash is not None
    assert user.invite_token_expires_at is not None
    db.add.assert_called_once_with(user)
    db.flush.assert_called_once()


def test_create_parent_with_invite_normalizes_email():
    """Email приводится к нижнему регистру."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "s"):
        user, _ = create_parent_with_invite(db, "  UPPER@MAIL.COM  ", "Имя")

    assert user.email == "upper@mail.com"


def test_create_parent_with_invite_creates_parent_role():
    """Пользователь создаётся с ролью PARENT."""
    db = MagicMock()

    with patch("app.services.parent_invite.auth.get_user_by_email", return_value=None), \
         patch("app.services.parent_invite.auth.get_password_hash", return_value="hashed"), \
         patch("app.services.parent_invite.auth.SECRET_KEY", "s"):
        user, _ = create_parent_with_invite(db, "r@example.com", "Родитель")

    assert user.role == UserRole.PARENT
    assert user.is_active is True
