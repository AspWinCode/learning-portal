"""Обновление периода обучения и даты следующей оплаты на карточке ученика."""
from datetime import date
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    LessonAttendance,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentCard,
)


DEFAULT_LESSON_THRESHOLD = 8


def _get_or_create_card(db: Session, student_id: int) -> "StudentCard | None":
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if card:
        return card
    from app.models import Student
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return None
    card = StudentCard(
        student_id=student_id,
        student_full_name=student.full_name,
    )
    db.add(card)
    db.flush()
    return card


def _lesson_threshold_for_card(card: "StudentCard") -> int:
    abonement = getattr(card, "abonement", None)
    if abonement and getattr(abonement, "lessons_count", None) and abonement.lessons_count > 0:
        return abonement.lessons_count
    return DEFAULT_LESSON_THRESHOLD


def count_lessons_since_period_start(db: Session, student_id: int, period_start: "date | None") -> int:
    """Количество уроков студента с даты начала периода (и посещённые, и пропущенные).
    Пропущенный урок всё равно считается — он занимает место в абонементе."""
    query = db.query(func.count(LessonAttendance.id)).filter(
        LessonAttendance.student_id == student_id,
    )
    if period_start:
        query = query.filter(LessonAttendance.lesson_date >= period_start)
    return query.scalar() or 0


def _has_payment_since(db: Session, student_id: int, since: "date | None") -> bool:
    """Была ли оплата с даты since (начала текущего периода)."""
    query = (
        db.query(StudentAccountTransaction.id)
        .join(StudentAccount, StudentAccount.id == StudentAccountTransaction.account_id)
        .filter(
            StudentAccount.student_id == student_id,
            StudentAccountTransaction.kind == StudentAccountTransactionKind.PAYMENT,
        )
    )
    if since:
        from sqlalchemy import cast, Date
        query = query.filter(
            func.date(StudentAccountTransaction.created_at) >= since
        )
    return query.first() is not None


def check_lesson_payment_threshold(db: Session, student_id: int) -> None:
    """Проверить нужна ли оплата после отметки посещаемости.

    Логика:
    - Урок посещён и оплаты за текущий период нет → next_payment_date = сегодня
    - Уроков накоплено >= порога (8) и была оплата → начать новый период,
      снова поставить next_payment_date (нужна следующая оплата)
    """
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    threshold = _lesson_threshold_for_card(card)
    lessons = count_lessons_since_period_start(db, student_id, card.learning_period_start)
    if lessons < 1:
        return

    has_payment = _has_payment_since(db, student_id, card.learning_period_start)

    if not has_payment:
        # Урок без оплаты → сразу в долги
        if not card.next_payment_date:
            card.next_payment_date = date.today()
    elif lessons >= threshold:
        # Оплата была, но период закончился (8 уроков) → новый период нужна следующая оплата
        card.learning_period_start = date.today()
        card.next_payment_date = date.today()


def update_card_payment_dates(db: Session, student_id: int, payment_date: date) -> None:
    """Зафиксировать оплату: сбросить next_payment_date, начать новый период.
    Если StudentCard ещё нет — создаётся автоматически."""
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    card.learning_period_start = payment_date
    card.next_payment_date = None


def set_card_payment_dates_from_training_start(db: Session, student_id: int, start_date: date) -> None:
    """Установить learning_period_start от даты первого занятия (если ещё не задано)."""
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    if not card.learning_period_start:
        card.learning_period_start = start_date
