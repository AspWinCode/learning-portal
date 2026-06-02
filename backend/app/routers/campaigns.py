"""Campaigns and SchoolCampaigns API. Owner only."""

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    AppSetting,
    B2BSchool,
    Campaign,
    CampaignDictionaryItem,
    CampaignEvent,
    SchoolCampaign,
    SchoolCampaignEvent,
    SalesCity,
    Task,
    TaskStatus,
    User,
)
from app.schemas.campaigns import (
    AddSchoolsBody,
    CampaignCreate,
    CampaignDictionaryCreate,
    CampaignDictionaryItemResponse,
    CampaignDictionaryUpdate,
    CampaignEventCreate,
    CampaignEventResponse,
    CampaignEventUpdate,
    CampaignResponse,
    CampaignSettingsResponse,
    CampaignUpdate,
    SchoolCampaignEventBulkUpdate,
    SchoolCampaignEventResponse,
    SchoolCampaignEventUpdate,
    SchoolCampaignResponse,
    SchoolCampaignUpdate,
    SchoolsEventsMatrixResponse,
)

router = APIRouter()

_CAMPAIGN_SETTING_CATEGORIES = {
    "types": "campaign_type",
    "formats": "campaign_format",
    "scales": "campaign_scale",
}
_B2B_DISTRICTS_KEY = "b2b_districts"


