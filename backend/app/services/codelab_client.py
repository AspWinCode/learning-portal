"""Клиент к серверному admin-API Codelab (`/api/lms-admin/*`).

Методист создаёт/публикует курсы, а преподаватель просматривает и оценивает
посылки — из своего аккаунта портала, не заходя в Codelab напрямую (как уже
работает у PixelForge/Kodex). Портал здесь ничего не хранит, только
проксирует запросы.

Подпись — HMAC общим межсистемным секретом SSO_KODEX_SHARED_SECRET (тот же,
что для SSO/enroll/lms-progress). Схема проще, чем у PixelForge (там подписывается
метод+путь+тело+таймстамп): Codelab подписывает только `staff_external_ref`,
как и остальная эта интеграция (см. codelab_sso.py) — весь запрос считается
доверенным, раз портал уже проверил права пользователя на своей стороне.
"""
import hashlib
import hmac
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

CODELAB_ADMIN_BASE = os.getenv("CODELAB_BASE_URL", "https://codelab.tirskix.space")


class CodelabError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(str(detail))


def staff_role_for_codelab(user_role: str) -> Optional[str]:
    """Роли портала -> роли Codelab. None — пользователь не должен иметь
    доступа к студии Codelab (эндпоинты и так проверяют permission отдельно,
    это дополнительная проверка на случай нестандартной роли)."""
    return {"methodist": "methodist", "trainer": "teacher", "admin": "admin", "owner": "admin"}.get(user_role)


def _staff_params(user) -> Dict[str, str]:
    lms_role = user.effective_role.value if hasattr(user.effective_role, "value") else str(user.effective_role)
    role = staff_role_for_codelab(lms_role)
    if not role:
        raise CodelabError(403, f"Роль {lms_role} не имеет доступа к Codelab Studio")
    return {
        "staff_external_ref": f"lp-user-{user.id}",
        "staff_full_name": user.full_name or user.email or f"user-{user.id}",
        "staff_role": role,
    }


def _sign(external_ref: str) -> str:
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")
    return hmac.new(SSO_KODEX_SHARED_SECRET.encode(), external_ref.encode(), hashlib.sha256).hexdigest()


async def _request(method: str, path: str, user, *, json: Any = None) -> Any:
    params = _staff_params(user)
    signature = _sign(params["staff_external_ref"])
    url = f"{CODELAB_ADMIN_BASE}{path}?{urlencode(params)}"

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.request(method, url, json=json, headers={"X-LP-Signature": signature})

    if not res.is_success:
        try:
            detail = res.json().get("detail", res.text)
        except Exception:
            detail = res.text
        raise CodelabError(res.status_code, detail)

    if res.status_code == 204 or not res.content:
        return None
    return res.json()


# ─── Курсы и дерево ─────────────────────────────────────────────────────────

async def list_courses(user) -> List[dict]:
    return await _request("GET", "/api/lms-admin/courses", user)


async def create_course(user, payload: dict) -> dict:
    return await _request("POST", "/api/lms-admin/courses", user, json=payload)


async def create_task(user, course_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/lms-admin/courses/{course_id}/tasks", user, json=payload)


async def create_item(user, course_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/lms-admin/courses/{course_id}/items", user, json=payload)


async def update_item(user, item_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/lms-admin/items/{item_id}", user, json=payload)


async def delete_item(user, item_id: int) -> None:
    await _request("DELETE", f"/api/lms-admin/items/{item_id}", user)


async def get_course_tree(user, course_id: int) -> Any:
    return await _request("GET", f"/api/lms-admin/courses/{course_id}/tree", user)


async def publish_course(user, course_id: int) -> dict:
    return await _request("POST", f"/api/lms-admin/courses/{course_id}/publish", user)


async def unpublish_course(user, course_id: int) -> dict:
    return await _request("POST", f"/api/lms-admin/courses/{course_id}/unpublish", user)


# ─── Посылки (кабинет преподавателя, TCH-001/003/004) ──────────────────────

async def list_course_submissions(user, course_id: int) -> List[dict]:
    return await _request("GET", f"/api/lms-admin/courses/{course_id}/submissions", user)


async def rerun_submissions(user, course_id: int, submission_ids: List[int]) -> dict:
    return await _request(
        "POST", f"/api/lms-admin/courses/{course_id}/submissions/rerun", user,
        json={"submission_ids": submission_ids},
    )


# ─── Эксплуатационный статус (ADM-004) ──────────────────────────────────────

async def get_system_status(user) -> dict:
    return await _request("GET", "/api/lms-admin/admin/status", user)


async def grade_submission(user, course_id: int, submission_id: int, score: float, comment: str) -> dict:
    # course_id в пути — Codelab проверяет, что посылка правда из этого
    # курса (RBAC-002); заодно позволяет LMS дёшево проверить группу
    # тренера ДО вызова, см. codelab.py router.
    return await _request(
        "PUT", f"/api/lms-admin/courses/{course_id}/submissions/{submission_id}/grade", user,
        json={"score": score, "comment": comment},
    )


# ─── Аналитика курса (ANA-001/002/005) ──────────────────────────────────────

async def get_course_analytics(user, course_id: int) -> dict:
    return await _request("GET", f"/api/lms-admin/courses/{course_id}/analytics", user)
