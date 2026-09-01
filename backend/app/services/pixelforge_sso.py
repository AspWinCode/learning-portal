"""SSO-переход ученика из кабинета (tirskix.space) во внешний сервис PixelForge
(платформа обучения GameDev, pixelforge.tirskix.space) и чтение его прогресса
служебным тренером/методистом.

Тот же протокол, что и с КОДЭКС / ТехноЛаб: одноразовый JWT подписывается общим
межсистемным секретом SSO_KODEX_SHARED_SECRET (это shared-secret для всех внешних
площадок, не основной SECRET_KEY ни одной из систем), external_ref ученика — в
формате lp-student-{id} (см. app/services/kodex_sso.py)."""
import hashlib
import hmac
import os
from typing import Optional

import httpx

from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

PIXELFORGE_EXTERNAL_BASE = os.getenv("PIXELFORGE_BASE_URL", "https://pixelforge.tirskix.space")


async def fetch_student_pixelforge_progress(student_id: int) -> Optional[dict]:
    """Тянет прогресс ученика на PixelForge (XP, уровень, курсы, последние сдачи)
    из служебного эндпоинта площадки. Возвращает None, если аккаунт там ещё не
    создан (создаётся при первом SSO-переходе)."""
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")

    external_ref = f"lp-student-{student_id}"
    signature = hmac.new(
        SSO_KODEX_SHARED_SECRET.encode(), external_ref.encode(), hashlib.sha256
    ).hexdigest()

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{PIXELFORGE_EXTERNAL_BASE}/api/internal/lms-progress/{external_ref}",
            headers={"X-LP-Signature": signature},
        )

    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()
