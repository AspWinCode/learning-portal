from datetime import date, datetime, timedelta, time as dt_time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, nulls_last
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import B2BSchool, B2BSchoolContact, B2BProject, Lead, LeadStatus, User, UserRole
from app.schemas import (
    B2BSchoolCreate,
    B2BSchoolUpdate,
    B2BSchoolResponse,
    B2BSchoolContactCreate,
    B2BSchoolContactUpdate,
    B2BSchoolContactResponse,
    B2BProjectCreate,
    B2BProjectUpdate,
    B2BProjectResponse,
)

router = APIRouter()


def _leads_count_and_conversion(db: Session, school_id: int) -> Tuple[int, float]:
    total = db.query(Lead).filter(Lead.b2b_school_id == school_id).count()
    if total == 0:
        return 0, 0.0
    won = db.query(Lead).filter(
        Lead.b2b_school_id == school_id,
        Lead.status == LeadStatus.WON,
    ).count()
    return total, round(100.0 * won / total, 1)


def _school_to_response(db: Session, school: B2BSchool) -> B2BSchoolResponse:
    leads_count, conversion_percent = _leads_count_and_conversion(db, school.id)
    contacts = [
        B2BSchoolContactResponse(
            id=c.id,
            b2b_school_id=c.b2b_school_id,
            full_name=c.full_name,
            position=c.position,
            phone=c.phone,
            phone_extra=c.phone_extra,
            created_at=c.created_at,
        )
        for c in school.school_contacts
    ]
    manager_name = school.manager.full_name if school.manager else None
    return B2BSchoolResponse(
        id=school.id,
        name=school.name,
        director=school.director,
        city=school.city,
        address=school.address,
        student_count=school.student_count,
        friendship_degree=school.friendship_degree,
        pipeline_stage=school.pipeline_stage,
        next_step=school.next_step,
        next_step_date=school.next_step_date,
        manager_id=school.manager_id,
        manager_full_name=manager_name,
        event_dates=school.event_dates,
        meeting_scheduled_at=school.meeting_scheduled_at,
        meeting_outcomes=school.meeting_outcomes,
        walkthrough_scheduled_at=school.walkthrough_scheduled_at,
        created_at=school.created_at,
        updated_at=school.updated_at,
        leads_count=leads_count,
        conversion_percent=conversion_percent,
        contacts=contacts,
    )