def _slugify_campaign_value(label: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", label.strip().lower())
    value = value.strip("_")
    value = value[:32].strip("_")
    return value or f"item_{uuid.uuid4().hex[:8]}"


def _campaign_dictionary_response(item: CampaignDictionaryItem) -> CampaignDictionaryItemResponse:
    return CampaignDictionaryItemResponse(
        id=item.id,
        category=item.category,
        value=item.value,
        label=item.label,
        is_active=item.is_active,
        position=item.position,
    )


def _list_campaign_dictionary(db: Session, category: str, active_only: bool = False) -> List[CampaignDictionaryItemResponse]:
    q = db.query(CampaignDictionaryItem).filter(CampaignDictionaryItem.category == category)
    if active_only:
        q = q.filter(CampaignDictionaryItem.is_active.is_(True))
    items = q.order_by(CampaignDictionaryItem.position.asc(), CampaignDictionaryItem.id.asc()).all()
    return [_campaign_dictionary_response(item) for item in items]


def _category_from_path(category: str) -> str:
    resolved = _CAMPAIGN_SETTING_CATEGORIES.get(category)
    if not resolved:
        raise HTTPException(status_code=400, detail="Unknown campaign setting category")
    return resolved


def _campaign_to_response(c: Campaign) -> CampaignResponse:
    return CampaignResponse(
        id=c.id,
        name=c.name,
        type=c.type,
        format=c.format,
        city=c.city,
        region=c.region,
        date_from=c.date_from,
        date_to=c.date_to,
        responsible_id=c.responsible_id,
        responsible_full_name=c.responsible.full_name if c.responsible else None,
        status=c.status,
        mode=c.mode,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


_PARTNERSHIP_STEPS = [
    "invited", "agreement_sent", "signed_school", "signed_both",
    "originals_received", "icon_on_site", "active_partner",
]


def _get_partnership_step(partnership: object) -> "Optional[str]":
    if not isinstance(partnership, dict):
        return None
    last = None
    for step in _PARTNERSHIP_STEPS:
        if partnership.get(step):
            last = step
    return last


def _school_campaign_to_response(sc: SchoolCampaign) -> SchoolCampaignResponse:
    school_partnership = getattr(sc.school, "partnership", None) if sc.school else None
    return SchoolCampaignResponse(
        id=sc.id,
        b2b_school_id=sc.b2b_school_id,
        campaign_id=sc.campaign_id,
        stage=sc.stage,
        support_letter_status=sc.support_letter_status,
        thank_you_sent=sc.thank_you_sent or False,
        created_at=sc.created_at,
        updated_at=sc.updated_at,
        school_name=sc.school.name if sc.school else None,
        school_city=sc.school.city if sc.school else None,
        partnership_step=_get_partnership_step(school_partnership),
    )


@router.get("/campaigns/settings", response_model=CampaignSettingsResponse)
async def get_campaign_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    cities = [
        city.name
        for city in db.query(SalesCity).filter(SalesCity.is_active.is_(True)).order_by(SalesCity.name.asc()).all()
        if city.name
    ]
    districts_setting = db.query(AppSetting).filter(AppSetting.key == _B2B_DISTRICTS_KEY).first()
    regions: List[str] = []
    if districts_setting and (districts_setting.value or "").strip():
        try:
            parsed = json.loads(districts_setting.value)
            if isinstance(parsed, list):
                regions = [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            regions = []
    return CampaignSettingsResponse(
        types=_list_campaign_dictionary(db, "campaign_type"),
        formats=_list_campaign_dictionary(db, "campaign_format"),
        scales=_list_campaign_dictionary(db, "campaign_scale"),
        cities=cities,
        regions=regions,
    )


@router.post("/campaigns/settings/{category}", response_model=CampaignDictionaryItemResponse, status_code=201)
async def create_campaign_setting_item(
    category: str,
    payload: CampaignDictionaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    resolved = _category_from_path(category)
    label = payload.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    value = _slugify_campaign_value(label)
    existing = db.query(CampaignDictionaryItem).filter(
        CampaignDictionaryItem.category == resolved,
        CampaignDictionaryItem.value == value,
    ).first()
    if existing:
        value = f"{value[:27].strip('_')}_{uuid.uuid4().hex[:4]}"
    max_position = db.query(CampaignDictionaryItem).filter(CampaignDictionaryItem.category == resolved).count() * 10 + 10
    item = CampaignDictionaryItem(category=resolved, value=value, label=label, position=max_position)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _campaign_dictionary_response(item)


@router.put("/campaigns/settings/{category}/{item_id}", response_model=CampaignDictionaryItemResponse)
async def update_campaign_setting_item(
    category: str,
    item_id: int,
    payload: CampaignDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    resolved = _category_from_path(category)
    item = db.query(CampaignDictionaryItem).filter(
        CampaignDictionaryItem.id == item_id,
        CampaignDictionaryItem.category == resolved,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Campaign setting item not found")
    data = payload.model_dump(exclude_unset=True)
    if "label" in data and data["label"] is not None:
        label = str(data["label"]).strip()
        if not label:
            raise HTTPException(status_code=400, detail="Label is required")
        item.label = label
    if "is_active" in data:
        item.is_active = bool(data["is_active"])
    if "position" in data and data["position"] is not None:
        item.position = int(data["position"])
    db.commit()
    db.refresh(item)
    return _campaign_dictionary_response(item)


@router.delete("/campaigns/settings/{category}/{item_id}", status_code=204)
async def delete_campaign_setting_item(
    category: str,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    resolved = _category_from_path(category)
    item = db.query(CampaignDictionaryItem).filter(
        CampaignDictionaryItem.id == item_id,
        CampaignDictionaryItem.category == resolved,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Campaign setting item not found")
    db.delete(item)
    db.commit()
    return None


@router.get("/campaigns", response_model=List[CampaignResponse])
async def list_campaigns(
    status: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    type_: Optional[str] = Query(None, alias="type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    q = db.query(Campaign).options(joinedload(Campaign.responsible)).order_by(Campaign.created_at.desc())
    if status:
        q = q.filter(Campaign.status == status)
    if city:
        q = q.filter(Campaign.city == city)
    if type_:
        q = q.filter(Campaign.type == type_)
    return [_campaign_to_response(c) for c in q.all()]


@router.post("/campaigns", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    c = Campaign(
        name=payload.name,
        type=payload.type,
        format=payload.format,
        city=payload.city,
        region=payload.region,
        date_from=payload.date_from,
        date_to=payload.date_to,
        responsible_id=payload.responsible_id,
        status=payload.status or "draft",
        mode=payload.mode or "city",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    c = db.query(Campaign).options(joinedload(Campaign.responsible)).filter(Campaign.id == c.id).first()
    return _campaign_to_response(c)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    c = db.query(Campaign).options(joinedload(Campaign.responsible)).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _campaign_to_response(c)


@router.put("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    c = db.query(Campaign).options(joinedload(Campaign.responsible)).filter(Campaign.id == campaign_id).first()
    return _campaign_to_response(c)


@router.delete("/campaigns/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(c)
    db.commit()


@router.get("/campaigns/{campaign_id}/school-campaigns", response_model=List[SchoolCampaignResponse])
async def list_campaign_schools(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(SchoolCampaign.campaign_id == campaign_id)
        .order_by(SchoolCampaign.id)
        .all()
    )
    return [_school_campaign_to_response(r) for r in rows]


@router.post("/campaigns/{campaign_id}/school-campaigns/add-schools", response_model=List[SchoolCampaignResponse])
async def add_schools_to_campaign(
    campaign_id: int,
    body: AddSchoolsBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    existing = {sc.b2b_school_id for sc in campaign.school_campaigns}
    added = []
    for sid in body.school_ids:
        if sid in existing:
            continue
        school = db.query(B2BSchool).filter(B2BSchool.id == sid).first()
        if not school:
            continue
        sc = SchoolCampaign(b2b_school_id=sid, campaign_id=campaign_id, stage="not_contacted")
        db.add(sc)
        db.flush()
        existing.add(sid)
        if body.create_contact_task:
            task = Task(
                title=f"Связаться со школой: {school.name} ({campaign.name})",
                description=None,
                created_by_id=current_user.id,
                assigned_to_id=campaign.responsible_id,
                status=TaskStatus.ACTIVE.value,
            )
            db.add(task)
        added.append(sc)
    db.commit()
    for sc in added:
        db.refresh(sc)
    rows = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(SchoolCampaign.campaign_id == campaign_id)
        .order_by(SchoolCampaign.id)
        .all()
    )
    return [_school_campaign_to_response(r) for r in rows]


@router.get("/campaigns/{campaign_id}/schools-available", response_model=List[dict])
async def list_schools_available_for_campaign(
    campaign_id: int,
    city: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    already_ids = {sc.b2b_school_id for sc in campaign.school_campaigns}
    q = db.query(B2BSchool)
    if already_ids:
        q = q.filter(~B2BSchool.id.in_(already_ids))
    if city:
        q = q.filter(B2BSchool.city == city)
    if search and search.strip():
        q = q.filter(
            B2BSchool.name.ilike(f"%{search.strip()}%")
        )
    schools = q.order_by(B2BSchool.name).limit(500).all()
    return [{"id": s.id, "name": s.name, "city": s.city} for s in schools]


@router.patch("/campaigns/{campaign_id}/school-campaigns/{sc_id}", response_model=SchoolCampaignResponse)
async def update_school_campaign(
    campaign_id: int,
    sc_id: int,
    payload: SchoolCampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    sc = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(SchoolCampaign.id == sc_id, SchoolCampaign.campaign_id == campaign_id)
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="SchoolCampaign not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(sc, k, v)
    db.commit()
    db.refresh(sc)
    return _school_campaign_to_response(sc)


@router.delete("/campaigns/{campaign_id}/school-campaigns/{sc_id}", status_code=204)
async def remove_school_from_campaign(
    campaign_id: int,
    sc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    sc = db.query(SchoolCampaign).filter(
        SchoolCampaign.id == sc_id, SchoolCampaign.campaign_id == campaign_id
    ).first()
    if not sc:
        raise HTTPException(status_code=404, detail="SchoolCampaign not found")
    db.delete(sc)
    db.commit()


# --- CampaignEvent (джемы внутри кампании) ---
def _campaign_event_to_response(e: CampaignEvent) -> CampaignEventResponse:
    return CampaignEventResponse(
        id=e.id,
        campaign_id=e.campaign_id,
        title=e.title,
        event_date=e.event_date,
        starts_at=e.starts_at,
        ends_at=e.ends_at,
        location=e.location,
        city=e.city,
        status=e.status,
        notes=e.notes,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


@router.get("/campaigns/{campaign_id}/events", response_model=List[CampaignEventResponse])
async def list_campaign_events(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    events = (
        db.query(CampaignEvent)
        .filter(CampaignEvent.campaign_id == campaign_id)
        .order_by(CampaignEvent.event_date.asc(), CampaignEvent.starts_at.asc())
        .all()
    )
    return [_campaign_event_to_response(e) for e in events]


@router.post("/campaigns/{campaign_id}/events", response_model=CampaignEventResponse, status_code=201)
async def create_campaign_event(
    campaign_id: int,
    payload: CampaignEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    event = CampaignEvent(
        campaign_id=campaign_id,
        title=payload.title,
        event_date=payload.event_date,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        location=payload.location,
        city=payload.city,
        status=payload.status or "planned",
        notes=payload.notes,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _campaign_event_to_response(event)


@router.put("/campaigns/{campaign_id}/events/{event_id}", response_model=CampaignEventResponse)
async def update_campaign_event(
    campaign_id: int,
    event_id: int,
    payload: CampaignEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    event = db.query(CampaignEvent).filter(
        CampaignEvent.id == event_id, CampaignEvent.campaign_id == campaign_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Campaign event not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(event, k, v)
    db.commit()
    db.refresh(event)
    return _campaign_event_to_response(event)


@router.patch("/campaigns/{campaign_id}/events/{event_id}", response_model=CampaignEventResponse)
async def patch_campaign_event(
    campaign_id: int,
    event_id: int,
    payload: CampaignEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    return await update_campaign_event(campaign_id, event_id, payload, db, current_user)


# --- SchoolCampaignEvent (матрица и детали по джему) ---
def _sce_to_response(sce: SchoolCampaignEvent) -> SchoolCampaignEventResponse:
    return SchoolCampaignEventResponse(
        id=sce.id,
        campaign_event_id=sce.campaign_event_id,
        school_campaign_id=sce.school_campaign_id,
        invite_status=sce.invite_status,
        participation_status=sce.participation_status,
        participant_count=sce.participant_count,
        host_status=sce.host_status,
        notes=sce.notes,
        created_at=sce.created_at,
        updated_at=sce.updated_at,
    )


@router.get("/campaigns/{campaign_id}/schools-events-matrix", response_model=SchoolsEventsMatrixResponse)
async def get_schools_events_matrix(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    school_campaigns = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(SchoolCampaign.campaign_id == campaign_id)
        .order_by(SchoolCampaign.id)
        .all()
    )
    events = (
        db.query(CampaignEvent)
        .filter(CampaignEvent.campaign_id == campaign_id)
        .order_by(CampaignEvent.event_date.asc(), CampaignEvent.starts_at.asc())
        .all()
    )
    sces = (
        db.query(SchoolCampaignEvent)
        .filter(
            SchoolCampaignEvent.campaign_event_id.in_([e.id for e in events]),
            SchoolCampaignEvent.school_campaign_id.in_([sc.id for sc in school_campaigns]),
        )
        .all()
    )
    schools_data = [
        {
            "id": sc.id,
            "b2b_school_id": sc.b2b_school_id,
            "school_name": sc.school.name if sc.school else None,
            "school_city": sc.school.city if sc.school else None,
            "stage": sc.stage,
        }
        for sc in school_campaigns
    ]
    return SchoolsEventsMatrixResponse(
        schools=schools_data,
        events=[_campaign_event_to_response(e) for e in events],
        school_campaign_events=[_sce_to_response(sce) for sce in sces],
    )


@router.get("/campaigns/{campaign_id}/school-event-counts", response_model=Dict[str, Dict[str, int]])
async def get_campaign_school_event_counts(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    """Сводка по каждой школе: сколько раз приглашали, участвовали, были площадкой (для канбана)."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    sc_ids = [row[0] for row in db.query(SchoolCampaign.id).filter(SchoolCampaign.campaign_id == campaign_id).all()]
    if not sc_ids:
        return {}
    event_ids = [row[0] for row in db.query(CampaignEvent.id).filter(CampaignEvent.campaign_id == campaign_id).all()]
    if not event_ids:
        return {str(sid): {"events_invited_count": 0, "events_participated_count": 0, "events_hosted_count": 0} for sid in sc_ids}
    from sqlalchemy import func
    invited = (
        db.query(SchoolCampaignEvent.school_campaign_id, func.count(SchoolCampaignEvent.id))
        .filter(
            SchoolCampaignEvent.school_campaign_id.in_(sc_ids),
            SchoolCampaignEvent.campaign_event_id.in_(event_ids),
            SchoolCampaignEvent.invite_status.in_(["invited", "awaiting_reply", "accepted", "declined"]),
        )
        .group_by(SchoolCampaignEvent.school_campaign_id)
        .all()
    )
    participated = (
        db.query(SchoolCampaignEvent.school_campaign_id, func.count(SchoolCampaignEvent.id))
        .filter(
            SchoolCampaignEvent.school_campaign_id.in_(sc_ids),
            SchoolCampaignEvent.campaign_event_id.in_(event_ids),
            SchoolCampaignEvent.participation_status == "participated",
        )
        .group_by(SchoolCampaignEvent.school_campaign_id)
        .all()
    )
    hosted = (
        db.query(SchoolCampaignEvent.school_campaign_id, func.count(SchoolCampaignEvent.id))
        .filter(
            SchoolCampaignEvent.school_campaign_id.in_(sc_ids),
            SchoolCampaignEvent.campaign_event_id.in_(event_ids),
            SchoolCampaignEvent.host_status.in_(["host_proposed", "host_confirmed", "hosted"]),
        )
        .group_by(SchoolCampaignEvent.school_campaign_id)
        .all()
    )
    by_sc = {sid: {"events_invited_count": 0, "events_participated_count": 0, "events_hosted_count": 0} for sid in sc_ids}
    for sid, cnt in invited:
        by_sc[sid]["events_invited_count"] = cnt
    for sid, cnt in participated:
        by_sc[sid]["events_participated_count"] = cnt
    for sid, cnt in hosted:
        by_sc[sid]["events_hosted_count"] = cnt
    return {str(k): v for k, v in by_sc.items()}


@router.get(
    "/campaigns/{campaign_id}/events/{event_id}/schools",
    response_model=List[Dict[str, Any]],
)
async def list_event_schools(
    campaign_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    event = db.query(CampaignEvent).filter(
        CampaignEvent.id == event_id, CampaignEvent.campaign_id == campaign_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Campaign event not found")
    school_campaigns = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(SchoolCampaign.campaign_id == campaign_id)
        .order_by(SchoolCampaign.id)
        .all()
    )
    sces = {
        (sce.school_campaign_id, sce.campaign_event_id): sce
        for sce in db.query(SchoolCampaignEvent)
        .filter(
            SchoolCampaignEvent.campaign_event_id == event_id,
            SchoolCampaignEvent.school_campaign_id.in_([sc.id for sc in school_campaigns]),
        )
        .all()
    }
    result = []
    for sc in school_campaigns:
        sce = sces.get((sc.id, event_id))
        result.append(
            {
                "school_campaign_id": sc.id,
                "school_name": sc.school.name if sc.school else None,
                "school_city": sc.school.city if sc.school else None,
                "stage": sc.stage,
                "invite_status": sce.invite_status if sce else "not_invited",
                "participation_status": sce.participation_status if sce else "not_planned",
                "participant_count": sce.participant_count if sce else None,
                "host_status": sce.host_status if sce else "not_host",
                "notes": sce.notes if sce else None,
                "school_campaign_event_id": sce.id if sce else None,
            }
        )
    return result


@router.put(
    "/campaigns/{campaign_id}/events/{event_id}/schools/{school_campaign_id}",
    response_model=SchoolCampaignEventResponse,
)
async def upsert_school_campaign_event(
    campaign_id: int,
    event_id: int,
    school_campaign_id: int,
    payload: SchoolCampaignEventUpdate,
    create_invite_task: bool = Query(False, description="Создать задачу «Позвать школу на джем» при invite_status=invited"),
    create_host_task: bool = Query(False, description="Создать задачу «Согласовать детали площадки» при host_status=host_confirmed"),
    create_participated_task: bool = Query(False, description="Создать задачу «Собрать лиды/итоги» при participation_status=participated"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    event = db.query(CampaignEvent).filter(
        CampaignEvent.id == event_id, CampaignEvent.campaign_id == campaign_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Campaign event not found")
    sc = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(
            SchoolCampaign.id == school_campaign_id, SchoolCampaign.campaign_id == campaign_id
        )
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="SchoolCampaign not found")
    sce = (
        db.query(SchoolCampaignEvent)
        .filter(
            SchoolCampaignEvent.campaign_event_id == event_id,
            SchoolCampaignEvent.school_campaign_id == school_campaign_id,
        )
        .first()
    )
    data = payload.model_dump(exclude_unset=True)
    if sce:
        for k, v in data.items():
            setattr(sce, k, v)
    else:
        defaults = {
            "invite_status": "not_invited",
            "participation_status": "not_planned",
            "host_status": "not_host",
        }
        defaults.update(data)
        sce = SchoolCampaignEvent(
            campaign_event_id=event_id,
            school_campaign_id=school_campaign_id,
            **defaults,
        )
        db.add(sce)
        db.flush()
    event_date_str = str(event.event_date) if event.event_date else event.title
    school_name = sc.school.name if sc.school else "Школа"
    if create_invite_task and data.get("invite_status") == "invited":
        db.add(Task(
            title=f"Позвать школу на джем {event_date_str}: {school_name}",
            created_by_id=current_user.id,
            assigned_to_id=campaign.responsible_id,
            status=TaskStatus.ACTIVE.value,
            category="schools",
        ))
    if create_host_task and data.get("host_status") == "host_confirmed":
        db.add(Task(
            title=f"Согласовать детали площадки: {school_name}",
            created_by_id=current_user.id,
            assigned_to_id=campaign.responsible_id,
            status=TaskStatus.ACTIVE.value,
            category="schools",
        ))
    if create_participated_task and data.get("participation_status") == "participated":
        db.add(Task(
            title=f"Собрать лиды/итоги по школе: {school_name}",
            created_by_id=current_user.id,
            assigned_to_id=campaign.responsible_id,
            status=TaskStatus.ACTIVE.value,
            category="schools",
        ))
    db.commit()
    db.refresh(sce)
    return _sce_to_response(sce)


@router.post(
    "/campaigns/{campaign_id}/events/{event_id}/schools/bulk-update",
    response_model=List[SchoolCampaignEventResponse],
)
async def bulk_update_event_schools(
    campaign_id: int,
    event_id: int,
    payload: SchoolCampaignEventBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    event = db.query(CampaignEvent).filter(
        CampaignEvent.id == event_id, CampaignEvent.campaign_id == campaign_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Campaign event not found")
    school_campaign_ids = set(payload.school_campaign_ids)
    school_campaigns = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(
            SchoolCampaign.id.in_(school_campaign_ids),
            SchoolCampaign.campaign_id == campaign_id,
        )
        .all()
    )
    valid_ids = {sc.id for sc in school_campaigns}
    sc_by_id = {sc.id: sc for sc in school_campaigns}
    data = payload.model_dump(exclude_unset=True)
    data.pop("school_campaign_ids", None)
    data.pop("create_invite_tasks", None)
    data.pop("create_host_tasks", None)
    data.pop("create_participated_tasks", None)
    if not data:
        return []
    existing = (
        db.query(SchoolCampaignEvent)
        .filter(
            SchoolCampaignEvent.campaign_event_id == event_id,
            SchoolCampaignEvent.school_campaign_id.in_(valid_ids),
        )
        .all()
    )
    by_sc = {sce.school_campaign_id: sce for sce in existing}
    result = []
    for sc_id in valid_ids:
        sce = by_sc.get(sc_id)
        if sce:
            for k, v in data.items():
                setattr(sce, k, v)
            result.append(sce)
        else:
            sce = SchoolCampaignEvent(
                campaign_event_id=event_id,
                school_campaign_id=sc_id,
                invite_status=data.get("invite_status", "not_invited"),
                participation_status=data.get("participation_status", "not_planned"),
                host_status=data.get("host_status", "not_host"),
                participant_count=data.get("participant_count"),
                notes=data.get("notes"),
            )
            db.add(sce)
            db.flush()
            result.append(sce)
    # Опциональное создание задач (п. 15 ТЗ)
    event_date_str = str(event.event_date) if event.event_date else event.title
    for sc_id in valid_ids:
        sc = sc_by_id.get(sc_id)
        if not sc or not sc.school:
            continue
        school_name = sc.school.name or "Школа"
        if getattr(payload, "create_invite_tasks", False) and data.get("invite_status") == "invited":
            task = Task(
                title=f"Позвать школу на джем {event_date_str}: {school_name}",
                description=None,
                created_by_id=current_user.id,
                assigned_to_id=campaign.responsible_id,
                status=TaskStatus.ACTIVE.value,
                category="schools",
            )
            db.add(task)
        if getattr(payload, "create_host_tasks", False) and data.get("host_status") == "host_confirmed":
            task = Task(
                title=f"Согласовать детали площадки: {school_name}",
                description=None,
                created_by_id=current_user.id,
                assigned_to_id=campaign.responsible_id,
                status=TaskStatus.ACTIVE.value,
                category="schools",
            )
            db.add(task)
        if getattr(payload, "create_participated_tasks", False) and data.get("participation_status") == "participated":
            task = Task(
                title=f"Собрать лиды/итоги по школе: {school_name}",
                description=None,
                created_by_id=current_user.id,
                assigned_to_id=campaign.responsible_id,
                status=TaskStatus.ACTIVE.value,
                category="schools",
            )
            db.add(task)
    db.commit()
    for sce in result:
        db.refresh(sce)
    return [_sce_to_response(sce) for sce in result]


@router.get(
    "/campaigns/{campaign_id}/school-campaigns/{sc_id}/events-history",
    response_model=List[Dict[str, Any]],
)
async def get_school_campaign_events_history(
    campaign_id: int,
    sc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    """История джемов по одной школе в кампании."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    sc = (
        db.query(SchoolCampaign)
        .options(joinedload(SchoolCampaign.school))
        .filter(SchoolCampaign.id == sc_id, SchoolCampaign.campaign_id == campaign_id)
        .first()
    )
    if not sc:
        raise HTTPException(status_code=404, detail="SchoolCampaign not found")
    sces = (
        db.query(SchoolCampaignEvent)
        .join(CampaignEvent, SchoolCampaignEvent.campaign_event_id == CampaignEvent.id)
        .filter(SchoolCampaignEvent.school_campaign_id == sc_id)
        .order_by(CampaignEvent.event_date.asc(), CampaignEvent.starts_at.asc())
        .all()
    )
    event_ids = [sce.campaign_event_id for sce in sces]
    events_map = {}
    if event_ids:
        for e in db.query(CampaignEvent).filter(CampaignEvent.id.in_(event_ids)).all():
            events_map[e.id] = e
    result = []
    for sce in sces:
        e = events_map.get(sce.campaign_event_id)
        result.append(
            {
                "campaign_event_id": sce.campaign_event_id,
                "event_title": e.title if e else None,
                "event_date": e.event_date.isoformat() if e and e.event_date else None,
                "invite_status": sce.invite_status,
                "participation_status": sce.participation_status,
                "participant_count": sce.participant_count,
                "host_status": sce.host_status,
                "notes": sce.notes,
            }
        )
    return result
