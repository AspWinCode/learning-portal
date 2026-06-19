"""Task manager: templates (admin/owner), tasks CRUD (admin/owner), sales: view tasks + complete subtasks."""
import re
from datetime import date, datetime, timedelta, time, timezone
from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import auth
from app.models import (
    User,
    Student,
    StudentCard,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    TaskTemplate,
    TaskTemplateSubtask,
    TaskTemplateStudent,
    Task,
    TaskSubtask,
    TaskStudent,
    TaskStatus,
    TaskCounter,
)
from app.schemas.tasks import (
    TaskTemplateCreate,
    TaskTemplateUpdate,
    TaskTemplateResponse,
    TaskTemplateSubtaskResponse,
    TaskCreate,
    TaskAiBreakdownRequest,
    TaskAiBreakdownResponse,
    TaskUpdate,
    TaskResponse,
    TaskSubtaskResponse,
    TaskSubtaskUpdate,
    TaskSubtaskBulkCreate,
    TaskSubtaskBulkResponse,
    TaskCountersResponse,
    ParentResponsesStat,
    TaskCounterIncrement,
    TaskDayDeskResponse,
    TaskDayDeskStats,
    TaskDayStatsResponse,
)
from app.services.ai_task_breakdown import build_task_breakdown_with_ai

router = APIRouter()


# Часовой пояс проекта — Иркутск (UTC+8)
MSK = timezone(timedelta(hours=8))


def _effective_role_value(user: User) -> str:
    return auth.resolve_effective_role(user).value


def _is_sales_user(user: User) -> bool:
    return _effective_role_value(user) == "sales"


def _is_trainer_user(user: User) -> bool:
    return _effective_role_value(user) == "trainer"


def _ensure_task_visible_for_user(task: Task, user: User) -> None:
    if _is_sales_user(user) and task.assigned_to_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="Not allowed")
    if _is_trainer_user(user) and task.assigned_to_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")


def _today_msk() -> Tuple[date, datetime, datetime]:
    """Сегодня по Москве и границы суток в UTC для сравнения с due_at (в БД в UTC)."""
    now_utc = datetime.now(timezone.utc)
    now_msk = now_utc.astimezone(MSK)
    today_msk = now_msk.date()
    start_msk = datetime.combine(today_msk, time.min, tzinfo=MSK)
    end_msk = datetime.combine(today_msk, time.max, tzinfo=MSK)
    start_utc = start_msk.astimezone(timezone.utc)
    end_utc = end_msk.astimezone(timezone.utc)
    return today_msk, start_utc, end_utc


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


def _get_task_payment_state(db: Session, task: Task) -> dict:
    """Для task_kind=payment_overdue: вычисляет payment_state, payment_days_overdue, payment_next_date, parent, balance."""
    if getattr(task, "task_kind", None) != "payment_overdue":
        return {}
    student_ids = [ts.student_id for ts in (task.students or [])]
    if not student_ids:
        return {"payment_state": "unknown", "payment_days_overdue": None, "payment_next_date": None, "payment_parent_name": None, "payment_balance": None}
    student_id = student_ids[0]
    today = date.today()
    card = db.query(StudentCard).filter(
        StudentCard.student_id == student_id,
        StudentCard.archived.is_(False),
    ).first()
    next_pay = _norm_date(getattr(card, "next_payment_date", None)) if card else None

    payment_after_created = False
    if task.created_at:
        payment_after_created = (
            db.query(StudentAccountTransaction.id)
            .join(StudentAccount, StudentAccount.id == StudentAccountTransaction.account_id)
            .filter(
                StudentAccount.student_id == student_id,
                StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT.value,
                StudentAccountTransaction.created_at > task.created_at,
            )
            .first()
            is not None
        )

    if next_pay and (next_pay > today or payment_after_created):
        payment_state = "paid"
    elif next_pay and next_pay < today:
        payment_state = "unpaid"
    else:
        payment_state = "unknown"

    payment_days_overdue = None
    if next_pay and next_pay < today:
        payment_days_overdue = (today - next_pay).days

    student = db.query(Student).filter(Student.id == student_id).first()
    payment_parent_name = None
    if student and getattr(student, "parent_id", None):
        parent = db.query(User).filter(User.id == student.parent_id).first()
        payment_parent_name = getattr(parent, "full_name", None) if parent else None

    balance_row = db.query(func.coalesce(func.sum(StudentAccount.balance), 0)).filter(StudentAccount.student_id == student_id).first()
    payment_balance = float(balance_row[0]) if balance_row else None

    return {
        "payment_state": payment_state,
        "payment_days_overdue": payment_days_overdue,
        "payment_next_date": next_pay,
        "payment_parent_name": payment_parent_name,
        "payment_balance": payment_balance,
    }


