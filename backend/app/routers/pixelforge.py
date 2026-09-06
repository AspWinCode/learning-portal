import hashlib
import hmac
import logging
import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import CourseCatalogItem, CourseCatalogItemKind, Student, StudentStatus, User
from app.routers.action_log import log_action
from app.schemas.pixelforge import (
    PixelForgeCardCreate,
    PixelForgeCardUpdate,
    PixelForgeCourseCreate,
    PixelForgeCourseUpdate,
    PixelForgeCourseWebhook,
    PixelForgeLecture,
    PixelForgeNodeCreate,
    PixelForgeNodeMove,
    PixelForgeNodeReorder,
    PixelForgeNodeTaskCreate,
    PixelForgeNodeUpdate,
    PixelForgeReorder,
    PixelForgeStudentProgress,
    PixelForgeTaskHint,
    PixelForgeTaskTest,
    PixelForgeTaskUpdate,
)
from app.services import pixelforge_client as pf
from app.services.kodex_sso import SSO_KODEX_SHARED_SECRET
from app.services.pixelforge_client import PixelForgeError
from app.services.pixelforge_sso import PIXELFORGE_EXTERNAL_BASE, fetch_student_pixelforge_progress

logger = logging.getLogger(__name__)
router = APIRouter()


def pixelforge_course_code(course_id: int) -> str:
    return f"pixelforge-{course_id}"


def _raise(e: PixelForgeError):
    raise HTTPException(
        status_code=e.status_code if e.status_code < 500 else 502,
        detail=e.detail if e.status_code < 500 else f"PixelForge недоступен: {e.detail}",
    )


def _manage(current_user: User = Depends(auth.require_permission("pixelforge.manage"))) -> User:
    return current_user


