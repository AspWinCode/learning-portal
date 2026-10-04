"""Регрессии идентичности банковских операций: даты, семантическое сопоставление, XLSX-ID."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import pytest

from app.services.bank_identity import (
    SOURCE_TOCHKA_STATEMENT,
    SOURCE_TOCHKA_WEBHOOK,
    SOURCE_XLSX,
    STRATEGY_AMBIGUOUS,
    STRATEGY_GENERIC_TO_REAL,
    STRATEGY_NORMALIZED_DATE,
    STRATEGY_SAME_PAYMENT,
    IncomingBankOperation,
    normalize_bank_operation_date,
    pick_semantic_match,
    stable_fingerprint_operation_id,
)

GENERIC = 'ООО "Банк Точка"'
REAL = "Никита Леонидович Т."


@dataclass
class Cand:
    id: int
    payment_date: Optional[str]
    amount: float
    is_expense: bool
    payer_name: Optional[str]
    payer_phone: Optional[str] = None
    purpose: Optional[str] = None


def _income(source, external_id="op", name=REAL, phone="", date="2026-09-30"):
    return IncomingBankOperation(
        source=source,
        external_id=external_id,
        canonical_date=date,
        amount=2250.0,
        is_expense=False,
        payer_name=name,
        payer_phone=phone,
    )


def _expense(source, external_id="op", name=GENERIC, purpose="Перевод по номеру телефона +79990000000", date="2026-09-30"):
    return IncomingBankOperation(
        source=source,
        external_id=external_id,
        canonical_date=date,
        amount=50000.0,
        is_expense=True,
        payer_name=name,
        purpose=purpose,
    )


# ---------- 1. Канонизация даты ----------

@pytest.mark.parametrize(
    "raw",
    [
        "2026-09-30",
        "2026-09-30T10:15:22",
        "2026-09-30T10:15:22+03:00",
        "2026-09-30T10:15:22Z".replace("Z", "+03:00"),
        "2026-09-30 10:15:22",
        "2026-09-30T10:15:22.123+03:00",
        "30.09.2026",
    ],
)
def test_canonical_date_is_identical_for_all_tochka_date_forms(raw):
    assert normalize_bank_operation_date(raw) == "2026-09-30"


def test_canonical_date_converts_utc_to_bank_timezone():
    # 2026-09-30 23:30 UTC — уже 1 октября по московскому времени банка
    assert normalize_bank_operation_date("2026-09-30T23:30:00Z") == "2026-10-01"


def test_canonical_date_accepts_datetime_objects():
    assert normalize_bank_operation_date(datetime(2026, 9, 30, 10, 15, tzinfo=timezone.utc)) == "2026-09-30"
    assert normalize_bank_operation_date(datetime(2026, 9, 30, 10, 15)) == "2026-09-30"


def test_canonical_date_empty_and_unknown_do_not_raise():
    assert normalize_bank_operation_date(None) == ""
    assert normalize_bank_operation_date("   ") == ""
    assert normalize_bank_operation_date("не дата") == "не дата"


# ---------- 2. Сопоставление приходов ----------

def test_webhook_generic_income_merges_with_statement_real_name_on_normalized_date():
    """Вебхук: дата с часовым поясом, заглушка. Выписка: дата без времени, реальное имя."""
    webhook_candidate = Cand(
        id=1,
        payment_date=normalize_bank_operation_date("2026-09-30T10:15:22+03:00"),
        amount=2250.0,
        is_expense=False,
        payer_name=GENERIC,
    )
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL, date="2026-09-30")

    picked, strategy = pick_semantic_match([webhook_candidate], incoming, lambda c: {SOURCE_TOCHKA_WEBHOOK})

    assert picked is webhook_candidate
    assert strategy == STRATEGY_GENERIC_TO_REAL


def test_raw_webhook_date_is_still_matched_and_reported_as_normalized():
    """Старая запись с сырой датой «2026-09-30T10:15:22+03:00» находится по канонической дате."""
    raw_candidate = Cand(id=1, payment_date="2026-09-30T10:15:22+03:00", amount=2250.0, is_expense=False, payer_name=GENERIC)
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL)

    picked, strategy = pick_semantic_match([raw_candidate], incoming, lambda c: set())

    assert picked is raw_candidate
    assert strategy == STRATEGY_NORMALIZED_DATE


def test_webhook_then_statement_same_real_name_is_one_operation():
    candidate = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name=REAL)
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL)

    picked, strategy = pick_semantic_match([candidate], incoming, lambda c: {SOURCE_TOCHKA_WEBHOOK})

    assert picked is candidate
    assert strategy == STRATEGY_SAME_PAYMENT


def test_different_phones_never_merge():
    candidate = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name=REAL, payer_phone="79990000001")
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL, phone="79990000002")

    picked, _ = pick_semantic_match([candidate], incoming, lambda c: set())

    assert picked is None


def test_different_real_names_never_merge_even_with_same_amount_and_day():
    candidate = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name="Иванова Мария")
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL)

    picked, _ = pick_semantic_match([candidate], incoming, lambda c: set())

    assert picked is None


# ---------- 3. Негативные кейсы: реальные одинаковые платежи остаются двумя ----------

def test_two_real_equal_payments_from_different_sources_stay_two():
    """Один и тот же источник (выписка) уже подтвердил кандидата — это другая операция."""
    first_statement_bt = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name=REAL)
    incoming_second_payment = _income(SOURCE_TOCHKA_STATEMENT, "statement-C", name=REAL)

    picked, strategy = pick_semantic_match(
        [first_statement_bt],
        incoming_second_payment,
        lambda c: {SOURCE_TOCHKA_STATEMENT},
    )

    assert picked is None
    assert strategy is None


def test_ambiguous_candidates_are_not_merged():
    first = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name=GENERIC)
    second = Cand(id=2, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name=GENERIC)
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL)

    picked, strategy = pick_semantic_match([first, second], incoming, lambda c: set())

    assert picked is None
    assert strategy == STRATEGY_AMBIGUOUS


def test_income_with_empty_name_never_merges():
    candidate = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=False, payer_name=GENERIC)
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name="")

    picked, _ = pick_semantic_match([candidate], incoming, lambda c: set())

    assert picked is None


def test_income_does_not_match_expense_or_other_amount():
    expense = Cand(id=1, payment_date="2026-09-30", amount=2250.0, is_expense=True, payer_name=GENERIC, purpose="x")
    other_amount = Cand(id=2, payment_date="2026-09-30", amount=2251.0, is_expense=False, payer_name=GENERIC)
    incoming = _income(SOURCE_TOCHKA_STATEMENT, "statement-B", name=REAL)

    picked, _ = pick_semantic_match([expense, other_amount], incoming, lambda c: set())

    assert picked is None


# ---------- 4. Расходы ----------

def test_expense_webhook_then_statement_same_purpose_is_one_operation():
    webhook_bt = Cand(
        id=1, payment_date="2026-09-30", amount=50000.0, is_expense=True,
        payer_name=GENERIC, purpose="Перевод по номеру телефона +79990000000",
    )
    statement = _expense(SOURCE_TOCHKA_STATEMENT, "statement-S", purpose="Перевод по номеру телефона +79990000000")

    picked, strategy = pick_semantic_match([webhook_bt], statement, lambda c: {SOURCE_TOCHKA_WEBHOOK})

    assert picked is webhook_bt
    assert strategy == STRATEGY_SAME_PAYMENT


def test_expense_with_different_purpose_is_not_merged():
    webhook_bt = Cand(id=1, payment_date="2026-09-30", amount=50000.0, is_expense=True, payer_name=GENERIC, purpose="Аренда")
    statement = _expense(SOURCE_TOCHKA_STATEMENT, "statement-S", purpose="Типография")

    picked, _ = pick_semantic_match([webhook_bt], statement, lambda c: set())

    assert picked is None


def test_two_identical_expenses_webhook_and_two_statement_lines_give_two_operations():
    """Два одинаковых перевода 50 000: вебхук на каждый, выписка на каждый.
    Каждый источник подтверждает одну операцию, поэтому пара сходится 1:1."""
    bt_1 = Cand(id=1, payment_date="2026-09-30", amount=50000.0, is_expense=True, payer_name=GENERIC, purpose="Перевод")
    bt_2 = Cand(id=2, payment_date="2026-09-30", amount=50000.0, is_expense=True, payer_name=GENERIC, purpose="Перевод")

    sources = {1: {SOURCE_TOCHKA_WEBHOOK}, 2: {SOURCE_TOCHKA_WEBHOOK}}
    first_statement = _expense(SOURCE_TOCHKA_STATEMENT, "statement-S1", purpose="Перевод")

    picked, _ = pick_semantic_match([bt_1, bt_2], first_statement, lambda c: sources[c.id])
    # Два кандидата — не склеиваем автоматически, это и есть защита от ошибочного слияния
    assert picked is None

    # Когда первая выписочная строка уже подтверждена отдельной записью, следующая ищет другую
    sources[1] = {SOURCE_TOCHKA_WEBHOOK, SOURCE_TOCHKA_STATEMENT}
    second_statement = _expense(SOURCE_TOCHKA_STATEMENT, "statement-S2", purpose="Перевод")
    picked, _ = pick_semantic_match([bt_2], second_statement, lambda c: sources[c.id])
    assert picked is bt_2


# ---------- 5. XLSX: стабильный ID без номера строки ----------

def test_xlsx_fingerprint_does_not_depend_on_row_position():
    parts = ("xlsx", "2026-09-30", "2250.00", REAL, "79990000000", "")
    first = stable_fingerprint_operation_id("xlsx-", parts, 0)
    again = stable_fingerprint_operation_id("xlsx-", parts, 0)
    assert first == again


def test_xlsx_identical_rows_get_distinct_ids_by_occurrence():
    parts = ("xlsx", "2026-09-30", "2250.00", REAL, "", "")
    assert stable_fingerprint_operation_id("xlsx-", parts, 0) != stable_fingerprint_operation_id("xlsx-", parts, 1)


def test_xlsx_incoming_operation_has_source_xlsx():
    incoming = _income(SOURCE_XLSX, "xlsx-x")
    assert incoming.source == SOURCE_XLSX


def test_real_bank_transaction_model_is_a_valid_candidate():
    """Регрессия: у модели BankTransaction нет поля is_expense, направление — по status."""
    from app.models import BankTransaction, BankTransactionStatus

    expense_bt = BankTransaction(
        operation_id="webhook-1",
        amount=50000.0,
        payment_date="2026-09-30T10:15:22+03:00",
        payer_name=GENERIC,
        purpose="Перевод по номеру телефона +79990000000",
        status=BankTransactionStatus.EXPENSE.value,
    )
    statement = _expense(SOURCE_TOCHKA_STATEMENT, "statement-S", purpose="Перевод по номеру телефона +79990000000")

    picked, strategy = pick_semantic_match([expense_bt], statement, lambda c: {SOURCE_TOCHKA_WEBHOOK})

    assert picked is expense_bt
    assert strategy == STRATEGY_NORMALIZED_DATE
