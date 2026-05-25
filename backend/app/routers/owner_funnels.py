"""Воронки для роли owner: письма поддержки, письма благодарности, мероприятия"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
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
from app.schemas.owner_funnels import (
    OwnerFunnelTypeInfo,
    OwnerFunnelEventCreate,
    OwnerFunnelEventResponse,
    OwnerFunnelItemCreate,
    OwnerFunnelItemUpdate,
    OwnerFunnelItemResponse,
    AddSchoolsByCityPayload,
)
from app.models import User

router = APIRouter()

# ╨б╨┐╨╕╤Б╨╛╨║╨▓╨╛╤А╨╛╨╜╨╛╨║╨┤╨╗╤П╨▓╤Л╨▒╨╛╤А╨░

# Russian labels as Unicode escapes (no file encoding issues)
FUNNEL_TYPE_LABELS = {
    OWNER_FUNNEL_SUPPORT_LETTERS: "\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043f\u0438\u0441\u044c\u043c\u0430 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438",
    OWNER_FUNNEL_THANK_YOU_LETTERS: "\u041f\u0438\u0441\u044c\u043c\u0430 \u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u0438",
    OWNER_FUNNEL_EVENTS: "\u041c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u044f",
}
STAGE_LABELS = {
    (OWNER_FUNNEL_SUPPORT_LETTERS, "new"): "\u041d\u043e\u0432\u044b\u0435",
    (OWNER_FUNNEL_SUPPORT_LETTERS, "letter_created"): "\u0421\u043e\u0437\u0434\u0430\u043b \u043f\u0438\u0441\u044c\u043c\u043e",
    (OWNER_FUNNEL_SUPPORT_LETTERS, "letter_sent"): "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b \u043f\u0438\u0441\u044c\u043c\u043e",
    (OWNER_FUNNEL_SUPPORT_LETTERS, "letter_received"): "\u041f\u043e\u043b\u0443\u0447\u0438\u043b \u043f\u0438\u0441\u044c\u043c\u043e",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "new"): "\u041d\u043e\u0432\u044b\u0435",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "thank_you_formed"): "\u0421\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043b\u0438 \u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u044c",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "thank_you_sent"): "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u044c",
    (OWNER_FUNNEL_THANK_YOU_LETTERS, "school_received"): "\u041f\u043e\u043b\u0443\u0447\u0438\u043b\u0430 \u0448\u043a\u043e\u043b\u0430",
    (OWNER_FUNNEL_EVENTS, "new"): "\u041d\u043e\u0432\u044b\u0435",
    (OWNER_FUNNEL_EVENTS, "contact_found"): "\u041a\u043e\u043d\u0442\u0430\u043a\u0442 \u043d\u0430\u0439\u0434\u0435\u043d",
    (OWNER_FUNNEL_EVENTS, "letter_sent"): "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u043f\u0438\u0441\u044c\u043c\u043e",
    (OWNER_FUNNEL_EVENTS, "reply_received"): "\u041f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 \u043e\u0442\u0432\u0435\u0442\u043d\u043e\u0435 \u043f\u0438\u0441\u044c\u043c\u043e",
    (OWNER_FUNNEL_EVENTS, "reached_by_phone"): "\u0414\u043e\u0437\u0432\u043e\u043d\u0438\u043b\u0438\u0441\u044c",
    (OWNER_FUNNEL_EVENTS, "not_reached"): "\u041d\u0435\u0434\u043e\u0437\u0432\u043e\u043d\u0438\u043b\u0438\u0441\u044c",
    (OWNER_FUNNEL_EVENTS, "meeting_agreed"): "\u0414\u043e\u0433\u043e\u0432\u043e\u0440\u0438\u043b\u0438\u0441\u044c \u043d\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0443",
    (OWNER_FUNNEL_EVENTS, "agreement_sent"): "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0435",
    (OWNER_FUNNEL_EVENTS, "agreement_approved"): "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b\u0438 \u0441\u043e\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435",
    (OWNER_FUNNEL_EVENTS, "agreement_signed"): "\u041f\u043e\u0434\u043f\u0438\u0441\u0430\u043b\u0438 \u0441\u043e\u0433\u043b\u0430\u0448\u0435\u043d\u0438\u0435",
    (OWNER_FUNNEL_EVENTS, "trip_agreed"): "\u0414\u043e\u0433\u043e\u0432\u043e\u0440\u0438\u043b\u0438\u0441\u044c \u043d\u0430 \u043f\u043e\u0445\u043e\u0434",
    (OWNER_FUNNEL_EVENTS, "info_sent_to_parents"): "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u043b\u0438 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044e \u0432 \u0447\u0430\u0442 \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u044f\u043c",
    (OWNER_FUNNEL_EVENTS, "leads_collected"): "\u0421\u043e\u0431\u0440\u0430\u043b\u0438 \u043b\u0438\u0434\u043e\u0432",
    (OWNER_FUNNEL_EVENTS, "rejected"): "\u041e\u0442\u043a\u0430\u0437\u0430\u043b\u0438",
}


def _stage_label(funnel_type: str, value: str) -> str:
    return STAGE_LABELS.get((funnel_type, value), value)


def _fix_mojibake(s: Optional[str]) -> Optional[str]:
    """Восстанавливает строку из битой кодировки (UTF-8, прочитанный как Latin-1 или CP1252)."""
    if not s or not isinstance(s, str):
        return s
    for enc in ("latin1", "cp1252"):
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
    current_user: User = Depends(auth.require_permission("owner_funnels.access")),
):
    """╨б╨┐╨╕╤Б╨╛╨║╤В╨╕╨┐╨╛╨▓╨▓╨╛╤А╨╛╨╜╨╛╨║╤Б╤Н╤В╨░╨┐╨░╨╝╨╕╨┤╨╗╤П╨▓╤Л╨▒╨╛╤А╨░╨▓╨╛╤А╨╛╨╜╨║╨╕"""
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
    current_user: User = Depends(auth.require_permission("owner_funnels.access")),
):
    """╨б╨┐╨╕╤Б╨╛╨║╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╣╨▓╨╛╤А╨╛╨╜╨╛╨║╨Ъ╨░╨╢╨┤╨╛╨╡╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡╨┤╨╛╤Б╨║╨░╤Б╤Н╤В╨░╨┐╨░╨╝╨╕"""
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

@router.post("/owner-funnels/events/{event_id}/add-schools-by-city")
async def add_schools_by_city_to_event(
    event_id: int,
    payload: AddSchoolsByCityPayload = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_funnels.manage")),
):
    """╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М╨▓╨▓╨╛╤А╨╛╨╜╨║╤Г╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П╨▓╤Б╨╡╤И╨║╨╛╨╗╤Л╨╕╨╖╨▓╤Л╨▒╤А╨░╨╜╨╜╨╛╨│╨╛╨│╨╛╤А╨╛╨┤╨░╨и╨║╨╛╨╗╤Л╤Г╨╢╨╡╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╜╤Л╨╡╨▓╨▓╨╛╤А╨╛╨╜╨║╤Г╨┐╨╛╨▓╨┐╤А╨╛╨┐╤Г╤Б╨║╨░╤О╤В╤Б╤П"""
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
    current_user: User = Depends(auth.require_permission("owner_funnels.manage")),
):
    """╨б╨╛╨╖╨┤╨░╤В╤М╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡╨▓╨╛╤А╨╛╨╜╨║╤Г╤Б╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡╨╝╨╕╨┤╨░╤В╨░╨╝╨╕╨Ъ╨░╤А╤В╨╛╤З╨║╨╕╨▓╨║╨╛╨╗╨╛╨╜╨║╨░╤Е╨┤╨╛╨▒╨░╨▓╨╗╤П╤О╤В╤Б╤П╨╛╤В╨┤╨╡╨╗╤М╨╜╨╛"""
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
    event_id: Optional[int] = Query(default=None, description="╨Ф╨╗╤П╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛"),
    stage: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_funnels.access")),
):
    """╨б╨┐╨╕╤Б╨╛╨║╤Н╨╗╨╡╨╝╨╡╨╜╤В╨╛╨▓╨▓╨╛╤А╨╛╨╜╨║╨╕╨Ф╨╗╤П╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜╨║╨░╤А╤В╨╛╤З╨║╨╕╨▓╨╜╤Г╤В╤А╨╕╨▓╤Л╨▒╤А╨░╨╜╨╜╨╛╨│╨╛╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П"""
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
    current_user: User = Depends(auth.require_permission("owner_funnels.manage")),
):
    """╨б╨╛╨╖╨┤╨░╤В╤М╤Н╨╗╨╡╨╝╨╡╨╜╤В╨▓╨╛╤А╨╛╨╜╨║╨╕╨║╨░╤А╤В╨╛╤З╨║╤Г╨Ф╨╗╤П╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜╨║╨░╤А╤В╨╛╤З╨║╨░╨▓╨╜╤Г╤В╤А╨╕╨▓╨╛╤А╨╛╨╜╨║╨╕╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П"""
    _validate_funnel_and_stage(payload.funnel_type, payload.stage)
    if payload.funnel_type == OWNER_FUNNEL_EVENTS:
        if payload.event_id is None:
            raise HTTPException(status_code=400, detail="For events funnel event_id is required")
        # ╨║╨░╤А╤В╨╛╤З╨║╨░╨▓╨╜╤Г╤В╤А╨╕╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П╨┐╤А╨╕╨┐╨╡╤А╨▓╨╛╨╝╨┐╨╡╤А╨╡╤Е╨╛╨┤╨╡╨╖╨░╨┐╨╛╨╗╨╜╤П╤В╤Б╤П
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
    current_user: User = Depends(auth.require_permission("owner_funnels.access")),
):
    """╨Я╨╛╨╗╤Г╤З╨╕╤В╤М╤Н╨╗╨╡╨╝╨╡╨╜╤В╨┐╨╛"""
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
    """╨Я╤А╨╕╤Б╨╝╨╡╨╜╨╡╤Н╤В╨░╨┐╨░╨▓╨╛╤А╨╛╨╜╨║╨╕╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П╨╝╨╡╤А╨╢╨╕╨╝╨┐╨╛╨╗╤П╨▓╨╕╤Д╨╕╨║╤Б╨╕╤А╤Г╨╡╨╝╨┤╨░╤В╤Г╤Н╤В╨░╨┐╨░"""
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
    current_user: User = Depends(auth.require_permission("owner_funnels.manage")),
):
    """╨Ю╨▒╨╜╨╛╨▓╨╕╤В╤М╤Н╨╗╨╡╨╝╨╡╨╜╤В╨▓╤В╤З╨┐╨╡╤А╨╡╨╜╨╛╤Б╨┐╨╛╤Н╤В╨░╨┐╨░╨╝╨Ф╨╗╤П╨┐╨╛╨╗╤П╤Б╨╛╤Е╤А╨░╨╜╤П╤О╤В╤Б╤П╨▓"""
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
    current_user: User = Depends(auth.require_permission("owner_funnels.manage")),
):
    """╨г╨┤╨░╨╗╨╕╤В╤М╤Н╨╗╨╡╨╝╨╡╨╜╤В"""
    item = db.query(OwnerFunnelItem).filter(OwnerFunnelItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "ok"}
