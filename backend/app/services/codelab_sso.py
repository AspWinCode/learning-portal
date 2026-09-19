"""SSO-переход ученика из кабинета (tirskix.space) во внешнюю платформу Codelab
(браузерная IDE и автопроверка Python-заданий) и чтение его прогресса служебным
тренером/методистом.

Тот же протокол, что и с КОДЭКС / ТехноЛаб / PixelForge: одноразовый JWT
подписывается общим межсистемным секретом SSO_KODEX_SHARED_SECRET (shared-secret
для всех внешних площадок, не основной SECRET_KEY ни одной из систем),
external_ref ученика — в формате lp-student-{id} (см. app/services/kodex_sso.py).
"""
import hashlib
import hmac
import os
from typing import Optional

import httpx

from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

CODELAB_EXTERNAL_BASE = os.getenv("CODELAB_BASE_URL", "https://codelab.tirskix.space")


async def fetch_student_codelab_progress(student_id: int) -> Optional[dict]:
    """Тянет прогресс ученика на Codelab (решённые задачи, баллы, последние
    посылки) из служебного эндпоинта площадки. Возвращает None, если аккаунт
    там ещё не создан (создаётся при первом SSO-переходе)."""
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")

    external_ref = f"lp-student-{student_id}"
    signature = hmac.new(
        SSO_KODEX_SHARED_SECRET.encode(), external_ref.encode(), hashlib.sha256
    ).hexdigest()

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{CODELAB_EXTERNAL_BASE}/api/internal/lms-progress/{external_ref}",
            headers={"X-LP-Signature": signature},
        )

    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


async def enroll_student(course_id: int, external_ref: str) -> None:
    """Зачисляет ученика на курс Codelab при выдаче доступа в портале."""
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")
    signature = hmac.new(
        SSO_KODEX_SHARED_SECRET.encode(), external_ref.encode(), hashlib.sha256
    ).hexdigest()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{CODELAB_EXTERNAL_BASE}/api/admin/courses/{course_id}/enroll",
            json={"externalRef": external_ref},
            headers={"X-LP-Signature": signature},
        )
    response.raise_for_status()


async def unenroll_student(course_id: int, external_ref: str) -> None:
    """Отзывает зачисление ученика на курс Codelab при отзыве доступа в портале."""
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")
    signature = hmac.new(
        SSO_KODEX_SHARED_SECRET.encode(), external_ref.encode(), hashlib.sha256
    ).hexdigest()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.delete(
            f"{CODELAB_EXTERNAL_BASE}/api/admin/courses/{course_id}/enroll/{external_ref}",
            headers={"X-LP-Signature": signature},
        )
    if response.status_code != 404:
        response.raise_for_status()
