"""AI Studio — консультационный/аналитический «мозг» над общим ai_gateway.

Это read-only режим: workspaces (бренд-контекст направления), knowledge base,
consult (спросить/проанализировать направление в контексте его бренд-профиля
и базы знаний), простая аналитика. Генерация постов, шаблоны, контент-план,
визуалы и публикация в соцсети — отдельный модуль smm_projects
(app/routers/smm_projects.py), который не привязан к направлениям AI Studio.

Academy AI (/api/v1/academy-ai) не трогаем — у него свой контур, свои модели,
свои права (academy_ai.*). Здесь только генерика для новых направлений.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import AiKnowledgeItem, AiWorkspace, User
from app.routers.action_log import log_action
from app.schemas.ai_studio import (
    BrandContextFieldOut,
    ConsultRequest,
    DialogDetail,
    DialogOut,
    KnowledgeItemCreate,
    KnowledgeItemList,
    KnowledgeItemOut,
    KnowledgeItemUpdate,
    MessageOut,
    ReindexResult,
    WorkspaceAnalyticsOut,
    WorkspaceListItem,
    WorkspaceOut,
    WorkspaceUpdate,
)
from app.services.ai_studio import access as access_svc
from app.services.ai_studio import analytics as analytics_svc
from app.services.ai_studio import consult as consult_svc
from app.services.ai_studio import knowledge as knowledge_svc
from app.services.ai_studio import workspaces as workspaces_svc

router = APIRouter()


def _get_workspace_or_404(db: Session, code: str) -> AiWorkspace:
    workspace = workspaces_svc.get_by_code(db, code)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Направление не найдено")
    return workspace


def _get_accessible_workspace(db: Session, code: str, user: User) -> AiWorkspace:
    workspace = _get_workspace_or_404(db, code)
    access_svc.ensure_workspace_access(db, user, workspace)
    return workspace


def _get_knowledge_item_or_404(db: Session, workspace: AiWorkspace, item_id: int) -> AiKnowledgeItem:
    item = (
        db.query(AiKnowledgeItem)
        .filter(AiKnowledgeItem.id == item_id, AiKnowledgeItem.workspace_id == workspace.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись базы знаний не найдена")
    return item


# ─── Workspaces ──────────────────────────────────────────────────────────

@router.get("/workspaces", response_model=List[WorkspaceListItem])
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    all_workspaces = workspaces_svc.list_workspaces(db)
    return [w for w in all_workspaces if access_svc.can_access_workspace(db, current_user, w)]


@router.get("/workspaces/{code}", response_model=WorkspaceOut)
def get_workspace(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    return _get_accessible_workspace(db, code, current_user)


@router.patch("/workspaces/{code}", response_model=WorkspaceOut)
def update_workspace(
    code: str,
    payload: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_workspace")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    updated = workspaces_svc.update_workspace(db, workspace, payload.model_dump(exclude_unset=True))
    log_action(db, current_user.id, "update", "ai_workspace", workspace.id, {"code": code})
    return updated


@router.get("/brand-context-fields", response_model=List[BrandContextFieldOut])
def get_brand_context_fields(
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    return workspaces_svc.BRAND_CONTEXT_FIELDS


# ─── Knowledge base ─────────────────────────────────────────────────────

@router.get("/workspaces/{code}/knowledge", response_model=KnowledgeItemList)
def list_knowledge(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    items = knowledge_svc.list_items(db, workspace)
    return KnowledgeItemList(items=items, total=len(items))


@router.post("/workspaces/{code}/knowledge", response_model=KnowledgeItemOut, status_code=status.HTTP_201_CREATED)
def create_knowledge(
    code: str,
    payload: KnowledgeItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_knowledge")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    item = knowledge_svc.create_item(db, workspace, payload.model_dump(), user_id=current_user.id)
    log_action(db, current_user.id, "create", "ai_knowledge_item", item.id, {"workspace": code, "title": item.title})
    return item


@router.patch("/workspaces/{code}/knowledge/{item_id}", response_model=KnowledgeItemOut)
def update_knowledge(
    code: str,
    item_id: int,
    payload: KnowledgeItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_knowledge")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    item = _get_knowledge_item_or_404(db, workspace, item_id)
    updated = knowledge_svc.update_item(db, item, payload.model_dump(exclude_unset=True))
    log_action(db, current_user.id, "update", "ai_knowledge_item", item_id, {"workspace": code})
    return updated


@router.delete("/workspaces/{code}/knowledge/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge(
    code: str,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_knowledge")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    item = _get_knowledge_item_or_404(db, workspace, item_id)
    knowledge_svc.delete_item(db, item)
    log_action(db, current_user.id, "archive", "ai_knowledge_item", item_id, {"workspace": code})


@router.post("/workspaces/{code}/knowledge/reindex", response_model=ReindexResult)
async def reindex_knowledge(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_knowledge")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    result = await knowledge_svc.index_pending(db, workspace, user_id=current_user.id)
    return ReindexResult(**result)


# ─── Consult (chat / analyze) ────────────────────────────────────────────

@router.get("/workspaces/{code}/dialogs", response_model=List[DialogOut])
def list_dialogs(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return consult_svc.list_dialogs(db, workspace, current_user.id)


@router.get("/workspaces/{code}/dialogs/{dialog_id}", response_model=DialogDetail)
def get_dialog(
    code: str,
    dialog_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    dialog = consult_svc.get_dialog(db, workspace, dialog_id)
    if dialog is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диалог не найден")
    return dialog


@router.post("/workspaces/{code}/consult", response_model=MessageOut)
async def consult(
    code: str,
    payload: ConsultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    try:
        message = await consult_svc.ask(
            db, current_user, workspace=workspace, message=payload.message, dialog_id=payload.dialog_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "ai_message", message.id, {"workspace": code, "dialog_id": message.dialog_id})
    return message


# ─── Analytics ───────────────────────────────────────────────────────────

@router.get("/workspaces/{code}/analytics", response_model=WorkspaceAnalyticsOut)
def get_workspace_analytics(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return analytics_svc.workspace_summary(db, workspace)