def _task_to_response(task: Task, db: Optional[Session] = None) -> TaskResponse:
    subtasks = [
        TaskSubtaskResponse(id=s.id, task_id=s.task_id, text=s.text, completed=s.completed, order=s.order)
        for s in sorted(task.subtasks, key=lambda x: (x.order, x.id))
    ]
    total = len(subtasks)
    completed = sum(1 for s in subtasks if s.completed)
    if total:
        progress = round(100.0 * completed / total, 1)
    else:
        progress = 0.0 if getattr(task, "status", TaskStatus.ACTIVE.value) == TaskStatus.ACTIVE.value else 100.0
    student_ids = [ts.student_id for ts in task.students] if hasattr(task, "students") else []
    tags = getattr(task, "tags", None) or None
    counters_map = {c.counter_key: c.value for c in getattr(task, "counters", []) or []}
    counters = TaskCountersResponse(
        parent_replies=int(counters_map.get("parent_replies", 0) or 0),
        parent_escalations=int(counters_map.get("parent_escalations", 0) or 0),
        parent_to_management=int(counters_map.get("parent_to_management", 0) or 0),
    )
    category = getattr(task, "category", None) or "schools"
    due_at = getattr(task, "due_at", None)
    task_kind = getattr(task, "task_kind", None)
    reminder_stage = getattr(task, "reminder_stage", None)
    extra = {}
    if db and task_kind == "payment_overdue":
        extra = _get_task_payment_state(db, task)
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
        scheduled_for=_norm_date(getattr(task, "scheduled_for", None)),
        due_at=due_at,
        priority=getattr(task, "priority", None) or "normal",
        pinned_today=getattr(task, "pinned_today", False),
        tags=tags,
        task_kind=task_kind,
        reminder_stage=reminder_stage,
        counters=counters,
        subtasks=subtasks,
        student_ids=student_ids,
        progress=progress,
        repeat_enabled=getattr(task, "repeat_enabled", False),
        repeat_frequency=getattr(task, "repeat_frequency", None),
        repeat_days=getattr(task, "repeat_days", None),
        repeat_end_type=getattr(task, "repeat_end_type", None),
        repeat_end_after_count=getattr(task, "repeat_end_after_count", None),
        repeat_end_until=_norm_date(getattr(task, "repeat_end_until", None)),
        **extra,
    )


def _sentence_split(text: str) -> List[str]:
    return [
        part.strip(" \t\r\n-•0123456789.()")
        for part in re.split(r"[\n.;]+", text)
        if part.strip(" \t\r\n-•0123456789.()")
    ]


def _make_task_title(text: str) -> str:
    first_sentence = _sentence_split(text)[0] if _sentence_split(text) else text.strip()
    first_sentence = re.sub(r"\s+", " ", first_sentence).strip()
    if len(first_sentence) <= 80:
        return first_sentence
    return first_sentence[:77].rstrip() + "..."


def _infer_task_priority(text: str) -> str:
    lowered = text.lower()
    high_markers = ("срочно", "горит", "критично", "сегодня", "дедлайн", "просроч")
    low_markers = ("когда будет время", "не срочно", "позже", "низкий приоритет")
    if any(marker in lowered for marker in high_markers):
        return "high"
    if any(marker in lowered for marker in low_markers):
        return "low"
    return "normal"


