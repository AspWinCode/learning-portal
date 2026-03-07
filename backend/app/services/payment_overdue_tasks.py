"""Автозадачи по контролю оплат (ТЗ): два этапа напоминаний — 3 и 10 дней после даты оплаты."""
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session

from app.models import (
    User,
    UserRole,
    Student,
    StudentStatus,
    StudentCard,
    Task,
    TaskSubtask,
    TaskStudent,
    Group,
    GroupStudent,
)
from app.student_display import get_student_display_name


TASK_KIND_PAYMENT_OVERDUE = "payment_overdue"
FIRST_REMINDER_DAYS = 3
SECOND_REMINDER_DAYS = 10

SUBTASKS_TEXTS = [
    "Связаться с родителем",
    "Напомнить об оплате",
    "Проверить поступление оплаты",
]


def _get_student_group_name(db: Session, student_id: int) -> str | None:
    """Группа ученика (одна из), если есть."""
    gs = (
        db.query(Group)
        .join(GroupStudent, Group.id == GroupStudent.group_id)
        .filter(GroupStudent.student_id == student_id)
        .first()
    )
    return gs.name if gs else None


def _has_active_task(db: Session, student_id: int, task_kind: str, reminder_stage: int) -> bool:
    """Есть ли активная задача заданного вида и этапа по ученику."""
    return (
        db.query(Task.id)
        .join(TaskStudent, Task.id == TaskStudent.task_id)
        .filter(
            TaskStudent.student_id == student_id,
            Task.task_kind == task_kind,
            Task.reminder_stage == reminder_stage,
            Task.status == "active",
        )
        .first()
        is not None
    )


def _create_payment_overdue_task(
    db: Session,
    *,
    student_id: int,
    student_name: str,
    next_payment_date: date,
    stage: int,
    created_by_id: int,
    assigned_to_id: int | None,
) -> Task:
    """Создать одну задачу напоминания об оплате (этап 1 или 2)."""
    today = date.today()
    overdue_days = (today - next_payment_date).days
    group_name = _get_student_group_name(db, student_id)

    if stage == 1:
        title = "Оплата просрочена"
        priority = "normal"
        stage_label = "1-е напоминание"
    else:
        title = "Оплата просрочена — повтор"
        priority = "high"
        stage_label = "повторное напоминание"

    lines = [
        f"Ученик: {student_name}",
        f"Группа: {group_name}" if group_name else "Группа: —",
        f"Дата следующей оплаты: {next_payment_date}",
        f"Просрочка: {overdue_days} дн.",
        f"Этап: {stage_label}",
        "Действие: написать или позвонить родителю",
    ]
    description = "\n".join(lines)

    task = Task(
        title=title,
        description=description,
        template_id=None,
        created_by_id=created_by_id,
        assigned_to_id=assigned_to_id,
        status="active",
        category="parents",
        tags=["payment"],
        task_kind=TASK_KIND_PAYMENT_OVERDUE,
        reminder_stage=stage,
        priority=priority,
        scheduled_for=today,
    )
    db.add(task)
    db.flush()

    for i, text in enumerate(SUBTASKS_TEXTS):
        db.add(TaskSubtask(task_id=task.id, text=text, order=i, completed=False))
    db.add(TaskStudent(task_id=task.id, student_id=student_id))
    return task


def create_payment_overdue_tasks(db: Session) -> int:
    """
    Два этапа напоминаний:
    - Этап 1: next_payment_date <= today - 3 дня, нет активной задачи этапа 1 по ученику → создать.
    - Этап 2: next_payment_date <= today - 10 дней, нет активной задачи этапа 2 по ученику → создать.
    Возвращает число созданных задач.
    """
    today = date.today()
    deadline_1 = today - timedelta(days=FIRST_REMINDER_DAYS)
    deadline_2 = today - timedelta(days=SECOND_REMINDER_DAYS)

    owner = db.query(User).filter(User.role == UserRole.OWNER.value).first()
    sales_user = db.query(User).filter(User.role == UserRole.SALES.value).first()
    created_by_id = owner.id if owner else (sales_user.id if sales_user else None)
    if not created_by_id:
        return 0
    assigned_to_id = sales_user.id if sales_user else None

    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.archived.is_(False),
            StudentCard.student_id.isnot(None),
            StudentCard.next_payment_date.isnot(None),
        )
        .all()
    )

    created = 0
    for card in cards:
        student_id = card.student_id
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student or student.status == StudentStatus.ARCHIVED:
            continue
        next_pay = getattr(card, "next_payment_date", None)
        if not next_pay:
            continue
        if isinstance(next_pay, datetime):
            next_pay = next_pay.date()

        student_name = get_student_display_name(db, student)

        # Этап 2: просрочка 10+ дней, нет активной задачи этапа 2
        if next_pay <= deadline_2:
            if not _has_active_task(db, student_id, TASK_KIND_PAYMENT_OVERDUE, 2):
                _create_payment_overdue_task(
                    db,
                    student_id=student_id,
                    student_name=student_name,
                    next_payment_date=next_pay,
                    stage=2,
                    created_by_id=created_by_id,
                    assigned_to_id=assigned_to_id,
                )
                created += 1
                continue

        # Этап 1: просрочка 3+ дней, нет активной задачи этапа 1
        if next_pay <= deadline_1:
            if not _has_active_task(db, student_id, TASK_KIND_PAYMENT_OVERDUE, 1):
                _create_payment_overdue_task(
                    db,
                    student_id=student_id,
                    student_name=student_name,
                    next_payment_date=next_pay,
                    stage=1,
                    created_by_id=created_by_id,
                    assigned_to_id=assigned_to_id,
                )
                created += 1

    if created:
        db.commit()
    return created
