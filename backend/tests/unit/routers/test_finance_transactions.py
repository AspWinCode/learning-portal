from unittest.mock import MagicMock

import pytest

from app.models import BankTransaction, BankTransactionStatus, FinanceTransaction, FinanceTransactionDirection, FinanceTransactionStatus
from app.routers import finance
from app.schemas.finance import FinanceTransactionApplyStudentRequest
from app.services.student_account_payment import AddPaymentResult


def _query_mock(result):
    query = MagicMock()
    query.filter.return_value = query
    query.options.return_value = query
    query.order_by.return_value = query
    query.in_.return_value = query
    query.first.return_value = result
    query.all.return_value = result if isinstance(result, list) else []
    return query


@pytest.mark.asyncio
async def test_delete_bank_finance_transaction_marks_bank_transaction_ignored(monkeypatch):
    monkeypatch.setattr(finance, "_require_finance_access", lambda user: None)

    tx = MagicMock(spec=FinanceTransaction)
    tx.id = 10
    tx.bank_source = "tochka"
    tx.bank_operation_id = "op-ignored"

    bank_transaction = MagicMock(spec=BankTransaction)
    bank_transaction.operation_id = "op-ignored"
    bank_transaction.status = BankTransactionStatus.EXPENSE.value
    bank_transaction.student_id = 123
    bank_transaction.student_account_id = 456

    db = MagicMock()
    db.query.side_effect = lambda model: {
        FinanceTransaction: _query_mock(tx),
        BankTransaction: _query_mock(bank_transaction),
    }[model]

    result = await finance.delete_finance_transaction(10, db=db, current_user=MagicMock())

    assert result == {"ok": True}
    assert bank_transaction.status == BankTransactionStatus.IGNORED.value
    assert bank_transaction.student_id is None
    assert bank_transaction.student_account_id is None
    db.delete.assert_called_once_with(tx)


@pytest.mark.asyncio
async def test_apply_finance_transaction_to_student_syncs_bank_transaction(monkeypatch):
    """Регрессия: зачисление из журнала (не из вкладки «Операции банка») должно
    пометить исходную BankTransaction как applied, иначе автоимпорт Точки
    попробует зачислить ту же операцию повторно другому ученику."""
    monkeypatch.setattr(finance, "_require_finance_access", lambda user: None)
    monkeypatch.setattr(finance, "_student_name_map", lambda db, ids: {})

    tx = MagicMock(spec=FinanceTransaction)
    tx.id = 10
    tx.direction = FinanceTransactionDirection.INCOME
    tx.amount = 1500.0
    tx.occurred_at = None
    tx.counterparty_name = "Надежда Сергеевна Д."
    tx.description_raw = None
    tx.bank_source = "tochka"
    tx.bank_operation_id = "c2b-real-first"
    tx.student_id = None
    tx.account = None
    tx.to_account = None
    tx.target = None
    tx.article = None
    tx.to_account_id = None
    tx.transfer_group_id = None
    tx.account_id = None
    tx.target_id = None
    tx.article_id = None
    tx.counterparty_phone = None

    bank_transaction = MagicMock(spec=BankTransaction)
    bank_transaction.operation_id = "c2b-real-first"
    bank_transaction.status = BankTransactionStatus.NO_MATCH.value

    student_account = MagicMock()
    student_account.id = 77
    payment_result = AddPaymentResult(account=student_account)

    monkeypatch.setattr(
        "app.services.student_account_payment.add_payment_to_student_account",
        lambda db, student_id, amount, note, pay_date: payment_result,
    )

    db = MagicMock()
    db.query.side_effect = lambda model: {
        FinanceTransaction: _query_mock(tx),
        BankTransaction: _query_mock(bank_transaction),
    }[model]

    result = await finance.apply_finance_transaction_to_student(
        10,
        FinanceTransactionApplyStudentRequest(student_id=42),
        db=db,
        current_user=MagicMock(),
    )

    assert tx.status == FinanceTransactionStatus.APPLIED
    assert tx.student_id == 42
    assert bank_transaction.status == BankTransactionStatus.APPLIED.value
    assert bank_transaction.student_id == 42
    assert bank_transaction.student_account_id == 77
    assert result.bank_transaction_status == BankTransactionStatus.APPLIED.value
