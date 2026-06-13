from unittest.mock import MagicMock, patch

from app.models import (
    BankTransactionStatus,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
)
from app.services.finance_ledger import (
    _make_dedup_hash,
    _make_operation_dedup_hash,
    apply_recognition_rules,
    ensure_finance_transaction_for_bank_transaction,
)


def test_make_dedup_hash_deterministic():
    h1 = _make_dedup_hash("tochka", "2025-01-01", 1000.0, "Ivanov", "+79001234567")
    h2 = _make_dedup_hash("tochka", "2025-01-01", 1000.0, "Ivanov", "+79001234567")
    assert h1 == h2


def test_make_dedup_hash_different_amounts():
    h1 = _make_dedup_hash("tochka", "2025-01-01", 1000.0, "Ivanov", None)
    h2 = _make_dedup_hash("tochka", "2025-01-01", 2000.0, "Ivanov", None)
    assert h1 != h2


def test_make_dedup_hash_none_fields():
    h = _make_dedup_hash("tochka", None, 500.0, None, None)
    assert isinstance(h, str) and len(h) == 40


def test_make_operation_dedup_hash_deterministic():
    h1 = _make_operation_dedup_hash("tochka", "OP123")
    h2 = _make_operation_dedup_hash("tochka", "OP123")

    assert h1 == h2
    assert h1 != _make_operation_dedup_hash("tochka", "OP124")


def _make_tx(
    status=FinanceTransactionStatus.NEW,
    counterparty="OOO Romashka",
    description="Payment for course",
):
    tx = MagicMock()
    tx.status = status
    tx.counterparty_name = counterparty
    tx.description_raw = description
    tx.target_id = None
    tx.article_id = None
    return tx


def _make_rule(
    pattern,
    match_type,
    priority=0,
    target_id=10,
    article_id=None,
    direction_override=None,
):
    rule = MagicMock()
    rule.pattern = pattern
    rule.match_type = match_type
    rule.priority = priority
    rule.target_id = target_id
    rule.article_id = article_id
    rule.direction_override = direction_override
    rule.is_active = True
    return rule


def test_apply_recognition_rules_skips_non_new():
    db = MagicMock()
    tx = _make_tx(status=FinanceTransactionStatus.CLASSIFIED)
    apply_recognition_rules(db, tx)
    db.query.assert_not_called()


def test_apply_recognition_rules_no_text():
    db = MagicMock()
    tx = _make_tx(counterparty="", description="")
    apply_recognition_rules(db, tx)
    db.query.assert_not_called()


def test_apply_recognition_rules_no_matching_rules():
    db = MagicMock()
    tx = _make_tx()
    rule = _make_rule("ZZZZZZ", "contains")
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.status == FinanceTransactionStatus.NEW


def test_apply_recognition_rules_contains_match():
    db = MagicMock()
    tx = _make_tx(counterparty="OOO Romashka", description="course payment")
    rule = _make_rule("romashka", "contains", target_id=5)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 5
    assert tx.status == FinanceTransactionStatus.CLASSIFIED


def test_apply_recognition_rules_equals_match():
    db = MagicMock()
    tx = _make_tx(counterparty="OOO Romashka", description="")
    rule = _make_rule("OOO Romashka", "equals", target_id=7)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 7
    assert tx.status == FinanceTransactionStatus.CLASSIFIED


def test_apply_recognition_rules_regex_match():
    db = MagicMock()
    tx = _make_tx(counterparty="Petrov Ivan", description="")
    rule = _make_rule(r"Petrov\s+\w+", "regex", target_id=9)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 9


def test_apply_recognition_rules_bad_regex_no_crash():
    db = MagicMock()
    tx = _make_tx()
    rule = _make_rule(r"[bad", "regex", target_id=9)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.status == FinanceTransactionStatus.NEW


def test_apply_recognition_rules_stops_at_first_match():
    db = MagicMock()
    tx = _make_tx(counterparty="romashka", description="")
    rule_high = _make_rule("romashka", "contains", priority=10, target_id=1)
    rule_low = _make_rule("romashka", "contains", priority=5, target_id=2)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule_high, rule_low]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 1


def test_apply_recognition_rules_does_not_overwrite_existing_target():
    db = MagicMock()
    tx = _make_tx()
    tx.target_id = 99
    rule = _make_rule("romashka", "contains", target_id=5)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.target_id == 99


