from datetime import datetime, date, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    PersonalFinanceAccount,
    PersonalFinanceCategory,
    PersonalFinanceDirection,
    PersonalFinanceRule,
    PersonalFinanceTransaction,
    User,
)
from app.schemas.personal_finance import (
    PersonalFinanceAccountCreate,
    PersonalFinanceAccountResponse,
    PersonalFinanceAccountUpdate,
    PersonalFinanceCategoryCreate,
    PersonalFinanceCategoryResponse,
    PersonalFinanceCategoryUpdate,
    PersonalFinanceLegacyImportPayload,
    PersonalFinanceLegacyImportResponse,
    PersonalFinanceRuleCreate,
    PersonalFinanceRuleResponse,
    PersonalFinanceRuleUpdate,
    PersonalFinanceSummaryAccountItem,
    PersonalFinanceSummaryResponse,
    PersonalFinanceTransactionCreate,
    PersonalFinanceTransactionResponse,
    PersonalFinanceTransactionUpdate,
)

router = APIRouter()

DEFAULT_ACCOUNT_NAMES = ["personal", "academy", "leninets", "gogol_mogol"]


def _require_owner(current_user: User) -> None:
    auth.ensure_permission(current_user, "personal_finance.access")


def _signed_amount(direction: PersonalFinanceDirection, amount: float) -> float:
    value = abs(float(amount or 0))
    if direction == PersonalFinanceDirection.EXPENSE:
        return -value
    return value


