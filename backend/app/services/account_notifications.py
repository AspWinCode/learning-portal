"""Письма при создании учётной записи: логин и пароль на почту пользователя."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def send_account_credentials_email(*, to_email: str, full_name: str, password: str) -> bool:
    """Отправить письмо с логином и паролем от нового аккаунта.

    Возвращает True, если письмо принято к отправке. Если почта не настроена —
    возвращает False (вызывающий код не должен падать из-за этого).
    """
    try:
        from app.services.email_sender import is_email_configured, send_email

        if not is_email_configured():
            return False

        school_name = (os.getenv("SCHOOL_NAME") or "Учебный портал").strip()
        frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
        greeting_name = (full_name or "").strip() or "пользователь"
        subject = f"Доступ в {school_name}"
        body = (
            f"Здравствуйте, {greeting_name}!\n\n"
            f"Для вас создан личный кабинет в {school_name}.\n\n"
            f"Адрес для входа: {frontend_url}\n"
            f"Логин (email): {to_email}\n"
            f"Пароль: {password}\n\n"
            f"Рекомендуем сменить пароль после первого входа.\n\n"
            f"Если вы не ожидали этого письма — сообщите администратору."
        )
        return send_email(to_email=to_email, subject=subject, body=body)
    except Exception:
        logger.exception("Failed to send account credentials email to %s", to_email)
        return False
