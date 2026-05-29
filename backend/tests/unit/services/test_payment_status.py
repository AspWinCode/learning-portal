from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from app.models import StudentStatus
from app.services.payment_status import (
    _has_payments,
    get_payment_status_list,
    get_payment_status_summary,
)


def test_has_payments_returns_true():
    db = MagicMock()
    db.query.return_value.join.return_value.filter.return_value.first.return_value = (1,)
    assert _has_payments(db, student_id=1) is True


def test_has_payments_returns_false():
    db = MagicMock()
    db.query.return_value.join.return_value.filter.return_value.first.return_value = None
    assert _has_payments(db, student_id=1) is False


def _make_card(student_id, next_payment_date, archived=False):
    card = MagicMock()
    card.student_id = student_id
    card.id = student_id * 10
    card.next_payment_date = next_payment_date
    card.archived = archived
    card.learning_period_start = None
    return card


def _make_student(student_id, status=StudentStatus.ACTIVE, full_name="Student"):
    student = MagicMock()
    student.id = student_id
    student.status = status
    student.full_name = full_name
    return student


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_ok_status(mock_name, mock_pay):
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
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_due_soon(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=1))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["status"] == "due_soon"


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_overdue(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card = _make_card(1, today - timedelta(days=5))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["status"] == "overdue"


@patch("app.services.payment_status._has_payments", return_value=False)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_unpaid(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=5))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["status"] == "unpaid"


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_archived_student_excluded(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card = _make_card(1, today + timedelta(days=10))
    student = _make_student(1, status=StudentStatus.ARCHIVED)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result == []


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_filter_by_status(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card_ok = _make_card(1, today + timedelta(days=10))
    card_over = _make_card(2, today - timedelta(days=5))
    student_ok = _make_student(1)
    student_over = _make_student(2)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card_ok, card_over]
    db.query.return_value.filter.return_value.first.side_effect = [student_ok, student_over]

    result = get_payment_status_list(db, status_filter="overdue", today=today)

    assert all(item["status"] == "overdue" for item in result)


def test_get_payment_status_list_no_cards():
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []

    result = get_payment_status_list(db, today=date(2025, 3, 1))

    assert result == []


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name")
def test_get_payment_status_list_sorted_by_date_then_name(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card_late = _make_card(2, today + timedelta(days=10))
    card_early_b = _make_card(1, today + timedelta(days=2))
    card_early_a = _make_card(3, today + timedelta(days=2))
    student_2 = _make_student(2, full_name="Boris")
    student_1 = _make_student(1, full_name="Yana")
    student_3 = _make_student(3, full_name="Anna")

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card_late, card_early_b, card_early_a]
    db.query.return_value.filter.return_value.first.side_effect = [student_2, student_1, student_3]
    mock_name.side_effect = ["Boris", "Yana", "Anna"]

    result = get_payment_status_list(db, today=today)

    assert [item["student_name"] for item in result] == ["Anna", "Yana", "Boris"]


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_converts_datetime_to_date(mock_name, mock_pay):
    class FakeDateTime:
        def __init__(self, value):
            self._value = value

        def date(self):
            return self._value

    today = date(2025, 3, 1)
    card = _make_card(1, FakeDateTime(today + timedelta(days=4)))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, today=today)

    assert result[0]["next_payment_date"] == today + timedelta(days=4)


@patch("app.services.payment_status._has_payments", return_value=True)
@patch("app.services.payment_status.get_student_display_name", return_value="Student")
def test_get_payment_status_list_all_filter_does_not_exclude(mock_name, mock_pay):
    today = date(2025, 3, 1)
    card = _make_card(1, today - timedelta(days=1))
    student = _make_student(1)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    result = get_payment_status_list(db, status_filter="all", today=today)

    assert len(result) == 1
    assert result[0]["status"] == "overdue"


@patch("app.services.payment_status._has_payments", return_value=True)
def test_get_payment_status_summary_counts(mock_pay):
    today = date(2025, 3, 1)
    card_3 = _make_card(1, today - timedelta(days=4))
    card_10 = _make_card(2, today - timedelta(days=11))
    card_recent = _make_card(3, today - timedelta(days=1))

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
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []

    summary = get_payment_status_summary(db, today=date(2025, 3, 1))

    assert summary == {"overdue_3_count": 0, "overdue_10_count": 0}


@patch("app.services.payment_status._has_payments", return_value=True)
def test_get_payment_status_summary_archived_students_excluded(mock_pay):
    today = date(2025, 3, 1)
    card = _make_card(1, today - timedelta(days=11))
    student = _make_student(1, status=StudentStatus.ARCHIVED)

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [card]
    db.query.return_value.filter.return_value.first.return_value = student

    summary = get_payment_status_summary(db, today=today)

    assert summary == {"overdue_3_count": 0, "overdue_10_count": 0}
