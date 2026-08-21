"""Генерация SSO-токена для перехода ученика из кабинета (tirskix.space)
во внешний курс (например КОДЭКС на lms_academy).

Подписывается ОТДЕЛЬНЫМ секретом SSO_KODEX_SHARED_SECRET — не основным
SECRET_KEY learning-portal и не SECRET_KEY внешней платформы, чтобы утечка
одного из основных секретов не позволяла подделывать переходы между системами.
"""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

import httpx
from jose import jwt

from app.models import CourseCatalogItem, Student

SSO_KODEX_SHARED_SECRET = os.getenv("SSO_KODEX_SHARED_SECRET", "")
SSO_TOKEN_TTL_SECONDS = int(os.getenv("SSO_KODEX_TOKEN_TTL_SECONDS", "60"))
KODEX_EXTERNAL_BASE = os.getenv("KODEX_BASE_URL", "https://kodex.tirskix.space")


def build_launch_redirect_url(student: Student, catalog_item: CourseCatalogItem) -> Optional[str]:
    """Возвращает URL для редиректа ученика во внешний сервис с одноразовым SSO-токеном,
    либо None если у этого пункта витрины нет external_url или не настроен секрет."""
    if not catalog_item.external_url or not SSO_KODEX_SHARED_SECRET:
        return None

    now = datetime.now(timezone.utc)
    payload = {
        "iss": "tirskix-lms",
        "aud": catalog_item.code,
        "external_ref": f"lp-student-{student.id}",
        "full_name": student.full_name,
        "catalog_item_code": catalog_item.code,
        "iat": now,
        "exp": now + timedelta(seconds=SSO_TOKEN_TTL_SECONDS),
        "jti": str(uuid4()),
    }
    token = jwt.encode(payload, SSO_KODEX_SHARED_SECRET, algorithm="HS256")
    separator = "&" if "?" in catalog_item.external_url else "?"
    return f"{catalog_item.external_url}{separator}token={token}"


async def fetch_student_kodex_detail(student_id: int) -> Optional[dict]:
    """Тянет детальный прогресс ученика (код решений, попытки, статусы по делам)
    из служебного эндпоинта Кодэкс — для просмотра тренером/методистом.
    Возвращает None, если ученик ещё ничего не решал."""
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")

    external_ref = f"lp-student-{student_id}"
    signature = hmac.new(
        SSO_KODEX_SHARED_SECRET.encode(), external_ref.encode(), hashlib.sha256
    ).hexdigest()

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{KODEX_EXTERNAL_BASE}/api/internal/lms-progress/{external_ref}",
            headers={"X-LP-Signature": signature},
        )

    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()
