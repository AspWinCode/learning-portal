"""Обновление периода обучения и даты следующей оплаты на карточке ученика (ТЗ п.2.2)."""
from datetime import date, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    LessonAttendance,
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
    """Вернуть порог уроков из абонемента карточки или DEFAULT_LESSON_THRESHOLD."""
    abonement = getattr(card, "abonement", None)
    if not abonement and getattr(card, "abonement_id", None):
        from app.models import Abonement
        from sqlalchemy.orm import Session as S
        # abonement already should be loaded via relationship; skip extra query
        pass
    if abonement and getattr(abonement, "lessons_count", None) and abonement.lessons_count > 0:
        return abonement.lessons_count
    return DEFAULT_LESSON_THRESHOLD


def count_lessons_since_period_start(db: Session, student_id: int, period_start: "date | None") -> int:
    """Количество посещённых уроков студента с даты начала периода."""
    query = db.query(func.count(LessonAttendance.id)).filter(
        LessonAttendance.student_id == student_id,
        LessonAttendance.attended == True,
    )
    if period_start:
        query = query.filter(LessonAttendance.lesson_date >= period_start)
    return query.scalar() or 0


def check_lesson_payment_threshold(db: Session, student_id: int) -> None:
    """Если студент посетил >= порога уроков с начала периода и next_payment_date не задан —
    установить next_payment_date = сегодня, сигнализируя о необходимости оплаты."""
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if not card:
        return
    if card.next_payment_date:
        return
    threshold = _lesson_threshold_for_card(card)
    count = count_lessons_since_period_start(db, student_id, card.learning_period_start)
    if count >= threshold:
        card.next_payment_date = date.today()


def update_card_payment_dates(db: Session, student_id: int, payment_date: date) -> None:
    """Зафиксировать оплату: сбросить next_payment_date, начать новый период.
    next_payment_date будет автоматически выставлен после следующих N посещённых уроков.
    Если StudentCard ещё нет — создаётся автоматически."""
    card = _get_or_create_card(db, student_id)
    if not card:
        return
    card.learning_period_start = payment_date
    card.next_payment_date = None


def set_card_payment_dates_from_training_start(db: Session, student_id: int, start_date: date) -> None:
    """Установить learning_period_start от даты начала обучения (первое занятие)."""
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if not card:
        return
    if card.learning_period_start:
        return
    card.learning_period_start = start_date
