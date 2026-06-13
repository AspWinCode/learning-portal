from datetime import date
from unittest.mock import MagicMock

import pytest

from app.models import BankTransaction, BankTransactionStatus, FinanceTransaction, PhonePaymentBinding, StudentCard
from app.routers.sales_bank import delete_bank_transaction, do_tochka_import_and_apply


def _query_mock(result):
    query = MagicMock()
    query.filter.return_value = query
    query.options.return_value = query
    query.all.return_value = result if isinstance(result, list) else []
    query.first.return_value = result if not isinstance(result, list) else None
    return query


def test_tochka_import_skips_existing_applied_transaction(monkeypatch):
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "op-1"
    bank_transaction.status = BankTransactionStatus.APPLIED.value

    db = MagicMock()
    db.query.side_effect = lambda model: {
        StudentCard: _query_mock([]),
        PhonePaymentBinding: _query_mock([]),
        BankTransaction: _query_mock(bank_transaction),
    }[model]

    ensure_finance = MagicMock()
    monkeypatch.setattr(
        "app.services.tochka_client.fetch_statement_ready",
        lambda account_id, date_from, date_to: {},
    )
    monkeypatch.setattr(
        "app.services.tochka_client.extract_incoming_transactions",
        lambda statement: [
            {
                "operation_id": "op-1",
                "payer_name": "Ivanov",
                "amount": 1000,
                "date": "2026-06-12",
                "payer_phone_raw": "+79990000000",
            }
        ],
    )
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = do_tochka_import_and_apply(
        db,
        "account-1",
        date(2026, 6, 12),
        date(2026, 6, 13),
    )

    assert result.applied == []
    assert result.no_match == []
    assert result.ambiguous == []
    ensure_finance.assert_called_once_with(db, bank_transaction, bank_source="tochka")
    db.add.assert_not_called()


def test_tochka_import_marks_debit_transaction_as_expense(monkeypatch):
    db = MagicMock()
    db.query.side_effect = lambda model: {
        StudentCard: _query_mock([]),
        PhonePaymentBinding: _query_mock([]),
        BankTransaction: _query_mock(None),
    }[model]

    ensure_finance = MagicMock()
    monkeypatch.setattr(
        "app.services.tochka_client.fetch_statement_ready",
        lambda account_id, date_from, date_to: {},
    )
    monkeypatch.setattr(
        "app.services.tochka_client.extract_incoming_transactions",
        lambda statement: [
            {
                "operation_id": "expense-1",
                "payer_name": "Bank fee",
                "amount": 42,
                "direction": "expense",
                "date": "2026-06-13",
                "payer_phone_raw": "+79990000000",
            }
        ],
    )
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = do_tochka_import_and_apply(
        db,
        "account-1",
        date(2026, 6, 13),
        date(2026, 6, 13),
    )

    created_transaction = db.add.call_args.args[0]
    assert created_transaction.status == BankTransactionStatus.EXPENSE.value
    assert created_transaction.amount == 42
    assert created_transaction.payer_phone is None
    assert result.applied == []
    assert result.no_match == []
    assert result.ambiguous == []
    ensure_finance.assert_called_once_with(db, created_transaction, bank_source="tochka")


def test_tochka_import_skips_ignored_transaction(monkeypatch):
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "ignored-1"
    bank_transaction.status = BankTransactionStatus.IGNORED.value

    db = MagicMock()
    db.query.side_effect = lambda model: {
        StudentCard: _query_mock([]),
        PhonePaymentBinding: _query_mock([]),
        BankTransaction: _query_mock(bank_transaction),
    }[model]

    ensure_finance = MagicMock()
    monkeypatch.setattr(
        "app.services.tochka_client.fetch_statement_ready",
        lambda account_id, date_from, date_to: {},
    )
    monkeypatch.setattr(
        "app.services.tochka_client.extract_incoming_transactions",
        lambda statement: [
            {
                "operation_id": "ignored-1",
                "payer_name": "Bank fee",
                "amount": 42,
                "direction": "expense",
                "date": "2026-06-13",
                "payer_phone_raw": "",
            }
        ],
    )
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = do_tochka_import_and_apply(
        db,
        "account-1",
        date(2026, 6, 13),
        date(2026, 6, 13),
    )

    assert result.applied == []
    assert result.no_match == []
    assert result.ambiguous == []
    ensure_finance.assert_not_called()
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_delete_bank_transaction_marks_ignored_and_deletes_finance_transaction():
    bank_transaction = MagicMock()
    bank_transaction.id = 123
    bank_transaction.operation_id = "op-delete"
    bank_transaction.tochka_account_id = "account-1"
    bank_transaction.status = BankTransactionStatus.EXPENSE.value
    bank_transaction.student_id = 55
    bank_transaction.student_account_id = 66

    bank_query = _query_mock(bank_transaction)
    finance_delete_query = MagicMock()
    finance_delete_query.filter.return_value = finance_delete_query
    finance_delete_query.delete.return_value = 1

    db = MagicMock()
    db.query.side_effect = lambda model: {
        BankTransaction: bank_query,
        FinanceTransaction: finance_delete_query,
    }[model]

    result = await delete_bank_transaction(123, db=db, current_user=MagicMock())

    assert result == {"ok": True}
    assert bank_transaction.status == BankTransactionStatus.IGNORED.value
    assert bank_transaction.student_id is None
    assert bank_transaction.student_account_id is None
    finance_delete_query.delete.assert_called_once_with(synchronize_session=False)
