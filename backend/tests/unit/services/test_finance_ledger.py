"""
Unit-тесты сервиса finance_ledger:
  - apply_recognition_rules: авто-классификация транзакций по правилам
  - ensure_finance_transaction_for_bank_transaction: создание/обновление записи в журнале
"""
from unittest.mock import MagicMock, patch, call

import pytest

from app.services.finance_ledger import (
    apply_recognition_rules,
    ensure_finance_transaction_for_bank_transaction,
    _make_dedup_hash,
)
from app.models import (
    FinanceTransactionStatus,
    FinanceTransactionDirection,
    BankTransactionStatus,
)


# ─────────────────────── _make_dedup_hash ───────────────────────


def test_make_dedup_hash_deterministic():
    """Одинаковые аргументы → одинаковый хэш."""
    h1 = _make_dedup_hash("tochka", "2025-01-01", 1000.0, "Иванов", "+79001234567")
    h2 = _make_dedup_hash("tochka", "2025-01-01", 1000.0, "Иванов", "+79001234567")
    assert h1 == h2


def test_make_dedup_hash_different_amounts():
    """Разные суммы → разные хэши."""
    h1 = _make_dedup_hash("tochka", "2025-01-01", 1000.0, "Иванов", None)
    h2 = _make_dedup_hash("tochka", "2025-01-01", 2000.0, "Иванов", None)
    assert h1 != h2


def test_make_dedup_hash_none_fields():
    """None-поля обрабатываются без ошибок."""
    h = _make_dedup_hash("tochka", None, 500.0, None, None)
    assert isinstance(h, str) and len(h) == 40  # SHA1


# ─────────────────────── apply_recognition_rules ───────────────────────


def _make_tx(status=FinanceTransactionStatus.NEW, counterparty="ООО Ромашка", description="Оплата за курс"):
    tx = MagicMock()
    tx.status = status
    tx.counterparty_name = counterparty
    tx.description_raw = description
    tx.target_id = None
    tx.article_id = None
    return tx


def _make_rule(pattern, match_type, priority=0, target_id=10, article_id=None, direction_override=None):
    rule = MagicMock()
    rule.pattern = pattern
    rule.match_type = match_type  # строка
    rule.priority = priority
    rule.target_id = target_id
    rule.article_id = article_id
    rule.direction_override = direction_override
    rule.is_active = True
    return rule


def test_apply_recognition_rules_skips_non_new():
    """Транзакция не в статусе NEW → правила не применяются."""
    db = MagicMock()
    tx = _make_tx(status=FinanceTransactionStatus.CLASSIFIED)
    apply_recognition_rules(db, tx)
    db.query.assert_not_called()


def test_apply_recognition_rules_no_text():
    """Пустой контрагент и описание → ранний возврат."""
    db = MagicMock()
    tx = _make_tx(counterparty="", description="")
    apply_recognition_rules(db, tx)
    db.query.assert_not_called()


def test_apply_recognition_rules_no_matching_rules():
    """Нет совпадающих правил → статус не меняется."""
    db = MagicMock()
    tx = _make_tx()
    rule = _make_rule("ZZZZZZ", "contains")
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.status == FinanceTransactionStatus.NEW


def test_apply_recognition_rules_contains_match():
    """Правило contains совпало → target_id и статус CLASSIFIED."""
    db = MagicMock()
    tx = _make_tx(counterparty="ООО Ромашка", description="оплата курс")
    rule = _make_rule("ромашка", "contains", target_id=5)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 5
    assert tx.status == FinanceTransactionStatus.CLASSIFIED


def test_apply_recognition_rules_equals_match():
    """Правило equals совпало (регистронезависимо)."""
    db = MagicMock()
    tx = _make_tx(counterparty="ООО Ромашка", description="")
    rule = _make_rule("ООО Ромашка", "equals", target_id=7)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 7
    assert tx.status == FinanceTransactionStatus.CLASSIFIED


def test_apply_recognition_rules_regex_match():
    """Правило regex совпало."""
    db = MagicMock()
    tx = _make_tx(counterparty="Петров Иван", description="")
    rule = _make_rule(r"Петров\s+\w+", "regex", target_id=9)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 9


def test_apply_recognition_rules_bad_regex_no_crash():
    """Плохой regex → правило пропускается, нет исключения."""
    db = MagicMock()
    tx = _make_tx()
    rule = _make_rule(r"[bad", "regex", target_id=9)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)  # не должно падать

    assert tx.status == FinanceTransactionStatus.NEW


def test_apply_recognition_rules_stops_at_first_match():
    """Останавливается на первом совпавшем правиле (наивысший priority)."""
    db = MagicMock()
    tx = _make_tx(counterparty="ромашка", description="")
    rule_high = _make_rule("ромашка", "contains", priority=10, target_id=1)
    rule_low = _make_rule("ромашка", "contains", priority=5, target_id=2)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule_high, rule_low]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 1  # только первое правило


def test_apply_recognition_rules_does_not_overwrite_existing_target():
    """Уже заданный target_id не перезаписывается."""
    db = MagicMock()
    tx = _make_tx()
    tx.target_id = 99  # уже задан
    rule = _make_rule("ромашка", "contains", target_id=5)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 99  # не тронуто


# ─────────────────────── ensure_finance_transaction_for_bank_transaction ───────────────────────


def _make_bank_tx(
    operation_id="OP123",
    amount=1000.0,
    status="new",
    payer_name="Иванов",
    payer_phone="+79001234567",
    payment_date="2025-01-15",
    student_id=None,
):
    bt = MagicMock()
    bt.operation_id = operation_id
    bt.amount = amount
    bt.status = status
    bt.payer_name = payer_name
    bt.payer_phone = payer_phone
    bt.payment_date = payment_date
    bt.student_id = student_id
    return bt


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_creates_new(mock_rules):
    """Если записи нет → создаётся новая FinanceTransaction, вызывается db.add."""
    db = MagicMock()
    # existing → None (записи нет)
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx()

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    db.add.assert_called_once_with(tx)
    assert tx.bank_source == "tochka"
    assert tx.bank_operation_id == "OP123"
    assert tx.amount == 1000.0
    assert tx.direction == FinanceTransactionDirection.INCOME
    mock_rules.assert_called_once_with(db, tx)


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_updates_existing(mock_rules):
    """Если запись есть → обновляет поля, db.add не вызывается."""
    db = MagicMock()
    existing = MagicMock()
    existing.status = FinanceTransactionStatus.NEW
    db.query.return_value.filter.return_value.first.return_value = existing
    bank_tx = _make_bank_tx(amount=2000.0)

    result = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert result is existing
    assert existing.amount == 2000.0
    db.add.assert_not_called()
    mock_rules.assert_called_once_with(db, existing)


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_expense_direction(mock_rules):
    """Отрицательная сумма → direction = EXPENSE."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx(amount=-500.0)

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert tx.direction == FinanceTransactionDirection.EXPENSE


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_applied_status(mock_rules):
    """Статус банковской операции applied → FinanceTransaction статус APPLIED."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx(status=BankTransactionStatus.APPLIED.value)

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert tx.status == FinanceTransactionStatus.APPLIED


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_existing_classified_status_not_downgraded(mock_rules):
    """Существующая транзакция со статусом CLASSIFIED не откатывается до NEW."""
    db = MagicMock()
    existing = MagicMock()
    existing.status = FinanceTransactionStatus.CLASSIFIED
    db.query.return_value.filter.return_value.first.return_value = existing
    bank_tx = _make_bank_tx(status="new")

    ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    # статус не должен быть изменён на NEW
    assert existing.status == FinanceTransactionStatus.CLASSIFIED