def _normalize_direction(value: str) -> PersonalFinanceDirection:
    try:
        return PersonalFinanceDirection(str(value).strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid direction") from exc


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _ensure_default_accounts(db: Session, owner_id: int) -> None:
    existing = {
        str(item.name).strip().lower()
        for item in db.query(PersonalFinanceAccount)
        .filter(PersonalFinanceAccount.owner_id == owner_id)
        .all()
    }
    created = False
    for name in DEFAULT_ACCOUNT_NAMES:
        if name in existing:
            continue
        db.add(
            PersonalFinanceAccount(
                owner_id=owner_id,
                name=name,
                currency="RUB",
                balance=0.0,
                is_active=True,
            )
        )
        created = True
    if created:
        db.commit()


def _recalculate_account_balance(db: Session, owner_id: int, account_id: int) -> PersonalFinanceAccount:
    account = (
        db.query(PersonalFinanceAccount)
        .filter(
            PersonalFinanceAccount.id == account_id,
            PersonalFinanceAccount.owner_id == owner_id,
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    txs = (
        db.query(PersonalFinanceTransaction)
        .filter(
            PersonalFinanceTransaction.owner_id == owner_id,
            PersonalFinanceTransaction.account_id == account_id,
        )
        .all()
    )
    account.balance = round(sum(_signed_amount(tx.direction, tx.amount) for tx in txs), 2)
    db.flush()
    return account


def _resolve_account(db: Session, owner_id: int, account_id: int) -> PersonalFinanceAccount:
    account = (
        db.query(PersonalFinanceAccount)
        .filter(
            PersonalFinanceAccount.id == account_id,
            PersonalFinanceAccount.owner_id == owner_id,
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _resolve_category(db: Session, owner_id: int, category_id: Optional[int]) -> Optional[PersonalFinanceCategory]:
    if not category_id:
        return None
    category = (
        db.query(PersonalFinanceCategory)
        .filter(
            PersonalFinanceCategory.id == category_id,
            PersonalFinanceCategory.owner_id == owner_id,
        )
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.get("/accounts", response_model=List[PersonalFinanceAccountResponse])
async def list_accounts(
    only_active: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _ensure_default_accounts(db, current_user.id)
    query = db.query(PersonalFinanceAccount).filter(PersonalFinanceAccount.owner_id == current_user.id)
    if only_active:
        query = query.filter(PersonalFinanceAccount.is_active.is_(True))
    return query.order_by(PersonalFinanceAccount.id.asc()).all()


@router.post("/accounts", response_model=PersonalFinanceAccountResponse)
async def create_account(
    payload: PersonalFinanceAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = PersonalFinanceAccount(
        owner_id=current_user.id,
        name=payload.name.strip(),
        currency=payload.currency.strip().upper(),
        balance=0.0,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/accounts/{account_id}", response_model=PersonalFinanceAccountResponse)
async def update_account(
    account_id: int,
    payload: PersonalFinanceAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = _resolve_account(db, current_user.id, account_id)
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.currency is not None:
        row.currency = payload.currency.strip().upper()
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)
    db.commit()
    db.refresh(row)
    return row


@router.get("/categories", response_model=List[PersonalFinanceCategoryResponse])
async def list_categories(
    only_active: bool = Query(True),
    direction: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    query = db.query(PersonalFinanceCategory).filter(PersonalFinanceCategory.owner_id == current_user.id)
    if only_active:
        query = query.filter(PersonalFinanceCategory.is_active.is_(True))
    if direction:
        query = query.filter(PersonalFinanceCategory.direction == _normalize_direction(direction))
    return query.order_by(PersonalFinanceCategory.name.asc()).all()


@router.post("/categories", response_model=PersonalFinanceCategoryResponse)
async def create_category(
    payload: PersonalFinanceCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = PersonalFinanceCategory(
        owner_id=current_user.id,
        name=payload.name.strip(),
        direction=_normalize_direction(payload.direction),
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/categories/{category_id}", response_model=PersonalFinanceCategoryResponse)
async def update_category(
    category_id: int,
    payload: PersonalFinanceCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = _resolve_category(db, current_user.id, category_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.direction is not None:
        row.direction = _normalize_direction(payload.direction)
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)
    db.commit()
    db.refresh(row)
    return row


@router.get("/rules", response_model=List[PersonalFinanceRuleResponse])
async def list_rules(
    only_active: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    query = (
        db.query(PersonalFinanceRule)
        .options(joinedload(PersonalFinanceRule.category))
        .filter(PersonalFinanceRule.owner_id == current_user.id)
    )
    if only_active:
        query = query.filter(PersonalFinanceRule.is_active.is_(True))
    return query.order_by(PersonalFinanceRule.pattern.asc()).all()


@router.post("/rules", response_model=PersonalFinanceRuleResponse)
async def create_rule(
    payload: PersonalFinanceRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    category = _resolve_category(db, current_user.id, payload.category_id)
    row = PersonalFinanceRule(
        owner_id=current_user.id,
        pattern=payload.pattern.strip(),
        category_id=category.id if category else None,
        display_name=(payload.display_name or "").strip() or None,
        is_active=True,
    )
    db.add(row)
    db.commit()
    return (
        db.query(PersonalFinanceRule)
        .options(joinedload(PersonalFinanceRule.category))
        .filter(PersonalFinanceRule.id == row.id)
        .first()
    )


@router.patch("/rules/{rule_id}", response_model=PersonalFinanceRuleResponse)
async def update_rule(
    rule_id: int,
    payload: PersonalFinanceRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = (
        db.query(PersonalFinanceRule)
        .filter(
            PersonalFinanceRule.id == rule_id,
            PersonalFinanceRule.owner_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    if payload.pattern is not None:
        row.pattern = payload.pattern.strip()
    if "category_id" in payload.model_fields_set:
        category = _resolve_category(db, current_user.id, payload.category_id)
        row.category_id = category.id if category else None
    if payload.display_name is not None:
        row.display_name = payload.display_name.strip() or None
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)
    db.commit()
    return (
        db.query(PersonalFinanceRule)
        .options(joinedload(PersonalFinanceRule.category))
        .filter(PersonalFinanceRule.id == row.id)
        .first()
    )


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = (
        db.query(PersonalFinanceRule)
        .filter(
            PersonalFinanceRule.id == rule_id,
            PersonalFinanceRule.owner_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/transactions", response_model=List[PersonalFinanceTransactionResponse])
async def list_transactions(
    account_ids: Optional[List[int]] = Query(None),
    category_ids: Optional[List[int]] = Query(None),
    direction: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    query = (
        db.query(PersonalFinanceTransaction)
        .options(
            joinedload(PersonalFinanceTransaction.account),
            joinedload(PersonalFinanceTransaction.category),
        )
        .filter(PersonalFinanceTransaction.owner_id == current_user.id)
    )
    if account_ids:
        query = query.filter(PersonalFinanceTransaction.account_id.in_(account_ids))
    if category_ids:
        query = query.filter(PersonalFinanceTransaction.category_id.in_(category_ids))
    if direction:
        query = query.filter(PersonalFinanceTransaction.direction == _normalize_direction(direction))
    if date_from:
        query = query.filter(PersonalFinanceTransaction.occurred_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(PersonalFinanceTransaction.occurred_at <= datetime.combine(date_to, time.max))
    return query.order_by(PersonalFinanceTransaction.occurred_at.desc(), PersonalFinanceTransaction.id.desc()).limit(limit).all()


@router.post("/transactions", response_model=PersonalFinanceTransactionResponse)
async def create_transaction(
    payload: PersonalFinanceTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    account = _resolve_account(db, current_user.id, payload.account_id)
    category = _resolve_category(db, current_user.id, payload.category_id)
    row = PersonalFinanceTransaction(
        owner_id=current_user.id,
        account_id=account.id,
        category_id=category.id if category else None,
        amount=abs(float(payload.amount)),
        direction=_normalize_direction(payload.direction),
        article=((payload.article or "").strip() or (category.name if category else None)),
        description=(payload.description or "").strip() or None,
        occurred_at=_normalize_datetime(payload.occurred_at),
    )
    db.add(row)
    db.flush()
    _recalculate_account_balance(db, current_user.id, account.id)
    db.commit()
    return (
        db.query(PersonalFinanceTransaction)
        .options(
            joinedload(PersonalFinanceTransaction.account),
            joinedload(PersonalFinanceTransaction.category),
        )
        .filter(PersonalFinanceTransaction.id == row.id)
        .first()
    )


@router.patch("/transactions/{transaction_id}", response_model=PersonalFinanceTransactionResponse)
async def update_transaction(
    transaction_id: int,
    payload: PersonalFinanceTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = (
        db.query(PersonalFinanceTransaction)
        .filter(
            PersonalFinanceTransaction.id == transaction_id,
            PersonalFinanceTransaction.owner_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    previous_account_id = row.account_id
    if payload.account_id is not None:
        row.account_id = _resolve_account(db, current_user.id, payload.account_id).id
    if "category_id" in payload.model_fields_set:
        category = _resolve_category(db, current_user.id, payload.category_id)
        row.category_id = category.id if category else None
        if category and ("article" not in payload.model_fields_set):
            row.article = category.name
    if payload.amount is not None:
        row.amount = abs(float(payload.amount))
    if payload.direction is not None:
        row.direction = _normalize_direction(payload.direction)
    if "article" in payload.model_fields_set:
        row.article = (payload.article or "").strip() or None
    if "description" in payload.model_fields_set:
        row.description = (payload.description or "").strip() or None
    if payload.occurred_at is not None:
        row.occurred_at = _normalize_datetime(payload.occurred_at)
    _recalculate_account_balance(db, current_user.id, previous_account_id)
    if row.account_id != previous_account_id:
        _recalculate_account_balance(db, current_user.id, row.account_id)
    else:
        _recalculate_account_balance(db, current_user.id, row.account_id)
    db.commit()
    return (
        db.query(PersonalFinanceTransaction)
        .options(
            joinedload(PersonalFinanceTransaction.account),
            joinedload(PersonalFinanceTransaction.category),
        )
        .filter(PersonalFinanceTransaction.id == row.id)
        .first()
    )


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    row = (
        db.query(PersonalFinanceTransaction)
        .filter(
            PersonalFinanceTransaction.id == transaction_id,
            PersonalFinanceTransaction.owner_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    account_id = row.account_id
    db.delete(row)
    db.flush()
    _recalculate_account_balance(db, current_user.id, account_id)
    db.commit()
    return {"ok": True}


@router.get("/summary", response_model=PersonalFinanceSummaryResponse)
async def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _ensure_default_accounts(db, current_user.id)
    accounts = (
        db.query(PersonalFinanceAccount)
        .filter(
            PersonalFinanceAccount.owner_id == current_user.id,
            PersonalFinanceAccount.is_active.is_(True),
        )
        .order_by(PersonalFinanceAccount.id.asc())
        .all()
    )
    transactions = (
        db.query(PersonalFinanceTransaction)
        .filter(PersonalFinanceTransaction.owner_id == current_user.id)
        .all()
    )
    by_account = {}
    for tx in transactions:
        bucket = by_account.setdefault(tx.account_id, {"income": 0.0, "expense": 0.0})
        if tx.direction == PersonalFinanceDirection.INCOME:
            bucket["income"] += abs(tx.amount)
        else:
            bucket["expense"] += abs(tx.amount)
    items: List[PersonalFinanceSummaryAccountItem] = []
    total_income = 0.0
    total_expense = 0.0
    total_balance = 0.0
    for account in accounts:
        stats = by_account.get(account.id, {"income": 0.0, "expense": 0.0})
        total_income += stats["income"]
        total_expense += stats["expense"]
        total_balance += account.balance
        items.append(
            PersonalFinanceSummaryAccountItem(
                account_id=account.id,
                account_name=account.name,
                currency=account.currency,
                balance=round(account.balance, 2),
                income_total=round(stats["income"], 2),
                expense_total=round(stats["expense"], 2),
            )
        )
    return PersonalFinanceSummaryResponse(
        accounts=items,
        total_balance=round(total_balance, 2),
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        transactions_count=len(transactions),
    )


@router.post("/import", response_model=PersonalFinanceLegacyImportResponse)
async def import_legacy_personal_finance(
    payload: PersonalFinanceLegacyImportPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    accounts_created = 0
    categories_created = 0
    transactions_created = 0
    rules_created = 0

    _ensure_default_accounts(db, current_user.id)

    account_by_name = {
        str(item.name).strip().lower(): item
        for item in db.query(PersonalFinanceAccount)
        .filter(PersonalFinanceAccount.owner_id == current_user.id)
        .all()
    }

    for item in payload.accounts:
        key = item.name.strip().lower()
        if key in account_by_name:
            continue
        row = PersonalFinanceAccount(
            owner_id=current_user.id,
            name=item.name.strip(),
            currency=item.currency.strip().upper(),
            balance=0.0,
            is_active=True,
        )
        db.add(row)
        db.flush()
        account_by_name[key] = row
        accounts_created += 1

    category_by_key = {}
    existing_categories = (
        db.query(PersonalFinanceCategory)
        .filter(PersonalFinanceCategory.owner_id == current_user.id)
        .all()
    )
    for category in existing_categories:
        category_by_key[(category.name.strip().lower(), category.direction.value)] = category

    for item in payload.categories:
        direction = _normalize_direction(item.direction)
        key = (item.name.strip().lower(), direction.value)
        if key in category_by_key:
            continue
        row = PersonalFinanceCategory(
            owner_id=current_user.id,
            name=item.name.strip(),
            direction=direction,
            is_active=True,
        )
        db.add(row)
        db.flush()
        category_by_key[key] = row
        categories_created += 1

    existing_rule_keys = {
        (rule.pattern.strip().lower(), rule.category_id or 0, (rule.display_name or "").strip().lower())
        for rule in db.query(PersonalFinanceRule)
        .filter(PersonalFinanceRule.owner_id == current_user.id)
        .all()
    }
    for item in payload.rules:
        category = _resolve_category(db, current_user.id, item.category_id)
        key = (
            item.pattern.strip().lower(),
            category.id if category else 0,
            (item.display_name or "").strip().lower(),
        )
        if key in existing_rule_keys:
            continue
        db.add(
            PersonalFinanceRule(
                owner_id=current_user.id,
                pattern=item.pattern.strip(),
                category_id=category.id if category else None,
                display_name=(item.display_name or "").strip() or None,
                is_active=True,
            )
        )
        existing_rule_keys.add(key)
        rules_created += 1

    existing_tx_keys = {
        (
            tx.account_id,
            tx.direction.value,
            round(abs(tx.amount), 2),
            (tx.article or "").strip().lower(),
            (tx.description or "").strip().lower(),
            tx.occurred_at.replace(microsecond=0),
        )
        for tx in db.query(PersonalFinanceTransaction)
        .filter(PersonalFinanceTransaction.owner_id == current_user.id)
        .all()
    }
    touched_accounts = set()
    for item in payload.transactions:
        account = _resolve_account(db, current_user.id, item.account_id)
        category = _resolve_category(db, current_user.id, item.category_id)
        occurred_at = _normalize_datetime(item.occurred_at).replace(microsecond=0)
        direction = _normalize_direction(item.direction)
        key = (
            account.id,
            direction.value,
            round(abs(item.amount), 2),
            (item.article or "").strip().lower(),
            (item.description or "").strip().lower(),
            occurred_at,
        )
        if key in existing_tx_keys:
            continue
        db.add(
            PersonalFinanceTransaction(
                owner_id=current_user.id,
                account_id=account.id,
                category_id=category.id if category else None,
                amount=abs(float(item.amount)),
                direction=direction,
                article=((item.article or "").strip() or (category.name if category else None)),
                description=(item.description or "").strip() or None,
                occurred_at=occurred_at,
            )
        )
        existing_tx_keys.add(key)
        touched_accounts.add(account.id)
        transactions_created += 1

    for account_id in touched_accounts:
        _recalculate_account_balance(db, current_user.id, account_id)

    db.commit()
    return PersonalFinanceLegacyImportResponse(
        accounts_created=accounts_created,
        categories_created=categories_created,
        transactions_created=transactions_created,
        rules_created=rules_created,
    )
