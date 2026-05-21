from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User
from app.schemas import OwnerDashboardSummaryResponse
from app.services.owner_dashboard import build_owner_dashboard_summary

router = APIRouter()


@router.get("/summary", response_model=OwnerDashboardSummaryResponse)
async def get_owner_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_dashboard.access")),
):
    return build_owner_dashboard_summary(db)
