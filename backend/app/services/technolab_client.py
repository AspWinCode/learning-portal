"""Тонкий клиент к Admin API внешней платформы ТехноЛаб (pro-reshaut, pro.tirskix.space).

ТехноЛаб — отдельно задеплоенный проект со своим Postgres: он является источником истины
для курсов/задач/тестов/лекций, мы здесь ничего не храним, только проксируем запросы методиста
от имени сервис-аккаунта (логин/пароль администратора ТехноЛаб)."""
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from jose import jwt

TECHNOLAB_BASE_URL = os.getenv("TECHNOLAB_BASE_URL", "https://pro.tirskix.space")
TECHNOLAB_ADMIN_LOGIN = os.getenv("TECHNOLAB_ADMIN_LOGIN", "")
TECHNOLAB_ADMIN_PASSWORD = os.getenv("TECHNOLAB_ADMIN_PASSWORD", "")

_token_cache: Optional[Dict[str, Any]] = None


def _token_expires_at(token: str) -> float:
    try:
        claims = jwt.get_unverified_claims(token)
        return float(claims.get("exp") or 0)
    except Exception:
        return 0.0


async def _login(client: httpx.AsyncClient) -> Dict[str, Any]:
    if not TECHNOLAB_ADMIN_LOGIN or not TECHNOLAB_ADMIN_PASSWORD:
        raise RuntimeError("TECHNOLAB_ADMIN_LOGIN/TECHNOLAB_ADMIN_PASSWORD не настроены")
    res = await client.post(
        f"{TECHNOLAB_BASE_URL}/api/auth/login",
        json={"login": TECHNOLAB_ADMIN_LOGIN, "password": TECHNOLAB_ADMIN_PASSWORD},
    )
    res.raise_for_status()
    data = res.json()
    return {"access": data["token"], "refresh": data.get("refresh_token"), "exp": _token_expires_at(data["token"])}


async def _get_access_token(client: httpx.AsyncClient) -> str:
    global _token_cache
    now = time.time()
    if _token_cache and _token_cache["exp"] - now > 15:
        return _token_cache["access"]

    if _token_cache and _token_cache.get("refresh"):
        try:
            res = await client.post(
                f"{TECHNOLAB_BASE_URL}/api/auth/refresh",
                json={"refresh_token": _token_cache["refresh"]},
            )
            if res.is_success:
                data = res.json()
                _token_cache = {
                    "access": data["token"],
                    "refresh": data.get("refresh_token", _token_cache["refresh"]),
                    "exp": _token_expires_at(data["token"]),
                }
                return _token_cache["access"]
        except Exception:
            pass

    _token_cache = await _login(client)
    return _token_cache["access"]


class TechnoLabError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(str(detail))


