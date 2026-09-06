"""Тонкий клиент к authoring-API PixelForge (pixelforge.tirskix.space).

PixelForge — отдельно задеплоенная площадка (Spring Boot). Портал здесь ничего
не хранит: студия методиста проксирует запросы в `/api/admin/**` PixelForge.

Авторизация — HMAC общим межсистемным секретом `SSO_KODEX_SHARED_SECRET`
(тот же, что для SSO и `/api/internal/lms-progress`). Каждый запрос подписывается
отдельно, сессии/логина нет.

Каноничная строка подписи (подтверждена совпадением с `openssl dgst -sha256 -hmac`
и фильтром AdminSignatureFilter на стороне PixelForge):

    X-LP-Timestamp: <unix seconds>
    X-LP-Signature: hex( HMAC_SHA256( secret, f"{METHOD}\\n{path}\\n{ts}\\n{sha256_hex(body)}" ) )

`path` — только путь, без query и хоста. Для запросов без тела — `sha256_hex(b"")`.
Для multipart — заголовок `X-LP-Multipart: 1` и подпись по `sha256_hex(b"")`.
"""
import hashlib
import hmac
import os
import time
from typing import Any, Dict, List, Optional

import httpx

from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET

PIXELFORGE_ADMIN_BASE = os.getenv("PIXELFORGE_BASE_URL", "https://pixelforge.tirskix.space")

_EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


class PixelForgeError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(str(detail))


def _sign(method: str, path: str, body: bytes, *, multipart: bool = False) -> Dict[str, str]:
    if not SSO_KODEX_SHARED_SECRET:
        raise RuntimeError("SSO_KODEX_SHARED_SECRET не настроен")
    ts = str(int(time.time()))
    body_hash = _EMPTY_SHA256 if multipart else hashlib.sha256(body or b"").hexdigest()
    msg = f"{method.upper()}\n{path}\n{ts}\n{body_hash}".encode()
    sig = hmac.new(SSO_KODEX_SHARED_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    headers = {"X-LP-Timestamp": ts, "X-LP-Signature": sig}
    if multipart:
        headers["X-LP-Multipart"] = "1"
    return headers


async def _request(
    method: str,
    path: str,
    *,
    json: Any = None,
    params: Any = None,
) -> Any:
    """path — начинается с /api/admin/... Тело сериализуется ровно теми же
    байтами, что и подписываются (httpx `content=`, не `json=`)."""
    body = b""
    request_kwargs: Dict[str, Any] = {"params": params}
    if json is not None:
        import json as _json

        body = _json.dumps(json, separators=(",", ":"), ensure_ascii=False).encode()
        request_kwargs["content"] = body

    headers = _sign(method, path, body)
    if json is not None:
        headers["Content-Type"] = "application/json"

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.request(
            method, f"{PIXELFORGE_ADMIN_BASE}{path}", headers=headers, **request_kwargs
        )

    if not res.is_success:
        detail: Any
        try:
            payload = res.json()
            # PixelForge отдаёт {"error": "..."} для /api/admin/**,
            # {timestamp,status,error,message} для общего хендлера.
            detail = payload.get("message") or payload.get("error") or payload
        except Exception:
            detail = res.text
        raise PixelForgeError(res.status_code, detail)

    if res.status_code == 204 or not res.content:
        return None
    return res.json()


async def list_task_images(task_id: int) -> Any:
    return await _request("GET", f"/api/admin/tasks/{task_id}/images")


async def upload_task_image(task_id: int, filename: str, content: bytes, content_type: str) -> Any:
    path = f"/api/admin/tasks/{task_id}/images"
    headers = _sign("POST", path, b"", multipart=True)
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{PIXELFORGE_ADMIN_BASE}{path}",
            headers=headers,
            files={"file": (filename, content, content_type)},
        )
    if not res.is_success:
        try:
            payload = res.json()
            detail = payload.get("message") or payload.get("error") or payload
        except Exception:
            detail = res.text
        raise PixelForgeError(res.status_code, detail)
    return res.json() if res.content else None


# ─── Курсы (группа a) ──────────────────────────────────────────────────────

async def list_courses() -> List[dict]:
    return await _request("GET", "/api/admin/courses")


async def create_course(payload: dict) -> dict:
    return await _request("POST", "/api/admin/courses", json=payload)


async def get_course(course_id: int) -> dict:
    return await _request("GET", f"/api/admin/courses/{course_id}")