def _build_ai_subtasks(text: str) -> List[dict]:
    chunks = _sentence_split(text)
    action_verbs = (
        "проверить",
        "подготовить",
        "создать",
        "собрать",
        "написать",
        "позвонить",
        "согласовать",
        "отправить",
        "обновить",
        "найти",
        "исправить",
        "запустить",
        "сделать",
    )
    subtasks: List[str] = []
    for chunk in chunks:
        normalized = re.sub(r"\s+", " ", chunk).strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered.startswith(action_verbs):
            text_item = normalized[:1].upper() + normalized[1:]
        else:
            text_item = f"Разобрать: {normalized[:1].lower() + normalized[1:]}"
        if text_item not in subtasks:
            subtasks.append(text_item)

    if len(subtasks) < 3:
        base = _make_task_title(text).rstrip(".")
        subtasks = [
            f"Уточнить ожидаемый результат по задаче: {base}",
            "Определить ответственных и ограничения по срокам",
            "Составить список материалов, доступов и данных",
            "Выполнить основную работу и зафиксировать результат",
            "Проверить результат и закрыть задачу",
        ]
    else:
        subtasks.insert(0, "Уточнить критерий готовности и срок")
        subtasks.append("Проверить результат и зафиксировать следующий шаг")

    return [{"text": item[:240], "order": idx} for idx, item in enumerate(subtasks[:8])]


# --- Task templates (admin, owner only) ---

@router.get("/task-templates", response_model=List[TaskTemplateResponse])
async def list_task_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    q = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students), joinedload(Task.counters))
        .order_by(Task.created_at.desc())
    )
    if _is_sales_user(current_user):
        q = q.filter(or_(Task.assigned_to_id == current_user.id, Task.assigned_to_id.is_(None)))
    elif _is_trainer_user(current_user):
        q = q.filter(Task.assigned_to_id == current_user.id)
    if status_filter and status_filter in ("active", "archived"):
        q = q.filter(Task.status == status_filter)
    if category and category in ("schools", "parents", "leads"):
        q = q.filter(Task.category == category)
    tasks = q.all()
    return [_task_to_response(t, db) for t in tasks]


@router.get("/tasks/today", response_model=List[TaskResponse])
async def list_today_tasks(
    mode: str = Query("today", pattern="^(today|overdue|active)$"),
    category: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None, description="По умолчанию для sales — текущий пользователь"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    """Задачи для «Плана на сегодня»: today — на сегодня (с сортировкой), overdue — просроченные, active — все активные.
    Границы «сегодня» и «просрочено» — по МСК (UTC+3)."""
    today_msk, today_start_utc, today_end_utc = _today_msk()
    q = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students), joinedload(Task.counters))
        .filter(Task.status == TaskStatus.ACTIVE.value)
    )
    if assignee_id is not None:
        q = q.filter(Task.assigned_to_id == assignee_id)
    elif _is_sales_user(current_user):
        q = q.filter(or_(Task.assigned_to_id == current_user.id, Task.assigned_to_id.is_(None)))
    elif _is_trainer_user(current_user):
        q = q.filter(Task.assigned_to_id == current_user.id)
    if category and category in ("schools", "parents", "leads"):
        q = q.filter(Task.category == category)

    if mode == "today":
        # 1.1 Сегодня: due_at в текущие сутки МСК ИЛИ scheduled_for=today ИЛИ pinned_today ИЛИ (создана сегодня, нет due/scheduled)
        q = q.filter(
            or_(
                Task.scheduled_for == today_msk,
                and_(Task.due_at.isnot(None), Task.due_at >= today_start_utc, Task.due_at <= today_end_utc),
                Task.pinned_today.is_(True),
                and_(
                    Task.scheduled_for.is_(None),
                    Task.due_at.is_(None),
                    Task.pinned_today.is_(False),
                    Task.created_at >= today_start_utc,
                    Task.created_at <= today_end_utc,
                ),
            )
        )
        tasks = q.all()
        # 3.1 Сортировка: high priority → due_at по времени (раньше выше) → pinned выше → по прогрессу (ближе к 100% выше) → createdAt (старые выше)
        def _progress(t: Task):
            st = getattr(t, "subtasks", None) or []
            total = len(st)
            if total == 0:
                return 0.0
            return 100.0 * sum(1 for s in st if getattr(s, "completed", False)) / total

        def _task_sort_key(t: Task):
            due = getattr(t, "due_at", None)
            prio = getattr(t, "priority", None) or "normal"
            pinned = getattr(t, "pinned_today", False)
            created = t.created_at or datetime.min.replace(tzinfo=timezone.utc)
            due_ord = due if due else datetime.max.replace(tzinfo=timezone.utc)
            prio_ord = 0 if prio == "high" else (1 if prio == "normal" else 2)
            return (prio_ord, due_ord, (0 if pinned else 1), -_progress(t), created)
        tasks = sorted(tasks, key=_task_sort_key)
        return [_task_to_response(t, db) for t in tasks]

    if mode == "overdue":
        # 1.2 Просрочено: due_at < today_start (МСК) или scheduled_for < today
        q = q.filter(
            or_(
                and_(Task.scheduled_for.isnot(None), Task.scheduled_for < today_msk),
                and_(Task.due_at.isnot(None), Task.due_at < today_start_utc),
            )
        )
        tasks = q.all()
        # 3.2 Сортировка: самые просроченные выше (срок по возрастанию), затем high priority
        def _overdue_sort_key(t: Task):
            due = getattr(t, "due_at", None)
            sched = getattr(t, "scheduled_for", None)
            prio = getattr(t, "priority", None) or "normal"
            deadline = due if due else (datetime.combine(sched, time.min, tzinfo=MSK).astimezone(timezone.utc) if sched else datetime.max.replace(tzinfo=timezone.utc))
            prio_ord = 0 if prio == "high" else 1
            return (deadline, prio_ord)
        tasks = sorted(tasks, key=_overdue_sort_key)
        return [_task_to_response(t, db) for t in tasks]

    # mode == "active"
    tasks = q.order_by(Task.created_at.desc()).all()
    return [_task_to_response(t, db) for t in tasks]


