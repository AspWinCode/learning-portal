"""╨Т╨╛╤А╨╛╨╜╨║╨╕ ╨┤╨╗╤П ╤А╨╛╨╗╨╕ owner: ╨┐╨╕╤Б╤М╨╝╨░ ╨┐╨╛╨┤╨┤╨╡╤А╨╢╨║╨╕, ╨┐╨╕╤Б╤М╨╝╨░ ╨▒╨╗╨░╨│╨╛╨┤╨░╤А╨╜╨╛╤Б╤В╨╕, ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П."""
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

# ╨б╨┐╨╕╤Б╨╛╨║ ╨▓╨╛╤А╨╛╨╜╨╛╨║ ╨┤╨╗╤П ╨▓╤Л╨▒╨╛╤А╨░ (id, label, stages)

# Русские подписи для воронок и этапов (без кракозябр)
FUNNEL_TYPE_LABELS = {
    OWNER_FUNNEL_SUPPORT_LETTERS: "Получить письма поддержки",
    OWNER_FUNNEL_THANK_YOU_LETTERS: "Письма благодарности",
    OWNER_FUNNEL_EVENTS: "Мероприятия",
}
STAGE_LABELS = {
    (OWNER_FUNNEL_SUPPORT_LETTERS, "new"): "Новые",
    (OWNER_FUNNEL_SUPPORT_LETTERS, "letter_created"): "Создал письмо",
    (OWNER_FUNNEL_SUPPORT_LETTERS, "letter_sent"): "Отправил письмо",
    (OWNER_FUNNEL_SUPPORT_LETTERS, "letter_received"): "Получил письмо",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "new"): "Новые",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "thank_you_formed"): "Сформировали благодарность",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "thank_you_sent"): "Отправили благодарность",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "school_received"): "Получила школа",
    (OWNER_FUNNEL_EVENTS, "new"): "Новые",
    (OWNER_FUNNEL_EVENTS, "contact_found"): "Контакт найден",
    (OWNER_FUNNEL_EVENTS, "letter_sent"): "Отправили письмо",
    (OWNER_FUNNEL_EVENTS, "reply_received"): "Получили ответное письмо",
    (OWNER_FUNNEL_EVENTS, "reached_by_phone"): "Дозвонились",
    (OWNER_FUNNEL_EVENTS, "not_reached"): "Недозвонились",
    (OWNER_FUNNEL_EVENTS, "meeting_agreed"): "Договорились на встречу",
    (OWNER_FUNNEL_EVENTS, "agreement_sent"): "Отправили согласование",
    (OWNER_FUNNEL_EVENTS, "agreement_approved"): "Согласовали соглашение",
    (OWNER_FUNNEL_EVENTS, "agreement_signed"): "Подписали соглашение",
    (OWNER_FUNNEL_EVENTS, "trip_agreed"): "Договорились на поход",
    (OWNER_FUNNEL_EVENTS, "info_sent_to_parents"): "Отправили информацию в чат родителям",
    (OWNER_FUNNEL_EVENTS, "leads_collected"): "Собрали лидов",
    (OWNER_FUNNEL_EVENTS, "rejected"): "Отказали",
}


def _stage_label(funnel_type: str, value: str) -> str:
    return STAGE_LABELS.get((funnel_type, value), value)


def _fix_mojibake(s: Optional[str]) -> Optional[str]:
    """Восстанавливает строку из битой кодировки (UTF-8, прочитанный как Latin-1 или CP1252)."""
    if not s or not isinstance(s, str):
        return s
    for enc in ("cp866", "latin1", "cp1252"):
        try:
            fixed = s.encode(enc).decode("utf-8")
            if fixed != s:
                return fixed
        except (UnicodeDecodeError, UnicodeEncodeError):
            continue
    return s



