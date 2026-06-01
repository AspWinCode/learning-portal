"""Finance Hub API — единая финансовая площадка owner.

Все маршруты: /api/v1/finance/hub/...
Доступ: только owner (permission: personal_finance.access).
"""
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    FinanceHubAllocation,
    FinanceHubDebt,
    FinanceTarget,
    PersonalFinanceAccount,
    PersonalFinanceCategory,
    PersonalFinanceDirection,
    PersonalFinanceTransaction,
    User,
)
from app.schemas.finance_hub import (
    HubAccountCreate,
    HubAccountResponse,
    HubAccountUpdate,
    HubAllocationCreate,
    HubAllocationResponse,
    HubChartPoint,
    HubChartResponse,
    HubDebtCreate,
    HubDebtPaymentRequest,
    HubDebtResponse,
    HubDebtUpdate,
    HubForecastResponse,
    HubSummaryResponse,
    HubTransactionByCategoryRow,
    HubTransactionByProjectRow,
    HubTransactionCreate,
    HubTransactionResponse,
    HubTransactionUpdate,
)

router = APIRouter()

_HUB_STATUSES = {"completed", "pending", "planned"}
_ACCOUNT_TYPES = {"bank", "cash", "crypto", "other"}
_DEBT_TYPES = {"owe", "owed"}
_DEBT_STATUSES = {"active", "partially_paid", "closed"}


def _require_owner(current_user: User) -> None:
    auth.ensure_permission(current_user, "personal_finance.access")


def _debt_response(debt: FinanceHubDebt) -> HubDebtResponse:
    today = date.today()
    amount = float(debt.amount or 0)
    paid = float(debt.paid_amount or 0)
    remaining = round(amount - paid, 2)

    is_overdue = False
    days_until_due: Optional[int] = None
    if debt.due_date:
        diff = (debt.due_date - today).days
        days_until_due = diff
        is_overdue = diff < 0 and debt.status != "closed"

    return HubDebtResponse(
        id=debt.id,
        owner_id=debt.owner_id,
        debt_type=debt.debt_type,
        counterparty=debt.counterparty,
        amount=round(amount, 2),
        paid_amount=round(paid, 2),
        debt_remaining=remaining,
        currency=debt.currency,
        due_date=debt.due_date,
        description=debt.description,
        project_id=debt.project_id,
        status=debt.status,
        is_overdue=is_overdue,
        days_until_due=days_until_due,
        created_at=debt.created_at,
    )


def _tx_response(tx: PersonalFinanceTransaction, db: Session) -> HubTransactionResponse:
    project_name: Optional[str] = None
    if tx.article and hasattr(tx, "project_id") and False:  # пока не используется
        pass
    # project_id хранится в article поле (пока через category_id → project relation не настроен)
    # Для Finance Hub article = category, project_id = category_id (перекрыто)
    # Используем account.project_id как источник project
    acct = getattr(tx, "account", None)
    proj_id = getattr(acct, "project_id", None) if acct else None
    if proj_id:
        tgt = db.query(FinanceTarget).filter(FinanceTarget.id == proj_id).first()
        project_name = tgt.name if tgt else None

    tx_date: Optional[date] = None
    if tx.occurred_at:
        tx_date = tx.occurred_at.date() if hasattr(tx.occurred_at, "date") else tx.occurred_at

    return HubTransactionResponse(
        id=tx.id,
        account_id=tx.account_id,
        direction=str(getattr(tx.direction, "value", tx.direction)),
        category=tx.article,
        amount=abs(float(tx.amount or 0)),
        currency=getattr(acct, "currency", "KZT") if acct else "KZT",
        transaction_date=tx_date,
        description=tx.description,
        project_id=proj_id,
        project_name=project_name,
        hub_status=tx.hub_status or "completed",
        created_at=tx.created_at,
    )


# ===========================================================================
# ACCOUNTS
# ===========================================================================

