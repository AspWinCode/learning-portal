import hashlib
import json
import logging
import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from jose import jwt
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database import db_transaction, get_db
from app.dependencies import require_sales_admin_owner, require_sales_manage_bank
from app.models import (
    BankTransaction,
    BankTransactionAlias,
    BankTransactionStatus,
    FinanceTransaction,
    PhonePaymentBinding,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
    StudentCard,
    TochkaAppliedPayment,
    User,
    UserRole,
)
from app.routers.action_log import log_action
from app.schemas.finance import (
    BankPaymentImportResponse,
    BankTransactionApplyRequest,
    BankTransactionExpenseCategoryUpdate,
    BankTransactionResponse,
    PhonePaymentBindingCreate,
    TochkaImportRequest,
)
from app.services.bank_identity import (
    SOURCE_TOCHKA_STATEMENT,
    SOURCE_TOCHKA_WEBHOOK,
    STRATEGY_AMBIGUOUS,
    STRATEGY_EXACT,
    IncomingBankOperation,
    is_generic_counterparty,
    normalize_bank_operation_date,
    pick_semantic_match,
)
from app.services.bank_operation import apply_bank_operation_to_student as bank_operation_apply
from app.services.finance_ledger import ensure_finance_transaction_for_bank_transaction
from app.services.student_account_payment import resolve_payment_format

logger = logging.getLogger(__name__)


def _sync_ft(db, bank_tx, description: str = "") -> None:
    ft = ensure_finance_transaction_for_bank_transaction(db, bank_tx, bank_source="tochka")
    if description and ft and not ft.description_raw:
        ft.description_raw = description
from app.student_display import get_student_display_name
from app.utils.phone import normalize_phone

router = APIRouter()


def _normalize_name(s: str) -> str:
    if not s or not isinstance(s, str):
        return ""
    return " ".join((s or "").lower().strip().split())


def _payer_matches_parent(payer_name: str, parent_full_name: Optional[str]) -> bool:
    if not parent_full_name or not payer_name:
        return False
    payer_normalized = _normalize_name(payer_name)
    parent_normalized = _normalize_name(parent_full_name)
    if not payer_normalized or not parent_normalized:
        return False
    if payer_normalized == parent_normalized:
        return True
    if payer_normalized in parent_normalized or parent_normalized in payer_normalized:
        return True
    payer_words = payer_normalized.split()
    parent_words = parent_normalized.split()
    parent_word_set = set(parent_words)
    initials: List[str] = []
    full_words: List[str] = []
    for word in payer_words:
        cleaned = word.rstrip(".")
        if len(cleaned) == 1 and cleaned.isalpha():
            initials.append(cleaned)
        else:
            full_words.append(word)
    if not all(word in parent_word_set for word in full_words):
        return False
    for letter in initials:
        if not any(parent_word.startswith(letter) for parent_word in parent_words):
            return False
    return True


def _resolve_student_for_bank_payment(
    db: Session,
    student_ids: List[int],
) -> Optional[int]:
    if not student_ids:
        return None
    if len(student_ids) == 1:
        return student_ids[0]
    cards = (
        db.query(StudentCard)
        .filter(
            StudentCard.student_id.in_(student_ids),
            StudentCard.archived.is_(False),
        )
        .options(joinedload(StudentCard.student).joinedload(Student.accounts))
        .all()
    )
    by_primary = [card for card in cards if getattr(card, "primary_for_bank_payments", False)]
    if len(by_primary) == 1:
        return by_primary[0].student_id
    by_abonement = [card for card in cards if card.student_id and card.abonement_id]
    if len(by_abonement) == 1:
        return by_abonement[0].student_id
    students_with_negative: List[int] = []
    for student_id in student_ids:
        account = db.query(StudentAccount).filter(StudentAccount.student_id == student_id).first()
        if account and account.balance is not None and account.balance < 0:
            students_with_negative.append(student_id)
    if len(students_with_negative) == 1:
        return students_with_negative[0]
    return None


