"""
Unit-тесты сервиса payment_status (ТЗ: список и сводка статусов оплаты учеников).
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from app.services.payment_status import (
    get_payment_status_list,
    get_payment_status_summary,
    _has_payments,
)
from app.models import StudentStatus


# ─────────────────────── _has_payments ───────────────────────


def test_has_payments_returns_true():
    db = MagicMock()
    db.query.return_value.join.return_value.filter.return_value.first.return_value = (1,)
    assert _has_payments(db, student_id=1) is True


def test_has_payments_returns_false():
    db = MagicMock()
    db.query.return_value.join.return_value.filter.return_value.first.return_value = None
    assert _has_payments(db, student_id=1) is False


# ─────────────────────── get_payment_status_list ───────────────────────


def _make_card(student_id, next_payment_date, archived=False):
    card = MagicMock()
    card.student_id = student_id
    card.id = student_id * 10
    card.next_payment_date = next_payment_date
    card.archived = archived
    card.learning_period_start = None
    return card


def _make_student(student_id, status=StudentStatus.ACTIVE, full_name="Ученик"):
    student = MagicMock()
    student.id = student_id
    student.status = status
    student.full_name = full_name
    return student


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Ученик")
def test_get_payment_status_list_ok_status(mock_name, mock_pay):
    """Дата следующей оплаты в будущем (> 3 дней) → статус ok."""
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=10))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert len(result) == 1
    assert result[0]["status"] == "ok"
    assert result[0]["student_id"] == 1


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Ученик")
def test_get_payment_status_list_due_soon(mock_name, mock_pay):
    """Дата следующей оплаты через 1 день → due_soon."""
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=1))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["status"] == "due_soon"


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Ученик")
def test_get_payment_status_list_overdue(mock_name, mock_pay):
    """Дата следующей оплаты в прошлом → overdue."""
    today = date(2025, 3, 1)
    card = _make_card(1, today - timedelta(days=5))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["status"] == "overdue"


@patch("app.services.payment_status._has_payments", return_value=False)
@patch("app.services.payment_status.get_student_display_name", return_value="Ученик")
def test_get_payment_status_list_unpaid(mock_name, mock_pay):
    """Нет платежей → unpaid."""
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=5))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["status"] == "unpaid"


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Ученик")
def test_get_payment_status_list_archived_student_excluded(mock_name, mock_pay):
    """Архивный ученик исключается из результата."""
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=10))
    student = _make_student(1, status=StudentStatus.ARCHIVED)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result == []


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Ученик")
def test_get_payment_status_list_filter_by_status(mock_name, mock_pay):
    """status_filter=overdue возвращает только overdue карточки."""
    today = date(2025, 3, 1)
    card_ok = _make_card(1, today + timedelta(days=10))
    card_over = _make_card(2, today - timedelta(days=5))
    student_ok = _make_student(1)
    student_over = _make_student(2)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card_ok, card_over]

    def _first_side():
        it = iter([student_ok, student_over])
        def _f(*a, **kw):
            return next(it, None)
        return _f

    db.query.return_value.filter.return_value.first.side_effect = [student_ok, student_over]

    result = get_payment_status_list(db, status_filter="overdue", today=today)

    assert all(r["status"] == "overdue" for r in result)


def test_get_payment_status_list_no_cards():
    """Нет карточек → пустой список."""
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []

    result = get_payment_status_list(db, today=date(2025, 3, 1))

    assert result == []


# ─────────────────────── get_payment_status_summary ───────────────────────


@patch("app.services.payment_status._has_payments", return_value=True)
def test_get_payment_status_summary_counts(mock_pay):
    """Просрочки 3+ и 10+ дней считаются корректно."""
    today = date(2025, 3, 1)
    card_3 = _make_card(1, today - timedelta(days=4))    # > 3 дней
    card_10 = _make_card(2, today - timedelta(days=11))  # > 10 дней
    card_recent = _make_card(3, today - timedelta(days=1))  # < 3 дней (не считаем, т.к. фильтр next_payment_date < today)

    student1 = _make_student(1)
    student2 = _make_student(2)
    student3 = _make_student(3)

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card_3, card_10, card_recent]
    db.query.return_value.filter.return_value.first.side_effect = [student1, student2, student3]

    summary = get_payment_status_summary(db, today=today)

    assert summary["overdue_3_count"] >= 2
    assert summary["overdue_10_count"] >= 1


@patch("app.services.payment_status._has_payments", return_value=False)
def test_get_payment_status_summary_no_payments_excluded(mock_pay):
    """Ученики без платежей не считаются в просрочку."""
    today = date(2025, 3, 1)
    card = _make_card(1, today - timedelta(days=15))
    student = _make_student(1)

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    summary = get_payment_status_summary(db, today=today)

    assert summary["overdue_3_count"] == 0
    assert summary["overdue_10_count"] == 0


def test_get_payment_status_summary_no_cards():
    """Нет карточек → нули."""
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []

    summary = get_payment_status_summary(db, today=date(2025, 3, 1))

    assert summary == {"overdue_3_count": 0, "overdue_10_count": 0}
