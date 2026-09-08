from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User, UserRole
from app.schemas.admin_dashboard import AdminDashboardSummaryResponse
from app.services.admin_dashboard import build_admin_dashboard_summary

router = APIRouter()

_ALLOWED_ROLES = {UserRole.ADMIN, UserRole.OWNER}
_ALLOWED_PERMISSIONS = ("users.access", "owner_dashboard.access", "students.access")


def _require_admin_home(current_user: User = Depends(auth.get_current_active_user)) -> User:
    if auth.resolve_effective_role(current_user) in _ALLOWED_ROLES:
        return current_user
    if any(auth.has_permission(current_user, perm) for perm in _ALLOWED_PERMISSIONS):
        return current_user
    raise HTTPException(status_code=403, detail="Not enough permissions")


@router.get("/summary", response_model=AdminDashboardSummaryResponse)
async def get_admin_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin_home),
):
    return build_admin_dashboard_summary(db)
