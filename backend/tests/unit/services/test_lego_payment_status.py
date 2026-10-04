"""LEGO: чистая логика платежей и статусов (без БД и без academy payment_status)."""
from datetime import date, timedelta

from app.services.lego_payment_status import (
    DEBT_FILTER_STATUSES,
    STATUS_DUE_SOON,
    STATUS_OK,
    STATUS_OVERDUE,
    STATUS_OVERDUE_3,
    STATUS_OVERDUE_10,
    STATUS_UNPAID,
    add_months,
    compute_monthly_period,
    compute_payment_status,
)

TODAY = date(2026, 10, 10)


def test_child_who_never_paid_is_unpaid() -> None:
    result = compute_payment_status(TODAY, paid_until=None)
    assert result.status == STATUS_UNPAID
    assert result.days_until_due is None
    assert result.days_overdue == 0


def test_paid_far_ahead_is_ok() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 11, 30), next_payment_date=date(2026, 12, 1))
    assert result.status == STATUS_OK
    assert result.days_until_due == 52


def test_due_within_three_days_is_due_soon() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 10, 12), next_payment_date=date(2026, 10, 13))
    assert result.status == STATUS_DUE_SOON
    assert result.days_until_due == 3


def test_due_today_is_due_soon() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 10, 9), next_payment_date=TODAY)
    assert result.status == STATUS_DUE_SOON
    assert result.days_until_due == 0


def test_one_or_two_days_late_is_overdue() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 10, 7), next_payment_date=date(2026, 10, 8))
    assert result.status == STATUS_OVERDUE
    assert result.days_overdue == 2


def test_three_days_late_is_overdue_3() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 10, 5), next_payment_date=date(2026, 10, 7))
    assert result.status == STATUS_OVERDUE_3
    assert result.days_overdue == 3


def test_ten_days_late_is_overdue_10() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 9, 29), next_payment_date=date(2026, 9, 30))
    assert result.status == STATUS_OVERDUE_10
    assert result.days_overdue == 10


def test_next_payment_date_defaults_to_day_after_paid_until() -> None:
    result = compute_payment_status(TODAY, paid_until=date(2026, 10, 10))
    assert result.status == STATUS_DUE_SOON
    assert result.days_until_due == 1


def test_new_payment_moves_overdue_child_back_to_ok() -> None:
    before = compute_payment_status(TODAY, paid_until=date(2026, 9, 1), next_payment_date=date(2026, 9, 2))
    assert before.status == STATUS_OVERDUE_10

    _, period_end = compute_monthly_period(TODAY, paid_until=date(2026, 9, 1))
    after = compute_payment_status(TODAY, paid_until=period_end, next_payment_date=period_end + timedelta(days=1))
    assert after.status == STATUS_OK


def test_monthly_period_starts_on_payment_date_when_not_prepaid() -> None:
    start, end = compute_monthly_period(date(2026, 10, 10), paid_until=None)
    assert start == date(2026, 10, 10)
    assert end == date(2026, 11, 9)


def test_monthly_period_extends_from_paid_until_when_prepaid() -> None:
    start, end = compute_monthly_period(date(2026, 10, 10), paid_until=date(2026, 10, 31))
    assert start == date(2026, 11, 1)
    assert end == date(2026, 11, 30)


def test_add_months_clamps_end_of_month() -> None:
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert add_months(date(2026, 12, 15), 1) == date(2027, 1, 15)


def test_debt_filters_cover_required_views() -> None:
    assert DEBT_FILTER_STATUSES["all"] is None
    assert STATUS_OVERDUE_3 in DEBT_FILTER_STATUSES["overdue_3"]
    assert STATUS_OVERDUE in DEBT_FILTER_STATUSES["overdue"]
    assert STATUS_OK not in DEBT_FILTER_STATUSES["overdue"]
    assert DEBT_FILTER_STATUSES["unpaid"] == {STATUS_UNPAID}