def test_apply_recognition_rules_sets_direction_override():
    db = MagicMock()
    tx = _make_tx(counterparty="payment")
    tx.direction = FinanceTransactionDirection.INCOME
    rule = _make_rule(
        "payment",
        "contains",
        direction_override=FinanceTransactionDirection.EXPENSE,
    )
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.direction == FinanceTransactionDirection.EXPENSE


def test_apply_recognition_rules_sets_article_if_missing():
    db = MagicMock()
    tx = _make_tx(counterparty="course")
    tx.article_id = None
    rule = _make_rule("course", "contains", article_id=77)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.article_id == 77


def test_apply_recognition_rules_does_not_overwrite_existing_article():
    db = MagicMock()
    tx = _make_tx(counterparty="course")
    tx.article_id = 55
    rule = _make_rule("course", "contains", article_id=77)
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [rule]

    apply_recognition_rules(db, tx)

    assert tx.article_id == 55


def _make_bank_tx(
    operation_id="OP123",
    amount=1000.0,
    status="new",
    payer_name="Ivanov",
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
    db = MagicMock()
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
def test_ensure_finance_tx_reuses_existing_by_dedup_hash(mock_rules):
    db = MagicMock()
    existing = MagicMock()
    existing.status = FinanceTransactionStatus.NEW
    existing.bank_operation_id = None
    db.query.return_value.filter.return_value.first.return_value = existing
    bank_tx = _make_bank_tx(operation_id="", amount=1000.0)

    result = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert result is existing
    assert existing.amount == 1000.0
    assert existing.bank_operation_id is None
    db.add.assert_not_called()
    mock_rules.assert_called_once_with(db, existing)


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_does_not_reuse_dedup_hash_when_operation_id_differs(mock_rules):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx(operation_id="NEW_OP", amount=1000.0)

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert tx.bank_operation_id == "NEW_OP"
    assert tx.dedup_hash == _make_operation_dedup_hash("tochka", "NEW_OP")
    db.add.assert_called_once_with(tx)
    mock_rules.assert_called_once_with(db, tx)


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_reuses_pending_transaction(mock_rules):
    db = MagicMock()
    pending = FinanceTransaction(
        bank_source="tochka",
        bank_operation_id="OP123",
        dedup_hash="old",
        status=FinanceTransactionStatus.NEW,
    )
    db.new = {pending}
    bank_tx = _make_bank_tx(operation_id="OP123", status=BankTransactionStatus.NO_MATCH.value)

    result = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert result is pending
    assert pending.status == FinanceTransactionStatus.CLASSIFIED
    db.query.assert_not_called()
    db.add.assert_not_called()
    mock_rules.assert_called_once_with(db, pending)


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_expense_direction(mock_rules):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx(amount=-500.0)

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert tx.direction == FinanceTransactionDirection.EXPENSE


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_applied_status(mock_rules):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx(status=BankTransactionStatus.APPLIED.value)

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert tx.status == FinanceTransactionStatus.APPLIED


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_existing_classified_status_not_downgraded(mock_rules):
    db = MagicMock()
    existing = MagicMock()
    existing.status = FinanceTransactionStatus.CLASSIFIED
    db.query.return_value.filter.return_value.first.return_value = existing
    bank_tx = _make_bank_tx(status="new")

    ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert existing.status == FinanceTransactionStatus.CLASSIFIED


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_existing_new_upgrades_to_classified(mock_rules):
    db = MagicMock()
    existing = MagicMock()
    existing.status = FinanceTransactionStatus.NEW
    db.query.return_value.filter.return_value.first.return_value = existing
    bank_tx = _make_bank_tx(status=BankTransactionStatus.NO_MATCH.value)

    ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert existing.status == FinanceTransactionStatus.CLASSIFIED


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_sets_target_for_student(mock_rules):
    db = MagicMock()
    first_query = MagicMock()
    second_query = MagicMock()
    third_query = MagicMock()
    first_query.filter.return_value.first.return_value = None
    second_query.filter.return_value.first.return_value = (101,)
    third_query.filter.return_value.first.return_value = (202,)
    db.query.side_effect = [first_query, second_query, third_query]
    bank_tx = _make_bank_tx(student_id=15)

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")

    assert tx.account_id == 101
    assert tx.target_id == 202


@patch("app.services.finance_ledger.apply_recognition_rules")
def test_ensure_finance_tx_empty_operation_id_becomes_none(mock_rules):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    bank_tx = _make_bank_tx(operation_id="   ")

    tx = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="manual")

    assert tx.bank_operation_id is None
