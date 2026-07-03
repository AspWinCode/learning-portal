"""Генерация SSO-токена для перехода ученика из кабинета (tirskix.space)
во внешний курс (например КОДЭКС на lms_academy).

Подписывается ОТДЕЛЬНЫМ секретом SSO_KODEX_SHARED_SECRET — не основным
SECRET_KEY learning-portal и не SECRET_KEY внешней платформы, чтобы утечка
одного из основных секретов не позволяла подделывать переходы между системами.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from jose import jwt

from app.models import CourseCatalogItem, Student

SSO_KODEX_SHARED_SECRET = os.getenv("SSO_KODEX_SHARED_SECRET", "")
SSO_TOKEN_TTL_SECONDS = int(os.getenv("SSO_KODEX_TOKEN_TTL_SECONDS", "60"))


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
