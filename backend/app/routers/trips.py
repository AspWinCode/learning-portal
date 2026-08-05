from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from datetime import date, datetime, timezone
from typing import Dict

from app import auth
from app.database import get_db
from app.models import FinanceTransaction, Trip, TripBudget, TripCashExchange, TripChecklistItem, TripExpense, TripItineraryItem, TripShare, TripStatus, User


router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TripCreate(BaseModel):
    title: str
    country: Optional[str] = None
    city: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    base_currency: str = "RUB"
    local_currency: str = "THB"
    status: str = "planned"
    notes: Optional[str] = None
    cash_alert_threshold: Optional[float] = None


class TripUpdate(BaseModel):
    title: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    base_currency: Optional[str] = None
    local_currency: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    cash_alert_threshold: Optional[float] = None


class TripResponse(BaseModel):
    id: int
    owner_id: int
    title: str
    country: Optional[str]
    city: Optional[str]
    start_date: date
    end_date: Optional[date]
    base_currency: str
    local_currency: str
    status: str
    notes: Optional[str]
    created_at: Optional[str]
    transaction_count: Optional[int] = 0

    class Config:
        from_attributes = True


class TransactionBrief(BaseModel):
    id: int
    occurred_at: Optional[str]
    amount: float
    direction: str
    description_raw: Optional[str]
    counterparty_name: Optional[str]
    status: str

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_owner(user: User) -> None:
    role = auth.resolve_effective_role(user).value
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ только для владельца")


def _get_trip_or_404(db: Session, trip_id: int, user: User) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.owner_id == user.id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Поездка не найдена")
    return trip


def _serialize_trip(trip: Trip, db: Session) -> dict:
    count = db.query(FinanceTransaction).filter(FinanceTransaction.trip_id == trip.id).count()
    return {
        "id": trip.id,
        "owner_id": trip.owner_id,
        "title": trip.title,
        "country": trip.country,
        "city": trip.city,
        "start_date": trip.start_date.isoformat() if trip.start_date else None,
        "end_date": trip.end_date.isoformat() if trip.end_date else None,
        "base_currency": trip.base_currency,
        "local_currency": trip.local_currency,
        "status": trip.status.value if hasattr(trip.status, "value") else trip.status,
        "notes": trip.notes,
        "cash_alert_threshold": trip.cash_alert_threshold,
        "created_at": trip.created_at.isoformat() if trip.created_at else None,
        "transaction_count": count,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[dict])
async def list_trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    _require_owner(current_user)
    q = db.query(Trip).filter(Trip.owner_id == current_user.id)
    if status_filter:
        q = q.filter(Trip.status == status_filter)
    trips = q.order_by(Trip.start_date.desc()).all()
    return [_serialize_trip(t, db) for t in trips]


