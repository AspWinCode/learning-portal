"""Воронки для роли owner: письма поддержки, письма благодарности, мероприятия."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    B2BSchool,
    OwnerFunnelEvent,
    OwnerFunnelItem,
    OWNER_FUNNEL_EVENTS,
    OWNER_FUNNEL_STAGES,
    OWNER_FUNNEL_SUPPORT_LETTERS,
    OWNER_FUNNEL_THANK_YOU_LETTERS,
)
from app.schemas import (
    OwnerFunnelTypeInfo,
    OwnerFunnelEventCreate,
    OwnerFunnelEventResponse,
    OwnerFunnelItemCreate,
    OwnerFunnelItemUpdate,
    OwnerFunnelItemResponse,
)
from app.models import User

router = APIRouter()

# Список воронок для выбора (id, label, stages)
OWNER_FUNNEL_TYPES_LIST = [
    OwnerFunnelTypeInfo(
        id=OWNER_FUNNEL_SUPPORT_LETTERS,
        label="Получить письма поддержки",
        stages=[{"value": v, "label": l} for v, l in OWNER_FUNNEL_STAGES[OWNER_FUNNEL_SUPPORT_LETTERS]],
    ),
    OwnerFunnelTypeInfo(
        id=OWNER_FUNNEL_THANK_YOU_LETTERS,
        label="Письма благодарности",
        stages=[{"value": v, "label": l} for v, l in OWNER_FUNNEL_STAGES[OWNER_FUNNEL_THANK_YOU_LETTERS]],
    ),
    OwnerFunnelTypeInfo(
        id=OWNER_FUNNEL_EVENTS,
        label="Мероприятия",
        stages=[{"value": v, "label": l} for v, l in OWNER_FUNNEL_STAGES[OWNER_FUNNEL_EVENTS]],
    ),
]


def _validate_funnel_and_stage(funnel_type: str, stage: str) -> None:
    if funnel_type not in OWNER_FUNNEL_STAGES:
        raise HTTPException(status_code=400, detail=f"Unknown funnel_type: {funnel_type}")
    stages_values = [s[0] for s in OWNER_FUNNEL_STAGES[funnel_type]]
    if stage not in stages_values:
        raise HTTPException(status_code=400, detail=f"Invalid stage for funnel {funnel_type}: {stage}")


@router.get("/owner-funnels/types", response_model=List[OwnerFunnelTypeInfo])
async def list_owner_funnel_types(
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Список типов воронок с этапами для выбора воронки."""
    return OWNER_FUNNEL_TYPES_LIST


