"""
Список и сводка статусов оплаты учеников.

Студент появляется в "Долгах" как только посетил 1 урок без оплаты за текущий период.
После оплаты исчезает из долгов на следующие 8 уроков.
"""

from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import (
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentCard,
    StudentStatus,
    Student,
)
from app.services.student_card_period import count_lessons_since_period_start
from app.student_display import get_student_display_name


def _has_payments(db: Session, student_id: int) -> bool:
    """Есть ли вообще хоть одна оплата у студента (для статуса unpaid vs overdue)."""
    return (
        db.query(StudentAccountTransaction.id)
        .join(StudentAccount, StudentAccount.id == StudentAccountTransaction.account_id)
        .filter(
            StudentAccount.student_id == student_id,
            StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
        )
        .first()
        is not None
    )


def get_payment_status_list(
    db: Session,
    status_filter: Optional[str] = None,
    today: Optional[date] = None,
) -> List[dict]:
    if today is None:
        today = date.today()
    due_soon_end = today + timedelta(days=3)

    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id.isnot(None),
            StudentCard.archived.is_(False),
            StudentCard.next_payment_date.isnot(None),
        )
        .all()
    )
    result = []
    for card in cards:
        student = db.query(Student).filter(Student.id == card.student_id).first()
        if not student or student.status == StudentStatus.ARCHIVED:
            continue
        next_pay = getattr(card, "next_payment_date", None)
        if not next_pay:
            continue
        if hasattr(next_pay, "date"):
            next_pay = next_pay.date()

        has_payments = _has_payments(db, card.student_id)
        lessons = count_lessons_since_period_start(db, card.student_id, card.learning_period_start)

        if not has_payments:
            st = "unpaid"
        elif next_pay < today:
            st = "overdue"
        elif next_pay <= due_soon_end:
            st = "due_soon"
        else:
            st = "ok"

        if status_filter and status_filter not in ("", "все", "all") and st != status_filter:
            continue
        result.append({
            "student_id": card.student_id,
            "student_name": get_student_display_name(db, student),
            "card_id": card.id,
            "next_payment_date": next_pay,
            "learning_period_start": getattr(card, "learning_period_start", None),
            "lessons_since_payment": lessons,
            "status": st,
        })
    result.sort(key=lambda x: (x["next_payment_date"] or date.max, x["student_name"]))
    return result


def get_payment_status_summary(
    db: Session,
    today: Optional[date] = None,
) -> dict:
    if today is None:
        today = date.today()
    day_3 = today - timedelta(days=3)
    day_10 = today - timedelta(days=10)
    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id.isnot(None),
            StudentCard.archived.is_(False),
            StudentCard.next_payment_date.isnot(None),
            StudentCard.next_payment_date < today,
        )
        .all()
    )
    overdue_3_count = 0
    overdue_10_count = 0
    for card in cards:
        student = db.query(Student).filter(Student.id == card.student_id).first()
        if not student or student.status == StudentStatus.ARCHIVED:
            continue
        if not _has_payments(db, card.student_id):
            continue
        next_pay = getattr(card, "next_payment_date", None)
        if not next_pay:
            continue
        if hasattr(next_pay, "date"):
            next_pay = next_pay.date()
        if next_pay <= day_3:
            overdue_3_count += 1
        if next_pay <= day_10:
            overdue_10_count += 1
    return {"overdue_3_count": overdue_3_count, "overdue_10_count": overdue_10_count}