@router.get("/compare")
async def compare_trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Return per-trip aggregate stats for comparison view."""
    _require_owner(current_user)
    trips = db.query(Trip).filter(Trip.owner_id == current_user.id).order_by(Trip.start_date.desc()).all()
    result = []
    for trip in trips:
        expenses = db.query(TripExpense).filter(TripExpense.trip_id == trip.id).all()
        exchanges = db.query(TripCashExchange).filter(TripCashExchange.trip_id == trip.id).all()
        budgets = db.query(TripBudget).filter(TripBudget.trip_id == trip.id).all()
        total_spent_local = round(sum(e.amount_local for e in expenses), 2)
        total_spent_base = round(sum(e.amount_base for e in expenses), 2)
        total_exchanged = round(sum(ex.amount_local for ex in exchanges), 2)
        budget_map = {b.category: b.amount_local for b in budgets}
        total_plan = budget_map.get("total")
        days_total = None
        daily_avg = None
        if trip.start_date and trip.end_date:
            days_total = max(1, (trip.end_date - trip.start_date).days + 1)
            daily_avg = round(total_spent_local / days_total, 2) if days_total else None
        by_cat: Dict[str, float] = {}
        for e in expenses:
            by_cat[e.category] = round(by_cat.get(e.category, 0) + e.amount_local, 2)
        result.append({
            "id": trip.id,
            "title": trip.title,
            "country": trip.country,
            "city": trip.city,
            "start_date": trip.start_date.isoformat() if trip.start_date else None,
            "end_date": trip.end_date.isoformat() if trip.end_date else None,
            "status": trip.status.value if hasattr(trip.status, "value") else trip.status,
            "local_currency": trip.local_currency,
            "base_currency": trip.base_currency,
            "days_total": days_total,
            "total_spent_local": total_spent_local,
            "total_spent_base": total_spent_base,
            "total_exchanged_local": total_exchanged,
            "total_plan": total_plan,
            "budget_used_pct": round(total_spent_local / total_plan * 100, 1) if total_plan and total_plan > 0 else None,
            "daily_avg": daily_avg,
            "expense_count": len(expenses),
            "by_category": by_cat,
        })
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    try:
        trip_status = TripStatus(payload.status)
    except ValueError:
        trip_status = TripStatus.PLANNED
    trip = Trip(
        owner_id=current_user.id,
        title=payload.title,
        country=payload.country,
        city=payload.city,
        start_date=payload.start_date,
        end_date=payload.end_date,
        base_currency=payload.base_currency,
        local_currency=payload.local_currency,
        status=trip_status,
        notes=payload.notes,
        cash_alert_threshold=payload.cash_alert_threshold,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return _serialize_trip(trip, db)


@router.get("/{trip_id}")
async def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)
    return _serialize_trip(trip, db)


@router.patch("/{trip_id}")
async def update_trip(
    trip_id: int,
    payload: TripUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)
    if payload.title is not None:
        trip.title = payload.title
    if payload.country is not None:
        trip.country = payload.country
    if payload.city is not None:
        trip.city = payload.city
    if payload.start_date is not None:
        trip.start_date = payload.start_date
    if payload.end_date is not None:
        trip.end_date = payload.end_date
    if payload.base_currency is not None:
        trip.base_currency = payload.base_currency
    if payload.local_currency is not None:
        trip.local_currency = payload.local_currency
    if payload.status is not None:
        try:
            trip.status = TripStatus(payload.status)
        except ValueError:
            pass
    if payload.notes is not None:
        trip.notes = payload.notes
    if payload.cash_alert_threshold is not None:
        trip.cash_alert_threshold = payload.cash_alert_threshold if payload.cash_alert_threshold > 0 else None
    db.commit()
    db.refresh(trip)
    return _serialize_trip(trip, db)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)
    db.query(FinanceTransaction).filter(FinanceTransaction.trip_id == trip_id).update({"trip_id": None})
    db.delete(trip)
    db.commit()


@router.get("/{trip_id}/transactions")
async def get_trip_transactions(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    txns = (
        db.query(FinanceTransaction)
        .filter(FinanceTransaction.trip_id == trip_id)
        .order_by(FinanceTransaction.occurred_at.desc())
        .all()
    )
    return [
        {
            "id": t.id,
            "occurred_at": t.occurred_at.isoformat() if t.occurred_at else None,
            "amount": t.amount,
            "direction": t.direction.value if hasattr(t.direction, "value") else t.direction,
            "description_raw": t.description_raw,
            "counterparty_name": t.counterparty_name,
            "status": t.status.value if hasattr(t.status, "value") else t.status,
        }
        for t in txns
    ]


@router.post("/{trip_id}/transactions/{transaction_id}/link")
async def link_transaction_to_trip(
    trip_id: int,
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    txn = db.query(FinanceTransaction).filter(FinanceTransaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Транзакция не найдена")
    txn.trip_id = trip_id
    db.commit()
    return {"ok": True}


@router.delete("/{trip_id}/transactions/{transaction_id}/link", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_transaction_from_trip(
    trip_id: int,
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    txn = db.query(FinanceTransaction).filter(
        FinanceTransaction.id == transaction_id,
        FinanceTransaction.trip_id == trip_id,
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Транзакция не найдена в этой поездке")
    txn.trip_id = None
    db.commit()


# ── Trip Expenses ─────────────────────────────────────────────────────────────

EXPENSE_CATEGORIES = [
    "food", "transport", "excursion", "accommodation",
    "shopping", "health", "visa", "entertainment", "other",
]


class ExpenseCreate(BaseModel):
    category: str = "other"
    description: Optional[str] = None
    amount_local: float
    local_currency: str
    exchange_rate: float
    occurred_at: date
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_url: Optional[str] = None
    place_name: Optional[str] = None


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    amount_local: Optional[float] = None
    exchange_rate: Optional[float] = None
    occurred_at: Optional[date] = None
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_url: Optional[str] = None
    place_name: Optional[str] = None


def _serialize_expense(e: TripExpense) -> dict:
    return {
        "id": e.id,
        "trip_id": e.trip_id,
        "category": e.category,
        "description": e.description,
        "amount_local": e.amount_local,
        "local_currency": e.local_currency,
        "exchange_rate": e.exchange_rate,
        "amount_base": e.amount_base,
        "base_currency": e.base_currency,
        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
        "notes": e.notes,
        "latitude": e.latitude,
        "longitude": e.longitude,
        "photo_url": e.photo_url,
        "place_name": e.place_name,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.get("/{trip_id}/expenses")
async def list_expenses(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    expenses = (
        db.query(TripExpense)
        .filter(TripExpense.trip_id == trip_id)
        .order_by(TripExpense.occurred_at.desc(), TripExpense.created_at.desc())
        .all()
    )
    return [_serialize_expense(e) for e in expenses]


@router.post("/{trip_id}/expenses", status_code=status.HTTP_201_CREATED)
async def create_expense(
    trip_id: int,
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)
    if payload.exchange_rate <= 0:
        raise HTTPException(status_code=400, detail="Курс обмена должен быть больше нуля")
    amount_base = round(payload.amount_local / payload.exchange_rate, 2)
    expense = TripExpense(
        trip_id=trip_id,
        category=payload.category if payload.category in EXPENSE_CATEGORIES else "other",
        description=payload.description,
        amount_local=payload.amount_local,
        local_currency=trip.local_currency,
        exchange_rate=payload.exchange_rate,
        amount_base=amount_base,
        base_currency=trip.base_currency,
        occurred_at=payload.occurred_at,
        notes=payload.notes,
        latitude=payload.latitude,
        longitude=payload.longitude,
        photo_url=payload.photo_url,
        place_name=payload.place_name,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _serialize_expense(expense)


@router.patch("/{trip_id}/expenses/{expense_id}")
async def update_expense(
    trip_id: int,
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    expense = db.query(TripExpense).filter(
        TripExpense.id == expense_id, TripExpense.trip_id == trip_id
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Трата не найдена")
    if payload.category is not None:
        expense.category = payload.category if payload.category in EXPENSE_CATEGORIES else "other"
    if payload.description is not None:
        expense.description = payload.description
    if payload.occurred_at is not None:
        expense.occurred_at = payload.occurred_at
    if payload.notes is not None:
        expense.notes = payload.notes
    if payload.amount_local is not None:
        expense.amount_local = payload.amount_local
    if payload.exchange_rate is not None:
        if payload.exchange_rate <= 0:
            raise HTTPException(status_code=400, detail="Курс обмена должен быть больше нуля")
        expense.exchange_rate = payload.exchange_rate
    if payload.latitude is not None:
        expense.latitude = payload.latitude
    if payload.longitude is not None:
        expense.longitude = payload.longitude
    if payload.photo_url is not None:
        expense.photo_url = payload.photo_url
    if payload.place_name is not None:
        expense.place_name = payload.place_name
    expense.amount_base = round(expense.amount_local / expense.exchange_rate, 2)
    db.commit()
    db.refresh(expense)
    return _serialize_expense(expense)


@router.delete("/{trip_id}/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    trip_id: int,
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    expense = db.query(TripExpense).filter(
        TripExpense.id == expense_id, TripExpense.trip_id == trip_id
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Трата не найдена")
    db.delete(expense)
    db.commit()


# ── Cash Exchanges ────────────────────────────────────────────────────────────

class CashExchangeCreate(BaseModel):
    amount_base: float
    exchange_rate: float
    occurred_at: date
    notes: Optional[str] = None


class CashExchangeUpdate(BaseModel):
    amount_base: Optional[float] = None
    exchange_rate: Optional[float] = None
    occurred_at: Optional[date] = None
    notes: Optional[str] = None


def _serialize_exchange(ex: TripCashExchange) -> dict:
    return {
        "id": ex.id,
        "trip_id": ex.trip_id,
        "amount_base": ex.amount_base,
        "base_currency": ex.base_currency,
        "exchange_rate": ex.exchange_rate,
        "amount_local": ex.amount_local,
        "local_currency": ex.local_currency,
        "occurred_at": ex.occurred_at.isoformat() if ex.occurred_at else None,
        "notes": ex.notes,
        "created_at": ex.created_at.isoformat() if ex.created_at else None,
    }


@router.get("/{trip_id}/cash-exchanges")
async def list_cash_exchanges(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    exchanges = (
        db.query(TripCashExchange)
        .filter(TripCashExchange.trip_id == trip_id)
        .order_by(TripCashExchange.occurred_at.desc(), TripCashExchange.created_at.desc())
        .all()
    )
    return [_serialize_exchange(ex) for ex in exchanges]


@router.post("/{trip_id}/cash-exchanges", status_code=status.HTTP_201_CREATED)
async def create_cash_exchange(
    trip_id: int,
    payload: CashExchangeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)
    if payload.exchange_rate <= 0:
        raise HTTPException(status_code=400, detail="Курс обмена должен быть больше нуля")
    amount_local = round(payload.amount_base * payload.exchange_rate, 2)
    exchange = TripCashExchange(
        trip_id=trip_id,
        amount_base=payload.amount_base,
        base_currency=trip.base_currency,
        exchange_rate=payload.exchange_rate,
        amount_local=amount_local,
        local_currency=trip.local_currency,
        occurred_at=payload.occurred_at,
        notes=payload.notes,
    )
    db.add(exchange)
    db.commit()
    db.refresh(exchange)
    return _serialize_exchange(exchange)


@router.delete("/{trip_id}/cash-exchanges/{exchange_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cash_exchange(
    trip_id: int,
    exchange_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    exchange = db.query(TripCashExchange).filter(
        TripCashExchange.id == exchange_id, TripCashExchange.trip_id == trip_id
    ).first()
    if not exchange:
        raise HTTPException(status_code=404, detail="Операция обмена не найдена")
    db.delete(exchange)
    db.commit()


# ── Trip Summary ──────────────────────────────────────────────────────────────

@router.get("/{trip_id}/summary")
async def get_trip_summary(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)

    expenses = db.query(TripExpense).filter(TripExpense.trip_id == trip_id).all()
    exchanges = db.query(TripCashExchange).filter(TripCashExchange.trip_id == trip_id).all()

    total_expense_local = sum(e.amount_local for e in expenses)
    total_expense_base = sum(e.amount_base for e in expenses)
    total_exchanged_local = sum(ex.amount_local for ex in exchanges)
    total_exchanged_base = sum(ex.amount_base for ex in exchanges)
    cash_balance_local = round(total_exchanged_local - total_expense_local, 2)

    avg_rate = (
        round(total_exchanged_local / total_exchanged_base, 4)
        if total_exchanged_base > 0 else None
    )

    by_category: dict = {}
    for e in expenses:
        cat = e.category
        if cat not in by_category:
            by_category[cat] = {"local": 0.0, "base": 0.0, "count": 0}
        by_category[cat]["local"] = round(by_category[cat]["local"] + e.amount_local, 2)
        by_category[cat]["base"] = round(by_category[cat]["base"] + e.amount_base, 2)
        by_category[cat]["count"] += 1

    return {
        "trip_id": trip_id,
        "base_currency": trip.base_currency,
        "local_currency": trip.local_currency,
        "total_expense_local": round(total_expense_local, 2),
        "total_expense_base": round(total_expense_base, 2),
        "total_exchanged_local": round(total_exchanged_local, 2),
        "total_exchanged_base": round(total_exchanged_base, 2),
        "cash_balance_local": cash_balance_local,
        "avg_exchange_rate": avg_rate,
        "expense_count": len(expenses),
        "exchange_count": len(exchanges),
        "by_category": by_category,
    }


# ── Budget ────────────────────────────────────────────────────────────────────

class BudgetSetRequest(BaseModel):
    budgets: Dict[str, float]


@router.get("/{trip_id}/budget")
async def get_budget(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    rows = db.query(TripBudget).filter(TripBudget.trip_id == trip_id).all()
    return {r.category: {"amount_local": r.amount_local, "id": r.id} for r in rows}


@router.put("/{trip_id}/budget")
async def set_budget(
    trip_id: int,
    payload: BudgetSetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Upsert budget entries. Pass {category: amount_local}. Use amount_local=0 to clear."""
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    for category, amount in payload.budgets.items():
        if amount < 0:
            continue
        existing = db.query(TripBudget).filter(
            TripBudget.trip_id == trip_id, TripBudget.category == category
        ).first()
        if amount == 0:
            if existing:
                db.delete(existing)
        elif existing:
            existing.amount_local = amount
        else:
            db.add(TripBudget(trip_id=trip_id, category=category, amount_local=amount))
    db.commit()
    rows = db.query(TripBudget).filter(TripBudget.trip_id == trip_id).all()
    return {r.category: {"amount_local": r.amount_local, "id": r.id} for r in rows}