@router.get("/b2b-schools/cities", response_model=List[str])
async def list_b2b_school_cities(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """╨б╨┐╨╕╤Б╨╛╨║ ╨│╨╛╤А╨╛╨┤╨╛╨▓, ╨▓ ╨║╨╛╤В╨╛╤А╤Л╤Е ╨╡╤Б╤В╤М B2B ╤И╨║╨╛╨╗╤Л (╨┤╨╗╤П ╨▓╤Л╨▒╨╛╤А╨░ ╨┐╤А╨╕ ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╨╕ ╤И╨║╨╛╨╗ ╨▓ ╨▓╨╛╤А╨╛╨╜╨║╤Г)."""
    rows = db.query(distinct(B2BSchool.city)).filter(B2BSchool.city.isnot(None)).filter(B2BSchool.city != "").order_by(B2BSchool.city).all()
    return [r[0] for r in rows if r[0] and r[0].strip()]


@router.get("/b2b-schools/managers", response_model=List[Dict[str, Any]])
async def list_b2b_managers(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """List sales users for assigning as school manager."""
    users = db.query(User).filter(User.role == UserRole.SALES, User.is_active == True).order_by(User.full_name).all()
    return [{"id": u.id, "full_name": u.full_name} for u in users]


@router.get("/b2b-schools/plan-for-today", response_model=Dict[str, List[B2BSchoolResponse]])
async def plan_for_today(
    city: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    """Schools for owner's daily plan: overdue, no next step, find_contacts > 3 days, today follow-up."""
    today = date.today()
    cutoff = today - timedelta(days=3)
    base = db.query(B2BSchool).options(
        joinedload(B2BSchool.school_contacts),
        joinedload(B2BSchool.manager),
    )
    if city and city.strip():
        base = base.filter(B2BSchool.city == city.strip())

    def run(q):
        return [_school_to_response(db, s) for s in q.order_by(nulls_last(B2BSchool.next_step_date.asc()), B2BSchool.name).all()]

    overdue = base.filter(B2BSchool.next_step_date.isnot(None), B2BSchool.next_step_date < today)
    no_next = base.filter((B2BSchool.next_step.is_(None)) | (B2BSchool.next_step_date.is_(None)))
    from sqlalchemy import or_
    cutoff_ts = datetime.combine(cutoff, dt_time.min)
    find_stale = base.filter(
        B2BSchool.pipeline_stage == "find_contacts",
        or_(
            B2BSchool.updated_at < cutoff_ts,
            (B2BSchool.updated_at.is_(None)) & (B2BSchool.created_at < cutoff_ts),
        ),
    )
    today_q = base.filter(B2BSchool.next_step_date == today)

    return {
        "overdue": run(overdue),
        "no_next_step": run(no_next),
        "find_contacts_stale": run(find_stale),
        "today": run(today_q),
    }


@router.get("/b2b-schools", response_model=List[B2BSchoolResponse])
async def list_b2b_schools(
    pipeline_stage: Optional[str] = Query(default=None),
    project_id: Optional[int] = Query(default=None),
    city: Optional[str] = Query(default=None, description="╨д╨╕╨╗╤М╤В╤А ╨┐╨╛ ╨│╨╛╤А╨╛╨┤╤Г"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    query = db.query(B2BSchool).options(
        joinedload(B2BSchool.school_contacts),
        joinedload(B2BSchool.manager),
    ).order_by(B2BSchool.created_at.desc())
    if project_id is not None:
        project = db.query(B2BProject).filter(B2BProject.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        cities: List[str] = []
        if project.main_city:
            cities.append(project.main_city)
        if isinstance(project.cities, list):
            cities.extend([c for c in project.cities if isinstance(c, str)])
        # ╨╜╨╛╤А╨╝╨░╨╗╨╕╨╖╤Г╨╡╨╝ ╨│╨╛╤А╨╛╨┤╨░
        cities = [c.strip() for c in cities if c and isinstance(c, str)]
        if cities:
            query = query.filter(B2BSchool.city.in_(cities))
    if city is not None and city.strip():
        query = query.filter(B2BSchool.city == city.strip())
    if pipeline_stage is not None:
        query = query.filter(B2BSchool.pipeline_stage == pipeline_stage)
    schools = query.all()
    return [_school_to_response(db, s) for s in schools]


def _load_school_with_contacts(db: Session, school_id: int) -> B2BSchool:
    school = db.query(B2BSchool).options(
        joinedload(B2BSchool.school_contacts),
        joinedload(B2BSchool.manager),
    ).filter(B2BSchool.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    _ = school.school_contacts
    return school


@router.get("/b2b-schools/{school_id}", response_model=B2BSchoolResponse)
async def get_b2b_school(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    school = _load_school_with_contacts(db, school_id)
    return _school_to_response(db, school)


@router.post("/b2b-schools", response_model=B2BSchoolResponse, status_code=201)
async def create_b2b_school(
    payload: B2BSchoolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    school = B2BSchool(
        name=payload.name,
        director=payload.director,
        address=payload.address,
        city=payload.city,
        student_count=payload.student_count,
        friendship_degree=payload.friendship_degree.value if payload.friendship_degree else None,
        pipeline_stage=payload.pipeline_stage.value,
        next_step=payload.next_step,
        next_step_date=payload.next_step_date,
        manager_id=payload.manager_id,
        event_dates=payload.event_dates,
        meeting_scheduled_at=payload.meeting_scheduled_at,
        meeting_outcomes=payload.meeting_outcomes,
        walkthrough_scheduled_at=payload.walkthrough_scheduled_at,
    )
    db.add(school)
    db.commit()
    db.refresh(school)
    _ = school.school_contacts
    return _school_to_response(db, school)


@router.put("/b2b-schools/{school_id}", response_model=B2BSchoolResponse)
async def update_b2b_school(
    school_id: int,
    payload: B2BSchoolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    school = _load_school_with_contacts(db, school_id)
    data = payload.dict(exclude_unset=True)
    if "pipeline_stage" in data and data["pipeline_stage"] is not None:
        data["pipeline_stage"] = data["pipeline_stage"].value
    if "friendship_degree" in data and data["friendship_degree"] is not None:
        data["friendship_degree"] = data["friendship_degree"].value
    for key, value in data.items():
        setattr(school, key, value)
    db.commit()
    db.refresh(school)
    _ = school.school_contacts
    return _school_to_response(db, school)


@router.delete("/b2b-schools/{school_id}", status_code=204)
async def delete_b2b_school(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    school = db.query(B2BSchool).filter(B2BSchool.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    db.delete(school)
    db.commit()
    return None


@router.get("/b2b-schools/{school_id}/contacts", response_model=List[B2BSchoolContactResponse])
async def list_school_contacts(
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    school = _load_school_with_contacts(db, school_id)
    return [
        B2BSchoolContactResponse(
            id=c.id,
            b2b_school_id=c.b2b_school_id,
            full_name=c.full_name,
            position=c.position,
            phone=c.phone,
            phone_extra=c.phone_extra,
            created_at=c.created_at,
        )
        for c in school.school_contacts
    ]


@router.post("/b2b-schools/{school_id}/contacts", response_model=B2BSchoolContactResponse, status_code=201)
async def create_school_contact(
    school_id: int,
    payload: B2BSchoolContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    school = db.query(B2BSchool).filter(B2BSchool.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    contact = B2BSchoolContact(
        b2b_school_id=school_id,
        full_name=payload.full_name,
        position=payload.position,
        phone=payload.phone,
        phone_extra=payload.phone_extra,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return B2BSchoolContactResponse(
        id=contact.id,
        b2b_school_id=contact.b2b_school_id,
        full_name=contact.full_name,
        position=contact.position,
        phone=contact.phone,
        phone_extra=contact.phone_extra,
        created_at=contact.created_at,
    )


@router.put("/b2b-schools/{school_id}/contacts/{contact_id}", response_model=B2BSchoolContactResponse)
async def update_school_contact(
    school_id: int,
    contact_id: int,
    payload: B2BSchoolContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    contact = db.query(B2BSchoolContact).filter(
        B2BSchoolContact.id == contact_id,
        B2BSchoolContact.b2b_school_id == school_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    return B2BSchoolContactResponse(
        id=contact.id,
        b2b_school_id=contact.b2b_school_id,
        full_name=contact.full_name,
        position=contact.position,
        phone=contact.phone,
        phone_extra=contact.phone_extra,
        created_at=contact.created_at,
    )


@router.delete("/b2b-schools/{school_id}/contacts/{contact_id}", status_code=204)
async def delete_school_contact(
    school_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    contact = db.query(B2BSchoolContact).filter(
        B2BSchoolContact.id == contact_id,
        B2BSchoolContact.b2b_school_id == school_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return None


@router.get("/b2b-projects", response_model=List[B2BProjectResponse])
async def list_b2b_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    projects = db.query(B2BProject).order_by(B2BProject.created_at.desc()).all()
    return [
        B2BProjectResponse(
            id=p.id,
            name=p.name,
            location=p.location,
            main_city=p.main_city,
            cities=p.cities or [],
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in projects
    ]


@router.post("/b2b-projects", response_model=B2BProjectResponse, status_code=201)
async def create_b2b_project(
    payload: B2BProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    project = B2BProject(
        name=payload.name,
        location=payload.location,
        main_city=payload.main_city,
        cities=payload.cities,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return B2BProjectResponse(
        id=project.id,
        name=project.name,
        location=project.location,
        main_city=project.main_city,
        cities=project.cities or [],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/b2b-projects/{project_id}", response_model=B2BProjectResponse)
async def get_b2b_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    project = db.query(B2BProject).filter(B2BProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return B2BProjectResponse(
        id=project.id,
        name=project.name,
        location=project.location,
        main_city=project.main_city,
        cities=project.cities or [],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.put("/b2b-projects/{project_id}", response_model=B2BProjectResponse)
async def update_b2b_project(
    project_id: int,
    payload: B2BProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    project = db.query(B2BProject).filter(B2BProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return B2BProjectResponse(
        id=project.id,
        name=project.name,
        location=project.location,
        main_city=project.main_city,
        cities=project.cities or [],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.delete("/b2b-projects/{project_id}", status_code=204)
async def delete_b2b_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["owner"])),
):
    project = db.query(B2BProject).filter(B2BProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return None
