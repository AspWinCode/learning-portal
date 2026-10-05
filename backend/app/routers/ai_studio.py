"""AI Studio — многонаправленная ИИ-платформа над общим ai_gateway.

Phase 1: workspaces (список/бренд-профиль), knowledge base, content templates,
generate, content list/update, transform (быстрые AI-действия).
Phase 2: content-plan, event-pack, мультиканальные варианты (variant).
Phase 3: семантический поиск по базе знаний, генерация визуалов, публикация
в соцсети (только по явному клику человека — см. services/publishing.py),
простая аналитика по направлению.

Academy AI (/api/v1/academy-ai) не трогаем — у него свой контур, свои модели,
свои права (academy_ai.*). Здесь только генерика для новых направлений.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import (
    AiContentPlan,
    AiContentPlanItem,
    AiGeneratedContent,
    AiKnowledgeItem,
    AiWorkspace,
    User,
)
from app.routers.action_log import log_action
from app.schemas.ai_studio import (
    AssetOut,
    BrandContextFieldOut,
    ChannelStatusOut,
    ContentList,
    ContentOut,
    ContentPlanCreate,
    ContentPlanGenerateRequest,
    ContentPlanItemCreate,
    ContentPlanItemOut,
    ContentPlanItemUpdate,
    ContentPlanOut,
    ContentUpdate,
    EventPackRequest,
    EventPackResult,
    GenerateRequest,
    KnowledgeItemCreate,
    KnowledgeItemList,
    KnowledgeItemOut,
    KnowledgeItemUpdate,
    PublishLogOut,
    PublishRequest,
    ReindexResult,
    RenderImageRequest,
    TemplateOut,
    TransformRequest,
    VariantRequest,
    WorkspaceAnalyticsOut,
    WorkspaceListItem,
    WorkspaceOut,
    WorkspaceUpdate,
)
from app.services.ai_studio import access as access_svc
from app.services.ai_studio import analytics as analytics_svc
from app.services.ai_studio import assets as assets_svc
from app.services.ai_studio import content_plan as content_plan_svc
from app.services.ai_studio import generation
from app.services.ai_studio import knowledge as knowledge_svc
from app.services.ai_studio import publishing as publishing_svc
from app.services.ai_studio import templates as templates_svc
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
    workspace = _get_accessible_workspace(db, code, current_user)
    return workspace


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


# ─── Templates ───────────────────────────────────────────────────────────

@router.get("/workspaces/{code}/templates", response_model=List[TemplateOut])
def list_templates(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return templates_svc.list_templates(db, workspace)


# ─── Generate ────────────────────────────────────────────────────────────

@router.post("/workspaces/{code}/generate", response_model=ContentOut)
async def generate_content(
    code: str,
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    template = templates_svc.get_by_code(db, workspace, payload.template_code)
    if template is None or not template.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")
    try:
        content = await generation.generate(db, current_user, workspace=workspace, template=template, input_data=payload.input_data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "ai_generated_content", content.id, {"workspace": code, "template": payload.template_code})
    return content


# ─── Content ─────────────────────────────────────────────────────────────

@router.get("/content", response_model=ContentList)
def list_content(
    workspace: str = Query(..., description="Код направления"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    ws = _get_accessible_workspace(db, workspace, current_user)
    q = db.query(AiGeneratedContent).filter(AiGeneratedContent.workspace_id == ws.id)
    if status_filter:
        q = q.filter(AiGeneratedContent.status == status_filter)
    items = q.order_by(AiGeneratedContent.created_at.desc()).limit(200).all()
    return ContentList(items=items, total=len(items))


def _get_content_or_404(db: Session, content_id: int) -> AiGeneratedContent:
    content = db.query(AiGeneratedContent).filter(AiGeneratedContent.id == content_id).first()
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Материал не найден")
    return content


@router.get("/content/{content_id}", response_model=ContentOut)
def get_content(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    content = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == content.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    return content


@router.patch("/content/{content_id}", response_model=ContentOut)
def update_content(
    content_id: int,
    payload: ContentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_content")),
):
    content = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == content.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in ("draft", "approved", "archived"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Недопустимый статус")
    for field, value in updates.items():
        setattr(content, field, value)
    db.commit()
    db.refresh(content)
    log_action(db, current_user.id, "update", "ai_generated_content", content_id, updates)
    return content


@router.post("/content/{content_id}/transform", response_model=ContentOut)
async def transform_content(
    content_id: int,
    payload: TransformRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    source = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == source.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    try:
        content = await generation.transform(
            db, current_user, workspace=workspace, source=source, action=payload.action, channel=payload.channel
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "ai_generated_content", content.id, {"source": content_id, "action": payload.action})
    return content


@router.post("/content/{content_id}/variant", response_model=ContentOut)
async def create_content_variant(
    content_id: int,
    payload: VariantRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    source = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == source.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    content = await generation.create_variant(db, current_user, workspace=workspace, source=source, channel=payload.channel)
    log_action(db, current_user.id, "create", "ai_generated_content", content.id, {"source": content_id, "variant_channel": payload.channel})
    return content


@router.get("/content/{content_id}/related", response_model=List[ContentOut])
def list_related_content(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    """Остальные материалы той же «семьи» (мультиканальные версии / пакет по
    событию) — все строки с тем же group_key, кроме самой запрошенной."""
    source = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == source.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    if not source.group_key:
        return []
    return (
        db.query(AiGeneratedContent)
        .filter(AiGeneratedContent.group_key == source.group_key, AiGeneratedContent.id != source.id)
        .order_by(AiGeneratedContent.created_at)
        .all()
    )


# ─── Event pack ("Создать материалы по событию", п.12 ТЗ) ─────────────────

@router.post("/workspaces/{code}/event-pack", response_model=EventPackResult)
async def create_event_pack(
    code: str,
    payload: EventPackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    items = await generation.event_pack(db, current_user, workspace=workspace, event_data=payload.event_data)
    log_action(db, current_user.id, "create", "ai_event_pack", None, {"workspace": code, "count": len(items)})
    return EventPackResult(group_key=items[0].group_key, items=items)


# ─── Content plan ("Контент-план", п.11 ТЗ) ────────────────────────────────

def _get_plan_or_404(db: Session, workspace: AiWorkspace, plan_id: int) -> AiContentPlan:
    plan = content_plan_svc.get_plan(db, workspace, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Контент-план не найден")
    return plan


def _get_plan_item_or_404(db: Session, plan: AiContentPlan, item_id: int) -> AiContentPlanItem:
    item = (
        db.query(AiContentPlanItem)
        .filter(AiContentPlanItem.id == item_id, AiContentPlanItem.plan_id == plan.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пункт плана не найден")
    return item


@router.get("/workspaces/{code}/content-plans", response_model=List[ContentPlanOut])
def list_content_plans(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return content_plan_svc.list_plans(db, workspace)


@router.post("/workspaces/{code}/content-plans", response_model=ContentPlanOut, status_code=status.HTTP_201_CREATED)
def create_content_plan(
    code: str,
    payload: ContentPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    plan = content_plan_svc.create_plan(
        db, workspace, current_user, name=payload.name, date_from=payload.date_from, date_to=payload.date_to
    )
    log_action(db, current_user.id, "create", "ai_content_plan", plan.id, {"workspace": code})
    return plan


@router.get("/workspaces/{code}/content-plans/{plan_id}", response_model=ContentPlanOut)
def get_content_plan(
    code: str,
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return _get_plan_or_404(db, workspace, plan_id)


@router.post("/workspaces/{code}/content-plans/{plan_id}/items", response_model=ContentPlanItemOut, status_code=status.HTTP_201_CREATED)
def add_content_plan_item(
    code: str,
    plan_id: int,
    payload: ContentPlanItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    plan = _get_plan_or_404(db, workspace, plan_id)
    return content_plan_svc.add_item(db, plan, payload.model_dump())


@router.post("/workspaces/{code}/content-plans/{plan_id}/generate-items", response_model=List[ContentPlanItemOut])
async def generate_content_plan_items(
    code: str,
    plan_id: int,
    payload: ContentPlanGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    plan = _get_plan_or_404(db, workspace, plan_id)
    try:
        items = await content_plan_svc.generate_items(
            db, current_user, workspace=workspace, plan=plan,
            count=payload.count, channels=payload.channels, goals=payload.goals, important_events=payload.important_events,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "ai_content_plan_items", plan.id, {"workspace": code, "count": len(items)})
    return items


@router.patch("/content-plan-items/{item_id}", response_model=ContentPlanItemOut)
def update_content_plan_item(
    item_id: int,
    payload: ContentPlanItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_content")),
):
    item = db.query(AiContentPlanItem).filter(AiContentPlanItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пункт плана не найден")
    plan = db.query(AiContentPlan).filter(AiContentPlan.id == item.plan_id).first()
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == plan.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    try:
        updated = content_plan_svc.update_item(db, item, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return updated


@router.delete("/content-plan-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_content_plan_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_content")),
):
    item = db.query(AiContentPlanItem).filter(AiContentPlanItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пункт плана не найден")
    plan = db.query(AiContentPlan).filter(AiContentPlan.id == item.plan_id).first()
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == plan.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    content_plan_svc.delete_item(db, item)


# ─── Knowledge search / reindex (Phase 3, п.22) ────────────────────────────

@router.post("/workspaces/{code}/knowledge/reindex", response_model=ReindexResult)
async def reindex_knowledge(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.manage_knowledge")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    result = await knowledge_svc.index_pending(db, workspace, user_id=current_user.id)
    return ReindexResult(**result)


# ─── Assets / image generation (Phase 3, п.27) ─────────────────────────────

@router.post("/content/{content_id}/render-image", response_model=AssetOut)
async def render_content_image(
    content_id: int,
    payload: RenderImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.generate")),
):
    content = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == content.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    try:
        asset = await assets_svc.render_image(db, current_user, workspace=workspace, content=content, prompt=payload.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "ai_generated_asset", asset.id, {"content_id": content_id})
    return asset


@router.get("/content/{content_id}/assets", response_model=List[AssetOut])
def list_content_assets(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    content = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == content.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    return assets_svc.list_assets(db, content)


# ─── Publishing (Phase 3) — только по явному клику человека ───────────────

@router.get("/workspaces/{code}/publish-channels", response_model=List[ChannelStatusOut])
def list_publish_channels(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return [
        ChannelStatusOut(channel=ch, configured=publishing_svc.is_channel_configured(ch, workspace.code))
        for ch in publishing_svc.SUPPORTED_CHANNELS
    ]


@router.post("/content/{content_id}/publish", response_model=PublishLogOut)
async def publish_content(
    content_id: int,
    payload: PublishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.publish")),
):
    content = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == content.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    try:
        log = await publishing_svc.publish(db, current_user, workspace=workspace, content=content, channel=payload.channel)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "ai_publish_log", log.id, {"content_id": content_id, "channel": payload.channel})
    return log


@router.get("/content/{content_id}/publish-logs", response_model=List[PublishLogOut])
def list_content_publish_logs(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    content = _get_content_or_404(db, content_id)
    workspace = db.query(AiWorkspace).filter(AiWorkspace.id == content.workspace_id).first()
    access_svc.ensure_workspace_access(db, current_user, workspace)
    return publishing_svc.list_publish_logs(db, content)


# ─── Analytics (Phase 3, п.28) ──────────────────────────────────────────────

@router.get("/workspaces/{code}/analytics", response_model=WorkspaceAnalyticsOut)
def get_workspace_analytics(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("ai_studio.access")),
):
    workspace = _get_accessible_workspace(db, code, current_user)
    return analytics_svc.workspace_summary(db, workspace)
