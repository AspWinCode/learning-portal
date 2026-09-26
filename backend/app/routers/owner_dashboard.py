from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User
from app.schemas.owner_dashboard import (
    AcademyMetricsRatingStudent,
    AcademyMetricsResponse,
    OwnerDashboardSummaryResponse,
)
from app.services.owner_dashboard import (
    build_academy_metrics,
    build_owner_dashboard_summary,
    list_students_by_rating,
)
from app.utils.datetime import utcnow

router = APIRouter()


@router.get("/summary", response_model=OwnerDashboardSummaryResponse)
async def get_owner_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_dashboard.access")),
):
    return build_owner_dashboard_summary(db)


@router.get("/academy-metrics", response_model=AcademyMetricsResponse)
async def get_academy_metrics(
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_dashboard.access")),
):
    now = utcnow()
    if date_from is not None:
        period_start = datetime(date_from.year, date_from.month, date_from.day)
    else:
        period_start = datetime(now.year, now.month, 1)
    if date_to is not None:
        period_end = datetime(date_to.year, date_to.month, date_to.day) + timedelta(days=1)
    else:
        if now.month == 12:
            period_end = datetime(now.year + 1, 1, 1)
        else:
            period_end = datetime(now.year, now.month + 1, 1)
    return build_academy_metrics(db, period_start=period_start, period_end=period_end)


@router.get("/academy-metrics/students", response_model=list[AcademyMetricsRatingStudent])
async def get_academy_metrics_rating_students(
    field: str = Query(..., description="grade | school"),
    label: str = Query(..., description="Значение строки рейтинга, как оно отображается в интерфейсе"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("owner_dashboard.access")),
):
    try:
        return list_students_by_rating(db, field_name=field, label=label)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
