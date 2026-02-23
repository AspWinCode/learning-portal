"""Обновление периода обучения и даты следующей оплаты на карточке ученика (ТЗ п.2.2)."""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from app.models import StudentCard


# Стандарт: 8 занятий в абонементе = 30 дней периода оплаты
DEFAULT_LESSONS_FOR_30_DAYS = 8


def update_card_payment_dates(db: Session, student_id: int, payment_date: date) -> None:
    """Установить learning_period_start и next_payment_date на карточке ученика после пополнения.
    Период оплаты берётся из абонемента карточки: lessons_count занятий -> 30*lessons_count/8 дней;
    если абонемента или lessons_count нет — 30 дней."""
    card = db.query(StudentCard).filter(StudentCard.student_id == student_id).first()
    if not card or not hasattr(card, "learning_period_start"):
        return
    card.learning_period_start = payment_date
    period_days = 30
    abonement = getattr(card, "abonement", None)
    if not abonement and getattr(card, "abonement_id", None):
        from app.models import Abonement
        abonement = db.query(Abonement).filter(Abonement.id == card.abonement_id).first()
    if abonement and getattr(abonement, "lessons_count", None) and abonement.lessons_count > 0:
        period_days = max(1, round(30 * abonement.lessons_count / DEFAULT_LESSONS_FOR_30_DAYS))
    card.next_payment_date = payment_date + timedelta(days=period_days)
