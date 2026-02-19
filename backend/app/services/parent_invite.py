"""Создание родителя с приглашением (ссылка для установки пароля). Используется из карточки и из раздела пользователей."""
import os
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Tuple

from sqlalchemy.orm import Session

from app import auth
from app.models import User, UserRole


def _hash_invite_token(secret_key: str, token: str) -> str:
    raw = f"{secret_key}:invite:{token}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def create_parent_with_invite(db: Session, email: str, full_name: str) -> Tuple[User, str]:
    """
    Создаёт пользователя с ролью parent и выдаёт ссылку для установки пароля.
    Возвращает (user, invite_link). Если email уже занят, бросает ValueError.
    """
    email = email.strip().lower()
    full_name = (full_name or "").strip() or "Родитель"
    existing = auth.get_user_by_email(db, email=email)
    if existing:
        raise ValueError("Пользователь с таким email уже зарегистрирован")
    token = secrets.token_urlsafe(32)
    token_hash = _hash_invite_token(auth.SECRET_KEY, token)
    expires_at = datetime.utcnow() + timedelta(days=7)
    random_password = secrets.token_urlsafe(24)
    hashed = auth.get_password_hash(random_password)
    db_user = User(
        email=email,
        hashed_password=hashed,
        full_name=full_name,
        role=UserRole.PARENT,
        is_active=True,
        invite_token_hash=token_hash,
        invite_token_expires_at=expires_at,
    )
    db.add(db_user)
    db.flush()
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    invite_link = f"{frontend_url}/set-password?token={token}"
    return db_user, invite_link
