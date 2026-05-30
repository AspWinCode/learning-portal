"""Создание родителя с приглашением (ссылка для установки пароля). Используется из карточки и из раздела пользователей."""
import logging
import os
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Tuple

from sqlalchemy.orm import Session

from app import auth
from app.models import User, UserRole
from app.utils.datetime import utcnow

logger = logging.getLogger(__name__)


def _hash_invite_token(secret_key: str, token: str) -> str:
    raw = f"{secret_key}:invite:{token}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def send_invite_email(to_email: str, full_name: str, invite_link: str) -> bool:
    """Отправить письмо с приглашением на установку пароля. Возвращает True если отправлено."""
    try:
        from app.services.email_sender import is_email_configured, send_email
        if not is_email_configured():
            return False
        school_name = (os.getenv("SCHOOL_NAME") or "Учебный портал").strip()
        subject = f"Приглашение в {school_name}"
        body = (
            f"Здравствуйте, {full_name}!\n\n"
            f"Вас пригласили в личный кабинет {school_name}.\n\n"
            f"Для входа установите пароль по ссылке:\n{invite_link}\n\n"
            f"Ссылка действительна 7 дней.\n\n"
            f"Если вы не ожидали этого письма — проигнорируйте его."
        )
        return send_email(to_email=to_email, subject=subject, body=body)
    except Exception:
        logger.exception("Failed to send invite email to %s", to_email)
        return False


def create_invite_for_existing_parent(db: Session, user: User) -> str:
    """
    Генерирует ссылку-приглашение для уже существующего родителя (устанавливает токен на user).
    Возвращает invite_link. Обновляет user.invite_token_hash и invite_token_expires_at.
    Если SMTP настроен — отправляет письмо.
    """
    token = secrets.token_urlsafe(32)
    token_hash = _hash_invite_token(auth.SECRET_KEY, token)
    expires_at = utcnow() + timedelta(days=7)
    user.invite_token_hash = token_hash
    user.invite_token_expires_at = expires_at
    db.add(user)
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    invite_link = f"{frontend_url}/set-password?token={token}"
    send_invite_email(user.email, user.full_name or "Родитель", invite_link)
    return invite_link


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
    Если SMTP настроен — отправляет письмо с invite_link.
    """
    email = email.strip().lower()
    full_name = (full_name or "").strip() or "Родитель"
    existing = auth.get_user_by_email(db, email=email)
    if existing:
        raise ValueError("Пользователь с таким email уже зарегистрирован")
    token = secrets.token_urlsafe(32)
    token_hash = _hash_invite_token(auth.SECRET_KEY, token)
    expires_at = utcnow() + timedelta(days=7)
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
    send_invite_email(email, full_name, invite_link)
    return db_user, invite_link
