from __future__ import annotations

import hashlib
import re
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    BankTransaction,
    BankTransactionStatus,
    FinanceAccount,
    FinanceRecognitionRule,
    FinanceTarget,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
)


def _get_finance_account_id(db: Session, code: str) -> Optional[int]:
    acc = db.query(FinanceAccount.id).filter(FinanceAccount.code == code).first()
    return acc[0] if acc else None


def _get_target_id(db: Session, code: str) -> Optional[int]:
    tgt = db.query(FinanceTarget.id).filter(FinanceTarget.code == code).first()
    return tgt[0] if tgt else None


def _make_dedup_hash(bank_source: str, payment_date: Optional[str], amount: float, payer_name: Optional[str], payer_phone: Optional[str]) -> str:
    seed = f"{bank_source}|{payment_date or ''}|{amount}|{(payer_name or '').strip()}|{(payer_phone or '').strip()}"
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()


def apply_recognition_rules(db: Session, tx: FinanceTransaction) -> None:
    """
    Применяет активные правила авто-классификации к транзакции журнала.
    Не перетирает уже выставленные вручную target/article и не трогает не-new статусы.
    """
    if tx.status != FinanceTransactionStatus.NEW:
        return

    text = f"{(tx.counterparty_name or '').strip()} {(tx.description_raw or '').strip()}".strip()
    if not text:
        return

    rules = (
        db.query(FinanceRecognitionRule)
        .filter(FinanceRecognitionRule.is_active.is_(True))
        .order_by(FinanceRecognitionRule.priority.desc())
        .all()
    )

    for rule in rules:
        pattern = (rule.pattern or "").strip()
        if not pattern:
            continue

        match_type = getattr(rule.match_type, "value", rule.match_type)
        matched = False
        if match_type == "contains":
            matched = pattern.lower() in text.lower()
        elif match_type == "equals":
            matched = text.lower() == pattern.lower()
        elif match_type == "regex":
            try:
                matched = bool(re.search(pattern, text))
            except re.error:
                matched = False

        if not matched:
            continue

        # Применяем правило: заполняем только отсутствующие поля
        if rule.target_id and not tx.target_id:
            tx.target_id = rule.target_id
        if rule.article_id and not tx.article_id:
            tx.article_id = rule.article_id
        if rule.direction_override:
            tx.direction = rule.direction_override

        if tx.status == FinanceTransactionStatus.NEW:
            tx.status = FinanceTransactionStatus.CLASSIFIED
        # Останавливаемся на первом сработавшем по убыванию priority
        break


def ensure_finance_transaction_for_bank_transaction(
    db: Session,
    bank_tx: BankTransaction,
    bank_source: str,
) -> FinanceTransaction:
    """
    Создаёт или обновляет запись в finance_transactions для операции из bank_transactions.
    Используется при авто‑импорте и ручном импорте выписки.
    """
    operation_id = (bank_tx.operation_id or "").strip()
    amount = float(bank_tx.amount or 0)
    dedup_hash = _make_dedup_hash(
        bank_source,
        bank_tx.payment_date,
        amount,
        bank_tx.payer_name,
        bank_tx.payer_phone,
    )
    identity_conditions = [FinanceTransaction.dedup_hash == dedup_hash]
    if operation_id:
        identity_conditions.append(FinanceTransaction.bank_operation_id == operation_id)

    existing = (
        db.query(FinanceTransaction)
        .filter(
            FinanceTransaction.bank_source == bank_source,
            or_(*identity_conditions),
        )
        .first()
    )

    bank_status = (bank_tx.status or "").lower()
    is_expense = amount < 0 or bank_status == BankTransactionStatus.EXPENSE.value
    direction = FinanceTransactionDirection.EXPENSE if is_expense else FinanceTransactionDirection.INCOME

    if bank_status == BankTransactionStatus.APPLIED.value:
        tx_status = FinanceTransactionStatus.APPLIED
    elif bank_status in (
        BankTransactionStatus.EXPENSE.value,
        BankTransactionStatus.NO_MATCH.value,
        BankTransactionStatus.AMBIGUOUS.value,
    ):
        tx_status = FinanceTransactionStatus.CLASSIFIED
    else:
        tx_status = FinanceTransactionStatus.NEW

    if existing:
        # Обновляем базовые поля, не трогая классификацию (target/article/status), если они уже заданы вручную.
        existing.amount = amount
        existing.direction = direction
        existing.counterparty_name = (bank_tx.payer_name or "").strip() or None
        existing.counterparty_phone = (bank_tx.payer_phone or "").strip() or None
        existing.bank_source = bank_source
        if operation_id and not existing.bank_operation_id:
            existing.bank_operation_id = operation_id
        existing.dedup_hash = dedup_hash
        existing.student_id = bank_tx.student_id
        # Статус обновляем только из "new" → более конкретного; ручную классификацию не перезатираем.
        if existing.status == FinanceTransactionStatus.NEW and tx_status != FinanceTransactionStatus.NEW:
            existing.status = tx_status
        # если транзакция всё ещё new и нет target/article — можно попробовать применить правила
        apply_recognition_rules(db, existing)
        return existing

    account_id: Optional[int] = None
    if bank_source == "tochka":
        account_id = _get_finance_account_id(db, "tochka_ip")

    target_id: Optional[int] = None
    if bank_tx.student_id:
        target_id = _get_target_id(db, "academy")

    tx = FinanceTransaction(
        occurred_at=bank_tx.payment_date,  # строка YYYY-MM-DD; PostgreSQL приведёт к timestamp
        amount=amount,
        direction=direction,
        account_id=account_id,
        counterparty_name=(bank_tx.payer_name or "").strip() or None,
        counterparty_phone=(bank_tx.payer_phone or "").strip() or None,
        description_raw=None,
        bank_source=bank_source,
        bank_operation_id=operation_id or None,
        dedup_hash=dedup_hash,
        target_id=target_id,
        student_id=bank_tx.student_id,
        status=tx_status,
    )
    db.add(tx)
    # Авто-классификация по правилам для новых транзакций
    apply_recognition_rules(db, tx)
    return tx