@router.get("/{trip_id}/budget-summary")
async def get_budget_summary(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)

    expenses = db.query(TripExpense).filter(TripExpense.trip_id == trip_id).all()
    budgets = db.query(TripBudget).filter(TripBudget.trip_id == trip_id).all()

    budget_map: Dict[str, float] = {b.category: b.amount_local for b in budgets}
    actual_map: Dict[str, float] = {}
    for e in expenses:
        actual_map[e.category] = round(actual_map.get(e.category, 0) + e.amount_local, 2)
    total_actual = round(sum(actual_map.values()), 2)

    # Forecast based on days elapsed / total days
    days_elapsed: Optional[int] = None
    days_remaining: Optional[int] = None
    days_total: Optional[int] = None
    daily_avg: Optional[float] = None
    projected_total: Optional[float] = None

    today = date.today()
    if trip.start_date:
        elapsed = (today - trip.start_date).days
        days_elapsed = max(0, elapsed)
        if trip.end_date:
            days_total = max(1, (trip.end_date - trip.start_date).days + 1)
            days_remaining = max(0, (trip.end_date - today).days)
            if days_elapsed > 0:
                daily_avg = round(total_actual / days_elapsed, 2)
                projected_total = round(daily_avg * days_total, 2)

    categories = sorted(set(list(budget_map.keys()) + list(actual_map.keys())))
    by_cat = {}
    for cat in categories:
        plan = budget_map.get(cat)
        actual = actual_map.get(cat, 0)
        pct = round((actual / plan * 100), 1) if plan and plan > 0 else None
        by_cat[cat] = {
            "plan": plan,
            "actual": actual,
            "remaining": round(plan - actual, 2) if plan is not None else None,
            "pct": pct,
            "over": (actual > plan) if plan is not None else False,
        }

    total_plan = budget_map.get("total")
    return {
        "local_currency": trip.local_currency,
        "total_plan": total_plan,
        "total_actual": total_actual,
        "total_remaining": round(total_plan - total_actual, 2) if total_plan is not None else None,
        "total_pct": round(total_actual / total_plan * 100, 1) if total_plan and total_plan > 0 else None,
        "total_over": (total_actual > total_plan) if total_plan is not None else False,
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "days_total": days_total,
        "daily_avg": daily_avg,
        "projected_total": projected_total,
        "by_category": by_cat,
    }