async def update_course(course_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/courses/{course_id}", json=payload)


async def delete_course(course_id: int) -> None:
    await _request("DELETE", f"/api/admin/courses/{course_id}")


async def archive_course(course_id: int) -> None:
    await _request("POST", f"/api/admin/courses/{course_id}/archive")


async def unarchive_course(course_id: int) -> None:
    await _request("POST", f"/api/admin/courses/{course_id}/unarchive")


async def get_course_tree(course_id: int) -> Any:
    return await _request("GET", f"/api/admin/courses/{course_id}/tree")


# ─── Зачисление учеников на курс (§8) ──────────────────────────────────────

async def enroll_student(course_id: int, external_ref: str) -> Any:
    return await _request(
        "POST", f"/api/admin/courses/{course_id}/enroll", json={"externalRef": external_ref}
    )


async def unenroll_student(course_id: int, external_ref: str) -> None:
    await _request("DELETE", f"/api/admin/courses/{course_id}/enroll/{external_ref}")


async def list_course_enrollments(course_id: int) -> List[dict]:
    return await _request("GET", f"/api/admin/courses/{course_id}/enrollments")


# ─── Узлы дерева (группа a) ────────────────────────────────────────────────

async def create_node(course_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/courses/{course_id}/nodes", json=payload)


async def update_node(node_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/nodes/{node_id}", json=payload)


async def delete_node(node_id: int) -> None:
    await _request("DELETE", f"/api/admin/nodes/{node_id}")


async def move_node(node_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/nodes/{node_id}/move", json=payload)


async def reorder_nodes(payload: dict) -> Any:
    return await _request("POST", "/api/admin/nodes/reorder", json=payload)


# ─── Задачи (группа b) ─────────────────────────────────────────────────────

async def get_task(task_id: int) -> dict:
    return await _request("GET", f"/api/admin/tasks/{task_id}")


async def create_node_task(node_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/nodes/{node_id}/tasks", json=payload)


async def update_task(task_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/tasks/{task_id}", json=payload)


async def delete_task(task_id: int) -> None:
    await _request("DELETE", f"/api/admin/tasks/{task_id}")


async def publish_task(task_id: int) -> Any:
    return await _request("POST", f"/api/admin/tasks/{task_id}/publish")


async def unpublish_task(task_id: int) -> Any:
    return await _request("POST", f"/api/admin/tasks/{task_id}/unpublish")


async def delete_node_task(node_id: int, node_task_id: int) -> None:
    await _request("DELETE", f"/api/admin/nodes/{node_id}/tasks/{node_task_id}")


async def reorder_node_tasks(node_id: int, payload: dict) -> Any:
    return await _request("POST", f"/api/admin/nodes/{node_id}/tasks/reorder", json=payload)


# ─── Тесты и подсказки (группа c) ──────────────────────────────────────────

async def list_task_tests(task_id: int) -> List[dict]:
    return await _request("GET", f"/api/admin/tasks/{task_id}/tests")


async def create_task_test(task_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/tasks/{task_id}/tests", json=payload)


async def update_task_test(test_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/tests/{test_id}", json=payload)


async def delete_task_test(test_id: int) -> None:
    await _request("DELETE", f"/api/admin/tests/{test_id}")


async def list_task_hints(task_id: int) -> List[dict]:
    return await _request("GET", f"/api/admin/tasks/{task_id}/hints")


async def create_task_hint(task_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/tasks/{task_id}/hints", json=payload)


async def update_task_hint(hint_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/hints/{hint_id}", json=payload)


async def delete_task_hint(hint_id: int) -> None:
    await _request("DELETE", f"/api/admin/hints/{hint_id}")


# ─── Лекции (группа d) ─────────────────────────────────────────────────────

async def list_lectures() -> List[dict]:
    return await _request("GET", "/api/admin/lectures")


async def create_lecture(payload: dict) -> dict:
    return await _request("POST", "/api/admin/lectures", json=payload)


async def update_lecture(lecture_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/lectures/{lecture_id}", json=payload)


async def delete_lecture(lecture_id: int) -> None:
    await _request("DELETE", f"/api/admin/lectures/{lecture_id}")


async def list_lecture_cards(lecture_id: int) -> List[dict]:
    return await _request("GET", f"/api/admin/lectures/{lecture_id}/cards")


async def create_lecture_card(lecture_id: int, payload: dict) -> dict:
    return await _request("POST", f"/api/admin/lectures/{lecture_id}/cards", json=payload)


async def update_lecture_card(card_id: int, payload: dict) -> dict:
    return await _request("PUT", f"/api/admin/lecture-cards/{card_id}", json=payload)


async def delete_lecture_card(card_id: int) -> None:
    await _request("DELETE", f"/api/admin/lecture-cards/{card_id}")


async def reorder_lecture_cards(lecture_id: int, payload: dict) -> Any:
    return await _request("POST", f"/api/admin/lectures/{lecture_id}/cards/reorder", json=payload)


# ─── Классы (группа e) ─────────────────────────────────────────────────────

async def list_classes() -> List[dict]:
    return await _request("GET", "/api/admin/classes")


async def get_class(class_id: int) -> dict:
    return await _request("GET", f"/api/admin/classes/{class_id}")


async def get_class_students(class_id: int) -> List[dict]:
    return await _request("GET", f"/api/admin/classes/{class_id}/students")
