from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User
from app.routers.action_log import log_action
from app.schemas.technolab import (
    TechnoLabCourseCreate,
    TechnoLabCourseUpdate,
    TechnoLabNodeContentCreate,
    TechnoLabNodeCreate,
    TechnoLabNodeMove,
    TechnoLabNodeTaskCreate,
    TechnoLabNodeUpdate,
    TechnoLabTaskHintCreate,
    TechnoLabTaskLectureCreate,
    TechnoLabTaskTestCreate,
    TechnoLabTaskUpdate,
)
from app.services import technolab_client as tl
from app.services.technolab_client import TechnoLabError

router = APIRouter()


def _raise(e: TechnoLabError):
    raise HTTPException(
        status_code=e.status_code if e.status_code < 500 else 502,
        detail=e.detail if e.status_code < 500 else f"ТехноЛаб недоступен: {e.detail}",
    )


# ─── Courses ───────────────────────────────────────────────────────────────

@router.get("/courses")
async def list_courses(current_user: User = Depends(auth.require_permission("technolab.access"))):
    try:
        return await tl.list_courses()
    except TechnoLabError as e:
        _raise(e)


@router.post("/courses", status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: TechnoLabCourseCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
    db: Session = Depends(get_db),
):
    try:
        course = await tl.create_course(payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)
        return
    log_action(db, current_user.id, "create", "technolab_course", course.get("id"), {"title": course.get("title")})
    return course


@router.get("/courses/{course_id}")
async def get_course(course_id: int, current_user: User = Depends(auth.require_permission("technolab.access"))):
    try:
        return await tl.get_course(course_id)
    except TechnoLabError as e:
        _raise(e)


@router.patch("/courses/{course_id}")
async def update_course(
    course_id: int,
    payload: TechnoLabCourseUpdate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_course(course_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.delete_course(course_id)
    except TechnoLabError as e:
        _raise(e)


@router.post("/courses/{course_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_course(course_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.archive_course(course_id)
    except TechnoLabError as e:
        _raise(e)


@router.post("/courses/{course_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
async def unarchive_course(course_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.unarchive_course(course_id)
    except TechnoLabError as e:
        _raise(e)


@router.get("/courses/{course_id}/tree")
async def get_course_tree(course_id: int, current_user: User = Depends(auth.require_permission("technolab.access"))):
    try:
        return await tl.get_course_tree(course_id)
    except TechnoLabError as e:
        _raise(e)


# ─── Nodes ─────────────────────────────────────────────────────────────────

@router.post("/courses/{course_id}/nodes", status_code=status.HTTP_201_CREATED)
async def create_node(
    course_id: int,
    payload: TechnoLabNodeCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.create_node(course_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.patch("/nodes/{node_id}")
async def update_node(
    node_id: int,
    payload: TechnoLabNodeUpdate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_node(node_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(node_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.delete_node(node_id)
    except TechnoLabError as e:
        _raise(e)


@router.post("/nodes/{node_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_node(node_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.archive_node(node_id)
    except TechnoLabError as e:
        _raise(e)


@router.post("/nodes/{node_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
async def unarchive_node(node_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.unarchive_node(node_id)
    except TechnoLabError as e:
        _raise(e)


@router.post("/nodes/{node_id}/move")
async def move_node(
    node_id: int,
    payload: TechnoLabNodeMove,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.move_node(node_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.post("/nodes/reorder")
async def reorder_nodes(
    payload: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.reorder_nodes(payload)
    except TechnoLabError as e:
        _raise(e)


@router.post("/nodes/{node_id}/content", status_code=status.HTTP_201_CREATED)
async def create_node_content(
    node_id: int,
    payload: TechnoLabNodeContentCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.create_node_content(node_id, payload.model_dump())
    except TechnoLabError as e:
        _raise(e)


@router.delete("/nodes/{node_id}/content/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node_content(
    node_id: int,
    content_id: int,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        await tl.delete_node_content(node_id, content_id)
    except TechnoLabError as e:
        _raise(e)


# ─── Node ↔ task attachment (создание задачи методистом) ────────────────────

@router.post("/nodes/{node_id}/tasks", status_code=status.HTTP_201_CREATED)
async def create_node_task(
    node_id: int,
    payload: TechnoLabNodeTaskCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.create_node_task(node_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.patch("/nodes/{node_id}/tasks/{node_task_id}")
async def update_node_task(
    node_id: int,
    node_task_id: int,
    payload: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_node_task(node_id, node_task_id, payload)
    except TechnoLabError as e:
        _raise(e)


@router.delete("/nodes/{node_id}/tasks/{node_task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node_task(
    node_id: int,
    node_task_id: int,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        await tl.delete_node_task(node_id, node_task_id)
    except TechnoLabError as e:
        _raise(e)


@router.post("/nodes/{node_id}/tasks/reorder")
async def reorder_node_tasks(
    node_id: int,
    payload: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.reorder_node_tasks(node_id, payload)
    except TechnoLabError as e:
        _raise(e)


# ─── Tasks ─────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}")
async def get_task(task_id: int, current_user: User = Depends(auth.require_permission("technolab.access"))):
    try:
        return await tl.get_task(task_id)
    except TechnoLabError as e:
        _raise(e)


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    payload: TechnoLabTaskUpdate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_task(task_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.delete_task(task_id)
    except TechnoLabError as e:
        _raise(e)


# ─── Tests (автотесты кода) ──────────────────────────────────────────────────

@router.post("/tasks/{task_id}/tests", status_code=status.HTTP_201_CREATED)
async def create_task_test(
    task_id: int,
    payload: TechnoLabTaskTestCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.create_task_test(task_id, payload.model_dump(exclude_unset=True))
    except TechnoLabError as e:
        _raise(e)


@router.patch("/tests/{test_id}")
async def update_task_test(
    test_id: int,
    payload: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_task_test(test_id, payload)
    except TechnoLabError as e:
        _raise(e)


@router.delete("/tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_test(test_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.delete_task_test(test_id)
    except TechnoLabError as e:
        _raise(e)


# ─── Lectures ──────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/lectures", status_code=status.HTTP_201_CREATED)
async def create_task_lecture(
    task_id: int,
    payload: TechnoLabTaskLectureCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.create_task_lecture(task_id, payload.model_dump())
    except TechnoLabError as e:
        _raise(e)


@router.patch("/lectures/{lecture_id}")
async def update_task_lecture(
    lecture_id: int,
    payload: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_task_lecture(lecture_id, payload)
    except TechnoLabError as e:
        _raise(e)


@router.delete("/lectures/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_lecture(
    lecture_id: int,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        await tl.delete_task_lecture(lecture_id)
    except TechnoLabError as e:
        _raise(e)


# ─── Hints ─────────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/hints", status_code=status.HTTP_201_CREATED)
async def create_task_hint(
    task_id: int,
    payload: TechnoLabTaskHintCreate,
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.create_task_hint(task_id, payload.model_dump())
    except TechnoLabError as e:
        _raise(e)


@router.patch("/hints/{hint_id}")
async def update_task_hint(
    hint_id: int,
    payload: Dict[str, Any],
    current_user: User = Depends(auth.require_permission("technolab.manage")),
):
    try:
        return await tl.update_task_hint(hint_id, payload)
    except TechnoLabError as e:
        _raise(e)


@router.delete("/hints/{hint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_hint(hint_id: int, current_user: User = Depends(auth.require_permission("technolab.manage"))):
    try:
        await tl.delete_task_hint(hint_id)
    except TechnoLabError as e:
        _raise(e)
