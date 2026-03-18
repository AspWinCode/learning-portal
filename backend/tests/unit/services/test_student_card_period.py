"""
Unit-тесты сервиса student_card_period (ТЗ: период обучения и дата следующей оплаты).
"""
from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest

from app.services.student_card_period import (
    update_card_payment_dates,
    set_card_payment_dates_from_training_start,
    DEFAULT_LESSONS_FOR_30_DAYS,
)


def _make_card(student_id=1, abonement_id=None, lessons_count=None):
    """Создать мок-карточку ученика."""
    card = MagicMock(spec=["student_id", "id", "learning_period_start",
                           "next_payment_date", "abonement_id", "abonement"])
    card.student_id = student_id
    card.id = student_id * 10
    card.learning_period_start = None
    card.next_payment_date = None
    card.abonement_id = abonement_id
    card.abonement = None
    if lessons_count is not None and abonement_id:
        mock_ab = MagicMock()
        mock_ab.lessons_count = lessons_count
        card.abonement = mock_ab
    return card


# ─────────────────────── update_card_payment_dates ───────────────────────


def test_update_card_payment_dates_card_not_found():
    """Карточка не найдена → функция завершается без ошибок (нет ученика)."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    # Не должно быть исключения
    update_card_payment_dates(db, student_id=999, payment_date=date(2025, 3, 1))


def test_update_card_payment_dates_default_30_days():
    """Без абонемента → период 30 дней."""
    db = MagicMock()
    card = _make_card()
    db.query.return_value.filter.return_value.first.return_value = card
    payment_date = date(2025, 3, 1)

    update_card_payment_dates(db, student_id=1, payment_date=payment_date)

    assert card.learning_period_start == payment_date
    assert card.next_payment_date == payment_date + timedelta(days=30)


def test_update_card_payment_dates_with_abonement_8_lessons():
    """Абонемент 8 занятий → период 30 дней (стандарт)."""
    db = MagicMock()
    card = _make_card(abonement_id=1, lessons_count=8)
    db.query.return_value.filter.return_value.first.return_value = card
    payment_date = date(2025, 3, 1)

    update_card_payment_dates(db, student_id=1, payment_date=payment_date)

    expected_days = round(30 * 8 / DEFAULT_LESSONS_FOR_30_DAYS)  # 30
    assert card.next_payment_date == payment_date + timedelta(days=expected_days)


def test_update_card_payment_dates_with_abonement_4_lessons():
    """Абонемент 4 занятия → период ~15 дней."""
    db = MagicMock()
    card = _make_card(abonement_id=1, lessons_count=4)
    db.query.return_value.filter.return_value.first.return_value = card
    payment_date = date(2025, 3, 1)

    update_card_payment_dates(db, student_id=1, payment_date=payment_date)

    expected_days = round(30 * 4 / DEFAULT_LESSONS_FOR_30_DAYS)  # 15
    assert card.next_payment_date == payment_date + timedelta(days=expected_days)


def test_update_card_payment_dates_with_abonement_16_lessons():
    """Абонемент 16 занятий → период 60 дней."""
    db = MagicMock()
    card = _make_card(abonement_id=1, lessons_count=16)
    db.query.return_value.filter.return_value.first.return_value = card
    payment_date = date(2025, 3, 1)

    update_card_payment_dates(db, student_id=1, payment_date=payment_date)

    expected_days = round(30 * 16 / DEFAULT_LESSONS_FOR_30_DAYS)  # 60
    assert card.next_payment_date == payment_date + timedelta(days=expected_days)


# ─────────────────────── set_card_payment_dates_from_training_start ───────────────────────


def test_set_card_from_training_start_not_found():
    """Карточка не найдена → нет исключения."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    set_card_payment_dates_from_training_start(db, student_id=999, start_date=date(2025, 3, 1))


def test_set_card_from_training_start_default_30_days():
    """Без абонемента → learning_period_start = start_date, next_payment_date + 30 дней."""
    db = MagicMock()
    card = _make_card()
    db.query.return_value.filter.return_value.first.return_value = card
    start_date = date(2025, 3, 1)

    set_card_payment_dates_from_training_start(db, student_id=1, start_date=start_date)

    assert card.learning_period_start == start_date
    assert card.next_payment_date == start_date + timedelta(days=30)


def test_set_card_from_training_start_with_abonement():
    """С абонементом 12 занятий → период ~45 дней."""
    db = MagicMock()
    card = _make_card(abonement_id=2, lessons_count=12)
    db.query.return_value.filter.return_value.first.return_value = card
    start_date = date(2025, 3, 1)

    set_card_payment_dates_from_training_start(db, student_id=1, start_date=start_date)

    expected_days = round(30 * 12 / DEFAULT_LESSONS_FOR_30_DAYS)  # 45
    assert card.next_payment_date == start_date + timedelta(days=expected_days)


def test_set_card_from_training_start_min_1_day():
    """Абонемент с очень малым lessons_count → минимум 1 день."""
    db = MagicMock()
    card = _make_card(abonement_id=3, lessons_count=1)
    db.query.return_value.filter.return_value.first.return_value = card
    start_date = date(2025, 3, 1)

    set_card_payment_dates_from_training_start(db, student_id=1, start_date=start_date)

    assert card.next_payment_date >= start_date + timedelta(days=1)
