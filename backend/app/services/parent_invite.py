"""Создание родителя с приглашением (ссылка для установки пароля). Используется из карточки и из раздела пользователей."""
import os
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Tuple

from sqlalchemy.orm import Session

from app import auth
from app.models import User, UserRole


def _hash_invite_token(secret_key: str, token: str) -> str:
    raw = f"{secret_key}:invite:{token}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def create_invite_for_existing_parent(db: Session, user: User) -> str:
    """
    Генерирует ссылку-приглашение для уже существующего родителя (устанавливает токен на user).
    Возвращает invite_link. Обновляет user.invite_token_hash и invite_token_expires_at.
    """
    token = secrets.token_urlsafe(32)
    token_hash = _hash_invite_token(auth.SECRET_KEY, token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    user.invite_token_hash = token_hash
    user.invite_token_expires_at = expires_at
    db.add(user)
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    return f"{frontend_url}/set-password?token={token}"


def create_parent_user_no_invite(db: Session, email: str, full_name: str) -> User:
    """
    Создаёт пользователя с ролью parent с случайным паролем (без приглашения).
    Для доступа потом вызывают create_invite_for_existing_parent и отправляют ссылку.
    Если email уже занят, бросает ValueError.
    """
    email = email.strip().lower()
    full_name = (full_name or "").strip() or "Родитель"
    existing = auth.get_user_by_email(db, email=email)
    if existing:
        raise ValueError("Пользователь с таким email уже зарегистрирован")
    random_password = secrets.token_urlsafe(24)
    hashed = auth.get_password_hash(random_password)
    db_user = User(
        email=email,
        hashed_password=hashed,
        full_name=full_name,
        role=UserRole.PARENT,
        is_active=True,
    )
    db.add(db_user)
    return db_user


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
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
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