@router.get("/students/{student_id}/progress", response_model=PixelForgeStudentProgress)
async def get_student_progress(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Прогресс ученика на PixelForge. Доступно служебным ролям с pixelforge.access
    (тренер/методист), а также родителю — только для своих активных детей."""
    is_staff = auth.has_permission(current_user, "pixelforge.access")
    is_own_child = False
    if not is_staff and auth.has_permission(current_user, "parent_dashboard.access"):
        student = (
            db.query(Student)
            .filter(
                Student.id == student_id,
                Student.parent_id == current_user.id,
                Student.status == StudentStatus.ACTIVE,
            )
            .first()
        )
        is_own_child = student is not None
    if not is_staff and not is_own_child:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    try:
        overview = await fetch_student_pixelforge_progress(student_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PixelForge недоступен: {e}")

    if not overview:
        return PixelForgeStudentProgress(started=False)
    return PixelForgeStudentProgress(started=True, **overview)


# ─── Вебхук публикации курса (§8.2) — витрина портала ────────────────────────

@router.post("/courses/webhook")
async def pixelforge_course_webhook(request: Request, db: Session = Depends(get_db)):
    """PixelForge зовёт при смене видимости курса. Подпись — HMAC тела общим
    секретом (заголовок X-LP-Signature, как X-Kodex-Signature у progress-sync).
    Ведёт пункт витрины `pixelforge-<course_id>`."""
    raw = await request.body()
    sig = request.headers.get("X-LP-Signature", "")
    secret = SSO_KODEX_SHARED_SECRET.encode("utf-8")
    if not secret or not sig or not hmac.compare_digest(
        hmac.new(secret, raw, hashlib.sha256).hexdigest(), sig
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная подпись")

    payload = PixelForgeCourseWebhook.model_validate_json(raw)
    c = payload.course
    code = pixelforge_course_code(c.id)
    item = db.query(CourseCatalogItem).filter(CourseCatalogItem.code == code).first()

    if payload.event == "published":
        base = PIXELFORGE_EXTERNAL_BASE.rstrip("/")
        external_url = f"{base}/api/auth/sso?course={c.id}"
        if item:
            item.name = c.title
            item.description = c.description
            item.external_url = external_url
            item.is_active = True
        else:
            db.add(CourseCatalogItem(
                code=code,
                name=c.title,
                description=c.description,
                kind=CourseCatalogItemKind.EXTERNAL,
                external_url=external_url,
                is_active=True,
                sort_order=100,
            ))
        db.commit()
    elif payload.event in ("unpublished", "deleted"):
        if item:
            item.is_active = False
            db.commit()
    else:
        logger.warning("pixelforge webhook: unknown event %r", payload.event)

    return {"ok": True}


# ══════════ Студия методиста — проксирование authoring-API PixelForge ══════════
# Всё под pixelforge.manage. Портал ничего не хранит, только прокидывает в
# /api/admin/** PixelForge с HMAC-подписью (pixelforge_client).

def _body(model) -> Dict[str, Any]:
    return model.model_dump(exclude_unset=True)


# ─── Курсы ───────────────────────────────────────────────────────────────────

@router.get("/admin/courses")
async def admin_list_courses(current_user: User = Depends(_manage)):
    try:
        return await pf.list_courses()
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/courses", status_code=status.HTTP_201_CREATED)
async def admin_create_course(
    payload: PixelForgeCourseCreate,
    current_user: User = Depends(_manage),
    db: Session = Depends(get_db),
):
    try:
        course = await pf.create_course(_body(payload))
    except PixelForgeError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "create", "pixelforge_course", course.get("id"), {"title": course.get("title")})
    return course


@router.get("/admin/courses/{course_id}")
async def admin_get_course(course_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.get_course(course_id)
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/courses/{course_id}")
async def admin_update_course(
    course_id: int,
    payload: PixelForgeCourseUpdate,
    current_user: User = Depends(_manage),
    db: Session = Depends(get_db),
):
    try:
        course = await pf.update_course(course_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "update", "pixelforge_course", course_id, _body(payload))
    return course


@router.delete("/admin/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_course(course_id: int, current_user: User = Depends(_manage), db: Session = Depends(get_db)):
    try:
        await pf.delete_course(course_id)
    except PixelForgeError as e:
        _raise(e)
    log_action(db, current_user.id, "delete", "pixelforge_course", course_id, {})


@router.post("/admin/courses/{course_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def admin_archive_course(course_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.archive_course(course_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/courses/{course_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
async def admin_unarchive_course(course_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.unarchive_course(course_id)
    except PixelForgeError as e:
        _raise(e)


@router.get("/admin/courses/{course_id}/tree")
async def admin_course_tree(course_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.get_course_tree(course_id)
    except PixelForgeError as e:
        _raise(e)


# ─── Узлы дерева ─────────────────────────────────────────────────────────────

@router.post("/admin/courses/{course_id}/nodes", status_code=status.HTTP_201_CREATED)
async def admin_create_node(
    course_id: int, payload: PixelForgeNodeCreate, current_user: User = Depends(_manage)
):
    try:
        return await pf.create_node(course_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/nodes/{node_id}")
async def admin_update_node(node_id: int, payload: PixelForgeNodeUpdate, current_user: User = Depends(_manage)):
    try:
        return await pf.update_node(node_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_node(node_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_node(node_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/nodes/{node_id}/move")
async def admin_move_node(node_id: int, payload: PixelForgeNodeMove, current_user: User = Depends(_manage)):
    try:
        return await pf.move_node(node_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/nodes/reorder")
async def admin_reorder_nodes(payload: PixelForgeNodeReorder, current_user: User = Depends(_manage)):
    try:
        return await pf.reorder_nodes(_body(payload))
    except PixelForgeError as e:
        _raise(e)


# ─── Задачи ─────────────────────────────────────────────────────────────────

@router.get("/admin/tasks/{task_id}")
async def admin_get_task(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.get_task(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/nodes/{node_id}/tasks", status_code=status.HTTP_201_CREATED)
async def admin_create_node_task(
    node_id: int, payload: PixelForgeNodeTaskCreate, current_user: User = Depends(_manage)
):
    try:
        return await pf.create_node_task(node_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/tasks/{task_id}")
async def admin_update_task(task_id: int, payload: PixelForgeTaskUpdate, current_user: User = Depends(_manage)):
    try:
        return await pf.update_task(task_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_task(task_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_task(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/tasks/{task_id}/publish")
async def admin_publish_task(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.publish_task(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/tasks/{task_id}/unpublish")
async def admin_unpublish_task(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.unpublish_task(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/nodes/{node_id}/tasks/{node_task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_detach_node_task(node_id: int, node_task_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_node_task(node_id, node_task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/nodes/{node_id}/tasks/reorder")
async def admin_reorder_node_tasks(
    node_id: int, payload: PixelForgeReorder, current_user: User = Depends(_manage)
):
    try:
        return await pf.reorder_node_tasks(node_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.get("/admin/tasks/{task_id}/images")
async def admin_task_images(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.list_task_images(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/tasks/{task_id}/images", status_code=status.HTTP_201_CREATED)
async def admin_upload_task_image(
    task_id: int, file: UploadFile = File(...), current_user: User = Depends(_manage)
):
    try:
        return await pf.upload_task_image(
            task_id, file.filename or "image", await file.read(), file.content_type or "application/octet-stream"
        )
    except PixelForgeError as e:
        _raise(e)


# ─── Тесты ──────────────────────────────────────────────────────────────────

@router.get("/admin/tasks/{task_id}/tests")
async def admin_list_tests(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.list_task_tests(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/tasks/{task_id}/tests", status_code=status.HTTP_201_CREATED)
async def admin_create_test(task_id: int, payload: PixelForgeTaskTest, current_user: User = Depends(_manage)):
    try:
        return await pf.create_task_test(task_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/tests/{test_id}")
async def admin_update_test(test_id: int, payload: PixelForgeTaskTest, current_user: User = Depends(_manage)):
    try:
        return await pf.update_task_test(test_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_test(test_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_task_test(test_id)
    except PixelForgeError as e:
        _raise(e)


# ─── Подсказки ──────────────────────────────────────────────────────────────

@router.get("/admin/tasks/{task_id}/hints")
async def admin_list_hints(task_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.list_task_hints(task_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/tasks/{task_id}/hints", status_code=status.HTTP_201_CREATED)
async def admin_create_hint(task_id: int, payload: PixelForgeTaskHint, current_user: User = Depends(_manage)):
    try:
        return await pf.create_task_hint(task_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/hints/{hint_id}")
async def admin_update_hint(hint_id: int, payload: PixelForgeTaskHint, current_user: User = Depends(_manage)):
    try:
        return await pf.update_task_hint(hint_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/hints/{hint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_hint(hint_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_task_hint(hint_id)
    except PixelForgeError as e:
        _raise(e)


# ─── Лекции ─────────────────────────────────────────────────────────────────

@router.get("/admin/lectures")
async def admin_list_lectures(current_user: User = Depends(_manage)):
    try:
        return await pf.list_lectures()
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/lectures", status_code=status.HTTP_201_CREATED)
async def admin_create_lecture(payload: PixelForgeLecture, current_user: User = Depends(_manage)):
    try:
        return await pf.create_lecture(_body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/lectures/{lecture_id}")
async def admin_update_lecture(lecture_id: int, payload: PixelForgeLecture, current_user: User = Depends(_manage)):
    try:
        return await pf.update_lecture(lecture_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/lectures/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_lecture(lecture_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_lecture(lecture_id)
    except PixelForgeError as e:
        _raise(e)


@router.get("/admin/lectures/{lecture_id}/cards")
async def admin_list_cards(lecture_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.list_lecture_cards(lecture_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/lectures/{lecture_id}/cards", status_code=status.HTTP_201_CREATED)
async def admin_create_card(lecture_id: int, payload: PixelForgeCardCreate, current_user: User = Depends(_manage)):
    try:
        return await pf.create_lecture_card(lecture_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.put("/admin/lecture-cards/{card_id}")
async def admin_update_card(card_id: int, payload: PixelForgeCardUpdate, current_user: User = Depends(_manage)):
    try:
        return await pf.update_lecture_card(card_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


@router.delete("/admin/lecture-cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_card(card_id: int, current_user: User = Depends(_manage)):
    try:
        await pf.delete_lecture_card(card_id)
    except PixelForgeError as e:
        _raise(e)


@router.post("/admin/lectures/{lecture_id}/cards/reorder")
async def admin_reorder_cards(
    lecture_id: int, payload: PixelForgeReorder, current_user: User = Depends(_manage)
):
    try:
        return await pf.reorder_lecture_cards(lecture_id, _body(payload))
    except PixelForgeError as e:
        _raise(e)


# ─── Классы (read-only) ─────────────────────────────────────────────────────

@router.get("/admin/classes")
async def admin_list_classes(current_user: User = Depends(_manage)):
    try:
        return await pf.list_classes()
    except PixelForgeError as e:
        _raise(e)


@router.get("/admin/classes/{class_id}")
async def admin_get_class(class_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.get_class(class_id)
    except PixelForgeError as e:
        _raise(e)


@router.get("/admin/classes/{class_id}/students")
async def admin_class_students(class_id: int, current_user: User = Depends(_manage)):
    try:
        return await pf.get_class_students(class_id)
    except PixelForgeError as e:
        _raise(e)
