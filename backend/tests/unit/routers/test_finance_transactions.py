from unittest.mock import MagicMock

import pytest

from app.models import BankTransaction, BankTransactionStatus, FinanceTransaction
from app.routers import finance


def _query_mock(result):
    query = MagicMock()
    query.filter.return_value = query
    query.first.return_value = result
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