@router.get("/tasks/stats", response_model=TaskDayStatsResponse)
async def get_tasks_day_stats(
    day: Optional[str] = Query(None, description="YYYY-MM-DD по МСК, по умолчанию сегодня"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    """Количество задач, завершённых (archived) в указанный день по МСК. Для счётчика «Сегодня: N задач, выполнено M»."""
    if day:
        try:
            day_date = date.fromisoformat(day)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date, use YYYY-MM-DD")
        start_msk = datetime.combine(day_date, time.min, tzinfo=MSK)
        end_msk = datetime.combine(day_date, time.max, tzinfo=MSK)
        day_start_utc = start_msk.astimezone(timezone.utc)
        day_end_utc = end_msk.astimezone(timezone.utc)
    else:
        day_date, day_start_utc, day_end_utc = _today_msk()
    q = (
        db.query(Task)
        .filter(Task.status == TaskStatus.ARCHIVED.value)
        .filter(Task.updated_at >= day_start_utc, Task.updated_at <= day_end_utc)
    )
    if _is_sales_user(current_user):
        q = q.filter(or_(Task.assigned_to_id == current_user.id, Task.assigned_to_id.is_(None)))
    elif _is_trainer_user(current_user):
        q = q.filter(Task.assigned_to_id == current_user.id)
    completed_count = q.count()
    return TaskDayStatsResponse(date=day_date, completed_count=completed_count)


@router.get("/tasks/day-desk-summary", response_model=TaskDayDeskResponse)
async def get_tasks_day_desk(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    """Day Desk: сгруппированные задачи для рабочего стола менеджера.

    Группы:
    - urgent: просроченные + дедлайны в ближайшие 2 часа + high priority на сегодня
    - parents: category=parents, сегодня, pinned/важные
    - makeups: tag=makeup
    - payments: tags=payment/renewal
    - operations: прочая операционка
    - leads: category=leads (вечерний блок)
    Общее ограничение: максимум ~25 уникальных задач (остальные считаются в overload).
    """
    today_msk, today_start_utc, today_end_utc = _today_msk()
    now_utc = datetime.now(timezone.utc)
    soon_utc = now_utc + timedelta(hours=2)

    base_q = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students), joinedload(Task.counters))
        .filter(Task.status == TaskStatus.ACTIVE.value)
    )
    # Ограничения по видимости
    if _is_sales_user(current_user):
        base_q = base_q.filter(or_(Task.assigned_to_id == current_user.id, Task.assigned_to_id.is_(None)))
    elif _is_trainer_user(current_user):
        base_q = base_q.filter(Task.assigned_to_id == current_user.id)

    tasks = base_q.all()

    # Подсчёт today/overdue для stats
    def is_today(t: Task) -> bool:
        if t.scheduled_for == today_msk:
            return True
        if t.due_at and today_start_utc <= t.due_at <= today_end_utc:
            return True
        if getattr(t, "pinned_today", False):
            return True
        if not t.scheduled_for and not t.due_at and today_start_utc <= (t.created_at or today_start_utc) <= today_end_utc:
            return True
        return False

    def is_overdue(t: Task) -> bool:
        if t.scheduled_for and t.scheduled_for < today_msk:
            return True
        if t.due_at and t.due_at < today_start_utc:
            return True
        return False

    today_candidates = [t for t in tasks if is_today(t)]
    overdue_candidates = [t for t in tasks if is_overdue(t)]

    # completed_today используем из /tasks/stats, чтобы логика была единой
    stats_today_date, stats_start, stats_end = _today_msk()
    completed_q = (
        db.query(Task)
        .filter(Task.status == TaskStatus.ARCHIVED.value)
        .filter(Task.updated_at >= stats_start, Task.updated_at <= stats_end)
    )
    if _is_sales_user(current_user):
        completed_q = completed_q.filter(or_(Task.assigned_to_id == current_user.id, Task.assigned_to_id.is_(None)))
    elif _is_trainer_user(current_user):
        completed_q = completed_q.filter(Task.assigned_to_id == current_user.id)
    completed_today = completed_q.count()

    # Разбор по группам
    def has_tag(t: Task, tag: str) -> bool:
        tags = getattr(t, "tags", None) or []
        return tag in tags

    urgent_raw: List[Task] = []
    parents_raw: List[Task] = []
    makeups_raw: List[Task] = []
    payments_raw: List[Task] = []
    operations_raw: List[Task] = []
    leads_raw: List[Task] = []

    for t in tasks:
        # Срочно: просроченные, скоро по времени, high priority сегодня
        if is_overdue(t):
            urgent_raw.append(t)
            continue
        if t.due_at and today_start_utc <= t.due_at <= today_end_utc and t.due_at <= soon_utc:
            urgent_raw.append(t)
            continue
        if (t.priority or "normal") == "high" and t.scheduled_for == today_msk:
            urgent_raw.append(t)
            continue

        # Категориальные блоки
        if getattr(t, "category", None) == "parents" and is_today(t):
            parents_raw.append(t)
            continue
        if has_tag(t, "makeup") and is_today(t):
            makeups_raw.append(t)
            continue
        if (has_tag(t, "payment") or has_tag(t, "renewal")) and is_today(t):
            payments_raw.append(t)
            continue
        if getattr(t, "category", None) == "leads" and is_today(t):
            leads_raw.append(t)
            continue

        # Остальное — операционка (если сегодня)
        if is_today(t):
            operations_raw.append(t)

    # Сортировки внутри групп (приблизительные, по приоритету и срокам)
    def sort_key_deadline(t: Task):
        prio = getattr(t, "priority", None) or "normal"
        prio_ord = 0 if prio == "high" else (1 if prio == "normal" else 2)
        due = getattr(t, "due_at", None) or datetime.max.replace(tzinfo=timezone.utc)
        created = t.created_at or datetime.min.replace(tzinfo=timezone.utc)
        return (prio_ord, due, created)

    urgent_raw.sort(key=sort_key_deadline)
    parents_raw.sort(key=sort_key_deadline)
    makeups_raw.sort(key=sort_key_deadline)
    payments_raw.sort(key=sort_key_deadline)
    operations_raw.sort(key=sort_key_deadline)
    leads_raw.sort(key=sort_key_deadline)

    # Глобальный лимит 25 задач
    LIMIT_TOTAL = 25
    limits = {
        "urgent": 7,
        "parents": 7,
        "makeups": 10,
        "payments": 7,
        "operations": 5,
        "leads": 30,
    }

    used_ids: set[int] = set()
    overload = 0

    def take_from(raw: List[Task], key: str) -> List[Task]:
        nonlocal overload
        result: List[Task] = []
        for t in raw:
            if t.id in used_ids:
                continue
            if len(used_ids) >= LIMIT_TOTAL:
                overload += 1
                continue
            if len(result) >= limits[key]:
                overload += 1
                continue
            used_ids.add(t.id)
            result.append(t)
        return result

    urgent = take_from(urgent_raw, "urgent")
    parents = take_from(parents_raw, "parents")
    makeups = take_from(makeups_raw, "makeups")
    payments = take_from(payments_raw, "payments")
    operations = take_from(operations_raw, "operations")
    leads = take_from(leads_raw, "leads")

    stats = TaskDayDeskStats(
        overdue=len(overdue_candidates),
        today=len(today_candidates),
        completed_today=completed_today,
        overload=overload,
    )

    return TaskDayDeskResponse(
        stats=stats,
        urgent=[_task_to_response(t, db) for t in urgent],
        parents=[_task_to_response(t, db) for t in parents],
        makeups=[_task_to_response(t, db) for t in makeups],
        payments=[_task_to_response(t, db) for t in payments],
        operations=[_task_to_response(t, db) for t in operations],
        leads=[_task_to_response(t, db) for t in leads],
    )


