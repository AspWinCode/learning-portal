from datetime import date

from app.schemas.student_payment_audit import PaymentDetail


def test_payment_detail_accepts_and_serializes_date():
    payment = PaymentDetail(
        transaction_id=1, account_id=2, date=date(2026, 10, 7), amount=1000.0
    )

    assert payment.date == date(2026, 10, 7)
    assert payment.model_dump(mode="json")["date"] == "2026-10-07"


def test_payment_detail_accepts_missing_date():
    payment = PaymentDetail(transaction_id=1, account_id=2, amount=1000.0)

    assert payment.date is None