OWNER_FUNNEL_TYPES_LIST = [
    OwnerFunnelTypeInfo(
        id=OWNER_FUNNEL_SUPPORT_LETTERS,
        label=FUNNEL_TYPE_LABELS[OWNER_FUNNEL_SUPPORT_LETTERS],
        stages=[{"value": v, "label": _stage_label(OWNER_FUNNEL_SUPPORT_LETTERS, v)} for v, _ in OWNER_FUNNEL_STAGES[OWNER_FUNNEL_SUPPORT_LETTERS]],
    ),
    OwnerFunnelTypeInfo(
        id=OWNER_FUNNEL_THANK_YOU_LETTERS,
        label=FUNNEL_TYPE_LABELS[OWNER_FUNNEL_THANK_YOU_LETTERS],
        stages=[{"value": v, "label": _stage_label(OWNER_FUNNEL_THANK_YOU_LETTERS, v)} for v, _ in OWNER_FUNNEL_STAGES[OWNER_FUNNEL_THANK_YOU_LETTERS]],
    ),
    OwnerFunnelTypeInfo(
        id=OWNER_FUNNEL_EVENTS,
        label=FUNNEL_TYPE_LABELS[OWNER_FUNNEL_EVENTS],
        stages=[{"value": v, "label": _stage_label(OWNER_FUNNEL_EVENTS, v)} for v, _ in OWNER_FUNNEL_STAGES[OWNER_FUNNEL_EVENTS]],
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
    """╨б╨┐╨╕╤Б╨╛╨║ ╤В╨╕╨┐╨╛╨▓ ╨▓╨╛╤А╨╛╨╜╨╛╨║ ╤Б ╤Н╤В╨░╨┐╨░╨╝╨╕ ╨┤╨╗╤П ╨▓╤Л╨▒╨╛╤А╨░ ╨▓╨╛╤А╨╛╨╜╨║╨╕."""
    return [
        OwnerFunnelTypeInfo(
            id=ft,
            label=FUNNEL_TYPE_LABELS[ft],
            stages=[{"value": v, "label": _stage_label(ft, v)} for v, _ in OWNER_FUNNEL_STAGES[ft]],
        )
        for ft in (OWNER_FUNNEL_SUPPORT_LETTERS, OWNER_FUNNEL_THANK_YOU_LETTERS, OWNER_FUNNEL_EVENTS)
    ]


@router.get("/owner-funnels/events", response_model=List[OwnerFunnelEventResponse])
async def list_owner_funnel_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨б╨┐╨╕╤Б╨╛╨║ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╣ (╨▓╨╛╤А╨╛╨╜╨╛╨║). ╨Ъ╨░╨╢╨┤╨╛╨╡ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡ тАФ ╨┤╨╛╤Б╨║╨░ ╤Б ╤Н╤В╨░╨┐╨░╨╝╨╕."""
    events = db.query(OwnerFunnelEvent).order_by(OwnerFunnelEvent.created_at.desc()).all()
    return [
        OwnerFunnelEventResponse(
            id=e.id,
            event_name=_fix_mojibake(e.event_name) or e.event_name,
            event_dates=e.event_dates,
            created_at=e.created_at,
        )
        for e in events
    ]


class AddSchoolsByCityPayload(BaseModel):
    city: str


@router.post("/owner-funnels/events/{event_id}/add-schools-by-city")
async def add_schools_by_city_to_event(
    event_id: int,
    payload: AddSchoolsByCityPayload = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╨▓ ╨▓╨╛╤А╨╛╨╜╨║╤Г ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П ╨▓╤Б╨╡ B2B ╤И╨║╨╛╨╗╤Л ╨╕╨╖ ╨▓╤Л╨▒╤А╨░╨╜╨╜╨╛╨│╨╛ ╨│╨╛╤А╨╛╨┤╨░. ╨и╨║╨╛╨╗╤Л, ╤Г╨╢╨╡ ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╜╤Л╨╡ ╨▓ ╨▓╨╛╤А╨╛╨╜╨║╤Г (╨┐╨╛ b2b_school_id ╨▓ card_data), ╨┐╤А╨╛╨┐╤Г╤Б╨║╨░╤О╤В╤Б╤П."""
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
    """╨б╨╛╨╖╨┤╨░╤В╤М ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡ (╨▓╨╛╤А╨╛╨╜╨║╤Г ╤Б ╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡╨╝ ╨╕ ╨┤╨░╤В╨░╨╝╨╕). ╨Ъ╨░╤А╤В╨╛╤З╨║╨╕ ╨▓ ╨║╨╛╨╗╨╛╨╜╨║╨░╤Е ╨┤╨╛╨▒╨░╨▓╨╗╤П╤О╤В╤Б╤П ╨╛╤В╨┤╨╡╨╗╤М╨╜╨╛."""
    event = OwnerFunnelEvent(
        event_name=payload.event_name.strip(),
        event_dates=payload.event_dates.strip() if payload.event_dates else None,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return OwnerFunnelEventResponse(
        id=event.id,
        event_name=_fix_mojibake(event.event_name) or event.event_name,
        event_dates=event.event_dates,
        created_at=event.created_at,
    )


@router.get("/owner-funnels/items", response_model=List[OwnerFunnelItemResponse])
async def list_owner_funnel_items(
    funnel_type: str = Query(..., description="support_letters | thank_you_letters | events"),
    event_id: Optional[int] = Query(default=None, description="╨Ф╨╗╤П funnel_type=events ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛"),
    stage: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨б╨┐╨╕╤Б╨╛╨║ ╤Н╨╗╨╡╨╝╨╡╨╜╤В╨╛╨▓ ╨▓╨╛╤А╨╛╨╜╨║╨╕. ╨Ф╨╗╤П events ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜ event_id тАФ ╨║╨░╤А╤В╨╛╤З╨║╨╕ ╨▓╨╜╤Г╤В╤А╨╕ ╨▓╤Л╨▒╤А╨░╨╜╨╜╨╛╨│╨╛ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П."""
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
    return [
        OwnerFunnelItemResponse(
            id=it.id,
            funnel_type=it.funnel_type,
            event_id=it.event_id,
            stage=it.stage,
            title=_fix_mojibake(it.title) if it.title else None,
            comment=_fix_mojibake(it.comment) if it.comment else None,
            card_data=it.card_data,
            created_at=it.created_at,
            updated_at=it.updated_at,
        )
        for it in items
    ]


@router.post("/owner-funnels/items", response_model=OwnerFunnelItemResponse, status_code=201)
async def create_owner_funnel_item(
    payload: OwnerFunnelItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨б╨╛╨╖╨┤╨░╤В╤М ╤Н╨╗╨╡╨╝╨╡╨╜╤В ╨▓╨╛╤А╨╛╨╜╨║╨╕ (╨║╨░╤А╤В╨╛╤З╨║╤Г). ╨Ф╨╗╤П events ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜ event_id тАФ ╨║╨░╤А╤В╨╛╤З╨║╨░ ╨▓╨╜╤Г╤В╤А╨╕ ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П."""
    _validate_funnel_and_stage(payload.funnel_type, payload.stage)
    if payload.funnel_type == OWNER_FUNNEL_EVENTS:
        if payload.event_id is None:
            raise HTTPException(status_code=400, detail="For events funnel event_id is required")
        # ╨║╨░╤А╤В╨╛╤З╨║╨░ ╨▓╨╜╤Г╤В╤А╨╕ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П: stage_dates ╨┐╤А╨╕ ╨┐╨╡╤А╨▓╨╛╨╝ ╨┐╨╡╤А╨╡╤Е╨╛╨┤╨╡ ╨╖╨░╨┐╨╛╨╗╨╜╤П╤В╤Б╤П
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
    return OwnerFunnelItemResponse(
        id=item.id,
        funnel_type=item.funnel_type,
        event_id=item.event_id,
        stage=item.stage,
        title=_fix_mojibake(item.title) if item.title else None,
        comment=_fix_mojibake(item.comment) if item.comment else None,
        card_data=item.card_data,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("/owner-funnels/items/{item_id}", response_model=OwnerFunnelItemResponse)
async def get_owner_funnel_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ╤Н╨╗╨╡╨╝╨╡╨╜╤В ╨┐╨╛ id."""
    item = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return OwnerFunnelItemResponse(
        id=item.id,
        funnel_type=item.funnel_type,
        event_id=item.event_id,
        stage=item.stage,
        title=_fix_mojibake(item.title) if item.title else None,
        comment=_fix_mojibake(item.comment) if item.comment else None,
        card_data=item.card_data,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _merge_events_card_data(item: OwnerFunnelItem, payload: OwnerFunnelItemUpdate) -> None:
    """╨Я╤А╨╕ ╤Б╨╝╨╡╨╜╨╡ ╤Н╤В╨░╨┐╨░ ╨▓╨╛╤А╨╛╨╜╨║╨╕ ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П ╨╝╨╡╤А╨╢╨╕╨╝ popup-╨┐╨╛╨╗╤П ╨▓ card_data ╨╕ ╤Д╨╕╨║╤Б╨╕╤А╤Г╨╡╨╝ ╨┤╨░╤В╤Г ╤Н╤В╨░╨┐╨░."""
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
    """╨Ю╨▒╨╜╨╛╨▓╨╕╤В╤М ╤Н╨╗╨╡╨╝╨╡╨╜╤В (╨▓ ╤В.╤З. ╨┐╨╡╤А╨╡╨╜╨╛╤Б ╨┐╨╛ ╤Н╤В╨░╨┐╨░╨╝). ╨Ф╨╗╤П events popup-╨┐╨╛╨╗╤П ╤Б╨╛╤Е╤А╨░╨╜╤П╤О╤В╤Б╤П ╨▓ card_data."""
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
    return OwnerFunnelItemResponse(
        id=item.id,
        funnel_type=item.funnel_type,
        event_id=item.event_id,
        stage=item.stage,
        title=_fix_mojibake(item.title) if item.title else None,
        comment=_fix_mojibake(item.comment) if item.comment else None,
        card_data=item.card_data,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.delete("/owner-funnels/items/{item_id}")
async def delete_owner_funnel_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨г╨┤╨░╨╗╨╕╤В╤М ╤Н╨╗╨╡╨╝╨╡╨╜╤В."""
    item = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "ok"}