def _webhook_get(payload: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return value
    return None


def _webhook_side_name(side: Any) -> str:
    if isinstance(side, dict):
        return str(side.get("name") or side.get("Name") or "").strip()
    return ""


def _webhook_side_phone(side: Any) -> str:
    if isinstance(side, dict):
        return str(
            side.get("phone")
            or side.get("Phone")
            or side.get("mobile")
            or side.get("Mobile")
            or side.get("payerMobileNumber")
            or ""
        ).strip()
    return ""


def _is_generic_tochka_counterparty(name: Optional[str]) -> bool:
    return is_generic_counterparty(name)


def _stable_tochka_fallback_operation_id(account_id: str, transaction: Dict[str, Any]) -> str:
    raw = transaction.get("raw")
    raw_identity = json.dumps(raw, ensure_ascii=False, sort_keys=True, default=str) if isinstance(raw, dict) else ""
    seed = "|".join(
        [
            account_id,
            str(transaction.get("date") or ""),
            str(transaction.get("amount") or ""),
            str(transaction.get("direction") or ""),
            str(transaction.get("description") or ""),
            raw_identity,
        ]
    )
    return "tochka-fallback-" + hashlib.sha256(seed.encode("utf-8")).hexdigest()


def _incoming_operation(
    transaction: Dict[str, Any],
    source: str,
    external_id: str,
    payer_phone: str,
) -> IncomingBankOperation:
    direction = str(transaction.get("direction") or "income").strip().lower()
    return IncomingBankOperation(
        source=source,
        external_id=external_id,
        canonical_date=normalize_bank_operation_date(transaction.get("date")),
        amount=abs(float(transaction.get("amount") or 0)),
        is_expense=direction == "expense",
        payer_name=(transaction.get("payer_name") or "").strip(),
        payer_phone=payer_phone or "",
        purpose=(transaction.get("description") or "").strip(),
    )


def _alias_sources_by_bank_transaction(db: Session, bank_transaction_ids: List[int]) -> Dict[int, set]:
    sources: Dict[int, set] = {}
    if not bank_transaction_ids:
        return sources
    aliases = (
        db.query(BankTransactionAlias)
        .filter(BankTransactionAlias.bank_transaction_id.in_(bank_transaction_ids))
        .all()
    )
    for alias in aliases:
        sources.setdefault(alias.bank_transaction_id, set()).add(alias.source)
    return sources


def _find_existing_bank_transaction(
    db: Session,
    account_id: Optional[str],
    incoming: IncomingBankOperation,
) -> Tuple[Optional[BankTransaction], str]:
    """Двухуровневый поиск существующей банковской операции.

    1. Точный внешний ID: алиас или operation_id.
    2. Семантически: один кандидат с той же каноничной датой, суммой, направлением и
       совместимыми банковскими полями. Два и больше кандидатов — не склеиваем.
    Возвращает (bank_transaction | None, strategy).
    """
    alias = (
        db.query(BankTransactionAlias)
        .filter(BankTransactionAlias.external_id == incoming.external_id)
        .first()
    )
    if alias is not None:
        bank_transaction = db.query(BankTransaction).filter(BankTransaction.id == alias.bank_transaction_id).first()
        if bank_transaction is not None:
            return bank_transaction, STRATEGY_EXACT
    exact = db.query(BankTransaction).filter(BankTransaction.operation_id == incoming.external_id).first()
    if exact is not None:
        return exact, STRATEGY_EXACT

    if not incoming.amount or not incoming.canonical_date:
        return None, ""
    try:
        day = date.fromisoformat(incoming.canonical_date)
    except ValueError:
        # Нераспознанная дата не должна валить весь импорт: операцию создадим как есть
        return None, ""

    # Дата в БД могла храниться в исходном виде («2026-09-30T10:15:22+03:00»), поэтому ищем
    # по префиксу в соседних днях и сравниваем каноничную дату уже в Python.
    prefixes = [(day + timedelta(days=delta)).isoformat() for delta in (-1, 0, 1)]
    query = db.query(BankTransaction).filter(
        BankTransaction.amount == incoming.amount,
        BankTransaction.status != BankTransactionStatus.IGNORED.value,
        or_(*[BankTransaction.payment_date.like(f"{prefix}%") for prefix in prefixes]),
    )
    if account_id:
        query = query.filter(
            or_(BankTransaction.tochka_account_id == account_id, BankTransaction.tochka_account_id.is_(None))
        )
    candidates = query.order_by(BankTransaction.id.asc()).all()
    if not candidates:
        return None, ""

    sources = _alias_sources_by_bank_transaction(db, [c.id for c in candidates])
    picked, strategy = pick_semantic_match(
        candidates,
        incoming,
        lambda c: sources.get(c.id, set()),
    )
    if picked is None:
        if strategy == STRATEGY_AMBIGUOUS:
            logger.warning(
                "Bank operation: %d candidates match %s/%s, not merging",
                len(candidates),
                incoming.source,
                incoming.canonical_date,
            )
        return None, ""
    return picked, strategy or ""


def _record_alias(db: Session, bank_transaction: BankTransaction, incoming: IncomingBankOperation) -> None:
    exists = (
        db.query(BankTransactionAlias)
        .filter(
            BankTransactionAlias.source == incoming.source,
            BankTransactionAlias.external_id == incoming.external_id,
        )
        .first()
    )
    if exists is None:
        db.add(
            BankTransactionAlias(
                bank_transaction_id=bank_transaction.id,
                source=incoming.source,
                external_id=incoming.external_id,
            )
        )


def _log_merge(bank_transaction: BankTransaction, incoming: IncomingBankOperation, strategy: str) -> None:
    logger.info(
        "tochka transaction merged: existing_bank_transaction_id=%s incoming_operation_id=%s "
        "existing_operation_id=%s matching_strategy=%s source=%s",
        bank_transaction.id,
        incoming.external_id,
        bank_transaction.operation_id,
        strategy,
        incoming.source,
    )


def _resolve_bank_transaction(
    db: Session,
    account_id: Optional[str],
    incoming: IncomingBankOperation,
) -> Tuple[Optional[BankTransaction], str]:
    """Находит существующую операцию или возвращает (None, '') — тогда создаём новую."""
    bank_transaction, strategy = _find_existing_bank_transaction(db, account_id, incoming)
    if bank_transaction is not None and strategy != STRATEGY_EXACT:
        _log_merge(bank_transaction, incoming, strategy)
    return bank_transaction, strategy


def _should_keep_existing_payer_name(existing_name: Optional[str], incoming_name: Optional[str]) -> bool:
    """Не даём затереть уже известное реальное имя плательщика именем-заглушкой «ООО Банк Точка»."""
    return bool(existing_name) and not _is_generic_tochka_counterparty(existing_name) and _is_generic_tochka_counterparty(incoming_name)


def _decode_tochka_webhook(raw_body: bytes) -> Dict[str, Any]:
    body = raw_body.decode("utf-8").strip()
    if not body:
        raise ValueError("empty webhook body")
    if body.startswith("{"):
        import json

        decoded = json.loads(body)
        if not isinstance(decoded, dict):
            raise ValueError("webhook JSON body must be object")
        return decoded
    claims = jwt.get_unverified_claims(body)
    if not isinstance(claims, dict):
        raise ValueError("webhook JWT claims must be object")
    return claims


def _transaction_from_tochka_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    webhook_type = str(_webhook_get(payload, "webhookType", "WebhookType") or "").strip()
    direction = "expense" if webhook_type == "outgoingPayment" else "income"
    payer_side = _webhook_get(payload, "SidePayer", "sidePayer", "payer", "Payer") or {}
    recipient_side = _webhook_get(payload, "SideRecipient", "sideRecipient", "recipient", "Recipient") or {}
    counterparty_side = recipient_side if direction == "expense" else payer_side

    payer_name = str(
        _webhook_get(payload, "payerName", "PayerName", "debtorName", "DebtorName")
        or _webhook_side_name(counterparty_side)
        or ""
    ).strip()
    payer_phone = str(
        _webhook_get(payload, "payerMobileNumber", "PayerMobileNumber", "payerPhone", "PayerPhone")
        or _webhook_side_phone(counterparty_side)
        or ""
    ).strip()

    amount_raw = _webhook_get(payload, "amount", "Amount") or (
        counterparty_side.get("amount") if isinstance(counterparty_side, dict) else None
    )
    try:
        amount = abs(float(amount_raw or 0))
    except (TypeError, ValueError):
        amount = 0.0

    return {
        "date": normalize_bank_operation_date(
            _webhook_get(payload, "date", "Date", "paymentDate", "PaymentDate") or date.today().isoformat()
        ),
        "amount": amount,
        "direction": direction,
        "payer_name": payer_name,
        "payer_phone_raw": payer_phone,
        "operation_id": str(
            _webhook_get(payload, "paymentId", "PaymentId", "operationId", "OperationId", "refTransactionId", "RefTransactionId")
            or ""
        ).strip(),
        "description": str(_webhook_get(payload, "purpose", "Purpose", "paymentPurpose", "PaymentPurpose") or "").strip(),
        "raw": payload,
    }


def _upsert_tochka_bank_transaction(
    db: Session,
    account_id: str,
    transaction: Dict[str, Any],
    source: str = SOURCE_TOCHKA_WEBHOOK,
) -> BankTransaction:
    payer_name = (transaction.get("payer_name") or "").strip()
    amount = abs(float(transaction.get("amount") or 0))
    tx_date = normalize_bank_operation_date(transaction.get("date"))
    payer_phone = normalize_phone(transaction.get("payer_phone_raw") or "")
    direction = str(transaction.get("direction") or "income").strip().lower()
    is_expense = direction == "expense"
    operation_id = (transaction.get("operation_id") or "").strip()
    if not operation_id:
        operation_id = _stable_tochka_fallback_operation_id(account_id, transaction)

    incoming = _incoming_operation(transaction, source, operation_id, payer_phone or "")
    bank_transaction, _strategy = _resolve_bank_transaction(db, account_id, incoming)
    if bank_transaction is None:
        bank_transaction = BankTransaction(
            operation_id=operation_id,
            tochka_account_id=account_id,
            amount=amount,
            payer_phone=(payer_phone or None) if not is_expense else None,
            payer_name=payer_name[:512] if payer_name else None,
            payment_date=tx_date,
            purpose=incoming.purpose[:512] or None,
            status=BankTransactionStatus.EXPENSE.value if is_expense else BankTransactionStatus.NEW.value,
        )
        db.add(bank_transaction)
        db.flush()
    else:
        bank_transaction.amount = amount
        if is_expense:
            bank_transaction.payer_phone = None
        elif payer_phone:
            bank_transaction.payer_phone = payer_phone
        if payer_name and not _should_keep_existing_payer_name(bank_transaction.payer_name, payer_name):
            bank_transaction.payer_name = payer_name[:512]
        bank_transaction.payment_date = tx_date or bank_transaction.payment_date
        if incoming.purpose and not bank_transaction.purpose:
            bank_transaction.purpose = incoming.purpose[:512]
        if is_expense and bank_transaction.status != BankTransactionStatus.APPLIED.value:
            bank_transaction.status = BankTransactionStatus.EXPENSE.value
            bank_transaction.student_id = None
            bank_transaction.student_account_id = None

    _record_alias(db, bank_transaction, incoming)
    _sync_ft(db, bank_transaction, (transaction.get("description") or "").strip())
    return bank_transaction


def do_tochka_import_and_apply(
    db: Session,
    account_id: str,
    date_from: date,
    date_to: date,
    actor_user_id: Optional[int] = None,
) -> BankPaymentImportResponse:
    from app.services.student_card_period import update_card_payment_dates
    from app.services.tochka_client import extract_incoming_transactions, fetch_statement_ready

    statement = fetch_statement_ready(account_id, date_from, date_to)
    transactions = extract_incoming_transactions(statement)
    cards = (
        db.query(StudentCard)
        .filter(StudentCard.archived.is_(False), StudentCard.student_id.isnot(None))
        .options(joinedload(StudentCard.student).joinedload(Student.parent))
        .all()
    )
    bindings = {
        binding.payer_phone_normalized: binding.parent_id
        for binding in db.query(PhonePaymentBinding).all()
    }

    applied: List[dict] = []
    no_match: List[dict] = []
    ambiguous: List[dict] = []

    for idx, transaction in enumerate(transactions):
        try:
            with db_transaction(db):
                payer_name = (transaction.get("payer_name") or "").strip()
                amount = abs(float(transaction.get("amount") or 0))
                tx_date = transaction.get("date") or ""
                payer_phone = normalize_phone(transaction.get("payer_phone_raw") or "")
                direction = str(transaction.get("direction") or "income").strip().lower()
                is_expense = direction == "expense"

                operation_id = (transaction.get("operation_id") or "").strip()
                if not operation_id:
                    operation_id = _stable_tochka_fallback_operation_id(account_id, transaction)
                tx_date = normalize_bank_operation_date(tx_date)
                incoming = _incoming_operation(transaction, SOURCE_TOCHKA_STATEMENT, operation_id, payer_phone or "")

                bank_transaction, _strategy = _resolve_bank_transaction(db, account_id, incoming)
                if bank_transaction is not None and bank_transaction.status == BankTransactionStatus.IGNORED.value:
                    continue
                if bank_transaction is None:
                    bank_transaction = BankTransaction(
                        operation_id=operation_id,
                        tochka_account_id=account_id,
                        amount=amount,
                        payer_phone=(payer_phone or None) if not is_expense else None,
                        payer_name=payer_name[:512] if payer_name else None,
                        payment_date=tx_date,
                        purpose=incoming.purpose[:512] or None,
                        status=BankTransactionStatus.EXPENSE.value if is_expense else BankTransactionStatus.NEW.value,
                    )
                    db.add(bank_transaction)
                    db.flush()
                else:
                    bank_transaction.amount = amount
                    if is_expense:
                        bank_transaction.payer_phone = None
                    elif payer_phone:
                        bank_transaction.payer_phone = payer_phone
                    if payer_name and not _should_keep_existing_payer_name(bank_transaction.payer_name, payer_name):
                        bank_transaction.payer_name = payer_name[:512]
                    bank_transaction.payment_date = tx_date or bank_transaction.payment_date
                    if incoming.purpose and not bank_transaction.purpose:
                        bank_transaction.purpose = incoming.purpose[:512]
                    if not is_expense:
                        payer_phone = normalize_phone(bank_transaction.payer_phone or "") or payer_phone
                        payer_name = (bank_transaction.payer_name or payer_name or "").strip()

                if bank_transaction is not None and is_expense and bank_transaction.status != BankTransactionStatus.APPLIED.value:
                    bank_transaction.amount = amount
                    bank_transaction.payer_phone = None
                    bank_transaction.payer_name = payer_name[:512] if payer_name else bank_transaction.payer_name
                    bank_transaction.payment_date = tx_date or bank_transaction.payment_date
                    bank_transaction.status = BankTransactionStatus.EXPENSE.value
                    bank_transaction.student_id = None
                    bank_transaction.student_account_id = None

                _record_alias(db, bank_transaction, incoming)
                _sync_ft(db, bank_transaction, (transaction.get("description") or "").strip())
                if bank_transaction.status == BankTransactionStatus.EXPENSE.value:
                    continue
                if bank_transaction.status == BankTransactionStatus.APPLIED.value:
                    continue

                student_ids: List[int] = []
                if payer_phone:
                    parent_id = bindings.get(payer_phone)
                    if parent_id is not None:
                        student_ids = [
                            row[0]
                            for row in db.query(Student.id).filter(Student.parent_id == parent_id).all()
                        ]
                    if not student_ids:
                        for card in cards:
                            if normalize_phone(card.parent_phone or "") == payer_phone or normalize_phone(
                                getattr(card, "parent_phone_2", None) or ""
                            ) == payer_phone:
                                if card.student_id:
                                    student_ids.append(card.student_id)
                        student_ids = list(dict.fromkeys(student_ids))

                if not student_ids and payer_name:
                    payer_norm = _normalize_name(payer_name)
                    # Точное совпадение с tochka_payer_name (приоритет)
                    for card in cards:
                        if card.tochka_payer_name and _normalize_name(card.tochka_payer_name) == payer_norm:
                            if card.student_id:
                                student_ids.append(card.student_id)
                    student_ids = list(dict.fromkeys(student_ids))

                if not student_ids and payer_name:
                    # Нечёткое совпадение с parent_full_name / user.full_name (запасной вариант)
                    for card in cards:
                        if _payer_matches_parent(payer_name, card.parent_full_name):
                            if card.student_id:
                                student_ids.append(card.student_id)
                        elif card.student and card.student.parent and card.student.parent.full_name:
                            if _payer_matches_parent(payer_name, card.student.parent.full_name):
                                if card.student_id:
                                    student_ids.append(card.student_id)
                    student_ids = list(dict.fromkeys(student_ids))

                if not student_ids:
                    bank_transaction.status = BankTransactionStatus.NO_MATCH.value
                    _sync_ft(db, bank_transaction, (transaction.get("description") or "").strip())
                    no_match.append(
                        {
                            "payer_name": payer_name,
                            "amount": amount,
                            "date": tx_date,
                            "payer_phone": payer_phone or None,
                        }
                    )
                    continue

                chosen_student_id = _resolve_student_for_bank_payment(db, student_ids)
                if chosen_student_id is None:
                    bank_transaction.status = BankTransactionStatus.AMBIGUOUS.value
                    _sync_ft(db, bank_transaction, (transaction.get("description") or "").strip())
                    ambiguous.append(
                        {
                            "payer_name": payer_name,
                            "amount": amount,
                            "date": tx_date,
                            "payer_phone": payer_phone or None,
                            "candidates": [
                                {
                                    "student_id": student_id,
                                    "student_name": get_student_display_name(
                                        db,
                                        db.query(Student).filter(Student.id == student_id).first(),
                                    ),
                                    "parent_full_name": next(
                                        (card.parent_full_name or "" for card in cards if card.student_id == student_id),
                                        "",
                                    ),
                                }
                                for student_id in student_ids
                            ],
                        }
                    )
                    continue

                student = db.query(Student).filter(Student.id == chosen_student_id).first()
                if student is None:
                    bank_transaction.status = BankTransactionStatus.NO_MATCH.value
                    _sync_ft(db, bank_transaction, (transaction.get("description") or "").strip())
                    no_match.append(
                        {
                            "payer_name": payer_name,
                            "amount": amount,
                            "date": tx_date,
                            "payer_phone": payer_phone or None,
                        }
                    )
                    continue

                account = (
                    db.query(StudentAccount)
                    .filter(StudentAccount.student_id == chosen_student_id)
                    .order_by(StudentAccount.id)
                    .first()
                )
                if account is None:
                    account = StudentAccount(student_id=chosen_student_id, name="Основной", balance=0.0)
                    db.add(account)
                    db.flush()

                note = f"Оплата из банка, плательщик: {payer_name}, дата: {tx_date}"
                db.add(
                    StudentAccountTransaction(
                        account_id=account.id,
                        amount=amount,
                        kind=StudentAccountTransactionKind.PAYMENT,
                        note=note,
                        payment_format=resolve_payment_format(student),
                    )
                )
                account.balance += amount
                db.add(
                    TochkaAppliedPayment(
                        tochka_account_id=account_id,
                        payment_date=tx_date,
                        amount=amount,
                        payer_name=(payer_name or "")[:512],
                        student_id=chosen_student_id,
                        student_account_id=account.id,
                    )
                )

                try:
                    pay_date = date.fromisoformat(tx_date[:10]) if tx_date else date.today()
                except (ValueError, TypeError):
                    pay_date = date.today()

                update_card_payment_dates(db, chosen_student_id, pay_date)

                bank_transaction.status = BankTransactionStatus.APPLIED.value
                bank_transaction.student_id = chosen_student_id
                bank_transaction.student_account_id = account.id
                _sync_ft(db, bank_transaction, (transaction.get("description") or "").strip())

                applied.append(
                    {
                        "payer_name": payer_name,
                        "amount": amount,
                        "date": tx_date,
                        "student_id": chosen_student_id,
                        "account_id": account.id,
                        "student_name": get_student_display_name(db, student),
                    }
                )

        except Exception:
            logger.exception(
                "Tochka import: failed to process transaction %s (idx=%s), skipping",
                (transaction.get("operation_id") or "").strip() or "?",
                idx,
            )
            continue

    if actor_user_id is not None:
        log_action(
            db,
            actor_user_id,
            "tochka_import_apply",
            "sales",
            None,
            {"applied": len(applied), "no_match": len(no_match), "ambiguous": len(ambiguous)},
        )
    return BankPaymentImportResponse(applied=applied, no_match=no_match, ambiguous=ambiguous)


@router.post("/tochka/webhook")
async def tochka_webhook(request: Request, db: Session = Depends(get_db)):
    account_id = (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
    if not account_id:
        raise HTTPException(status_code=400, detail="TOCHKA_ACCOUNT_ID is not configured")

    raw_body = await request.body()
    try:
        payload = _decode_tochka_webhook(raw_body)
        transaction = _transaction_from_tochka_webhook(payload)
    except Exception as exc:
        logger.warning(
            "Tochka webhook: failed to decode payload: %s. body=%s",
            exc,
            raw_body[:2000],
        )
        raise HTTPException(status_code=400, detail=f"Invalid Tochka webhook: {exc!s}")

    if not transaction.get("amount"):
        logger.warning(
            "Tochka webhook: missing amount, dropping. payload=%s",
            json.dumps(payload, ensure_ascii=False, default=str)[:2000],
        )
        raise HTTPException(status_code=400, detail="Invalid Tochka webhook: missing amount")

    with db_transaction(db):
        bank_transaction = _upsert_tochka_bank_transaction(db, account_id, transaction)

    return {
        "ok": True,
        "operation_id": bank_transaction.operation_id,
        "payer_phone": bank_transaction.payer_phone,
        "payer_name": bank_transaction.payer_name,
        "status": bank_transaction.status,
    }


@router.get("/tochka/status")
async def tochka_bank_status(current_user: User = Depends(require_sales_admin_owner)):
    from app.services.tochka_client import is_auto_import_configured, is_configured

    return {
        "configured": is_configured(),
        "auto_import_configured": is_auto_import_configured(),
    }


@router.get("/tochka/status/public")
async def tochka_bank_status_public():
    from app.services.tochka_client import is_auto_import_configured, is_configured

    return {
        "configured": is_configured(),
        "auto_import_configured": is_auto_import_configured(),
    }


@router.post("/tochka/import-and-apply", response_model=BankPaymentImportResponse)
async def tochka_import_and_apply(
    payload: TochkaImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_manage_bank),
):
    from app.services.tochka_client import is_configured

    if not is_configured():
        raise HTTPException(
            status_code=400,
            detail="Точка Банк не настроен: задайте TOCHKA_CLIENT_ID и TOCHKA_CLIENT_SECRET в .env",
        )

    account_id = (payload.account_id or "").strip() or (os.getenv("TOCHKA_ACCOUNT_ID") or "").strip()
    if not account_id:
        raise HTTPException(
            status_code=400,
            detail="Укажите account_id в теле запроса или задайте TOCHKA_ACCOUNT_ID в .env",
        )

    try:
        date_from = date.fromisoformat(payload.date_from)
        date_to = date.fromisoformat(payload.date_to)
    except ValueError:
        raise HTTPException(status_code=400, detail="date_from и date_to должны быть в формате YYYY-MM-DD")

    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from не может быть больше date_to")

    try:
        return do_tochka_import_and_apply(db, account_id, date_from, date_to, actor_user_id=current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка выписки Точка Банк: {exc!s}")


@router.get("/bank-transactions", response_model=List[BankTransactionResponse])
async def list_bank_transactions(
    status: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_admin_owner),
):
    query = db.query(BankTransaction).order_by(BankTransaction.created_at.desc())
    if status:
        query = query.filter(BankTransaction.status.in_(status))
    else:
        query = query.filter(BankTransaction.status != BankTransactionStatus.IGNORED.value)
    items = query.limit(500).all()
    return [BankTransactionResponse.model_validate(item) for item in items]


@router.post("/phone-payment-bindings")
async def create_phone_payment_binding(
    payload: PhonePaymentBindingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_manage_bank),
):
    normalized = normalize_phone(payload.payer_phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")
    parent = db.query(User).filter(User.id == payload.parent_id, User.role == UserRole.PARENT).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Родитель не найден")
    existing = db.query(PhonePaymentBinding).filter(PhonePaymentBinding.payer_phone_normalized == normalized).first()
    with db_transaction(db):
        if existing:
            existing.parent_id = payload.parent_id
            return {"ok": True, "updated": True}
        db.add(PhonePaymentBinding(payer_phone_normalized=normalized, parent_id=payload.parent_id))
    return {"ok": True}


@router.post("/bank-transactions/{transaction_id}/apply", response_model=BankTransactionResponse)
async def apply_bank_transaction(
    transaction_id: int,
    payload: BankTransactionApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_manage_bank),
):
    try:
        with db_transaction(db):
            result = bank_operation_apply(db, transaction_id, payload.student_id)
    except ValueError as exc:
        message = str(exc)
        if "не найден" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    db.refresh(result.transaction)
    return BankTransactionResponse.model_validate(result.transaction)


