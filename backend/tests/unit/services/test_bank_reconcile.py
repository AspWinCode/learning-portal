from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.bank_reconcile import plan_generic_income_hides

GENERIC = 'ООО "Банк Точка"'
T0 = datetime(2026, 11, 10, 10, 0, tzinfo=timezone.utc)


def row(id, name, minutes=0, status="new"):
    return SimpleNamespace(id=id, payer_name=name, status=status, created_at=T0 + timedelta(minutes=minutes))


def test_generic_a_minute_after_real_is_duplicate():
    assert plan_generic_income_hides([row(1, "Марат Ф."), row(2, GENERIC, 1)]) == [(2, 1)]


def test_each_generic_pairs_with_nearest_real():
    rows = [row(1, "А", 0), row(2, "Б", 60), row(3, GENERIC, 61), row(4, GENERIC, 1)]
    assert sorted(plan_generic_income_hides(rows)) == [(3, 2), (4, 1)]


def test_generic_hours_later_is_separate_payment():
    assert plan_generic_income_hides([row(1, "А", 0), row(2, GENERIC, 300)]) == []


def test_extra_generic_without_free_real_stays():
    rows = [row(1, "А", 0), row(2, GENERIC, 1), row(3, GENERIC, 2)]
    assert plan_generic_income_hides(rows) == [(2, 1)]


def test_generic_without_real_stays():
    assert plan_generic_income_hides([row(1, GENERIC)]) == []


def test_applied_generic_is_never_hidden_and_takes_its_real():
    rows = [row(1, "А", 0), row(2, GENERIC, 1, "applied"), row(3, GENERIC, 2)]
    assert plan_generic_income_hides(rows) == []
