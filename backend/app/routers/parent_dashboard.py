from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import User
from app.routers.action_log import log_action
from app.schemas.parent_dashboard import (
    OwnerWorkspaceWebPushStatusResponse,
    OwnerWorkspaceWebPushSubscriptionDelete,
    OwnerWorkspaceWebPushSubscriptionUpsert,
    ParentDashboardSummaryResponse,
    ParentQuestionCreate,
    ParentQuestionResponse,
)
from app.services.parent_dashboard import (
    build_parent_dashboard_summary,
    create_parent_question,
    get_parent_web_push_status,
    remove_parent_web_push_subscription,
    upsert_parent_web_push_subscription,
)

router = APIRouter()


def _require_parent(current_user: User) -> None:
    auth.ensure_permission(current_user, "parent_dashboard.access")


@router.get("/summary", response_model=ParentDashboardSummaryResponse)
async def get_parent_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_parent(current_user)
    return build_parent_dashboard_summary(db, current_user.id)


@router.post("/questions", response_model=ParentQuestionResponse)
async def create_dashboard_question(
    payload: ParentQuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_parent(current_user)
    try:
        row = await create_parent_question(
            db,
            parent_user=current_user,
            student_id=payload.student_id,
            topic=payload.topic,
            message=payload.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    log_action(db, current_user.id, "create", "parent_question", row.id)
    return row


@router.get("/me/web-push", response_model=OwnerWorkspaceWebPushStatusResponse)
async def get_parent_dashboard_web_push_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_parent(current_user)
    return OwnerWorkspaceWebPushStatusResponse.model_validate(
        get_parent_web_push_status(db, current_user.id)
    )


@router.post("/me/web-push/subscriptions", response_model=OwnerWorkspaceWebPushStatusResponse)
async def upsert_parent_dashboard_web_push_subscription(
    payload: OwnerWorkspaceWebPushSubscriptionUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_parent(current_user)
    if not payload.endpoint.strip():
        raise HTTPException(status_code=400, detail="Endpoint is required")
    return OwnerWorkspaceWebPushStatusResponse.model_validate(
        upsert_parent_web_push_subscription(
            db,
            user_id=current_user.id,
            endpoint=payload.endpoint.strip(),
            p256dh=payload.p256dh.strip(),
            auth=payload.auth.strip(),
            user_agent=(payload.user_agent or "").strip() or None,
        )
    )


@router.post("/me/web-push/subscriptions/remove", response_model=OwnerWorkspaceWebPushStatusResponse)
async def remove_parent_dashboard_web_push_subscription(
    payload: OwnerWorkspaceWebPushSubscriptionDelete,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    _require_parent(current_user)
    return OwnerWorkspaceWebPushStatusResponse.model_validate(
        remove_parent_web_push_subscription(
            db,
            user_id=current_user.id,
            endpoint=payload.endpoint.strip(),
        )
    )
