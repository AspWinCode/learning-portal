from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User
from app.schemas import TrainerCockpitSummaryResponse
from app.services.trainer_cockpit import build_trainer_cockpit_summary

router = APIRouter()


@router.get("/summary", response_model=TrainerCockpitSummaryResponse)
async def get_trainer_cockpit_summary(
    summary_date: Optional[date] = Query(None, description="Reference date for the cockpit"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("trainer_cockpit.access")),
):
    return build_trainer_cockpit_summary(
        db,
        current_user=current_user,
        today=summary_date,
    )