# ── Itinerary ─────────────────────────────────────────────────────────────────

ITINERARY_STATUSES = ("planned", "done", "skipped")


class ItineraryItemCreate(BaseModel):
    day_date: date
    time_of_day: Optional[str] = None
    title: str
    description: Optional[str] = None
    category: str = "other"
    estimated_cost: Optional[float] = None
    notes: Optional[str] = None
    sort_order: int = 0


class ItineraryItemUpdate(BaseModel):
    day_date: Optional[date] = None
    time_of_day: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    estimated_cost: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class ItineraryConvertRequest(BaseModel):
    amount_local: float
    exchange_rate: float
    occurred_at: date
    description: Optional[str] = None


def _serialize_item(item: TripItineraryItem) -> dict:
    return {
        "id": item.id,
        "trip_id": item.trip_id,
        "day_date": item.day_date.isoformat() if item.day_date else None,
        "time_of_day": item.time_of_day,
        "title": item.title,
        "description": item.description,
        "category": item.category,
        "estimated_cost": item.estimated_cost,
        "actual_expense_id": item.actual_expense_id,
        "status": item.status,
        "notes": item.notes,
        "sort_order": item.sort_order,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("/{trip_id}/itinerary")
async def list_itinerary(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    items = (
        db.query(TripItineraryItem)
        .filter(TripItineraryItem.trip_id == trip_id)
        .order_by(TripItineraryItem.day_date, TripItineraryItem.sort_order, TripItineraryItem.time_of_day)
        .all()
    )
    # Group by day
    days: Dict[str, list] = {}
    for item in items:
        key = item.day_date.isoformat()
        days.setdefault(key, []).append(_serialize_item(item))
    return {"days": days, "items": [_serialize_item(i) for i in items]}


@router.post("/{trip_id}/itinerary", status_code=status.HTTP_201_CREATED)
async def create_itinerary_item(
    trip_id: int,
    payload: ItineraryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    item = TripItineraryItem(
        trip_id=trip_id,
        day_date=payload.day_date,
        time_of_day=payload.time_of_day,
        title=payload.title,
        description=payload.description,
        category=payload.category if payload.category in EXPENSE_CATEGORIES else "other",
        estimated_cost=payload.estimated_cost,
        notes=payload.notes,
        sort_order=payload.sort_order,
        status="planned",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_item(item)


@router.patch("/{trip_id}/itinerary/{item_id}")
async def update_itinerary_item(
    trip_id: int,
    item_id: int,
    payload: ItineraryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    item = db.query(TripItineraryItem).filter(
        TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт маршрута не найден")
    if payload.day_date is not None:
        item.day_date = payload.day_date
    if payload.time_of_day is not None:
        item.time_of_day = payload.time_of_day
    if payload.title is not None:
        item.title = payload.title
    if payload.description is not None:
        item.description = payload.description
    if payload.category is not None:
        item.category = payload.category if payload.category in EXPENSE_CATEGORIES else "other"
    if payload.estimated_cost is not None:
        item.estimated_cost = payload.estimated_cost
    if payload.status is not None and payload.status in ITINERARY_STATUSES:
        item.status = payload.status
    if payload.notes is not None:
        item.notes = payload.notes
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order
    db.commit()
    db.refresh(item)
    return _serialize_item(item)


@router.delete("/{trip_id}/itinerary/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_itinerary_item(
    trip_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    item = db.query(TripItineraryItem).filter(
        TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт маршрута не найден")
    db.delete(item)
    db.commit()


@router.post("/{trip_id}/itinerary/{item_id}/convert")
async def convert_itinerary_to_expense(
    trip_id: int,
    item_id: int,
    payload: ItineraryConvertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Mark itinerary item as done and create a TripExpense from it."""
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)
    item = db.query(TripItineraryItem).filter(
        TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт маршрута не найден")
    if payload.exchange_rate <= 0:
        raise HTTPException(status_code=400, detail="Курс обмена должен быть больше нуля")
    amount_base = round(payload.amount_local / payload.exchange_rate, 2)
    expense = TripExpense(
        trip_id=trip_id,
        category=item.category,
        description=payload.description or item.title,
        amount_local=payload.amount_local,
        local_currency=trip.local_currency,
        exchange_rate=payload.exchange_rate,
        amount_base=amount_base,
        base_currency=trip.base_currency,
        occurred_at=payload.occurred_at,
    )
    db.add(expense)
    db.flush()
    item.actual_expense_id = expense.id
    item.status = "done"
    db.commit()
    db.refresh(item)
    return {"item": _serialize_item(item), "expense": _serialize_expense(expense)}


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/{trip_id}/dashboard")
async def get_dashboard(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Aggregated dashboard: burn rate, cash on hand, category bars, upcoming items."""
    _require_owner(current_user)
    trip = _get_trip_or_404(db, trip_id, current_user)

    today = date.today()
    expenses = db.query(TripExpense).filter(TripExpense.trip_id == trip_id).all()
    exchanges = db.query(TripCashExchange).filter(TripCashExchange.trip_id == trip_id).all()
    budgets = db.query(TripBudget).filter(TripBudget.trip_id == trip_id).all()
    upcoming = (
        db.query(TripItineraryItem)
        .filter(
            TripItineraryItem.trip_id == trip_id,
            TripItineraryItem.status == "planned",
            TripItineraryItem.day_date >= today,
        )
        .order_by(TripItineraryItem.day_date, TripItineraryItem.time_of_day, TripItineraryItem.sort_order)
        .limit(5)
        .all()
    )

    total_spent_local = round(sum(e.amount_local for e in expenses), 2)
    total_spent_base = round(sum(e.amount_base for e in expenses), 2)
    total_exchanged_local = round(sum(ex.amount_local for ex in exchanges), 2)
    cash_on_hand = round(total_exchanged_local - total_spent_local, 2)

    budget_map: Dict[str, float] = {b.category: b.amount_local for b in budgets}
    actual_map: Dict[str, float] = {}
    for e in expenses:
        actual_map[e.category] = round(actual_map.get(e.category, 0) + e.amount_local, 2)

    # Burn rate
    days_elapsed: Optional[int] = None
    days_remaining: Optional[int] = None
    days_total: Optional[int] = None
    burn_rate: Optional[float] = None       # local per day
    projected_total: Optional[float] = None

    if trip.start_date:
        elapsed = (today - trip.start_date).days
        days_elapsed = max(0, elapsed)
        if trip.end_date:
            days_total = max(1, (trip.end_date - trip.start_date).days + 1)
            days_remaining = max(0, (trip.end_date - today).days)
        if days_elapsed > 0:
            burn_rate = round(total_spent_local / days_elapsed, 2)
            if days_total:
                projected_total = round(burn_rate * days_total, 2)

    # Category breakdown (only categories with budget or actual spend)
    all_cats = sorted(set(list(actual_map.keys()) + [k for k in budget_map if k != "total"]))
    category_breakdown = []
    for cat in all_cats:
        plan = budget_map.get(cat)
        actual = actual_map.get(cat, 0)
        pct = round(actual / plan * 100, 1) if plan and plan > 0 else None
        category_breakdown.append({
            "category": cat,
            "plan": plan,
            "actual": actual,
            "remaining": round(plan - actual, 2) if plan is not None else None,
            "pct": pct,
            "over": (actual > plan) if plan is not None else False,
        })

    total_plan = budget_map.get("total")
    total_pct = round(total_spent_local / total_plan * 100, 1) if total_plan and total_plan > 0 else None

    return {
        "local_currency": trip.local_currency,
        "base_currency": trip.base_currency,
        # Spending
        "total_spent_local": total_spent_local,
        "total_spent_base": total_spent_base,
        "total_exchanged_local": total_exchanged_local,
        "cash_on_hand": cash_on_hand,
        # Budget
        "total_plan": total_plan,
        "total_pct": total_pct,
        "total_over": (total_spent_local > total_plan) if total_plan is not None else False,
        # Time
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "days_total": days_total,
        "burn_rate": burn_rate,
        "projected_total": projected_total,
        # Category bars
        "category_breakdown": category_breakdown,
        # Upcoming itinerary
        "upcoming_items": [_serialize_item(i) for i in upcoming],
        # Cash alert
        "cash_alert_threshold": trip.cash_alert_threshold,
        "cash_alert_triggered": (
            trip.cash_alert_threshold is not None and cash_on_hand < trip.cash_alert_threshold
        ),
    }


# ── Checklist ─────────────────────────────────────────────────────────────────

CHECKLIST_CATEGORIES = ["documents", "clothes", "electronics", "health", "money", "other"]

CHECKLIST_DEFAULTS = [
    ("documents", "Загранпаспорт"),
    ("documents", "Виза / разрешение на въезд"),
    ("documents", "Страховка (медицинская)"),
    ("documents", "Авиабилеты (распечатать или скачать)"),
    ("documents", "Бронь отеля"),
    ("money", "Наличная валюта"),
    ("money", "Банковская карта (уведомить банк)"),
    ("health", "Аптечка / базовые лекарства"),
    ("health", "Солнцезащитный крем"),
    ("electronics", "Зарядки / переходник"),
    ("electronics", "Power bank"),
    ("clothes", "Купальник / шорты"),
    ("clothes", "Удобная обувь"),
]


def _serialize_checklist(item: TripChecklistItem) -> dict:
    return {
        "id": item.id,
        "trip_id": item.trip_id,
        "category": item.category,
        "title": item.title,
        "is_done": item.is_done,
        "sort_order": item.sort_order,
        "notes": item.notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


class ChecklistItemCreate(BaseModel):
    category: str = "other"
    title: str
    notes: Optional[str] = None
    sort_order: int = 0


class ChecklistItemUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    is_done: Optional[bool] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


@router.get("/{trip_id}/checklist")
async def list_checklist(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    items = (
        db.query(TripChecklistItem)
        .filter(TripChecklistItem.trip_id == trip_id)
        .order_by(TripChecklistItem.category, TripChecklistItem.sort_order, TripChecklistItem.id)
        .all()
    )
    by_cat: Dict[str, list] = {}
    for item in items:
        by_cat.setdefault(item.category, []).append(_serialize_checklist(item))
    total = len(items)
    done = sum(1 for i in items if i.is_done)
    return {"by_category": by_cat, "items": [_serialize_checklist(i) for i in items], "total": total, "done": done}


@router.post("/{trip_id}/checklist", status_code=status.HTTP_201_CREATED)
async def create_checklist_item(
    trip_id: int,
    payload: ChecklistItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    cat = payload.category if payload.category in CHECKLIST_CATEGORIES else "other"
    item = TripChecklistItem(
        trip_id=trip_id, category=cat, title=payload.title.strip(),
        notes=payload.notes, sort_order=payload.sort_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_checklist(item)


@router.post("/{trip_id}/checklist/seed", status_code=status.HTTP_201_CREATED)
async def seed_checklist(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Заполнить чеклист стандартными пунктами (если список пуст)."""
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    existing = db.query(TripChecklistItem).filter(TripChecklistItem.trip_id == trip_id).count()
    if existing > 0:
        raise HTTPException(status_code=400, detail="Чеклист уже содержит пункты")
    for idx, (cat, title) in enumerate(CHECKLIST_DEFAULTS):
        db.add(TripChecklistItem(trip_id=trip_id, category=cat, title=title, sort_order=idx))
    db.commit()
    items = db.query(TripChecklistItem).filter(TripChecklistItem.trip_id == trip_id).order_by(TripChecklistItem.sort_order).all()
    return {"seeded": len(items), "items": [_serialize_checklist(i) for i in items]}


@router.patch("/{trip_id}/checklist/{item_id}")
async def update_checklist_item(
    trip_id: int,
    item_id: int,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    item = db.query(TripChecklistItem).filter(
        TripChecklistItem.id == item_id, TripChecklistItem.trip_id == trip_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт чеклиста не найден")
    if payload.category is not None:
        item.category = payload.category if payload.category in CHECKLIST_CATEGORIES else "other"
    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.is_done is not None:
        item.is_done = payload.is_done
    if payload.notes is not None:
        item.notes = payload.notes
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order
    db.commit()
    db.refresh(item)
    return _serialize_checklist(item)


@router.delete("/{trip_id}/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_item(
    trip_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    item = db.query(TripChecklistItem).filter(
        TripChecklistItem.id == item_id, TripChecklistItem.trip_id == trip_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Пункт чеклиста не найден")
    db.delete(item)
    db.commit()


# ── Sharing ───────────────────────────────────────────────────────────────────

class ShareCreate(BaseModel):
    email: str
    can_edit: bool = False


def _serialize_share(s: TripShare) -> dict:
    return {
        "id": s.id,
        "trip_id": s.trip_id,
        "shared_with_id": s.shared_with_id,
        "shared_with_email": s.shared_with.email if s.shared_with else None,
        "shared_with_name": (
            f"{s.shared_with.first_name or ''} {s.shared_with.last_name or ''}".strip()
            if s.shared_with else None
        ),
        "can_edit": s.can_edit,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


@router.get("/{trip_id}/shares")
async def list_shares(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    shares = db.query(TripShare).filter(TripShare.trip_id == trip_id).all()
    return [_serialize_share(s) for s in shares]


@router.post("/{trip_id}/shares", status_code=status.HTTP_201_CREATED)
async def create_share(
    trip_id: int,
    payload: ShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    target = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь с таким email не найден")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя поделиться поездкой с собой")
    existing = db.query(TripShare).filter(
        TripShare.trip_id == trip_id, TripShare.shared_with_id == target.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Доступ уже выдан этому пользователю")
    share = TripShare(
        trip_id=trip_id,
        owner_id=current_user.id,
        shared_with_id=target.id,
        can_edit=payload.can_edit,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _serialize_share(share)


@router.delete("/{trip_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    trip_id: int,
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_owner(current_user)
    _get_trip_or_404(db, trip_id, current_user)
    share = db.query(TripShare).filter(
        TripShare.id == share_id, TripShare.trip_id == trip_id
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Запись шаринга не найдена")
    db.delete(share)
    db.commit()
