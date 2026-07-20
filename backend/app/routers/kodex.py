from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import KodexCase, User
from app.routers.action_log import log_action
from app.schemas.kodex import (
    KodexCaseCreate,
    KodexCaseResponse,
    KodexCaseSummary,
    KodexCaseUpdate,
)

router = APIRouter()

VALID_STATUSES = {"draft", "in_review", "approved", "changes_requested"}


def _get_case_or_404(db: Session, case_id: int) -> KodexCase:
    case = db.query(KodexCase).filter(KodexCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Дело не найдено")
    return case


@router.get("/", response_model=List[KodexCaseSummary])
async def list_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.access")),
):
    return db.query(KodexCase).order_by(KodexCase.created_at.desc()).all()


@router.post("/", response_model=KodexCaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: KodexCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
):
    existing = db.query(KodexCase).filter(KodexCase.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Дело с таким идентификатором уже существует")

    case = KodexCase(
        **payload.model_dump(),
        created_by_id=current_user.id,
        status="draft",
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    log_action(db, current_user.id, "create", "kodex_case", case.id, {"slug": case.slug, "title": case.title})
    return case


@router.get("/{case_id}", response_model=KodexCaseResponse)
async def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.access")),
):
    return _get_case_or_404(db, case_id)


@router.put("/{case_id}", response_model=KodexCaseResponse)
async def update_case(
    case_id: int,
    payload: KodexCaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
):
    case = _get_case_or_404(db, case_id)

    update_data = payload.model_dump(exclude_unset=True)

    if "slug" in update_data and update_data["slug"] != case.slug:
        conflict = db.query(KodexCase).filter(KodexCase.slug == update_data["slug"]).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Дело с таким идентификатором уже существует")

    if "status" in update_data and update_data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {', '.join(VALID_STATUSES)}")

    for field, value in update_data.items():
        setattr(case, field, value)

    db.commit()
    db.refresh(case)
    log_action(db, current_user.id, "update", "kodex_case", case.id, update_data)
    return case


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("kodex.manage")),
):
    case = _get_case_or_404(db, case_id)
    db.delete(case)
    db.commit()
    log_action(db, current_user.id, "delete", "kodex_case", case_id, {"slug": case.slug})
