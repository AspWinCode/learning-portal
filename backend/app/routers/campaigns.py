"""Campaigns and SchoolCampaigns API. Owner only."""

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    AppSetting,
    B2BSchool,
    Campaign,
    CampaignDictionaryItem,
    CampaignEvent,
    CampaignEventStage,
    CampaignStage,
    EmailBroadcast,
    EmailBroadcastRecipient,
    SchoolCampaign,
    SchoolCampaignEvent,
    SalesCity,
    Task,
    TaskStatus,
    User,
    UserRole,
)
from app.schemas.campaigns import (
    AddSchoolsBody,
    CampaignCreate,
    CampaignDictionaryCreate,
    CampaignDictionaryItemResponse,
    CampaignDictionaryUpdate,
    CampaignEventCreate,
    CampaignEventResponse,
    CampaignEventStageCreate,
    CampaignEventStageReorder,
    CampaignEventStageResponse,
    CampaignEventStageUpdate,
    CampaignEventUpdate,
    CampaignResponse,
    CampaignSettingsResponse,
    CampaignStageCreate,
    CampaignStageReorder,
    CampaignStageResponse,
    CampaignStageUpdate,
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


def _split_csv_filter(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


_DEFAULT_STAGES_GAME_JAM = [
    {"key": "not_contacted", "label": "Не связались", "is_terminal": False},
    {"key": "email_sent", "label": "Отправили письмо на почту", "is_terminal": False},
    {"key": "email_opened", "label": "Письмо открыли", "is_terminal": False},
    {"key": "contact_established", "label": "Контакт установлен", "is_terminal": False},
    {"key": "director_agreed", "label": "Директор согласен", "is_terminal": False},
    {"key": "contact_person_received", "label": "Получен контакт ответственного", "is_terminal": False},
    {"key": "agreed_to_class_visits", "label": "Согласованы обходы", "is_terminal": False},
    {"key": "info_sent_to_parents", "label": "Инфо отправлено родителям", "is_terminal": False},
    {"key": "declined", "label": "Отказ", "is_terminal": True},
    {"key": "participated", "label": "Участвовали", "is_terminal": False},
    {"key": "leads_received", "label": "Лиды получены", "is_terminal": True},
]

_DEFAULT_STAGES_ONLINE = [
    {"key": "not_contacted", "label": "Не связались", "is_terminal": False},
    {"key": "email_sent", "label": "Отправили письмо на почту", "is_terminal": False},
    {"key": "email_opened", "label": "Письмо открыли", "is_terminal": False},
    {"key": "invited", "label": "Приглашены", "is_terminal": False},
    {"key": "info_sent", "label": "Инфо отправлено", "is_terminal": False},
    {"key": "confirmed", "label": "Подтвердили", "is_terminal": False},
    {"key": "declined", "label": "Отказ", "is_terminal": True},
    {"key": "participated", "label": "Участвовали", "is_terminal": False},
]


def default_stages_for_type(campaign_type: str) -> List[Dict[str, Any]]:
    """Дефолтный набор этапов воронки по типу кампании.

    Для онлайн-ивента — свой короткий набор; для остальных типов
    (game_jam, olympiad, league, ...) — полный «джемовый» набор.
    """
    if campaign_type == "online_event":
        return [dict(s) for s in _DEFAULT_STAGES_ONLINE]
    return [dict(s) for s in _DEFAULT_STAGES_GAME_JAM]


def _seed_campaign_stages(db: Session, campaign: Campaign) -> None:
    """Создаёт дефолтные этапы для новой кампании."""
    for index, stage in enumerate(default_stages_for_type(campaign.type)):
        db.add(
            CampaignStage(
                campaign_id=campaign.id,
                key=stage["key"],
                label=stage["label"],
                position=(index + 1) * 10,
                is_terminal=stage["is_terminal"],
            )
        )


def _stage_to_response(stage: CampaignStage) -> CampaignStageResponse:
    return CampaignStageResponse(
        id=stage.id,
        campaign_id=stage.campaign_id,
        key=stage.key,
        label=stage.label,
        position=stage.position,
        is_terminal=stage.is_terminal,
    )


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
        is_game_jam=bool(c.is_game_jam),
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
        school_district=sc.school.district if sc.school else None,
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
        is_game_jam=bool(payload.is_game_jam),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    _seed_campaign_stages(db, c)
    db.commit()
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
    cities: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    districts: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    exists = db.query(Campaign.id).filter(Campaign.id == campaign_id).scalar()
    if not exists:
        raise HTTPException(status_code=404, detail="Campaign not found")
    already_subq = db.query(SchoolCampaign.b2b_school_id).filter(SchoolCampaign.campaign_id == campaign_id).subquery()
    q = db.query(B2BSchool).filter(~B2BSchool.id.in_(already_subq))
    city_values = _split_csv_filter(cities) or ([city.strip()] if city and city.strip() else [])
    district_values = _split_csv_filter(districts) or ([district.strip()] if district and district.strip() else [])
    if city_values:
        q = q.filter(B2BSchool.city.in_(city_values))
    if district_values:
        q = q.filter(B2BSchool.district.in_(district_values))
    if search and search.strip():
        q = q.filter(
            B2BSchool.name.ilike(f"%{search.strip()}%")
        )
    schools = q.order_by(B2BSchool.name).all()
    return [{"id": s.id, "name": s.name, "city": s.city, "district": s.district} for s in schools]


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


# --- CampaignStage (произвольные этапы воронки) ---
def _require_campaign(db: Session, campaign_id: int) -> Campaign:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.get("/campaigns/{campaign_id}/stages", response_model=List[CampaignStageResponse])
async def list_campaign_stages(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    _require_campaign(db, campaign_id)
    stages = (
        db.query(CampaignStage)
        .filter(CampaignStage.campaign_id == campaign_id)
        .order_by(CampaignStage.position.asc(), CampaignStage.id.asc())
        .all()
    )
    return [_stage_to_response(s) for s in stages]


@router.post("/campaigns/{campaign_id}/stages", response_model=CampaignStageResponse, status_code=201)
async def create_campaign_stage(
    campaign_id: int,
    payload: CampaignStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    _require_campaign(db, campaign_id)
    label = payload.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    existing_keys = {
        row[0]
        for row in db.query(CampaignStage.key).filter(CampaignStage.campaign_id == campaign_id).all()
    }
    key = _slugify_campaign_value(label)
    if key in existing_keys:
        key = f"{key[:27].strip('_')}_{uuid.uuid4().hex[:4]}"
    max_position = (
        db.query(func.max(CampaignStage.position))
        .filter(CampaignStage.campaign_id == campaign_id)
        .scalar()
        or 0
    )
    stage = CampaignStage(
        campaign_id=campaign_id,
        key=key,
        label=label,
        position=max_position + 10,
        is_terminal=False,
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return _stage_to_response(stage)


@router.patch("/campaigns/{campaign_id}/stages/{stage_id}", response_model=CampaignStageResponse)
async def update_campaign_stage(
    campaign_id: int,
    stage_id: int,
    payload: CampaignStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    stage = (
        db.query(CampaignStage)
        .filter(CampaignStage.id == stage_id, CampaignStage.campaign_id == campaign_id)
        .first()
    )
    if not stage:
        raise HTTPException(status_code=404, detail="Campaign stage not found")
    data = payload.model_dump(exclude_unset=True)
    if "label" in data and data["label"] is not None:
        label = str(data["label"]).strip()
        if not label:
            raise HTTPException(status_code=400, detail="Label is required")
        stage.label = label
    if "position" in data and data["position"] is not None:
        stage.position = int(data["position"])
    if "is_terminal" in data and data["is_terminal"] is not None:
        stage.is_terminal = bool(data["is_terminal"])
    db.commit()
    db.refresh(stage)
    return _stage_to_response(stage)


@router.post("/campaigns/{campaign_id}/stages/reorder", response_model=List[CampaignStageResponse])
async def reorder_campaign_stages(
    campaign_id: int,
    payload: CampaignStageReorder,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    _require_campaign(db, campaign_id)
    stages = db.query(CampaignStage).filter(CampaignStage.campaign_id == campaign_id).all()
    by_id = {s.id: s for s in stages}
    for index, stage_id in enumerate(payload.ordered_ids):
        stage = by_id.get(stage_id)
        if stage:
            stage.position = (index + 1) * 10
    db.commit()
    ordered = (
        db.query(CampaignStage)
        .filter(CampaignStage.campaign_id == campaign_id)
        .order_by(CampaignStage.position.asc(), CampaignStage.id.asc())
        .all()
    )
    return [_stage_to_response(s) for s in ordered]


@router.delete("/campaigns/{campaign_id}/stages/{stage_id}", status_code=204)
async def delete_campaign_stage(
    campaign_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    stage = (
        db.query(CampaignStage)
        .filter(CampaignStage.id == stage_id, CampaignStage.campaign_id == campaign_id)
        .first()
    )
    if not stage:
        raise HTTPException(status_code=404, detail="Campaign stage not found")
    remaining = (
        db.query(CampaignStage)
        .filter(CampaignStage.campaign_id == campaign_id, CampaignStage.id != stage_id)
        .order_by(CampaignStage.position.asc(), CampaignStage.id.asc())
        .all()
    )
    if not remaining:
        raise HTTPException(status_code=400, detail="Cannot delete the last stage")
    target_key = remaining[0].key
    db.query(SchoolCampaign).filter(
        SchoolCampaign.campaign_id == campaign_id,
        SchoolCampaign.stage == stage.key,
    ).update({SchoolCampaign.stage: target_key}, synchronize_session=False)
    db.delete(stage)
    db.commit()
    return None


# --- CampaignEvent (джемы внутри кампании) ---
_DEFAULT_JAM_STAGES = [
    {"key": "registered", "label": "Зарегистрированы", "is_terminal": False},
    {"key": "briefed", "label": "Прошли брифинг", "is_terminal": False},
    {"key": "working", "label": "В процессе", "is_terminal": False},
    {"key": "submitted", "label": "Сдали работу", "is_terminal": False},
    {"key": "judged", "label": "Оценены", "is_terminal": False},
    {"key": "completed", "label": "Завершили", "is_terminal": True},
]


def _seed_jam_stages(db: Session, event: CampaignEvent) -> None:
    """Засевает дефолтные этапы для нового джема."""
    for index, stage in enumerate(_DEFAULT_JAM_STAGES):
        db.add(CampaignEventStage(
            campaign_event_id=event.id,
            key=stage["key"],
            label=stage["label"],
            position=(index + 1) * 10,
            is_terminal=stage["is_terminal"],
        ))


def _jam_stage_to_response(s: CampaignEventStage) -> CampaignEventStageResponse:
    return CampaignEventStageResponse(
        id=s.id,
        campaign_event_id=s.campaign_event_id,
        key=s.key,
        label=s.label,
        position=s.position,
        is_terminal=s.is_terminal,
    )


def _campaign_event_to_response(e: CampaignEvent) -> CampaignEventResponse:
    return CampaignEventResponse(
        id=e.id,
        campaign_id=e.campaign_id,
        title=e.title,
        event_date=e.event_date,
        description=e.notes,
        starts_at=e.starts_at,
        ends_at=e.ends_at,
        trainer_id=e.trainer_id,
        trainer_full_name=e.trainer.full_name if e.trainer else None,
        location=e.location,
        city=e.city,
        status=e.status,
        notes=e.notes,
        host_b2b_school_id=e.host_b2b_school_id,
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
    if payload.trainer_id is not None:
        trainer = db.query(User).filter(User.id == payload.trainer_id, User.role == UserRole.TRAINER).first()
        if not trainer:
            raise HTTPException(status_code=400, detail="Trainer not found")
    event = CampaignEvent(
        campaign_id=campaign_id,
        title=payload.title,
        event_date=payload.event_date,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        trainer_id=payload.trainer_id,
        location=payload.location,
        city=payload.city,
        status=payload.status or "planned",
        notes=payload.description if payload.description is not None else payload.notes,
        host_b2b_school_id=payload.host_b2b_school_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    # Засеваем этапы джема для Game Jam кампаний
    if campaign.is_game_jam:
        _seed_jam_stages(db, event)
        db.commit()
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
    if "trainer_id" in data and data["trainer_id"] is not None:
        trainer = db.query(User).filter(User.id == data["trainer_id"], User.role == UserRole.TRAINER).first()
        if not trainer:
            raise HTTPException(status_code=400, detail="Trainer not found")
    if "description" in data:
        data["notes"] = data.pop("description")
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

@router.delete("/campaigns/{campaign_id}/events/{event_id}", status_code=204)
async def delete_campaign_event(
    campaign_id: int,
    event_id: int,
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
    db.delete(event)
    db.commit()


# --- CampaignEventStage (этапы внутреннего канбана джема) ---

@router.get("/campaigns/{campaign_id}/events/{event_id}/stages", response_model=List[CampaignEventStageResponse])
async def list_jam_stages(
    campaign_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    _require_campaign(db, campaign_id)
    event = db.query(CampaignEvent).filter(
        CampaignEvent.id == event_id, CampaignEvent.campaign_id == campaign_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Campaign event not found")
    stages = (
        db.query(CampaignEventStage)
        .filter(CampaignEventStage.campaign_event_id == event_id)
        .order_by(CampaignEventStage.position.asc(), CampaignEventStage.id.asc())
        .all()
    )
    return [_jam_stage_to_response(s) for s in stages]


@router.post("/campaigns/{campaign_id}/events/{event_id}/stages", response_model=CampaignEventStageResponse, status_code=201)
async def create_jam_stage(
    campaign_id: int,
    event_id: int,
    payload: CampaignEventStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    _require_campaign(db, campaign_id)
    event = db.query(CampaignEvent).filter(
        CampaignEvent.id == event_id, CampaignEvent.campaign_id == campaign_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Campaign event not found")
    label = payload.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    existing_keys = {
        row[0] for row in
        db.query(CampaignEventStage.key).filter(CampaignEventStage.campaign_event_id == event_id).all()
    }
    key = _slugify_campaign_value(label)
    if key in existing_keys:
        key = f"{key[:27].strip('_')}_{uuid.uuid4().hex[:4]}"
    max_pos = (
        db.query(func.max(CampaignEventStage.position))
        .filter(CampaignEventStage.campaign_event_id == event_id)
        .scalar() or 0
    )
    stage = CampaignEventStage(
        campaign_event_id=event_id,
        key=key, label=label,
        position=max_pos + 10,
        is_terminal=False,
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return _jam_stage_to_response(stage)


@router.patch("/campaigns/{campaign_id}/events/{event_id}/stages/{stage_id}", response_model=CampaignEventStageResponse)
async def update_jam_stage(
    campaign_id: int,
    event_id: int,
    stage_id: int,
    payload: CampaignEventStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    stage = db.query(CampaignEventStage).filter(
        CampaignEventStage.id == stage_id,
        CampaignEventStage.campaign_event_id == event_id,
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Jam stage not found")
    data = payload.model_dump(exclude_unset=True)
    if "label" in data and data["label"] is not None:
        label = str(data["label"]).strip()
        if not label:
            raise HTTPException(status_code=400, detail="Label is required")
        stage.label = label
    if "position" in data and data["position"] is not None:
        stage.position = int(data["position"])
    if "is_terminal" in data and data["is_terminal"] is not None:
        stage.is_terminal = bool(data["is_terminal"])
    db.commit()
    db.refresh(stage)
    return _jam_stage_to_response(stage)


@router.post("/campaigns/{campaign_id}/events/{event_id}/stages/reorder", response_model=List[CampaignEventStageResponse])
async def reorder_jam_stages(
    campaign_id: int,
    event_id: int,
    payload: CampaignEventStageReorder,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    _require_campaign(db, campaign_id)
    stages = db.query(CampaignEventStage).filter(CampaignEventStage.campaign_event_id == event_id).all()
    by_id = {s.id: s for s in stages}
    for index, sid in enumerate(payload.ordered_ids):
        s = by_id.get(sid)
        if s:
            s.position = (index + 1) * 10
    db.commit()
    ordered = (
        db.query(CampaignEventStage)
        .filter(CampaignEventStage.campaign_event_id == event_id)
        .order_by(CampaignEventStage.position.asc(), CampaignEventStage.id.asc())
        .all()
    )
    return [_jam_stage_to_response(s) for s in ordered]


@router.delete("/campaigns/{campaign_id}/events/{event_id}/stages/{stage_id}", status_code=204)
async def delete_jam_stage(
    campaign_id: int,
    event_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    stage = db.query(CampaignEventStage).filter(
        CampaignEventStage.id == stage_id,
        CampaignEventStage.campaign_event_id == event_id,
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Jam stage not found")
    remaining = (
        db.query(CampaignEventStage)
        .filter(CampaignEventStage.campaign_event_id == event_id, CampaignEventStage.id != stage_id)
        .order_by(CampaignEventStage.position.asc(), CampaignEventStage.id.asc())
        .all()
    )
    if not remaining:
        raise HTTPException(status_code=400, detail="Cannot delete the last jam stage")
    target_key = remaining[0].key
    db.query(SchoolCampaignEvent).filter(
        SchoolCampaignEvent.campaign_event_id == event_id,
        SchoolCampaignEvent.jam_stage == stage.key,
    ).update({SchoolCampaignEvent.jam_stage: target_key}, synchronize_session=False)
    db.delete(stage)
    db.commit()
    return None


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
        jam_stage=sce.jam_stage,
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

    sc_subq = db.query(SchoolCampaign.id).filter(SchoolCampaign.campaign_id == campaign_id).subquery()
    sc_ids_list = [row[0] for row in db.query(sc_subq).all()]
    if not sc_ids_list:
        return {}

    event_exists = db.query(CampaignEvent.id).filter(CampaignEvent.campaign_id == campaign_id).first()
    if not event_exists:
        return {str(sid): {"events_invited_count": 0, "events_participated_count": 0, "events_hosted_count": 0} for sid in sc_ids_list}

    event_subq = db.query(CampaignEvent.id).filter(CampaignEvent.campaign_id == campaign_id).subquery()

    # Single aggregation query instead of three separate ones
    rows = (
        db.query(
            SchoolCampaignEvent.school_campaign_id,
            func.count(case(
                (SchoolCampaignEvent.invite_status.in_(["invited", "awaiting_reply", "accepted", "declined"]), 1),
                else_=None,
            )).label("invited"),
            func.count(case(
                (SchoolCampaignEvent.participation_status == "participated", 1),
                else_=None,
            )).label("participated"),
            func.count(case(
                (SchoolCampaignEvent.host_status.in_(["host_proposed", "host_confirmed", "hosted"]), 1),
                else_=None,
            )).label("hosted"),
        )
        .filter(
            SchoolCampaignEvent.school_campaign_id.in_(sc_subq),
            SchoolCampaignEvent.campaign_event_id.in_(event_subq),
        )
        .group_by(SchoolCampaignEvent.school_campaign_id)
        .all()
    )
    by_sc = {sid: {"events_invited_count": 0, "events_participated_count": 0, "events_hosted_count": 0} for sid in sc_ids_list}
    for sc_id, invited, participated, hosted in rows:
        by_sc[sc_id] = {
            "events_invited_count": invited,
            "events_participated_count": participated,
            "events_hosted_count": hosted,
        }
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
                "jam_stage": sce.jam_stage if sce else None,
                "notes": sce.notes if sce else None,
                "school_campaign_event_id": sce.id if sce else None,
            }
        )
    return result


@router.patch(
    "/campaigns/{campaign_id}/events/{event_id}/schools/{school_campaign_id}",
    response_model=SchoolCampaignEventResponse,
)
async def patch_school_campaign_event(
    campaign_id: int,
    event_id: int,
    school_campaign_id: int,
    payload: SchoolCampaignEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    """Частичное обновление записи школы в джеме (jam_stage и другие поля)."""
    return await upsert_school_campaign_event(
        campaign_id, event_id, school_campaign_id, payload,
        False, False, False, db, current_user,
    )


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
        defaults: Dict[str, Any] = {
            "invite_status": "not_invited",
            "participation_status": "not_planned",
            "host_status": "not_host",
        }
        # Для Game Jam кампаний: ставим первый этап джема по умолчанию
        if campaign.is_game_jam and "jam_stage" not in data:
            first_stage = (
                db.query(CampaignEventStage)
                .filter(CampaignEventStage.campaign_event_id == event_id)
                .order_by(CampaignEventStage.position.asc(), CampaignEventStage.id.asc())
                .first()
            )
            if first_stage:
                defaults["jam_stage"] = first_stage.key
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


# ---------------------------------------------------------------------------
# Broadcasts ↔ Campaign integration
# ---------------------------------------------------------------------------

def _ensure_email_stages(db: Session, campaign_id: int) -> None:
    """Автоматически создаёт этапы email_sent / email_opened, если их ещё нет в кампании."""
    existing_keys = {
        row[0]
        for row in db.query(CampaignStage.key).filter(CampaignStage.campaign_id == campaign_id).all()
    }
    not_contacted_pos = (
        db.query(CampaignStage.position)
        .filter(CampaignStage.campaign_id == campaign_id, CampaignStage.key == "not_contacted")
        .scalar()
        or 10
    )
    stages_to_add = []
    if "email_sent" not in existing_keys:
        stages_to_add.append(("email_sent", "Отправили письмо на почту", not_contacted_pos + 5))
    if "email_opened" not in existing_keys:
        stages_to_add.append(("email_opened", "Письмо открыли", not_contacted_pos + 7))
    if not stages_to_add:
        return
    # Сдвигаем остальные этапы, чтобы освободить место
    db.query(CampaignStage).filter(
        CampaignStage.campaign_id == campaign_id,
        CampaignStage.position > not_contacted_pos,
    ).update({CampaignStage.position: CampaignStage.position + 20}, synchronize_session=False)
    for key, label, position in stages_to_add:
        db.add(CampaignStage(campaign_id=campaign_id, key=key, label=label, position=position, is_terminal=False))
    db.commit()


@router.get("/campaigns/{campaign_id}/broadcasts", response_model=List[Dict[str, Any]])
async def list_campaign_broadcasts(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.access")),
):
    """Список рассылок, привязанных к кампании."""
    _require_campaign(db, campaign_id)
    try:
        broadcasts = (
            db.query(EmailBroadcast)
            .filter(EmailBroadcast.campaign_id == campaign_id)
            .order_by(EmailBroadcast.created_at.desc())
            .all()
        )
    except Exception:
        db.rollback()
        return []
    result = []
    for b in broadcasts:
        result.append({
            "id": b.id,
            "name": b.name,
            "subject": b.subject,
            "status": b.status,
            "sent_at": b.sent_at.isoformat() if b.sent_at else None,
            "total_recipients": b.total_recipients or 0,
            "sent_count": b.sent_count or 0,
            "opened_count": b.opened_count or 0,
            "clicked_count": b.clicked_count or 0,
        })
    return result


@router.post("/campaigns/{campaign_id}/broadcasts/{broadcast_id}/link", status_code=200)
async def link_broadcast_to_campaign(
    campaign_id: int,
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    """Привязывает рассылку к кампании и создаёт этапы email_sent/email_opened."""
    _require_campaign(db, campaign_id)
    broadcast = db.query(EmailBroadcast).filter(EmailBroadcast.id == broadcast_id).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    broadcast.campaign_id = campaign_id
    db.commit()
    _ensure_email_stages(db, campaign_id)
    return {"ok": True, "campaign_id": campaign_id, "broadcast_id": broadcast_id}


@router.delete("/campaigns/{campaign_id}/broadcasts/{broadcast_id}/link", status_code=200)
async def unlink_broadcast_from_campaign(
    campaign_id: int,
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    """Отвязывает рассылку от кампании."""
    broadcast = db.query(EmailBroadcast).filter(
        EmailBroadcast.id == broadcast_id,
        EmailBroadcast.campaign_id == campaign_id,
    ).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не найдена или не привязана к этой кампании")
    broadcast.campaign_id = None
    db.flush()

    # If no more broadcasts linked, remove email stages that have no schools in them
    remaining = db.query(EmailBroadcast).filter(
        EmailBroadcast.campaign_id == campaign_id
    ).count()
    if remaining == 0:
        for stage_key in ("email_sent", "email_opened"):
            stage = db.query(CampaignStage).filter(
                CampaignStage.campaign_id == campaign_id,
                CampaignStage.key == stage_key,
            ).first()
            if not stage:
                continue
            occupied = db.query(SchoolCampaign).filter(
                SchoolCampaign.campaign_id == campaign_id,
                SchoolCampaign.stage == stage_key,
            ).count()
            if occupied == 0:
                db.delete(stage)

    db.commit()
    return {"ok": True}


@router.post("/campaigns/{campaign_id}/broadcasts/{broadcast_id}/sync", response_model=Dict[str, int])
async def sync_broadcast_campaign_stages(
    campaign_id: int,
    broadcast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("campaigns.manage")),
):
    """Ретроспективно синхронизирует этапы кампании по уже отправленной/открытой рассылке."""
    _require_campaign(db, campaign_id)
    broadcast = db.query(EmailBroadcast).filter(
        EmailBroadcast.id == broadcast_id,
        EmailBroadcast.campaign_id == campaign_id,
    ).first()
    if not broadcast:
        raise HTTPException(status_code=404, detail="Рассылка не привязана к этой кампании")

    _ensure_email_stages(db, campaign_id)

    from app.services.email_broadcast_service import _advance_campaign_stage

    from sqlalchemy import or_
    recipients = (
        db.query(EmailBroadcastRecipient)
        .filter(
            EmailBroadcastRecipient.broadcast_id == broadcast_id,
            EmailBroadcastRecipient.school_id.isnot(None),
            or_(
                EmailBroadcastRecipient.status.in_(["sent", "opened", "failed"]),
                EmailBroadcastRecipient.opened_at.isnot(None),
            ),
        )
        .all()
    )

    advanced_sent = 0
    advanced_opened = 0
    for r in recipients:
        if r.status in ("sent", "opened"):
            _advance_campaign_stage(db, campaign_id, r.school_id, "email_sent")
            advanced_sent += 1
        # Also advance to email_opened if opened_at is set but status didn't reach "opened"
        # (can happen with race conditions or if status was modified after open tracking)
        if r.status == "opened" or r.opened_at is not None:
            _advance_campaign_stage(db, campaign_id, r.school_id, "email_opened")
            advanced_opened += 1
    # Recalculate opened_count from actual DB data (fixes undercounting from race conditions)
    actual_opened = (
        db.query(EmailBroadcastRecipient)
        .filter(
            EmailBroadcastRecipient.broadcast_id == broadcast_id,
            EmailBroadcastRecipient.opened_at.isnot(None),
        )
        .count()
    )
    broadcast.opened_count = actual_opened
    db.commit()
    return {"advanced_sent": advanced_sent, "advanced_opened": advanced_opened}