@router.patch("/bank-transactions/{transaction_id}/expense-category", response_model=BankTransactionResponse)
async def update_bank_transaction_expense_category(
    transaction_id: int,
    payload: BankTransactionExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_manage_bank),
):
    bank_transaction = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if not bank_transaction:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    if bank_transaction.status != BankTransactionStatus.EXPENSE.value:
        raise HTTPException(status_code=400, detail="Категорию можно задать только для расхода")
    with db_transaction(db):
        if payload.expense_category is not None:
            bank_transaction.expense_category = (payload.expense_category or "").strip() or None
    db.refresh(bank_transaction)
    return BankTransactionResponse.model_validate(bank_transaction)


@router.delete("/bank-transactions/{transaction_id}")
async def delete_bank_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sales_manage_bank),
) -> Dict[str, bool]:
    bank_transaction = db.query(BankTransaction).filter(BankTransaction.id == transaction_id).first()
    if not bank_transaction:
        raise HTTPException(status_code=404, detail="Операция не найдена")
    if bank_transaction.status == BankTransactionStatus.APPLIED.value:
        raise HTTPException(status_code=400, detail="Зачисленную операцию нельзя скрыть без отмены зачисления")
    with db_transaction(db):
        bank_source = "tochka" if bank_transaction.tochka_account_id else "import_xlsx"
        (
            db.query(FinanceTransaction)
            .filter(
                FinanceTransaction.bank_source == bank_source,
                FinanceTransaction.bank_operation_id == bank_transaction.operation_id,
            )
            .delete(synchronize_session=False)
        )
        bank_transaction.status = BankTransactionStatus.IGNORED.value
        bank_transaction.student_id = None
        bank_transaction.student_account_id = None
    return {"ok": True}
