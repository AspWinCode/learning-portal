"""Campaigns and SchoolCampaigns API. Owner only."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app import auth
from app.database import get_db
from app.models import B2BSchool, Campaign, SchoolCampaign, Task, TaskStatus, User
from app.schemas import (
    CampaignCreate,
    CampaignResponse,
    CampaignUpdate,
    SchoolCampaignResponse,
    SchoolCampaignUpdate,
)

router = APIRouter()


class AddSchoolsBody(BaseModel):
    school_ids: List[int]
    create_contact_task: bool = True


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


def _school_campaign_to_response(sc: SchoolCampaign) -> SchoolCampaignResponse:
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
    )


@router.get("/campaigns", response_model=List[CampaignResponse])
async def list_campaigns(
    status: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    type_: Optional[str] = Query(None, alias="type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
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
    current_user: User = Depends(auth.require_role(["owner"])),
):
    sc = db.query(SchoolCampaign).filter(
        SchoolCampaign.id == sc_id, SchoolCampaign.campaign_id == campaign_id
    ).first()
    if not sc:
        raise HTTPException(status_code=404, detail="SchoolCampaign not found")
    db.delete(sc)
    db.commit()
