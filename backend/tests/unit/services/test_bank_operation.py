"""
Unit-тесты сервиса bank_operation (ТЗ: зачисление банковской операции на ученика).
"""
from unittest.mock import MagicMock, patch

import pytest

from app.services.bank_operation import apply_bank_operation_to_student
from app.models import BankTransactionStatus


def test_apply_bank_operation_transaction_not_found():
    """Операция не найдена -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Операция не найдена"):
        apply_bank_operation_to_student(db, 999, student_id=1)


def test_apply_bank_operation_already_applied():
    """Операция уже зачислена -> ValueError."""
    db = MagicMock()
    mock_bt = MagicMock()
    mock_bt.id = 1
    mock_bt.status = BankTransactionStatus.APPLIED.value
    mock_bt.amount = 100.0
    mock_bt.payer_name = None
    mock_bt.payment_date = None
    mock_bt.tochka_account_id = None
    db.query.return_value.filter.return_value.first.return_value = mock_bt

    with pytest.raises(ValueError, match="уже зачислена"):
        apply_bank_operation_to_student(db, 1, student_id=1)


def test_apply_bank_operation_student_not_found():
    """Ученик не найден -> ValueError."""
    db = MagicMock()
    mock_bt = MagicMock()
    mock_bt.id = 1
    mock_bt.status = "new"
    mock_bt.amount = 100.0
    mock_bt.payer_name = None
    mock_bt.payment_date = None
    mock_bt.tochka_account_id = None
    # first(): BankTransaction, then Student
    db.query.return_value.filter.return_value.first.side_effect = [mock_bt, None]

    with pytest.raises(ValueError, match="Ученик не найден"):
        apply_bank_operation_to_student(db, 1, student_id=999)