async def _request(method: str, path: str, *, json: Any = None, params: Any = None) -> Any:
    async with httpx.AsyncClient(timeout=20) as client:
        token = await _get_access_token(client)
        res = await client.request(
            method,
            f"{TECHNOLAB_BASE_URL}{path}",
            json=json,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        if res.status_code == 401:
            # Токен мог быть отозван на стороне ТехноЛаб — логинимся заново один раз.
            global _token_cache
            _token_cache = await _login(client)
            res = await client.request(
                method,
                f"{TECHNOLAB_BASE_URL}{path}",
                json=json,
                params=params,
                headers={"Authorization": f"Bearer {_token_cache['access']}"},
            )
        if not res.is_success:
            detail: Any
            try:
                detail = res.json()
            except Exception:
                detail = res.text
            raise TechnoLabError(res.status_code, detail)
        if res.status_code == 204 or not res.content:
            return None
        return res.json()


# ─── Courses ───────────────────────────────────────────────────────────────

async def list_courses() -> List[dict]:
    return await _request("GET", "/api/admin/courses")


async def create_course(payload: dict) -> dict:
    return await _request("POST", "/api/admin/courses", json=payload)


async def get_course(course_id: int) -> dict:
    return await _request("GET", f"/api/admin/courses/{course_id}")


async def update_course(course_id: int, payload: dict) -> dict:
    return await _request("PATCH", f"/api/admin/courses/{course_id}", json=payload)


async def delete_course(course_id: int) -> None:
    await _request("DELETE", f"/api/admin/courses/{course_id}")


async def archive_course(course_id: int) -> None:
    await _request("POST", f"/api/admin/courses/{course_id}/archive")


async def unarchive_course(course_id: int) -> None:
    await _request("POST", f"/api/admin/courses/{course_id}/unarchive")


async def get_course_tree(course_id: int) -> Any:
    return await _request("GET", f"/api/admin/courses/{course_id}/tree")


# ─── Nodes ─────────────────────────────────────────────────────────────────

async def create_node(course_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/courses/{course_id}/nodes", json=payload)


async def update_node(node_id: int, payload: dict) -> dict:
    return await _request("PATCH", f"/api/admin/courses/nodes/{node_id}", json=payload)


async def delete_node(node_id: int) -> None:
    await _request("DELETE", f"/api/admin/courses/nodes/{node_id}")


async def archive_node(node_id: int) -> None:
    await _request("POST", f"/api/admin/courses/nodes/{node_id}/archive")


async def unarchive_node(node_id: int) -> None:
    await _request("POST", f"/api/admin/courses/nodes/{node_id}/unarchive")


async def move_node(node_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/courses/nodes/{node_id}/move", json=payload)


async def reorder_nodes(payload: dict) -> Any:
    return await _request("POST", "/api/admin/courses/nodes/reorder", json=payload)


async def create_node_content(node_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/courses/nodes/{node_id}/content", json=payload)


async def delete_node_content(node_id: int, content_id: int) -> None:
    await _request("DELETE", f"/api/admin/courses/nodes/{node_id}/content/{content_id}")


# ─── Node ↔ task attachment ────────────────────────────────────────────────

async def create_node_task(node_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/courses/nodes/{node_id}/tasks", json=payload)


async def update_node_task(node_id: int, node_task_id: int, payload: dict) -> dict:
    return await _request("PATCH", f"/api/admin/courses/nodes/{node_id}/tasks/{node_task_id}", json=payload)


async def delete_node_task(node_id: int, node_task_id: int) -> None:
    await _request("DELETE", f"/api/admin/courses/nodes/{node_id}/tasks/{node_task_id}")


async def reorder_node_tasks(node_id: int, payload: dict) -> Any:
    return await _request("POST", f"/api/admin/courses/nodes/{node_id}/tasks/reorder", json=payload)


# ─── Tasks ─────────────────────────────────────────────────────────────────

async def get_task(task_id: int) -> dict:
    return await _request("GET", f"/api/tasks/{task_id}")


async def update_task(task_id: int, payload: dict) -> dict:
    # ТехноЛаб принимает PUT для обновления задачи (не PATCH, вопреки остальным
    # ресурсам вроде nodes/tests/lectures) — подтверждено пробой на живом API.
    return await _request("PUT", f"/api/tasks/{task_id}", json=payload)


async def delete_task(task_id: int) -> None:
    await _request("DELETE", f"/api/tasks/{task_id}")


# ─── Tests / hints / lectures ───────────────────────────────────────────────

async def create_task_test(task_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/tasks/{task_id}/tests", json=payload)


async def update_task_test(test_id: int, payload: dict) -> dict:
    return await _request("PATCH", f"/api/tasks/tests/{test_id}", json=payload)


async def delete_task_test(test_id: int) -> None:
    await _request("DELETE", f"/api/tasks/tests/{test_id}")


async def create_task_lecture(task_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/tasks/{task_id}/lectures", json=payload)


async def update_task_lecture(lecture_id: int, payload: dict) -> dict:
    return await _request("PATCH", f"/api/tasks/lectures/{lecture_id}", json=payload)


async def delete_task_lecture(lecture_id: int) -> None:
    await _request("DELETE", f"/api/tasks/lectures/{lecture_id}")


async def create_task_hint(task_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/tasks/{task_id}/hints", json=payload)


async def update_task_hint(hint_id: int, payload: dict) -> dict:
    return await _request("PATCH", f"/api/tasks/hints/{hint_id}", json=payload)


async def delete_task_hint(hint_id: int) -> None:
    await _request("DELETE", f"/api/tasks/hints/{hint_id}")


# ─── Student progress (методист/тренер/родитель) ────────────────────────────

async def find_user_by_login(login: str) -> Optional[dict]:
    """Находит пользователя ТехноЛаб по точному логину (используем SSO external_ref
    вида lp-student-{id}, см. app/services/kodex_sso.py — тот же формат для всех
    внешних площадок)."""
    users = await _request("GET", "/api/users", params={"login": login})
    if not users:
        return None
    return users[0]


async def get_student_progress_overview(student_id: int) -> Optional[dict]:
    """Прогресс ученика на ТехноЛаб: курсы (% прохождения, решённые задачи),
    баланс баллов, последние попытки. None — если ученик там ещё не был (аккаунт
    создаётся только при первом SSO-переходе)."""
    login = f"lp-student-{student_id}"
    user = await find_user_by_login(login)
    if not user:
        return None
    overview = await _request("GET", f"/api/users/{user['id']}/progress-overview")
    return overview
