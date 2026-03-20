import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models import User, UserRole

logger = logging.getLogger(__name__)


def _get_token() -> Optional[str]:
    return os.getenv("TELEGRAM_BOT_TOKEN")


def _get_bot_username() -> Optional[str]:
    return os.getenv("TELEGRAM_BOT_USERNAME")


def generate_link_code() -> str:
    # 8 символов, удобно вводить руками
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def issue_link_code(db: Session, user: User, ttl_minutes: int = 10) -> Tuple[str, datetime]:
    code = generate_link_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    user.telegram_link_code = code
    user.telegram_link_code_expires_at = expires_at
    db.add(user)
    db.commit()
    db.refresh(user)
    return code, expires_at


async def send_message(chat_id: int, text: str) -> bool:
    token = _get_token()
    if not token:
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    try:
        # Не тянем внешние зависимости: используем стандартную библиотеку.
        import json
        import urllib.request

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception:
        logger.exception("Telegram sendMessage exception")
        return False


async def notify_user(db: Session, user_id: int, text: str) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.telegram_chat_id:
        return
    await send_message(int(user.telegram_chat_id), text)


async def notify_admins(db: Session, text: str) -> None:
    admins = db.query(User).filter(
        User.role.in_([UserRole.ADMIN, UserRole.OWNER]),
        User.telegram_chat_id.isnot(None)
    ).all()
    for admin in admins:
        try:
            await send_message(int(admin.telegram_chat_id), text)
        except Exception:
            # не роняем основной процесс
            logger.exception("Telegram notify_admins failed for user_id=%s", admin.id)


def build_deep_link(code: str) -> Optional[str]:
    username = _get_bot_username()
    if not username:
        return None
    return f"https://t.me/{username}?start={code}"