@router.get("/tasks/day-desk", response_model=TaskDayDeskResponse)
async def get_tasks_day_desk_legacy(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
) -> TaskDayDeskResponse:
    """Совместимость со старым frontend: алиас для /tasks/day-desk-summary."""
    return await get_tasks_day_desk(db=db, current_user=current_user)


@router.post("/tasks/ai-breakdown", response_model=TaskAiBreakdownResponse)
async def create_task_ai_breakdown(
    payload: TaskAiBreakdownRequest,
    current_user: User = Depends(auth.require_permission("tasks.manage")),
) -> TaskAiBreakdownResponse:
    text = re.sub(r"\s+", " ", (payload.text or "").strip())
    if len(text) < 8:
        raise HTTPException(status_code=400, detail="Опишите задачу подробнее")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="Описание задачи слишком длинное")

    category = payload.category if payload.category in ("schools", "parents", "leads") else "schools"
    ai_breakdown, provider = await build_task_breakdown_with_ai(text, category)
    if ai_breakdown and provider:
        return TaskAiBreakdownResponse(**ai_breakdown, provider=provider)

    return TaskAiBreakdownResponse(
        title=_make_task_title(text),
        description=text,
        category=category,
        priority=_infer_task_priority(text),
        subtasks=_build_ai_subtasks(text),
        provider="rules",
    )


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
        scheduled_for=getattr(payload, "scheduled_for", None),
        due_at=getattr(payload, "due_at", None),
        priority=(getattr(payload, "priority", None) or "normal"),
        pinned_today=getattr(payload, "pinned_today", False) or False,
        tags=getattr(payload, "tags", None),
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
    return _task_to_response(task, db)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_visible_for_user(task, current_user)
    return _task_to_response(task, db)


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    if getattr(payload, "scheduled_for", None) is not None:
        task.scheduled_for = payload.scheduled_for
    if getattr(payload, "due_at", None) is not None:
        task.due_at = payload.due_at
    if getattr(payload, "priority", None) is not None and payload.priority in ("low", "normal", "high"):
        task.priority = payload.priority
    if getattr(payload, "pinned_today", None) is not None:
        task.pinned_today = payload.pinned_today
    if getattr(payload, "tags", None) is not None:
        task.tags = payload.tags
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
    return _task_to_response(task, db)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.manage")),
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
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_visible_for_user(task, current_user)
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
                scheduled_for=getattr(task, "scheduled_for", None),
                due_at=getattr(task, "due_at", None),
                priority=getattr(task, "priority", "normal"),
                pinned_today=False,
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