@router.get("/owner-funnels/events", response_model=List[OwnerFunnelEventResponse])
async def list_owner_funnel_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Список мероприятий (воронок). Каждое мероприятие — доска с этапами."""
    events = db.query(OwnerFunnelEvent).order_by(OwnerFunnelEvent.created_at.desc()).all()
    return events


class AddSchoolsByCityPayload(BaseModel):
    city: str


@router.post("/owner-funnels/events/{event_id}/add-schools-by-city")
async def add_schools_by_city_to_event(
    event_id: int,
    payload: AddSchoolsByCityPayload = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Добавить в воронку мероприятия все B2B школы из выбранного города. Школы, уже добавленные в воронку (по b2b_school_id в card_data), пропускаются."""
    event = db.query(OwnerFunnelEvent).filter(OwnerFunnelEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    city = (payload.city or "").strip()
    if not city:
        raise HTTPException(status_code=400, detail="city is required")
    existing_items = db.query(OwnerFunnelItem).filter(
        OwnerFunnelItem.funnel_type == OWNER_FUNNEL_EVENTS,
        OwnerFunnelItem.event_id == event_id,
    ).all()
    existing_b2b_ids = set()
    for it in existing_items:
        if it.card_data and isinstance(it.card_data, dict) and "b2b_school_id" in it.card_data:
            existing_b2b_ids.add(int(it.card_data["b2b_school_id"]))
    schools = db.query(B2BSchool).filter(B2BSchool.city == city).all()
    added = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for school in schools:
        if school.id in existing_b2b_ids:
            continue
        card_data = {
            "stage_dates": {"new": now_iso},
            "b2b_school_id": school.id,
        }
        item = OwnerFunnelItem(
            funnel_type=OWNER_FUNNEL_EVENTS,
            event_id=event_id,
            stage="new",
            title=school.name,
            card_data=card_data,
        )
        db.add(item)
        added += 1
    db.commit()
    return {"message": "ok", "added": added, "total_in_city": len(schools)}


@router.post("/owner-funnels/events", response_model=OwnerFunnelEventResponse, status_code=201)
async def create_owner_funnel_event(
    payload: OwnerFunnelEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Создать мероприятие (воронку с названием и датами). Карточки в колонках добавляются отдельно."""
    event = OwnerFunnelEvent(
        event_name=payload.event_name.strip(),
        event_dates=payload.event_dates.strip() if payload.event_dates else None,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/owner-funnels/items", response_model=List[OwnerFunnelItemResponse])
async def list_owner_funnel_items(
    funnel_type: str = Query(..., description="support_letters | thank_you_letters | events"),
    event_id: Optional[int] = Query(default=None, description="Для funnel_type=events обязательно"),
    stage: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Список элементов воронки. Для events обязателен event_id — карточки внутри выбранного мероприятия."""
    if funnel_type not in OWNER_FUNNEL_STAGES:
        raise HTTPException(status_code=400, detail=f"Unknown funnel_type: {funnel_type}")
    if funnel_type == OWNER_FUNNEL_EVENTS and event_id is None:
        raise HTTPException(status_code=400, detail="For funnel_type=events event_id is required")
    query = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.funnel_type == funnel_type)
    if funnel_type == OWNER_FUNNEL_EVENTS and event_id is not None:
        query = query.filter(OwnerFunnelItem.event_id == event_id)
    if stage is not None:
        _validate_funnel_and_stage(funnel_type, stage)
        query = query.filter(OwnerFunnelItem.stage == stage)
    items = query.order_by(OwnerFunnelItem.created_at.desc()).all()
    return items


@router.post("/owner-funnels/items", response_model=OwnerFunnelItemResponse, status_code=201)
async def create_owner_funnel_item(
    payload: OwnerFunnelItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Создать элемент воронки (карточку). Для events обязателен event_id — карточка внутри воронки мероприятия."""
    _validate_funnel_and_stage(payload.funnel_type, payload.stage)
    if payload.funnel_type == OWNER_FUNNEL_EVENTS:
        if payload.event_id is None:
            raise HTTPException(status_code=400, detail="For events funnel event_id is required")
        # карточка внутри мероприятия: stage_dates при первом переходе заполнятся
        card_data = dict(payload.card_data or {})
        card_data.setdefault("stage_dates", {})[payload.stage] = datetime.now(timezone.utc).isoformat()
    else:
        card_data = payload.card_data
    item = OwnerFunnelItem(
        funnel_type=payload.funnel_type,
        event_id=payload.event_id if payload.funnel_type == OWNER_FUNNEL_EVENTS else None,
        stage=payload.stage,
        title=payload.title,
        comment=payload.comment,
        card_data=card_data if payload.funnel_type == OWNER_FUNNEL_EVENTS else payload.card_data,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/owner-funnels/items/{item_id}", response_model=OwnerFunnelItemResponse)
async def get_owner_funnel_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Получить элемент по id."""
    item = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _merge_events_card_data(item: OwnerFunnelItem, payload: OwnerFunnelItemUpdate) -> None:
    """При смене этапа воронки Мероприятия мержим popup-поля в card_data и фиксируем дату этапа."""
    if item.funnel_type != OWNER_FUNNEL_EVENTS:
        if payload.card_data is not None:
            item.card_data = payload.card_data
        return
    data: Dict[str, Any] = dict(item.card_data or {})
    if payload.card_data:
        data.update(payload.card_data)
    now_iso = datetime.now(timezone.utc).isoformat()
    if payload.contact_fio is not None:
        data["contact_fio"] = payload.contact_fio
    if payload.contact_phone is not None:
        data["contact_phone"] = payload.contact_phone
    if payload.contact_comment is not None:
        data["contact_comment"] = payload.contact_comment
    if payload.reply_comment is not None:
        data["reply_comment"] = payload.reply_comment
        data["reply_at"] = now_iso
    if payload.meeting_date is not None:
        data["meeting_date"] = payload.meeting_date
    if payload.trip_date is not None:
        data["trip_date"] = payload.trip_date
    if payload.leads_count is not None:
        data["leads_count"] = payload.leads_count
    if payload.stage is not None:
        if "stage_dates" not in data:
            data["stage_dates"] = {}
        data["stage_dates"][payload.stage] = now_iso
        if payload.stage == "letter_sent":
            data["letter_sent_at"] = now_iso
    item.card_data = data


@router.patch("/owner-funnels/items/{item_id}", response_model=OwnerFunnelItemResponse)
async def update_owner_funnel_item(
    item_id: int,
    payload: OwnerFunnelItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Обновить элемент (в т.ч. перенос по этапам). Для events popup-поля сохраняются в card_data."""
    item = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if payload.stage is not None:
        _validate_funnel_and_stage(item.funnel_type, payload.stage)
        item.stage = payload.stage
    if payload.title is not None:
        item.title = payload.title
    if payload.comment is not None:
        item.comment = payload.comment
    _merge_events_card_data(item, payload)
    if payload.card_data is not None and item.funnel_type != OWNER_FUNNEL_EVENTS:
        item.card_data = payload.card_data
    db.commit()
    db.refresh(item)
    return item


@router.delete("/owner-funnels/items/{item_id}")
async def delete_owner_funnel_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Удалить элемент."""
    item = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "ok"}
