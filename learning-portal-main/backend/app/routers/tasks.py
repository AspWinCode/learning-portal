"""Task manager: templates (admin/owner), tasks CRUD (admin/owner), sales: view tasks + close subtasks."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import auth
from app.models import (
    User,
    UserRole,
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


def _template_to_response(t: TaskTemplate) -> TaskTemplateResponse:
    subtasks = [TaskTemplateSubtaskResponse(id=s.id, template_id=s.template_id, text=s.text, order=s.order) for s in t.subtasks]
    student_ids = [st.student_id for st in t.students] if hasattr(t, "students") else []
    if hasattr(t, "students") and hasattr(t.students, "__iter__"):
        try:
            student_ids = [ts.student_id for ts in t.students]
        except Exception:
            pass
    return TaskTemplateResponse(
        id=t.id,
        name=t.name,
        created_by_id=t.created_by_id,
        created_at=t.created_at,
        subtasks=subtasks,
        student_ids=student_ids,
    )


def _task_to_response(task: Task) -> TaskResponse:
    subtasks = [
        TaskSubtaskResponse(id=s.id, task_id=s.task_id, text=s.text, completed=s.completed, order=s.order)
        for s in sorted(task.subtasks, key=lambda x: (x.order, x.id))
    ]
    total = len(subtasks)
    completed = sum(1 for s in subtasks if s.completed)
    progress = round(100.0 * completed / total, 1) if total else 100.0
    student_ids = []
    if hasattr(task, "students"):
        student_ids = [ts.student_id for ts in task.students]
    return TaskResponse(
        id=task.id,
        title=task.title,
        template_id=task.template_id,
        created_by_id=task.created_by_id,
        assigned_to_id=task.assigned_to_id,
        status=task.status.value if hasattr(task.status, "value") else str(task.status),
        created_at=task.created_at,
        updated_at=task.updated_at,
        subtasks=subtasks,
        student_ids=student_ids,
        progress=progress,
    )


# --- Task templates (admin, owner only) ---

@router.get("/task-templates", response_model=List[TaskTemplateResponse])
async def list_task_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    rows = db.query(TaskTemplate).options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students)).order_by(TaskTemplate.created_at.desc()).all()
    out = []
    for t in rows:
        student_ids = [ts.student_id for ts in t.students]
        out.append(TaskTemplateResponse(
            id=t.id,
            name=t.name,
            created_by_id=t.created_by_id,
            created_at=t.created_at,
            subtasks=[TaskTemplateSubtaskResponse(id=s.id, template_id=s.template_id, text=s.text, order=s.order) for s in t.subtasks],
            student_ids=student_ids,
        ))
    return out


@router.post("/task-templates", response_model=TaskTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_task_template(
    payload: TaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    t = TaskTemplate(name=payload.name.strip(), created_by_id=current_user.id)
    db.add(t)
    db.flush()
    for i, st in enumerate(payload.subtasks or []):
        db.add(TaskTemplateSubtask(template_id=t.id, text=st.text.strip(), order=st.order if st.order is not None else i))
    for sid in payload.student_ids or []:
        if db.query(Student).filter(Student.id == sid).first():
            db.add(TaskTemplateStudent(template_id=t.id, student_id=sid))
    db.commit()
    db.refresh(t)
    t = db.query(TaskTemplate).options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students)).filter(TaskTemplate.id == t.id).first()
    student_ids = [ts.student_id for ts in t.students]
    return TaskTemplateResponse(
        id=t.id,
        name=t.name,
        created_by_id=t.created_by_id,
        created_at=t.created_at,
        subtasks=[TaskTemplateSubtaskResponse(id=s.id, template_id=s.template_id, text=s.text, order=s.order) for s in t.subtasks],
        student_ids=student_ids,
    )


@router.get("/task-templates/{template_id}", response_model=TaskTemplateResponse)
async def get_task_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    t = db.query(TaskTemplate).options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students)).filter(TaskTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    student_ids = [ts.student_id for ts in t.students]
    return TaskTemplateResponse(
        id=t.id,
        name=t.name,
        created_by_id=t.created_by_id,
        created_at=t.created_at,
        subtasks=[TaskTemplateSubtaskResponse(id=s.id, template_id=s.template_id, text=s.text, order=s.order) for s in t.subtasks],
        student_ids=student_ids,
    )


@router.put("/task-templates/{template_id}", response_model=TaskTemplateResponse)
async def update_task_template(
  template_id: int,
  payload: TaskTemplateUpdate,
  db: Session = Depends(get_db),
  current_user: User = Depends(auth.require_role(["admin", "owner"])),
):
    t = db.query(TaskTemplate).options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students)).filter(TaskTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if payload.name is not None:
        t.name = payload.name.strip()
    if payload.subtasks is not None:
        for s in t.subtasks:
            db.delete(s)
        for i, st in enumerate(payload.subtasks):
            db.add(TaskTemplateSubtask(template_id=t.id, text=st.text.strip(), order=st.order if st.order is not None else i))
    if payload.student_ids is not None:
        db.query(TaskTemplateStudent).filter(TaskTemplateStudent.template_id == template_id).delete()
        for sid in payload.student_ids:
            if db.query(Student).filter(Student.id == sid).first():
                db.add(TaskTemplateStudent(template_id=t.id, student_id=sid))
    db.commit()
    db.refresh(t)
    t = db.query(TaskTemplate).options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students)).filter(TaskTemplate.id == template_id).first()
    student_ids = [ts.student_id for ts in t.students]
    return TaskTemplateResponse(
        id=t.id,
        name=t.name,
        created_by_id=t.created_by_id,
        created_at=t.created_at,
        subtasks=[TaskTemplateSubtaskResponse(id=s.id, template_id=s.template_id, text=s.text, order=s.order) for s in t.subtasks],
        student_ids=student_ids,
    )


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


# --- Tasks (admin, owner: full CRUD; sales: list assigned + patch subtask) ---

def _tasks_query(db: Session, current_user: User):
    """Admin/owner видят все задачи, sales тоже видят все (могут закрывать подзадачи)."""
    return db.query(Task).options(joinedload(Task.subtasks), joinedload(Task.students)).order_by(Task.created_at.desc())


@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
  current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    q = _tasks_query(db, current_user)
    if status_filter and status_filter in ("active", "archived"):
        q = q.filter(Task.status == status_filter)
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
        template = db.query(TaskTemplate).options(joinedload(TaskTemplate.subtasks), joinedload(TaskTemplate.students)).filter(TaskTemplate.id == payload.template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
    title = payload.title.strip() if payload.title else (template.name if template else "Задача")
    task = Task(
        title=title,
        template_id=payload.template_id,
        created_by_id=current_user.id,
        assigned_to_id=payload.assigned_to_id,
        status=TaskStatus.ACTIVE.value,
    )
    db.add(task)
    db.flush()
    if template and (not payload.subtasks or len(payload.subtasks) == 0):
        for i, st in enumerate(template.subtasks):
            db.add(TaskSubtask(task_id=task.id, text=st.text, order=st.order if st.order is not None else i, completed=False))
        student_ids = payload.student_ids if payload.student_ids else [ts.student_id for ts in template.students]
    else:
        for i, st in enumerate(payload.subtasks or []):
            db.add(TaskSubtask(task_id=task.id, text=st.text.strip(), order=st.order if st.order is not None else i, completed=False))
        student_ids = payload.student_ids or []
    for sid in student_ids:
        if db.query(Student).filter(Student.id == sid).first():
            db.add(TaskStudent(task_id=task.id, student_id=sid))
    db.commit()
    db.refresh(task)
    task = db.query(Task).options(joinedload(Task.subtasks), joinedload(Task.students)).filter(Task.id == task.id).first()
    return _task_to_response(task)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
  task_id: int,
  db: Session = Depends(get_db),
  current_user: User = Depends(auth.require_role(["admin", "owner", "sales"])),
):
    task = db.query(Task).options(joinedload(Task.subtasks), joinedload(Task.students)).filter(Task.id == task_id).first()
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
    task = db.query(Task).options(joinedload(Task.subtasks), joinedload(Task.students)).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.status is not None:
        task.status = getattr(payload.status, "value", payload.status) or "active"
    if payload.assigned_to_id is not None:
        task.assigned_to_id = payload.assigned_to_id
    if payload.student_ids is not None:
        db.query(TaskStudent).filter(TaskStudent.task_id == task_id).delete()
        for sid in payload.student_ids:
            if db.query(Student).filter(Student.id == sid).first():
                db.add(TaskStudent(task_id=task_id, student_id=sid))
    db.commit()
    db.refresh(task)
    task = db.query(Task).options(joinedload(Task.subtasks), joinedload(Task.students)).filter(Task.id == task_id).first()
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
    task = db.query(Task).options(joinedload(Task.subtasks)).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    st = next((s for s in task.subtasks if s.id == subtask_id), None)
    if not st:
        raise HTTPException(status_code=404, detail="Subtask not found")
    if payload.completed is not None:
        st.completed = payload.completed
    db.commit()
    db.refresh(st)
    return TaskSubtaskResponse(id=st.id, task_id=st.task_id, text=st.text, completed=st.completed, order=st.order)