@router.post("/tasks/{task_id}/subtasks/bulk", response_model=TaskSubtaskBulkResponse, status_code=201)
async def bulk_create_subtasks(
    task_id: int,
    payload: TaskSubtaskBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.manage")),
):
    """Создать несколько подзадач одной транзакцией."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    max_order_row = db.query(func.max(TaskSubtask.order)).filter(TaskSubtask.task_id == task_id).scalar()
    next_order = (max_order_row + 1) if max_order_row is not None else 0

    new_subtasks = []
    for i, title in enumerate(payload.titles):
        st = TaskSubtask(task_id=task_id, text=title, order=next_order + i, completed=False)
        db.add(st)
        new_subtasks.append(st)

    db.commit()
    for st in new_subtasks:
        db.refresh(st)

    return TaskSubtaskBulkResponse(
        created=len(new_subtasks),
        subtasks=[
            TaskSubtaskResponse(id=st.id, task_id=st.task_id, text=st.text, completed=st.completed, order=st.order)
            for st in new_subtasks
        ],
    )


@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
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
    _ensure_task_visible_for_user(task, current_user)

    if task.status != TaskStatus.ACTIVE.value:
        return _task_to_response(task, db)

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
                scheduled_for=getattr(task, "scheduled_for", None),
                due_at=getattr(task, "due_at", None),
                priority=getattr(task, "priority", "normal"),
                pinned_today=False,
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

    return _task_to_response(task, db)


@router.patch("/tasks/{task_id}/postpone", response_model=TaskResponse)
async def postpone_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    """5) Отложить: если scheduled_for — +1 день; иначе если due_at — на завтра то же время; иначе scheduled_for = tomorrow. pin сбрасывается."""
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_visible_for_user(task, current_user)
    if task.status != TaskStatus.ACTIVE.value:
        return _task_to_response(task, db)
    today_msk, _, _ = _today_msk()
    tomorrow_msk = today_msk + timedelta(days=1)
    if getattr(task, "scheduled_for", None) is not None:
        task.scheduled_for = task.scheduled_for + timedelta(days=1)
    elif getattr(task, "due_at", None) is not None:
        task.due_at = task.due_at + timedelta(days=1)
    else:
        task.scheduled_for = tomorrow_msk
    task.pinned_today = False
    db.commit()
    db.refresh(task)
    return _task_to_response(task, db)


@router.patch("/tasks/{task_id}/pin-today", response_model=TaskResponse)
async def pin_task_today(
    task_id: int,
    pinned: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
):
    """Добавить задачу в план на сегодня (pinned_today=True) или убрать."""
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_visible_for_user(task, current_user)
    task.pinned_today = pinned
    db.commit()
    db.refresh(task)
    return _task_to_response(task, db)


@router.post("/tasks/{task_id}/counters/increment", response_model=TaskResponse)
async def increment_task_counter(
    task_id: int,
    payload: TaskCounterIncrement,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.access")),
) -> TaskResponse:
    """Инкремент специальных счётчиков задачи (например, parent_replies / parent_escalations)."""
    task = (
        db.query(Task)
        .options(joinedload(Task.subtasks), joinedload(Task.students), joinedload(Task.counters))
        .filter(Task.id == task_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Проверка прав: sales/trainer могут трогать только свои задачи
    _ensure_task_visible_for_user(task, current_user)
    key = (payload.key or "").strip()
    if key not in ("parent_replies", "parent_escalations", "parent_to_management"):
        raise HTTPException(status_code=400, detail="Unsupported counter key")
    delta = payload.delta if payload.delta is not None else 1
    if delta == 0:
        return _task_to_response(task, db)
    # Найти или создать счётчик
    counter = next((c for c in task.counters if c.counter_key == key), None)
    if not counter:
        counter = TaskCounter(task_id=task.id, counter_key=key, value=0)
        db.add(counter)
        db.flush()
        task.counters.append(counter)
    counter.value = (counter.value or 0) + delta
    db.commit()
    db.refresh(task)
    return _task_to_response(task, db)


@router.get("/tasks/parent-responses/stats", response_model=List[ParentResponsesStat])
async def get_parent_responses_stats(
    from_date: date,
    to_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("tasks.manage")),
) -> List[ParentResponsesStat]:
    """Агрегация по ответам родителям (по дням и менеджерам) для операционных отчётов."""
    rows = (
        db.query(
            Task.scheduled_for.label("d"),
            Task.assigned_to_id.label("uid"),
            User.full_name.label("name"),
            TaskCounter.counter_key,
            func.sum(TaskCounter.value).label("v"),
        )
        .join(Task, Task.id == TaskCounter.task_id)
        .join(User, User.id == Task.assigned_to_id)
        .filter(
            Task.tags.contains(["parent_responses"]),
            Task.scheduled_for >= from_date,
            Task.scheduled_for <= to_date,
            TaskCounter.counter_key.in_(["parent_replies", "parent_escalations"]),
        )
        .group_by(Task.scheduled_for, Task.assigned_to_id, User.full_name, TaskCounter.counter_key)
        .all()
    )

    agg: Dict[Tuple[date, int], Dict[str, object]] = {}
    for d, uid, name, key, v in rows:
        k = (d, uid)
        if k not in agg:
            agg[k] = {"date": d, "user_id": uid, "user_name": name, "replies": 0, "escalations": 0}
        if key == "parent_replies":
            agg[k]["replies"] = int(agg[k]["replies"]) + int(v or 0)
        else:
            agg[k]["escalations"] = int(agg[k]["escalations"]) + int(v or 0)

    out: List[ParentResponsesStat] = []
    for item in agg.values():
        out.append(
            ParentResponsesStat(
                date=item["date"],
                user_id=item["user_id"],
                user_name=item["user_name"],
                replies=item["replies"],
                escalations=item["escalations"],
            )
        )
    return out
