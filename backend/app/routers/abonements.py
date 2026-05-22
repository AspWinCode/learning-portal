from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import auth
from app.models import Abonement, AbonementStatus, DiscountType, User
from app.schemas import AbonementCreate, AbonementListResponse, AbonementResponse, AbonementUpdate
from app.routers.action_log import log_action

router = APIRouter()


def _validate_discount(discount_type: DiscountType, discount_value: float) -> None:
    if discount_value < 0:
        raise HTTPException(status_code=400, detail="Discount must be >= 0")
    if discount_type == DiscountType.PERCENT and discount_value > 100:
        raise HTTPException(status_code=400, detail="Percent discount must be <= 100")


def _validate_price(price: float) -> None:
    if price < 0:
        raise HTTPException(status_code=400, detail="Price must be >= 0")


@router.get("/", response_model=List[AbonementResponse])
async def read_abonements(
    status_filter: Optional[AbonementStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.access")),
):
    query = db.query(Abonement)
    if status_filter:
        query = query.filter(Abonement.status == status_filter)
    return query.order_by(Abonement.created_at.desc()).all()


@router.get("/paginated", response_model=AbonementListResponse)
async def read_abonements_paginated(
    status_filter: Optional[AbonementStatus] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.access")),
):
    query = db.query(Abonement)
    if status_filter:
        query = query.filter(Abonement.status == status_filter)
    total = query.order_by(None).count()
    items = query.order_by(Abonement.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "total": total,
        "items": items,
        "skip": skip,
        "limit": limit,
    }


@router.post("/", response_model=AbonementResponse, status_code=status.HTTP_201_CREATED)
async def create_abonement(
    abonement: AbonementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.manage")),
):
    _validate_discount(abonement.discount_type, abonement.discount_value)
    _validate_price(float(abonement.price))
    db_abonement = Abonement(
        name=abonement.name,
        price=abonement.price,
        discount_type=abonement.discount_type,
        discount_value=abonement.discount_value,
        status=AbonementStatus.ACTIVE,
        abonement_format=abonement.abonement_format,
    )
    db.add(db_abonement)
    db.commit()
    db.refresh(db_abonement)
    log_action(db, current_user.id, "create", "abonement", db_abonement.id)
    return db_abonement


@router.put("/{abonement_id}", response_model=AbonementResponse)
async def update_abonement(
    abonement_id: int,
    abonement_update: AbonementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.manage")),
):
    db_abonement = db.query(Abonement).filter(Abonement.id == abonement_id).first()
    if not db_abonement:
        raise HTTPException(status_code=404, detail="Abonement not found")

    update_data = abonement_update.dict(exclude_unset=True)
    if "price" in update_data:
        _validate_price(float(update_data.get("price") or 0))
    if "discount_type" in update_data or "discount_value" in update_data:
        discount_type = update_data.get("discount_type", db_abonement.discount_type)
        discount_value = update_data.get("discount_value", db_abonement.discount_value)
        _validate_discount(discount_type, float(discount_value or 0))

    for key, value in update_data.items():
        setattr(db_abonement, key, value)
    db.commit()
    db.refresh(db_abonement)
    log_action(db, current_user.id, "update", "abonement", abonement_id, update_data)
    return db_abonement


@router.post("/{abonement_id}/archive")
async def archive_abonement(
    abonement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.manage"))
):
    db_abonement = db.query(Abonement).filter(Abonement.id == abonement_id).first()
    if not db_abonement:
        raise HTTPException(status_code=404, detail="Abonement not found")
    db_abonement.status = AbonementStatus.ARCHIVED
    db.commit()
    log_action(db, current_user.id, "archive", "abonement", abonement_id)
    return {"message": "Abonement archived"}


@router.post("/{abonement_id}/unarchive")
async def unarchive_abonement(
    abonement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.manage"))
):
    db_abonement = db.query(Abonement).filter(Abonement.id == abonement_id).first()
    if not db_abonement:
        raise HTTPException(status_code=404, detail="Abonement not found")
    db_abonement.status = AbonementStatus.ACTIVE
    db.commit()
    log_action(db, current_user.id, "unarchive", "abonement", abonement_id)
    return {"message": "Abonement unarchived"}


@router.delete("/{abonement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_abonement(
    abonement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("abonements.manage"))
):
    db_abonement = db.query(Abonement).filter(Abonement.id == abonement_id).first()
    if not db_abonement:
        raise HTTPException(status_code=404, detail="Abonement not found")

    has_students = db.query(Abonement).filter(
        Abonement.id == abonement_id,
        Abonement.students.any()
    ).first()
    if has_students:
        raise HTTPException(status_code=400, detail="Abonement is assigned to students")

    db.delete(db_abonement)
    db.commit()
    log_action(db, current_user.id, "delete", "abonement", abonement_id)
    return None

