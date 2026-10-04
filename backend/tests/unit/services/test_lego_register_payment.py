"""LEGO: регистрация оплаты (финансовая проводка и идемпотентность) на мок-сессии без БД."""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

from app.models import FinanceTarget, FinanceTransaction, LegoPayment, LegoStudent
from app.services import lego_service


def _session_with(existing_payment=None, target=None, student=None):
    db = MagicMock()
    added = []
    db.add.side_effect = added.append

    def query(model):
        chain = MagicMock()
        if model is LegoPayment:
            chain.filter.return_value.first.return_value = existing_payment
        elif model is FinanceTarget:
            chain.filter.return_value.first.return_value = target
        elif model is LegoStudent:
            chain.filter.return_value.with_for_update.return_value.one.return_value = student
        return chain

    db.query.side_effect = query
    db.flush.side_effect = lambda: [setattr(o, "id", 42) for o in added if isinstance(o, FinanceTransaction)]
    return db, added


def _student() -> LegoStudent:
    student = LegoStudent(full_name="Ребёнок", start_date=date(2026, 9, 1), parent_name="Мама", payment_active=True)
    student.id = 5
    student.paid_until = None
    return student


def test_repeated_request_with_same_key_returns_existing_and_books_nothing() -> None:
    existing = LegoPayment(student_id=5, amount=Decimal("3000"), payment_date=date(2026, 10, 1), idempotency_key="k1")
    db, added = _session_with(existing_payment=existing, student=_student())

    payment, created = lego_service.register_payment(
        db,
        _student(),
        amount=Decimal("3000"),
        payment_date=date(2026, 10, 1),
        created_by=1,
        idempotency_key="k1",
    )

    assert payment is existing
    assert created is False
    assert added == []
    db.commit.assert_not_called()


def test_new_payment_creates_leninets_income_and_lego_payment() -> None:
    target = FinanceTarget(code="leninets", name="LEGO — Ленинец", is_active=True)
    target.id = 9
    student = _student()
    db, added = _session_with(existing_payment=None, target=target, student=student)

    payment, created = lego_service.register_payment(
        db,
        student,
        amount=Decimal("3000"),
        payment_date=date(2026, 10, 10),
        created_by=1,
        idempotency_key="k2",
    )

    assert created is True
    transactions = [o for o in added if isinstance(o, FinanceTransaction)]
    assert len(transactions) == 1
    tx = transactions[0]
    assert tx.target_id == 9
    assert tx.amount == 3000.0
    assert tx.student_id is None
    assert tx.counterparty_name == "Мама"

    lego_payments = [o for o in added if isinstance(o, LegoPayment)]
    assert len(lego_payments) == 1
    assert lego_payments[0].finance_transaction_id == 42
    assert lego_payments[0].paid_until == date(2026, 11, 9)
    assert student.paid_until == date(2026, 11, 9)
    assert student.next_payment_date == date(2026, 11, 10)
    db.commit.assert_called_once()


def test_payment_does_not_touch_academy_models() -> None:
    target = FinanceTarget(code="leninets", name="LEGO — Ленинец", is_active=True)
    target.id = 9
    db, added = _session_with(target=target, student=_student())

    lego_service.register_payment(
        db,
        _student(),
        amount=Decimal("1000"),
        payment_date=date(2026, 10, 10),
        created_by=1,
    )

    academy_names = {type(o).__name__ for o in added}
    assert academy_names <= {"FinanceTransaction", "LegoPayment"}