@router.get("/accounts", response_model=List[HubAccountResponse])
async def hub_list_accounts(
    only_active: bool = Query(True),
    project_id: Optional[int] = Query(None, description="Фильтр по проекту (NULL = личные счета)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubAccountResponse]:
    """Список счетов/кошельков owner."""
    _require_owner(current_user)
    q = db.query(PersonalFinanceAccount).filter(PersonalFinanceAccount.owner_id == current_user.id)
    if only_active:
        q = q.filter(PersonalFinanceAccount.is_active.is_(True))
    if project_id is not None:
        q = q.filter(PersonalFinanceAccount.project_id == project_id)
    accounts = q.order_by(PersonalFinanceAccount.name).all()
    return [
        HubAccountResponse(
            id=a.id,
            owner_id=a.owner_id,
            name=a.name,
            account_type=a.account_type or "other",
            currency=a.currency,
            balance=float(a.balance or 0),
            project_id=a.project_id,
            is_active=bool(a.is_active),
            created_at=a.created_at,
        )
        for a in accounts
    ]


@router.post("/accounts", response_model=HubAccountResponse, status_code=201)
async def hub_create_account(
    payload: HubAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubAccountResponse:
    """Создать счёт/кошелёк."""
    _require_owner(current_user)
    if payload.account_type not in _ACCOUNT_TYPES:
        raise HTTPException(400, detail=f"account_type must be one of: {_ACCOUNT_TYPES}")

    acct = PersonalFinanceAccount(
        owner_id=current_user.id,
        name=payload.name.strip(),
        account_type=payload.account_type,
        currency=(payload.currency or "KZT").upper(),
        balance=float(payload.balance or 0),
        project_id=payload.project_id,
        is_active=True,
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return HubAccountResponse(
        id=acct.id,
        owner_id=acct.owner_id,
        name=acct.name,
        account_type=acct.account_type,
        currency=acct.currency,
        balance=float(acct.balance or 0),
        project_id=acct.project_id,
        is_active=bool(acct.is_active),
        created_at=acct.created_at,
    )


@router.patch("/accounts/{account_id}", response_model=HubAccountResponse)
async def hub_update_account(
    account_id: int,
    payload: HubAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubAccountResponse:
    """Обновить счёт."""
    _require_owner(current_user)
    acct = db.query(PersonalFinanceAccount).filter(
        PersonalFinanceAccount.id == account_id,
        PersonalFinanceAccount.owner_id == current_user.id,
    ).first()
    if not acct:
        raise HTTPException(404, detail="Счёт не найден")

    if payload.name is not None:
        acct.name = payload.name.strip() or acct.name
    if payload.account_type is not None:
        if payload.account_type not in _ACCOUNT_TYPES:
            raise HTTPException(400, detail=f"account_type must be one of: {_ACCOUNT_TYPES}")
        acct.account_type = payload.account_type
    if payload.currency is not None:
        acct.currency = payload.currency.upper()
    if payload.balance is not None:
        acct.balance = float(payload.balance)
    if payload.project_id is not None:
        acct.project_id = payload.project_id
    if payload.is_active is not None:
        acct.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(acct)
    return HubAccountResponse(
        id=acct.id,
        owner_id=acct.owner_id,
        name=acct.name,
        account_type=acct.account_type,
        currency=acct.currency,
        balance=float(acct.balance or 0),
        project_id=acct.project_id,
        is_active=bool(acct.is_active),
        created_at=acct.created_at,
    )


@router.delete("/accounts/{account_id}")
async def hub_delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Деактивировать счёт (soft delete)."""
    _require_owner(current_user)
    acct = db.query(PersonalFinanceAccount).filter(
        PersonalFinanceAccount.id == account_id,
        PersonalFinanceAccount.owner_id == current_user.id,
    ).first()
    if not acct:
        raise HTTPException(404, detail="Счёт не найден")
    acct.is_active = False
    db.commit()
    return {"ok": True}


# ===========================================================================
# TRANSACTIONS
# ===========================================================================

@router.get("/transactions", response_model=List[HubTransactionResponse])
async def hub_list_transactions(
    account_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    direction: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    hub_status: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubTransactionResponse]:
    """Список транзакций Finance Hub."""
    _require_owner(current_user)

    # Только счета владельца
    owner_account_ids = [
        a.id for a in db.query(PersonalFinanceAccount.id).filter(
            PersonalFinanceAccount.owner_id == current_user.id
        ).all()
    ]
    if not owner_account_ids:
        return []

    q = (
        db.query(PersonalFinanceTransaction)
        .options(joinedload(PersonalFinanceTransaction.account))
        .filter(PersonalFinanceTransaction.account_id.in_(owner_account_ids))
    )

    if account_id is not None:
        q = q.filter(PersonalFinanceTransaction.account_id == account_id)
    if direction is not None:
        q = q.filter(PersonalFinanceTransaction.direction == direction)
    if category is not None:
        q = q.filter(PersonalFinanceTransaction.article == category)
    if hub_status is not None:
        q = q.filter(PersonalFinanceTransaction.hub_status == hub_status)
    if date_from is not None:
        q = q.filter(PersonalFinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        q = q.filter(PersonalFinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

    # Фильтр по project_id (через account.project_id)
    if project_id is not None:
        project_account_ids = [
            a.id for a in db.query(PersonalFinanceAccount.id).filter(
                PersonalFinanceAccount.owner_id == current_user.id,
                PersonalFinanceAccount.project_id == project_id,
            ).all()
        ]
        q = q.filter(PersonalFinanceTransaction.account_id.in_(project_account_ids or [-1]))

    txs = q.order_by(PersonalFinanceTransaction.occurred_at.desc()).limit(limit).all()
    return [_tx_response(tx, db) for tx in txs]


@router.post("/transactions", response_model=HubTransactionResponse, status_code=201)
async def hub_create_transaction(
    payload: HubTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubTransactionResponse:
    """Создать транзакцию Finance Hub."""
    _require_owner(current_user)

    acct = db.query(PersonalFinanceAccount).filter(
        PersonalFinanceAccount.id == payload.account_id,
        PersonalFinanceAccount.owner_id == current_user.id,
    ).first()
    if not acct:
        raise HTTPException(404, detail="Счёт не найден")

    direction = PersonalFinanceDirection(payload.direction)
    amount = abs(float(payload.amount or 0))
    if amount <= 0:
        raise HTTPException(400, detail="amount must be > 0")

    tx = PersonalFinanceTransaction(
        owner_id=current_user.id,
        account_id=payload.account_id,
        amount=amount if direction == PersonalFinanceDirection.INCOME else -amount,
        direction=direction,
        article=payload.category,
        description=payload.description,
        occurred_at=datetime.combine(payload.transaction_date, datetime.min.time()),
        hub_status=payload.hub_status,
    )
    db.add(tx)

    # Обновить баланс счёта только для completed
    if payload.hub_status == "completed":
        if direction == PersonalFinanceDirection.INCOME:
            acct.balance = float(acct.balance or 0) + amount
        else:
            acct.balance = float(acct.balance or 0) - amount

    db.commit()
    db.refresh(tx)
    db.refresh(acct)
    return _tx_response(tx, db)


@router.patch("/transactions/{tx_id}", response_model=HubTransactionResponse)
async def hub_update_transaction(
    tx_id: int,
    payload: HubTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubTransactionResponse:
    """Обновить транзакцию."""
    _require_owner(current_user)

    owner_account_ids = [
        a.id for a in db.query(PersonalFinanceAccount.id).filter(
            PersonalFinanceAccount.owner_id == current_user.id
        ).all()
    ]
    tx = db.query(PersonalFinanceTransaction).filter(
        PersonalFinanceTransaction.id == tx_id,
        PersonalFinanceTransaction.account_id.in_(owner_account_ids or [-1]),
    ).first()
    if not tx:
        raise HTTPException(404, detail="Транзакция не найдена")

    if payload.direction is not None:
        tx.direction = PersonalFinanceDirection(payload.direction)
    if payload.category is not None:
        tx.article = payload.category
    if payload.amount is not None:
        tx.amount = abs(float(payload.amount))
    if payload.description is not None:
        tx.description = payload.description
    if payload.transaction_date is not None:
        tx.occurred_at = datetime.combine(payload.transaction_date, datetime.min.time())
    if payload.hub_status is not None:
        if payload.hub_status not in _HUB_STATUSES:
            raise HTTPException(400, detail=f"hub_status must be one of: {_HUB_STATUSES}")
        tx.hub_status = payload.hub_status

    db.commit()
    db.refresh(tx)
    return _tx_response(tx, db)


@router.delete("/transactions/{tx_id}")
async def hub_delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Удалить транзакцию."""
    _require_owner(current_user)

    owner_account_ids = [
        a.id for a in db.query(PersonalFinanceAccount.id).filter(
            PersonalFinanceAccount.owner_id == current_user.id
        ).all()
    ]
    tx = db.query(PersonalFinanceTransaction).filter(
        PersonalFinanceTransaction.id == tx_id,
        PersonalFinanceTransaction.account_id.in_(owner_account_ids or [-1]),
    ).first()
    if not tx:
        raise HTTPException(404, detail="Транзакция не найдена")

    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.get("/transactions/by-category", response_model=List[HubTransactionByCategoryRow])
async def hub_transactions_by_category(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    direction: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubTransactionByCategoryRow]:
    """Группировка транзакций по категориям за период."""
    _require_owner(current_user)

    owner_account_ids = [
        a.id for a in db.query(PersonalFinanceAccount.id).filter(
            PersonalFinanceAccount.owner_id == current_user.id
        ).all()
    ]
    if not owner_account_ids:
        return []

    q = db.query(PersonalFinanceTransaction).filter(
        PersonalFinanceTransaction.account_id.in_(owner_account_ids),
        PersonalFinanceTransaction.hub_status == "completed",
    )
    if direction:
        q = q.filter(PersonalFinanceTransaction.direction == direction)
    if date_from:
        q = q.filter(PersonalFinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(PersonalFinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

    txs = q.all()
    buckets: Dict[str, Dict] = {}
    for tx in txs:
        cat = tx.article or "other"
        if cat not in buckets:
            buckets[cat] = {"total": 0.0, "count": 0}
        buckets[cat]["total"] += abs(float(tx.amount or 0))
        buckets[cat]["count"] += 1

    return sorted(
        [HubTransactionByCategoryRow(category=k, total=round(v["total"], 2), count=v["count"]) for k, v in buckets.items()],
        key=lambda r: r.total,
        reverse=True,
    )


@router.get("/transactions/by-project", response_model=List[HubTransactionByProjectRow])
async def hub_transactions_by_project(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubTransactionByProjectRow]:
    """Группировка транзакций по проектам за период."""
    _require_owner(current_user)

    accounts = db.query(PersonalFinanceAccount).filter(
        PersonalFinanceAccount.owner_id == current_user.id,
        PersonalFinanceAccount.is_active.is_(True),
    ).all()
    if not accounts:
        return []

    acc_by_id: Dict[int, PersonalFinanceAccount] = {a.id: a for a in accounts}

    q = db.query(PersonalFinanceTransaction).filter(
        PersonalFinanceTransaction.account_id.in_(list(acc_by_id.keys())),
        PersonalFinanceTransaction.hub_status == "completed",
    )
    if date_from:
        q = q.filter(PersonalFinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(PersonalFinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

    txs = q.all()
    # ключ: project_id (None → личные)
    buckets: Dict[Optional[int], Dict] = {}
    for tx in txs:
        acct = acc_by_id.get(tx.account_id)
        proj_id = acct.project_id if acct else None
        if proj_id not in buckets:
            tgt_name = "Личное"
            if proj_id:
                tgt = db.query(FinanceTarget).filter(FinanceTarget.id == proj_id).first()
                tgt_name = tgt.name if tgt else f"Проект {proj_id}"
            buckets[proj_id] = {"project_id": proj_id, "project_name": tgt_name, "income": 0.0, "expense": 0.0}

        amt = abs(float(tx.amount or 0))
        direction = getattr(tx.direction, "value", tx.direction)
        if direction == "income":
            buckets[proj_id]["income"] += amt
        elif direction == "expense":
            buckets[proj_id]["expense"] += amt

    return [
        HubTransactionByProjectRow(
            project_id=v["project_id"],
            project_name=v["project_name"],
            income=round(v["income"], 2),
            expense=round(v["expense"], 2),
            net=round(v["income"] - v["expense"], 2),
        )
        for v in sorted(buckets.values(), key=lambda x: abs(x["income"] - x["expense"]), reverse=True)
    ]


# ===========================================================================
# SUMMARY + CHART
# ===========================================================================

@router.get("/summary", response_model=HubSummaryResponse)
async def hub_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubSummaryResponse:
    """Сводка Finance Hub: total_balance, period_income, period_expense, net_flow, forecast_balance."""
    _require_owner(current_user)

    if date_to is None:
        date_to = date.today()
    if date_from is None:
        date_from = date(date_to.year, date_to.month, 1)

    # total_balance = сумма всех активных счетов
    accounts = db.query(PersonalFinanceAccount).filter(
        PersonalFinanceAccount.owner_id == current_user.id,
        PersonalFinanceAccount.is_active.is_(True),
    ).all()
    total_balance = round(sum(float(a.balance or 0) for a in accounts), 2)
    owner_account_ids = [a.id for a in accounts]

    if not owner_account_ids:
        return HubSummaryResponse(
            date_from=date_from,
            date_to=date_to,
            total_balance=0.0,
            period_income=0.0,
            period_expense=0.0,
            net_flow=0.0,
            forecast_balance=0.0,
        )

    dt_from = datetime.combine(date_from, datetime.min.time())
    dt_to = datetime.combine(date_to, datetime.max.time())

    txs = db.query(PersonalFinanceTransaction).filter(
        PersonalFinanceTransaction.account_id.in_(owner_account_ids),
        PersonalFinanceTransaction.occurred_at >= dt_from,
        PersonalFinanceTransaction.occurred_at <= dt_to,
    ).all()

    period_income = 0.0
    period_expense = 0.0
    planned_income = 0.0
    planned_expense = 0.0

    for tx in txs:
        amt = abs(float(tx.amount or 0))
        direction = getattr(tx.direction, "value", tx.direction)
        hs = tx.hub_status or "completed"
        if hs == "completed":
            if direction == "income":
                period_income += amt
            elif direction == "expense":
                period_expense += amt
        elif hs in ("planned", "pending"):
            if direction == "income":
                planned_income += amt
            elif direction == "expense":
                planned_expense += amt

    net_flow = round(period_income - period_expense, 2)
    forecast_balance = round(total_balance + planned_income - planned_expense, 2)

    return HubSummaryResponse(
        date_from=date_from,
        date_to=date_to,
        total_balance=total_balance,
        period_income=round(period_income, 2),
        period_expense=round(period_expense, 2),
        net_flow=net_flow,
        forecast_balance=forecast_balance,
    )


@router.get("/chart", response_model=HubChartResponse)
async def hub_chart(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    group_by: str = Query("day", description="day | week | month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubChartResponse:
    """Данные для графика входящие/исходящие."""
    _require_owner(current_user)

    if group_by not in ("day", "week", "month"):
        raise HTTPException(400, detail="group_by must be 'day', 'week', or 'month'")
    if date_to is None:
        date_to = date.today()
    if date_from is None:
        date_from = date(date_to.year, date_to.month, 1)

    accounts = db.query(PersonalFinanceAccount.id).filter(
        PersonalFinanceAccount.owner_id == current_user.id,
        PersonalFinanceAccount.is_active.is_(True),
    ).all()
    owner_account_ids = [a.id for a in accounts]
    if not owner_account_ids:
        return HubChartResponse(group_by=group_by, points=[])

    txs = db.query(PersonalFinanceTransaction).filter(
        PersonalFinanceTransaction.account_id.in_(owner_account_ids),
        PersonalFinanceTransaction.hub_status == "completed",
        PersonalFinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()),
        PersonalFinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()),
    ).all()

    buckets: Dict[str, Dict[str, float]] = {}
    for tx in txs:
        if not tx.occurred_at:
            continue
        d = tx.occurred_at.date()
        if group_by == "day":
            key = d.isoformat()
        elif group_by == "week":
            monday = d - timedelta(days=d.weekday())
            key = monday.isoformat()
        else:
            key = f"{d.year:04d}-{d.month:02d}"

        if key not in buckets:
            buckets[key] = {"income": 0.0, "expense": 0.0}
        amt = abs(float(tx.amount or 0))
        direction = getattr(tx.direction, "value", tx.direction)
        if direction == "income":
            buckets[key]["income"] += amt
        elif direction == "expense":
            buckets[key]["expense"] += amt

    points = [
        HubChartPoint(period=k, income=round(v["income"], 2), expense=round(v["expense"], 2))
        for k, v in sorted(buckets.items())
    ]
    return HubChartResponse(group_by=group_by, points=points)


# ===========================================================================
# DEBTS
# ===========================================================================

@router.get("/debts", response_model=List[HubDebtResponse])
async def hub_list_debts(
    debt_type: Optional[str] = Query(None, description="owe | owed"),
    debt_status: Optional[str] = Query(None, description="active | partially_paid | closed"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubDebtResponse]:
    """Список долгов и обязательств."""
    _require_owner(current_user)

    q = db.query(FinanceHubDebt).filter(FinanceHubDebt.owner_id == current_user.id)
    if debt_type:
        if debt_type not in _DEBT_TYPES:
            raise HTTPException(400, detail=f"debt_type must be one of: {_DEBT_TYPES}")
        q = q.filter(FinanceHubDebt.debt_type == debt_type)
    if debt_status:
        if debt_status not in _DEBT_STATUSES:
            raise HTTPException(400, detail=f"status must be one of: {_DEBT_STATUSES}")
        q = q.filter(FinanceHubDebt.status == debt_status)

    debts = q.order_by(FinanceHubDebt.due_date.asc().nullslast()).all()
    return [_debt_response(d) for d in debts]


@router.post("/debts", response_model=HubDebtResponse, status_code=201)
async def hub_create_debt(
    payload: HubDebtCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubDebtResponse:
    """Создать долг/обязательство."""
    _require_owner(current_user)

    debt = FinanceHubDebt(
        owner_id=current_user.id,
        debt_type=payload.debt_type,
        counterparty=payload.counterparty.strip(),
        amount=payload.amount,
        paid_amount=0,
        currency=(payload.currency or "KZT").upper(),
        due_date=payload.due_date,
        description=payload.description,
        project_id=payload.project_id,
        status="active",
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return _debt_response(debt)


@router.patch("/debts/{debt_id}", response_model=HubDebtResponse)
async def hub_update_debt(
    debt_id: int,
    payload: HubDebtUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubDebtResponse:
    """Обновить долг."""
    _require_owner(current_user)

    debt = db.query(FinanceHubDebt).filter(
        FinanceHubDebt.id == debt_id,
        FinanceHubDebt.owner_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, detail="Долг не найден")

    if payload.counterparty is not None:
        debt.counterparty = payload.counterparty.strip()
    if payload.amount is not None:
        debt.amount = payload.amount
    if payload.currency is not None:
        debt.currency = payload.currency.upper()
    if payload.due_date is not None:
        debt.due_date = payload.due_date
    if payload.description is not None:
        debt.description = payload.description
    if payload.project_id is not None:
        debt.project_id = payload.project_id
    if payload.status is not None:
        if payload.status not in _DEBT_STATUSES:
            raise HTTPException(400, detail=f"status must be one of: {_DEBT_STATUSES}")
        debt.status = payload.status

    db.commit()
    db.refresh(debt)
    return _debt_response(debt)


@router.post("/debts/{debt_id}/payment", response_model=HubDebtResponse)
async def hub_debt_payment(
    debt_id: int,
    payload: HubDebtPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubDebtResponse:
    """Зафиксировать выплату по долгу."""
    _require_owner(current_user)

    debt = db.query(FinanceHubDebt).filter(
        FinanceHubDebt.id == debt_id,
        FinanceHubDebt.owner_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, detail="Долг не найден")
    if debt.status == "closed":
        raise HTTPException(400, detail="Долг уже закрыт")

    payment = float(payload.amount or 0)
    if payment <= 0:
        raise HTTPException(400, detail="amount must be > 0")

    new_paid = float(debt.paid_amount or 0) + payment
    total = float(debt.amount or 0)
    debt.paid_amount = min(new_paid, total)  # не превышаем сумму долга

    if float(debt.paid_amount) >= total:
        debt.status = "closed"
    elif float(debt.paid_amount) > 0:
        debt.status = "partially_paid"

    db.commit()
    db.refresh(debt)
    return _debt_response(debt)


@router.delete("/debts/{debt_id}")
async def hub_delete_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Удалить долг."""
    _require_owner(current_user)

    debt = db.query(FinanceHubDebt).filter(
        FinanceHubDebt.id == debt_id,
        FinanceHubDebt.owner_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, detail="Долг не найден")
    db.delete(debt)
    db.commit()
    return {"ok": True}


# ===========================================================================
# ALLOCATIONS
# ===========================================================================

@router.get("/allocations", response_model=List[HubAllocationResponse])
async def hub_list_allocations(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubAllocationResponse]:
    """История распределений средств."""
    _require_owner(current_user)

    q = db.query(FinanceHubAllocation).filter(FinanceHubAllocation.owner_id == current_user.id)
    if date_from:
        q = q.filter(FinanceHubAllocation.date >= date_from)
    if date_to:
        q = q.filter(FinanceHubAllocation.date <= date_to)

    allocs = q.order_by(FinanceHubAllocation.date.desc()).all()
    result = []
    for a in allocs:
        from_acct = db.query(PersonalFinanceAccount).filter(PersonalFinanceAccount.id == a.from_account_id).first() if a.from_account_id else None
        to_acct = db.query(PersonalFinanceAccount).filter(PersonalFinanceAccount.id == a.to_account_id).first() if a.to_account_id else None
        to_proj = db.query(FinanceTarget).filter(FinanceTarget.id == a.to_project_id).first() if a.to_project_id else None
        result.append(HubAllocationResponse(
            id=a.id,
            owner_id=a.owner_id,
            amount=float(a.amount or 0),
            currency=a.currency,
            from_account_id=a.from_account_id,
            from_account_name=from_acct.name if from_acct else None,
            to_type=a.to_type,
            to_project_id=a.to_project_id,
            to_project_name=to_proj.name if to_proj else None,
            to_account_id=a.to_account_id,
            to_account_name=to_acct.name if to_acct else None,
            date=a.date,
            comment=a.comment,
            created_at=a.created_at,
        ))
    return result


@router.post("/allocations", response_model=HubAllocationResponse, status_code=201)
async def hub_create_allocation(
    payload: HubAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubAllocationResponse:
    """Создать распределение. Автоматически создаёт 2 транзакции (expense + income)."""
    _require_owner(current_user)

    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(400, detail="amount must be > 0")

    # Проверяем from_account
    from_acct: Optional[PersonalFinanceAccount] = None
    if payload.from_account_id:
        from_acct = db.query(PersonalFinanceAccount).filter(
            PersonalFinanceAccount.id == payload.from_account_id,
            PersonalFinanceAccount.owner_id == current_user.id,
        ).first()
        if not from_acct:
            raise HTTPException(404, detail="Счёт-источник не найден")

    # Проверяем to_account
    to_acct: Optional[PersonalFinanceAccount] = None
    if payload.to_account_id:
        to_acct = db.query(PersonalFinanceAccount).filter(
            PersonalFinanceAccount.id == payload.to_account_id,
            PersonalFinanceAccount.owner_id == current_user.id,
        ).first()
        if not to_acct:
            raise HTTPException(404, detail="Счёт-назначение не найден")

    # Проверяем to_project
    to_proj: Optional[FinanceTarget] = None
    if payload.to_project_id:
        to_proj = db.query(FinanceTarget).filter(FinanceTarget.id == payload.to_project_id).first()
        if not to_proj:
            raise HTTPException(404, detail="Проект не найден")

    alloc = FinanceHubAllocation(
        owner_id=current_user.id,
        amount=amount,
        currency=(payload.currency or "KZT").upper(),
        from_account_id=payload.from_account_id,
        to_type=payload.to_type,
        to_project_id=payload.to_project_id,
        to_account_id=payload.to_account_id,
        date=payload.date,
        comment=payload.comment,
        created_by_id=current_user.id,
    )
    db.add(alloc)

    tx_date = datetime.combine(payload.date, datetime.min.time())

    # Транзакция EXPENSE на счёте-источнике
    if from_acct:
        tx_out = PersonalFinanceTransaction(
            owner_id=current_user.id,
            account_id=from_acct.id,
            amount=-amount,
            direction=PersonalFinanceDirection.EXPENSE,
            article="allocation_out",
            description=f"Распределение → {to_proj.name if to_proj else to_acct.name if to_acct else '—'}: {payload.comment or ''}".strip(),
            occurred_at=tx_date,
            hub_status="completed",
        )
        db.add(tx_out)
        from_acct.balance = float(from_acct.balance or 0) - amount

    # Транзакция INCOME на счёте-назначении
    if to_acct:
        tx_in = PersonalFinanceTransaction(
            owner_id=current_user.id,
            account_id=to_acct.id,
            amount=amount,
            direction=PersonalFinanceDirection.INCOME,
            article="allocation_in",
            description=f"Распределение ← {from_acct.name if from_acct else 'Общий пул'}: {payload.comment or ''}".strip(),
            occurred_at=tx_date,
            hub_status="completed",
        )
        db.add(tx_in)
        to_acct.balance = float(to_acct.balance or 0) + amount

    db.commit()
    db.refresh(alloc)

    return HubAllocationResponse(
        id=alloc.id,
        owner_id=alloc.owner_id,
        amount=float(alloc.amount),
        currency=alloc.currency,
        from_account_id=alloc.from_account_id,
        from_account_name=from_acct.name if from_acct else None,
        to_type=alloc.to_type,
        to_project_id=alloc.to_project_id,
        to_project_name=to_proj.name if to_proj else None,
        to_account_id=alloc.to_account_id,
        to_account_name=to_acct.name if to_acct else None,
        date=alloc.date,
        comment=alloc.comment,
        created_at=alloc.created_at,
    )


@router.delete("/allocations/{allocation_id}")
async def hub_delete_allocation(
    allocation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Отменить распределение (откатывает транзакции и балансы)."""
    _require_owner(current_user)

    alloc = db.query(FinanceHubAllocation).filter(
        FinanceHubAllocation.id == allocation_id,
        FinanceHubAllocation.owner_id == current_user.id,
    ).first()
    if not alloc:
        raise HTTPException(404, detail="Распределение не найдено")

    amount = float(alloc.amount or 0)
    tx_date = datetime.combine(alloc.date, datetime.min.time())

    # Откатить транзакции allocation_out/allocation_in созданные в эту же дату с этой же суммой
    if alloc.from_account_id:
        tx_out = db.query(PersonalFinanceTransaction).filter(
            PersonalFinanceTransaction.account_id == alloc.from_account_id,
            PersonalFinanceTransaction.article == "allocation_out",
            PersonalFinanceTransaction.occurred_at == tx_date,
            PersonalFinanceTransaction.amount == -amount,
        ).first()
        if tx_out:
            db.delete(tx_out)
            from_acct = db.query(PersonalFinanceAccount).filter(PersonalFinanceAccount.id == alloc.from_account_id).first()
            if from_acct:
                from_acct.balance = float(from_acct.balance or 0) + amount

    if alloc.to_account_id:
        tx_in = db.query(PersonalFinanceTransaction).filter(
            PersonalFinanceTransaction.account_id == alloc.to_account_id,
            PersonalFinanceTransaction.article == "allocation_in",
            PersonalFinanceTransaction.occurred_at == tx_date,
            PersonalFinanceTransaction.amount == amount,
        ).first()
        if tx_in:
            db.delete(tx_in)
            to_acct = db.query(PersonalFinanceAccount).filter(PersonalFinanceAccount.id == alloc.to_account_id).first()
            if to_acct:
                to_acct.balance = float(to_acct.balance or 0) - amount

    db.delete(alloc)
    db.commit()
    return {"ok": True}


# ===========================================================================
# PLANNED + FORECAST
# ===========================================================================

@router.get("/planned", response_model=List[HubTransactionResponse])
async def hub_planned_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[HubTransactionResponse]:
    """Список запланированных/ожидаемых транзакций."""
    _require_owner(current_user)

    owner_account_ids = [
        a.id for a in db.query(PersonalFinanceAccount.id).filter(
            PersonalFinanceAccount.owner_id == current_user.id
        ).all()
    ]
    if not owner_account_ids:
        return []

    txs = (
        db.query(PersonalFinanceTransaction)
        .options(joinedload(PersonalFinanceTransaction.account))
        .filter(
            PersonalFinanceTransaction.account_id.in_(owner_account_ids),
            PersonalFinanceTransaction.hub_status.in_(["planned", "pending"]),
        )
        .order_by(PersonalFinanceTransaction.occurred_at.asc())
        .all()
    )
    return [_tx_response(tx, db) for tx in txs]


@router.get("/forecast", response_model=HubForecastResponse)
async def hub_forecast(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> HubForecastResponse:
    """Прогноз баланса: текущий + ожидаемые поступления − расходы."""
    _require_owner(current_user)

    accounts = db.query(PersonalFinanceAccount).filter(
        PersonalFinanceAccount.owner_id == current_user.id,
        PersonalFinanceAccount.is_active.is_(True),
    ).all()
    current_balance = round(sum(float(a.balance or 0) for a in accounts), 2)
    owner_account_ids = [a.id for a in accounts]

    if not owner_account_ids:
        return HubForecastResponse(
            current_balance=0.0,
            planned_income=0.0,
            planned_expense=0.0,
            forecast_balance=0.0,
            planned_transactions=[],
        )

    planned_txs = (
        db.query(PersonalFinanceTransaction)
        .options(joinedload(PersonalFinanceTransaction.account))
        .filter(
            PersonalFinanceTransaction.account_id.in_(owner_account_ids),
            PersonalFinanceTransaction.hub_status.in_(["planned", "pending"]),
        )
        .order_by(PersonalFinanceTransaction.occurred_at.asc())
        .all()
    )

    planned_income = 0.0
    planned_expense = 0.0
    for tx in planned_txs:
        amt = abs(float(tx.amount or 0))
        direction = getattr(tx.direction, "value", tx.direction)
        if direction == "income":
            planned_income += amt
        elif direction == "expense":
            planned_expense += amt

    forecast_balance = round(current_balance + planned_income - planned_expense, 2)

    return HubForecastResponse(
        current_balance=current_balance,
        planned_income=round(planned_income, 2),
        planned_expense=round(planned_expense, 2),
        forecast_balance=forecast_balance,
        planned_transactions=[_tx_response(tx, db) for tx in planned_txs],
    )
