from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import FinanceTransaction, Trip, TripStatus, User

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
