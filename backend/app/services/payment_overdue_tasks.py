"""Автозадачи просрочки оплаты (ТЗ п.8.3): через 3 дня после next_payment_date создаём задачу менеджеру, повтор каждые 7 дней."""
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    User,
    UserRole,
    Student,
    StudentStatus,
    StudentCard,
    Task,
    TaskStudent,
)
from app.student_display import get_student_display_name


PAYMENT_OVERDUE_TITLE_PREFIX = "Оплата просрочена:"
OVERDUE_DAYS = 3
REPEAT_DAYS = 7


def create_payment_overdue_tasks(db: Session) -> int:
    """
    Для учеников с next_payment_date + 3 дня в прошлом создаёт задачу «Написать/позвонить родителю»,
    если такой задачи не было в последние 7 дней. Возвращает число созданных задач.
    """
    today = date.today()
    deadline = today - timedelta(days=OVERDUE_DAYS)
    owner = db.query(User).filter(User.role == UserRole.OWNER.value).first()
    sales_user = db.query(User).filter(User.role == UserRole.SALES.value).first()
    created_by_id = owner.id if owner else (sales_user.id if sales_user else None)
    if not created_by_id:
        return 0
    assigned_to_id = sales_user.id if sales_user else None

    cards = db.query(StudentCard).filter(
        StudentCard.archived.is_(False),
        StudentCard.student_id.isnot(None),
        StudentCard.next_payment_date.isnot(None),
        StudentCard.next_payment_date <= deadline,
    ).all()
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
        if next_pay > deadline:
            continue
        recent = (
            db.query(Task.id)
            .join(TaskStudent, Task.id == TaskStudent.task_id)
            .filter(
                TaskStudent.student_id == student_id,
                Task.title.like(f"{PAYMENT_OVERDUE_TITLE_PREFIX}%"),
                Task.status == "active",
                Task.created_at >= datetime.combine(today - timedelta(days=REPEAT_DAYS), datetime.min.time()),
            )
            .first()
        )
        if recent:
            continue
        student_name = get_student_display_name(db, student)
        period_str = str(next_pay)
        title = f"{PAYMENT_OVERDUE_TITLE_PREFIX} ученик {student_name}, период до {period_str}. Написать/позвонить родителю."
        task = Task(
            title=title,
            template_id=None,
            created_by_id=created_by_id,
            assigned_to_id=assigned_to_id,
            status="active",
        )
        db.add(task)
        db.flush()
        db.add(TaskStudent(task_id=task.id, student_id=student_id))
        created += 1
    if created:
        db.commit()
    return created
