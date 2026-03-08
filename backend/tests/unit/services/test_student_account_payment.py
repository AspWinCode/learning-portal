"""
Unit-тесты сервиса student_account_payment (ТЗ: зачисление платежа на счёт ученика).
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.services.student_account_payment import add_payment_to_student_account
from app.models import StudentAccount


@patch("app.services.student_account_payment.update_card_payment_dates")
def test_add_payment_student_not_found(mock_update_dates):
    """Ученик не найден -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    # Первый query — Student
    first_chain = MagicMock()
    first_chain.filter.return_value.first.return_value = None
    # Второй query — StudentAccount (не вызывается, т.к. student not found)
    db.query.side_effect = lambda model: first_chain

    with pytest.raises(ValueError, match="Ученик не найден"):
        add_payment_to_student_account(db, 999, 100.0, "Тест", date(2025, 1, 15))

    mock_update_dates.assert_not_called()


@patch("app.services.student_account_payment.update_card_payment_dates")
def test_add_payment_success_creates_account(mock_update_dates):
    """Успех: ученик есть, счёта нет — создаётся счёт и проводка."""
    from app.models import Student, StudentAccount
    db = MagicMock()
    mock_student = MagicMock()
    mock_student.id = 1
    student_chain = MagicMock()
    student_chain.filter.return_value.first.return_value = mock_student
    account_chain = MagicMock()
    account_chain.filter.return_value.order_by.return_value.first.return_value = None
    def _query(model):
        if model is Student:
            return student_chain
        return account_chain
    db.query.side_effect = _query

    result = add_payment_to_student_account(db, 1, 500.0, "Оплата", date(2025, 1, 15))

    assert result.account is not None
    assert result.account.student_id == 1
    assert result.account.balance == 500.0
    assert db.add.call_count >= 2  # StudentAccount и StudentAccountTransaction
    mock_update_dates.assert_called_once_with(db, 1, date(2025, 1, 15))
