"""Task manager: templates (admin/owner), tasks CRUD (admin/owner), sales: view tasks + complete subtasks."""
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import auth
from app.models import (
    User,
    Student,
    TaskTemplate,
    TaskTemplateSubtask,
    TaskTemplateStudent,
    Task,
    TaskSubtask,
    TaskStudent,
    TaskStatus,
)
from app.schemas import (
    TaskTemplateCreate,
    TaskTemplateUpdate,
    TaskTemplateResponse,
    TaskTemplateSubtaskResponse,
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskSubtaskResponse,
    TaskSubtaskUpdate,
)

router = APIRouter()


def _norm_date(v):
    """Normalize to date for Pydantic (schema expects date, DB may return datetime)."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    return v


def _template_to_response(t: TaskTemplate) -> TaskTemplateResponse:
    subtasks_sorted = sorted(t.subtasks or [], key=lambda s: (s.order, s.id))
    return TaskTemplateResponse(
        id=t.id,
        name=t.name,
        created_by_id=t.created_by_id,
        created_at=t.created_at,
        subtasks=[
            TaskTemplateSubtaskResponse(id=s.id, template_id=s.template_id, text=s.text, order=s.order)
            for s in subtasks_sorted
        ],
        student_ids=[ts.student_id for ts in (t.students or [])],
        repeat_enabled=getattr(t, "repeat_enabled", False),
        repeat_frequency=getattr(t, "repeat_frequency", None),
        repeat_days=getattr(t, "repeat_days", None),
        repeat_end_type=getattr(t, "repeat_end_type", None),
        repeat_end_after_count=getattr(t, "repeat_end_after_count", None),
        repeat_end_until=_norm_date(getattr(t, "repeat_end_until", None)),
    )


def _task_to_response(task: Task) -> TaskResponse:
    subtasks = [
        TaskSubtaskResponse(id=s.id, task_id=s.task_id, text=s.text, completed=s.completed, order=s.order)
        for s in sorted(task.subtasks, key=lambda x: (x.order, x.id))
    ]
    total = len(subtasks)
    completed = sum(1 for s in subtasks if s.completed)
    if total:
        progress = round(100.0 * completed / total, 1)
    else:
        # Без подзадач: считаем 0% для активных задач и 100% для архивных
        progress = 0.0 if getattr(task, "status", TaskStatus.ACTIVE.value) == TaskStatus.ACTIVE.value else 100.0
    student_ids = [ts.student_id for ts in task.students] if hasattr(task, "students") else []
    category = getattr(task, "category", None) or "schools"
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=getattr(task, "description", None),
        template_id=task.template_id,
        created_by_id=task.created_by_id,
        assigned_to_id=task.assigned_to_id,
        category=category if isinstance(category, str) else "schools",
        status=task.status if isinstance(task.status, str) else getattr(task.status, "value", str(task.status)),
        created_at=task.created_at,
        updated_at=task.updated_at,
        subtasks=subtasks,
        student_ids=student_ids,
        progress=progress,
        repeat_enabled=getattr(task, "repeat_enabled", False),
        repeat_frequency=getattr(task, "repeat_frequency", None),
        repeat_days=getattr(task, "repeat_days", None),
        repeat_end_type=getattr(task, "repeat_end_type", None),
        repeat_end_after_count=getattr(task, "repeat_end_after_count", None),
        repeat_end_until=getattr(task, "repeat_end_until", None),
    )


# --- Task templates (admin, owner only) ---

@router.get("/task-templates", response_model=List[TaskTemplateResponse])
async def list_task_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    try:
        rows = (
            db.query(TaskTemplate)
            .options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students))
            .order_by(TaskTemplate.created_at.desc())
            .all()
        )
        return [_template_to_response(t) for t in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"task_templates list: {type(e).__name__}: {e}")


@router.post("/task-templates", response_model=TaskTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_task_template(
    payload: TaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    try:
        t = TaskTemplate(
            name=payload.name.strip(),
            created_by_id=current_user.id,
            repeat_enabled=payload.repeat_enabled or False,
            repeat_frequency=payload.repeat_frequency,
            repeat_days=payload.repeat_days,
            repeat_end_type=payload.repeat_end_type,
            repeat_end_after_count=payload.repeat_end_after_count,
            repeat_end_until=payload.repeat_end_until,
        )
        db.add(t)
        db.flush()
        for i, st in enumerate(payload.subtasks or []):
            item = st if isinstance(st, dict) else {"text": getattr(st, "text", ""), "order": getattr(st, "order", None)}
            db.add(
                TaskTemplateSubtask(
                    template_id=t.id,
                    text=(item.get("text") or "").strip(),
                    order=item.get("order") if item.get("order") is not None else i,
                )
            )
        for sid in payload.student_ids or []:
            if db.query(Student).filter(Student.id == sid).first():
                db.add(TaskTemplateStudent(template_id=t.id, student_id=sid))
        db.commit()
        db.refresh(t)
        t = (
            db.query(TaskTemplate)
            .options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students))
            .filter(TaskTemplate.id == t.id)
            .first()
        )
        return _template_to_response(t)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"task_templates create: {type(e).__name__}: {e}")


@router.get("/task-templates/{template_id}", response_model=TaskTemplateResponse)
async def get_task_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    t = (
        db.query(TaskTemplate)
        .options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students))
        .filter(TaskTemplate.id == template_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_response(t)


@router.put("/task-templates/{template_id}", response_model=TaskTemplateResponse)
async def update_task_template(
    template_id: int,
    payload: TaskTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    t = (
        db.query(TaskTemplate)
        .options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students))
        .filter(TaskTemplate.id == template_id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if payload.name is not None:
        t.name = payload.name.strip()
    if payload.repeat_enabled is not None:
        t.repeat_enabled = payload.repeat_enabled
    if payload.repeat_frequency is not None:
        t.repeat_frequency = payload.repeat_frequency
    if payload.repeat_days is not None:
        t.repeat_days = payload.repeat_days
    if payload.repeat_end_type is not None:
        t.repeat_end_type = payload.repeat_end_type
    if payload.repeat_end_after_count is not None:
        t.repeat_end_after_count = payload.repeat_end_after_count
    if payload.repeat_end_until is not None:
        t.repeat_end_until = payload.repeat_end_until
    if payload.subtasks is not None:
        for s in t.subtasks:
            db.delete(s)
        for i, st in enumerate(payload.subtasks):
            item = st if isinstance(st, dict) else {"text": getattr(st, "text", ""), "order": getattr(st, "order", None)}
            db.add(
                TaskTemplateSubtask(
                    template_id=t.id,
                    text=(item.get("text") or "").strip(),
                    order=item.get("order") if item.get("order") is not None else i,
                )
            )
    if payload.student_ids is not None:
        db.query(TaskTemplateStudent).filter(TaskTemplateStudent.template_id == template_id).delete()
        for sid in payload.student_ids:
            if db.query(Student).filter(Student.id == sid).first():
                db.add(TaskTemplateStudent(template_id=t.id, student_id=sid))
    db.commit()
    db.refresh(t)
    t = (
        db.query(TaskTemplate)
        .options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students))
        .filter(TaskTemplate.id == template_id)
        .first()
    )
    return _template_to_response(t)


@router.delete("/task-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    t = db.query(TaskTemplate).filter(TaskTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return None


# --- Tasks (admin, owner: full CRUD; sales: list + patch subtask) ---

@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    q = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .order_by(Task.created_at.desc())
    )
    if status_filter and status_filter in ("active", "archived"):
        q = q.filter(Task.status == status_filter)
    if category and category in ("schools", "parents", "leads"):
        q = q.filter(Task.category == category)
    tasks = q.all()
    return [_task_to_response(t) for t in tasks]


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    template = None
    if payload.template_id:
        template = (
            db.query(TaskTemplate)
            .options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students))
            .filter(TaskTemplate.id == payload.template_id)
            .first()
        )
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
    title = (payload.title or "").strip() or (template.name if template else "Задача")
    repeat_enabled = payload.repeat_enabled if payload.repeat_enabled is not None else (getattr(template, "repeat_enabled", False) if template else False)
    repeat_frequency = payload.repeat_frequency if payload.repeat_frequency is not None else (getattr(template, "repeat_frequency", None) if template else None)
    repeat_days = payload.repeat_days if payload.repeat_days is not None else (getattr(template, "repeat_days", None) if template else None)
    repeat_end_type = payload.repeat_end_type if payload.repeat_end_type is not None else (getattr(template, "repeat_end_type", None) if template else None)
    repeat_end_after_count = payload.repeat_end_after_count if payload.repeat_end_after_count is not None else (getattr(template, "repeat_end_after_count", None) if template else None)
    repeat_end_until = payload.repeat_end_until if payload.repeat_end_until is not None else (getattr(template, "repeat_end_until", None) if template else None)
    task_category = getattr(payload, "category", None) or "schools"
    task = Task(
        title=title,
        description=(payload.description or "").strip() or None,
        template_id=payload.template_id,
        created_by_id=current_user.id,
        assigned_to_id=payload.assigned_to_id,
        category=task_category,
        status=TaskStatus.ACTIVE.value,
        repeat_enabled=repeat_enabled,
        repeat_frequency=repeat_frequency,
        repeat_days=repeat_days,
        repeat_end_type=repeat_end_type,
        repeat_end_after_count=repeat_end_after_count,
        repeat_end_until=repeat_end_until,
    )
    db.add(task)
    db.flush()
    if template and (not payload.subtasks or len(payload.subtasks) == 0):
        for i, st in enumerate(template.subtasks):
            db.add(
                TaskSubtask(
                    task_id=task.id,
                    text=st.text,
                    order=st.order if st.order is not None else i,
                    completed=False,
                )
            )
        student_ids = payload.student_ids if payload.student_ids else [ts.student_id for ts in template.students]
    else:
        for i, st in enumerate(payload.subtasks or []):
            item = st if isinstance(st, dict) else {"text": getattr(st, "text", ""), "order": getattr(st, "order", None)}
            db.add(
                TaskSubtask(
                    task_id=task.id,
                    text=(item.get("text") or "").strip(),
                    order=item.get("order") if item.get("order") is not None else i,
                    completed=False,
                )
            )
        student_ids = payload.student_ids or []
    for sid in student_ids:
        if db.query(Student).filter(Student.id == sid).first():
            db.add(TaskStudent(task_id=task.id, student_id=sid))
    db.commit()
    db.refresh(task)
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task.id)
        .first()
    )
    return _task_to_response(task)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(task)


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = (payload.description or "").strip() or None
    if payload.status is not None:
        task.status = getattr(payload.status, "value", payload.status) or "active"
    if payload.assigned_to_id is not None:
        task.assigned_to_id = payload.assigned_to_id
    if payload.category is not None and payload.category in ("schools", "parents", "leads"):
        task.category = payload.category
    if payload.repeat_enabled is not None:
        task.repeat_enabled = payload.repeat_enabled
    if payload.repeat_frequency is not None:
        task.repeat_frequency = payload.repeat_frequency
    if payload.repeat_days is not None:
        task.repeat_days = payload.repeat_days
    if payload.repeat_end_type is not None:
        task.repeat_end_type = payload.repeat_end_type
    if payload.repeat_end_after_count is not None:
        task.repeat_end_after_count = payload.repeat_end_after_count
    if payload.repeat_end_until is not None:
        task.repeat_end_until = payload.repeat_end_until
    if payload.student_ids is not None:
        db.query(TaskStudent).filter(TaskStudent.task_id == task_id).delete()
        for sid in payload.student_ids:
            if db.query(Student).filter(Student.id == sid).first():
                db.add(TaskStudent(task_id=task_id, student_id=sid))
    db.commit()
    db.refresh(task)
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    return _task_to_response(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return None


@router.patch("/tasks/{task_id}/subtasks/{subtask_id}", response_model=TaskSubtaskResponse)
async def update_task_subtask(
    task_id: int,
    subtask_id: int,
    payload: TaskSubtaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    st = next((s for s in task.subtasks if s.id == subtask_id), None)
    if not st:
        raise HTTPException(status_code=404, detail="Subtask not found")
    if payload.completed is not None:
        st.completed = payload.completed
    # Автозакрытие задач и повторяющихся задач при 100% прогрессе (по подзадачам)
    total = len(task.subtasks)
    completed = sum(1 for s in task.subtasks if s.completed)
    all_done = total > 0 and completed == total
    if all_done and task.status == TaskStatus.ACTIVE.value:
        if getattr(task, "repeat_enabled", False):
            new_task = Task(
                title=task.title,
                description=task.description,
                template_id=task.template_id,
                created_by_id=task.created_by_id,
                assigned_to_id=task.assigned_to_id,
                status=TaskStatus.ACTIVE.value,
                repeat_enabled=task.repeat_enabled,
                repeat_frequency=task.repeat_frequency,
                repeat_days=task.repeat_days,
                repeat_end_type=task.repeat_end_type,
                repeat_end_after_count=task.repeat_end_after_count,
                repeat_end_until=task.repeat_end_until,
            )
            db.add(new_task)
            db.flush()
            for s in sorted(task.subtasks, key=lambda x: (x.order, x.id)):
                db.add(
                    TaskSubtask(
                        task_id=new_task.id,
                        text=s.text,
                        order=s.order,
                        completed=False,
                    )
                )
            for ts in task.students:
                db.add(TaskStudent(task_id=new_task.id, student_id=ts.student_id))
        task.status = TaskStatus.ARCHIVED.value
    db.commit()
    db.refresh(st)
    return TaskSubtaskResponse(
        id=st.id,
        task_id=st.task_id,
        text=st.text,
        completed=st.completed,
        order=st.order,
    )


@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    """Ручное завершение задачи менеджером: отправить в архив и при необходимости создать повтор."""
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != TaskStatus.ACTIVE.value:
        return _task_to_response(task)

    total = len(task.subtasks)
    completed = sum(1 for s in task.subtasks if s.completed)
    # Для задач без подзадач считаем, что менеджер вручную довёл прогресс до 100%
    all_done = total == 0 or (total > 0 and completed == total)

    if all_done:
        if getattr(task, "repeat_enabled", False):
            new_task = Task(
                title=task.title,
                description=task.description,
                template_id=task.template_id,
                created_by_id=task.created_by_id,
                assigned_to_id=task.assigned_to_id,
                status=TaskStatus.ACTIVE.value,
                repeat_enabled=task.repeat_enabled,
                repeat_frequency=task.repeat_frequency,
                repeat_days=task.repeat_days,
                repeat_end_type=task.repeat_end_type,
                repeat_end_after_count=task.repeat_end_after_count,
                repeat_end_until=task.repeat_end_until,
            )
            db.add(new_task)
            db.flush()
            for s in sorted(task.subtasks, key=lambda x: (x.order, x.id)):
                db.add(
                    TaskSubtask(
                        task_id=new_task.id,
                        text=s.text,
                        order=s.order,
                        completed=False,
                    )
                )
            for ts in task.students:
                db.add(TaskStudent(task_id=new_task.id, student_id=ts.student_id))
        task.status = TaskStatus.ARCHIVED.value
        db.commit()
        db.refresh(task)

    return _task_to_response(task)
