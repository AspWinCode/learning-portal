from datetime import date
from unittest.mock import MagicMock

import pytest

from app.models import BankTransaction, BankTransactionStatus, FinanceTransaction, PhonePaymentBinding, StudentCard
from app.routers.sales_bank import (
    _transaction_from_tochka_webhook,
    _upsert_tochka_bank_transaction,
    delete_bank_transaction,
    do_tochka_import_and_apply,
)


def _query_mock(result):
    query = MagicMock()
    query.filter.return_value = query
    query.options.return_value = query
    query.order_by.return_value = query
    query.all.return_value = result if isinstance(result, list) else []
    query.first.return_value = result if not isinstance(result, list) else None
    return query


def test_tochka_import_skips_existing_applied_transaction(monkeypatch):
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "op-1"
    bank_transaction.status = BankTransactionStatus.APPLIED.value
    bank_transaction.payer_name = 'ООО "Банк Точка"'
    bank_transaction.payer_phone = None

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
    assert bank_transaction.payer_name == "Ivanov"
    assert bank_transaction.payer_phone == "+79990000000"
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


def test_tochka_webhook_extracts_sbp_payer_phone():
    transaction = _transaction_from_tochka_webhook(
        {
            "webhookType": "incomingSbpPayment",
            "operationId": "sbp-1",
            "amount": "4000.00",
            "payerMobileNumber": "+79991112233",
            "payerName": "Иван Иванович И.",
            "purpose": "Оплата обучения",
        }
    )

    assert transaction["operation_id"] == "sbp-1"
    assert transaction["payer_phone_raw"] == "+79991112233"
    assert transaction["payer_name"] == "Иван Иванович И."
    assert transaction["direction"] == "income"


def test_tochka_upsert_preserves_existing_phone_when_statement_has_no_phone(monkeypatch):
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "op-keep-phone"
    bank_transaction.status = BankTransactionStatus.NEW.value
    bank_transaction.payer_phone = "+79991112233"
    bank_transaction.payer_name = "Old"
    bank_transaction.payment_date = "2026-06-14"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = bank_transaction
    ensure_finance = MagicMock()
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = _upsert_tochka_bank_transaction(
        db,
        "account-1",
        {
            "operation_id": "op-keep-phone",
            "amount": 4000,
            "date": "2026-06-15",
            "direction": "income",
            "payer_name": 'ООО "Банк Точка"',
            "payer_phone_raw": "",
        },
    )

    assert result is bank_transaction
    assert bank_transaction.payer_phone == "+79991112233"
    assert bank_transaction.payer_name == "Old"
    ensure_finance.assert_called_once_with(db, bank_transaction, bank_source="tochka")


def test_tochka_webhook_enriches_existing_statement_transaction(monkeypatch):
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "statement-op"
    bank_transaction.status = BankTransactionStatus.NEW.value
    bank_transaction.payer_phone = None
    bank_transaction.payer_name = 'ООО "Банк Точка"'
    bank_transaction.payment_date = "2026-06-15"
    bank_transaction.amount = 4200

    db = MagicMock()
    db.query.side_effect = [_query_mock(None), _query_mock([bank_transaction])]
    ensure_finance = MagicMock()
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = _upsert_tochka_bank_transaction(
        db,
        "account-1",
        {
            "operation_id": "sbp-op",
            "amount": 4200,
            "date": "2026-06-15",
            "direction": "income",
            "payer_name": "Елена Ивановна И.",
            "payer_phone_raw": "+7 (952) 624-43-52",
        },
    )

    assert result is bank_transaction
    assert bank_transaction.operation_id == "statement-op"
    assert bank_transaction.payer_phone == "+79526244352"
    assert bank_transaction.payer_name == "Елена Ивановна И."
    db.add.assert_not_called()
    ensure_finance.assert_called_once_with(db, bank_transaction, bank_source="tochka")


def test_tochka_import_reuses_enriched_webhook_transaction(monkeypatch):
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "sbp-op"
    bank_transaction.status = BankTransactionStatus.NEW.value
    bank_transaction.payer_phone = "+79526244352"
    bank_transaction.payer_name = "Елена Ивановна И."
    bank_transaction.payment_date = "2026-06-15"
    bank_transaction.amount = 4200

    def query_side_effect(model):
        if model is StudentCard:
            return _query_mock([])
        if model is PhonePaymentBinding:
            return _query_mock([])
        if model is BankTransaction:
            query_side_effect.bank_queries += 1
            return _query_mock(None) if query_side_effect.bank_queries == 1 else _query_mock([bank_transaction])
        raise AssertionError(model)

    query_side_effect.bank_queries = 0
    db = MagicMock()
    db.query.side_effect = query_side_effect
    ensure_finance = MagicMock()
    monkeypatch.setattr(
        "app.services.tochka_client.fetch_statement_ready",
        lambda account_id, date_from, date_to: {},
    )
    monkeypatch.setattr(
        "app.services.tochka_client.extract_incoming_transactions",
        lambda statement: [
            {
                "operation_id": "statement-op",
                "payer_name": 'ООО "Банк Точка"',
                "amount": 4200,
                "direction": "income",
                "date": "2026-06-15",
                "payer_phone_raw": "",
            }
        ],
    )
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = do_tochka_import_and_apply(
        db,
        "account-1",
        date(2026, 6, 15),
        date(2026, 6, 15),
    )

    assert result.applied == []
    assert result.no_match == [
        {
            "payer_name": bank_transaction.payer_name,
            "amount": 4200.0,
            "date": "2026-06-15",
            "payer_phone": "+79526244352",
        }
    ]
    assert result.ambiguous == []
    assert bank_transaction.operation_id == "sbp-op"
    assert bank_transaction.payer_phone == "+79526244352"
    assert bank_transaction.payer_name == "Елена Ивановна И."
    db.add.assert_not_called()
    assert ensure_finance.call_count == 2
    ensure_finance.assert_called_with(db, bank_transaction, bank_source="tochka")


def test_tochka_webhook_generic_name_reuses_existing_real_name_transaction(monkeypatch):
    """Регрессия: реальное имя пришло первым (из выписки), а вебхук с именем-заглушкой
    «ООО Банк Точка» по этой же операции прилетел позже — не должен плодить дубль
    и не должен затирать уже известное реальное имя."""
    bank_transaction = MagicMock()
    bank_transaction.operation_id = "c2b-real-first"
    bank_transaction.status = BankTransactionStatus.NEW.value
    bank_transaction.payer_phone = None
    bank_transaction.payer_name = "Надежда Сергеевна Д."
    bank_transaction.payment_date = "2026-07-05"
    bank_transaction.amount = 1500

    db = MagicMock()
    db.query.side_effect = [_query_mock(None), _query_mock([]), _query_mock([]), _query_mock([bank_transaction])]
    ensure_finance = MagicMock()
    monkeypatch.setattr("app.routers.sales_bank.ensure_finance_transaction_for_bank_transaction", ensure_finance)

    result = _upsert_tochka_bank_transaction(
        db,
        "account-1",
        {
            "operation_id": "cbs-tb;123",
            "amount": 1500,
            "date": "2026-07-05",
            "direction": "income",
            "payer_name": 'ООО "Банк Точка"',
            "payer_phone_raw": "",
        },
    )

    assert result is bank_transaction
    assert bank_transaction.payer_name == "Надежда Сергеевна Д."
    db.add.assert_not_called()
    ensure_finance.assert_called_once_with(db, bank_transaction, bank_source="tochka")


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
