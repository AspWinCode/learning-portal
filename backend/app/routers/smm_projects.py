"""SMM-проекты — автопостинг в соцсети, отдельный модуль от AI Studio.

Project — независимая сущность (не привязана к AiWorkspace/направлениям AI
Studio). Поток: создать проект → загрузить контекст (знания/бренд-профиль) →
настроить каналы публикации → собрать контент-план → включить периодичность
→ дальше система генерирует и публикует материалы автоматически (approve
публикации/плана — явное действие человека, которое включает автоматизацию;
сама доставка в канал идёт по расписанию без дополнительного клика —
см. services/smm_projects/publishing.py и content_plan.py).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import auth
from app.database import get_db
from app.models import SmmContent, SmmContentPlan, SmmContentPlanItem, SmmKnowledgeItem, SmmProject, User
from app.routers.action_log import log_action
from app.schemas.smm_projects import (
    AssetOut,
    BrandContextFieldOut,
    ChannelConfigSet,
    ChannelStatusOut,
    ContentList,
    ContentOut,
    ContentPlanCreate,
    ContentPlanGenerateRequest,
    ContentPlanItemCreate,
    ContentPlanItemOut,
    ContentPlanItemUpdate,
    ContentPlanOut,
    ContentPlanUpdate,
    ContentUpdate,
    EventPackRequest,
    EventPackResult,
    GenerateRequest,
    KnowledgeItemCreate,
    KnowledgeItemList,
    KnowledgeItemOut,
    KnowledgeItemUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectOut,
    ProjectUpdate,
    PublicationOut,
    PublishBundleRequest,
    PublishLogOut,
    PublishRequest,
    ReindexResult,
    RenderImageRequest,
    RunPlanResult,
    SelectAssetRequest,
    TemplateOut,
    TransformRequest,
    VariantRequest,
)
from app.services.smm_projects import access as access_svc
from app.services.smm_projects import assets as assets_svc
from app.services.smm_projects import channels as channels_svc
from app.services.smm_projects import content_plan as content_plan_svc
from app.services.smm_projects import generation
from app.services.smm_projects import knowledge as knowledge_svc
from app.services.smm_projects import projects as projects_svc
from app.services.smm_projects import publishing as publishing_svc
from app.services.smm_projects import templates as templates_svc

router = APIRouter()


def _get_project_or_404(db: Session, code: str) -> SmmProject:
    project = projects_svc.get_by_code(db, code)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Проект не найден")
    return project


def _get_accessible_project(db: Session, code: str, user: User) -> SmmProject:
    project = _get_project_or_404(db, code)
    access_svc.ensure_project_access(db, user, project)
    return project


def _get_knowledge_item_or_404(db: Session, project: SmmProject, item_id: int) -> SmmKnowledgeItem:
    item = db.query(SmmKnowledgeItem).filter(SmmKnowledgeItem.id == item_id, SmmKnowledgeItem.project_id == project.id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись базы знаний не найдена")
    return item


def _get_content_or_404(db: Session, content_id: int) -> SmmContent:
    content = db.query(SmmContent).filter(SmmContent.id == content_id).first()
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Материал не найден")
    return content


def _project_for_content(db: Session, content: SmmContent, user: User) -> SmmProject:
    project = db.query(SmmProject).filter(SmmProject.id == content.project_id).first()
    access_svc.ensure_project_access(db, user, project)
    return project


# ─── Projects ────────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[ProjectListItem])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    all_projects = projects_svc.list_projects(db)
    return [p for p in all_projects if access_svc.can_access_project(db, current_user, p)]


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_project")),
):
    project = projects_svc.create_project(db, current_user, name=payload.name, description=payload.description)
    templates_svc.seed_defaults(db, project)
    log_action(db, current_user.id, "create", "smm_project", project.id, {"name": project.name})
    return project


@router.get("/projects/{code}", response_model=ProjectOut)
def get_project(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    return _get_accessible_project(db, code, current_user)


@router.patch("/projects/{code}", response_model=ProjectOut)
def update_project(
    code: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_project")),
):
    project = _get_accessible_project(db, code, current_user)
    updated = projects_svc.update_project(db, project, payload.model_dump(exclude_unset=True))
    log_action(db, current_user.id, "update", "smm_project", project.id, {"code": code})
    return updated


@router.get("/brand-context-fields", response_model=List[BrandContextFieldOut])
def get_brand_context_fields(
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    return projects_svc.BRAND_CONTEXT_FIELDS


# ─── Channels ────────────────────────────────────────────────────────────

@router.get("/projects/{code}/channels", response_model=List[ChannelStatusOut])
def list_channels(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    project = _get_accessible_project(db, code, current_user)
    return channels_svc.list_channel_statuses(db, project)


@router.put("/projects/{code}/channels/{channel}", response_model=ChannelStatusOut)
def set_channel(
    code: str,
    channel: str,
    payload: ChannelConfigSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_channels")),
):
    project = _get_accessible_project(db, code, current_user)
    try:
        channels_svc.set_channel_config(db, project, current_user, channel, payload.config)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "update", "smm_channel_config", None, {"project": code, "channel": channel})
    return ChannelStatusOut(channel=channel, configured=channels_svc.is_configured(db, project, channel))


@router.delete("/projects/{code}/channels/{channel}", status_code=status.HTTP_204_NO_CONTENT)
def remove_channel(
    code: str,
    channel: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_channels")),
):
    project = _get_accessible_project(db, code, current_user)
    channels_svc.disable_channel(db, project, channel)
    log_action(db, current_user.id, "archive", "smm_channel_config", None, {"project": code, "channel": channel})


# ─── Knowledge base ──────────────────────────────────────────────────────

@router.get("/projects/{code}/knowledge", response_model=KnowledgeItemList)
def list_knowledge(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    project = _get_accessible_project(db, code, current_user)
    items = knowledge_svc.list_items(db, project)
    return KnowledgeItemList(items=items, total=len(items))


@router.post("/projects/{code}/knowledge", response_model=KnowledgeItemOut, status_code=status.HTTP_201_CREATED)
def create_knowledge(
    code: str,
    payload: KnowledgeItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_knowledge")),
):
    project = _get_accessible_project(db, code, current_user)
    item = knowledge_svc.create_item(db, project, payload.model_dump(), user_id=current_user.id)
    log_action(db, current_user.id, "create", "smm_knowledge_item", item.id, {"project": code, "title": item.title})
    return item


@router.patch("/projects/{code}/knowledge/{item_id}", response_model=KnowledgeItemOut)
def update_knowledge(
    code: str,
    item_id: int,
    payload: KnowledgeItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_knowledge")),
):
    project = _get_accessible_project(db, code, current_user)
    item = _get_knowledge_item_or_404(db, project, item_id)
    updated = knowledge_svc.update_item(db, item, payload.model_dump(exclude_unset=True))
    log_action(db, current_user.id, "update", "smm_knowledge_item", item_id, {"project": code})
    return updated


@router.delete("/projects/{code}/knowledge/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge(
    code: str,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_knowledge")),
):
    project = _get_accessible_project(db, code, current_user)
    item = _get_knowledge_item_or_404(db, project, item_id)
    knowledge_svc.delete_item(db, item)
    log_action(db, current_user.id, "archive", "smm_knowledge_item", item_id, {"project": code})


@router.post("/projects/{code}/knowledge/reindex", response_model=ReindexResult)
async def reindex_knowledge(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_knowledge")),
):
    project = _get_accessible_project(db, code, current_user)
    result = await knowledge_svc.index_pending(db, project, user_id=current_user.id)
    return ReindexResult(**result)


# ─── Templates ───────────────────────────────────────────────────────────

@router.get("/projects/{code}/templates", response_model=List[TemplateOut])
def list_templates(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    project = _get_accessible_project(db, code, current_user)
    return templates_svc.list_templates(db, project)


# ─── Generate / Content ──────────────────────────────────────────────────

@router.post("/projects/{code}/generate", response_model=ContentOut)
async def generate_content(
    code: str,
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    project = _get_accessible_project(db, code, current_user)
    template = templates_svc.get_by_code(db, project, payload.template_code)
    if template is None or not template.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")
    try:
        content = await generation.generate(db, current_user, project=project, template=template, input_data=payload.input_data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "smm_content", content.id, {"project": code, "template": payload.template_code})
    return content


@router.get("/content", response_model=ContentList)
def list_content(
    project: str = Query(..., description="Код проекта"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    proj = _get_accessible_project(db, project, current_user)
    q = db.query(SmmContent).filter(SmmContent.project_id == proj.id)
    if status_filter:
        q = q.filter(SmmContent.status == status_filter)
    items = q.order_by(SmmContent.created_at.desc()).limit(200).all()
    return ContentList(items=items, total=len(items))


@router.get("/content/{content_id}", response_model=ContentOut)
def get_content(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    content = _get_content_or_404(db, content_id)
    _project_for_content(db, content, current_user)
    return content


@router.patch("/content/{content_id}", response_model=ContentOut)
def update_content(
    content_id: int,
    payload: ContentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_content")),
):
    content = _get_content_or_404(db, content_id)
    _project_for_content(db, content, current_user)
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in ("draft", "approved", "archived"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Недопустимый статус")
    for field, value in updates.items():
        setattr(content, field, value)
    db.commit()
    db.refresh(content)
    log_action(db, current_user.id, "update", "smm_content", content_id, updates)
    return content


@router.post("/content/{content_id}/approve", response_model=ContentOut)
def approve_content(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_content")),
):
    content = _get_content_or_404(db, content_id)
    project = _project_for_content(db, content, current_user)
    content.status = "approved"
    db.commit()
    db.refresh(content)
    log_action(db, current_user.id, "approve", "smm_content", content_id, {"project": project.code})
    return content


@router.post("/content/{content_id}/transform", response_model=ContentOut)
async def transform_content(
    content_id: int,
    payload: TransformRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    source = _get_content_or_404(db, content_id)
    project = _project_for_content(db, source, current_user)
    try:
        content = await generation.transform(db, current_user, project=project, source=source, action=payload.action, channel=payload.channel)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "smm_content", content.id, {"source": content_id, "action": payload.action})
    return content


@router.post("/content/{content_id}/variant", response_model=ContentOut)
async def create_content_variant(
    content_id: int,
    payload: VariantRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    source = _get_content_or_404(db, content_id)
    project = _project_for_content(db, source, current_user)
    content = await generation.create_variant(db, current_user, project=project, source=source, channel=payload.channel)
    log_action(db, current_user.id, "create", "smm_content", content.id, {"source": content_id, "variant_channel": payload.channel})
    return content


@router.get("/content/{content_id}/related", response_model=List[ContentOut])
def list_related_content(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    source = _get_content_or_404(db, content_id)
    _project_for_content(db, source, current_user)
    if not source.group_key:
        return []
    return db.query(SmmContent).filter(SmmContent.group_key == source.group_key, SmmContent.id != source.id).order_by(SmmContent.created_at).all()


# ─── Event pack ──────────────────────────────────────────────────────────

@router.post("/projects/{code}/event-pack", response_model=EventPackResult)
async def create_event_pack(
    code: str,
    payload: EventPackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    project = _get_accessible_project(db, code, current_user)
    items = await generation.event_pack(db, current_user, project=project, event_data=payload.event_data)
    log_action(db, current_user.id, "create", "smm_event_pack", None, {"project": code, "count": len(items)})
    return EventPackResult(group_key=items[0].group_key, items=items)


# ─── Content plan (+ периодичность) ──────────────────────────────────────

def _get_plan_or_404(db: Session, project: SmmProject, plan_id: int) -> SmmContentPlan:
    plan = content_plan_svc.get_plan(db, project, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Контент-план не найден")
    return plan


@router.get("/projects/{code}/content-plans", response_model=List[ContentPlanOut])
def list_content_plans(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    project = _get_accessible_project(db, code, current_user)
    return content_plan_svc.list_plans(db, project)


@router.post("/projects/{code}/content-plans", response_model=ContentPlanOut, status_code=status.HTTP_201_CREATED)
def create_content_plan(
    code: str,
    payload: ContentPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    project = _get_accessible_project(db, code, current_user)
    periodicity = payload.periodicity.model_dump() if payload.periodicity else None
    plan = content_plan_svc.create_plan(
        db, project, current_user, name=payload.name, date_from=payload.date_from, date_to=payload.date_to,
        periodicity=periodicity,
    )
    log_action(db, current_user.id, "create", "smm_content_plan", plan.id, {"project": code, "periodicity": bool(periodicity)})
    return plan


@router.get("/projects/{code}/content-plans/{plan_id}", response_model=ContentPlanOut)
def get_content_plan(
    code: str,
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    project = _get_accessible_project(db, code, current_user)
    return _get_plan_or_404(db, project, plan_id)


@router.patch("/projects/{code}/content-plans/{plan_id}", response_model=ContentPlanOut)
def update_content_plan(
    code: str,
    plan_id: int,
    payload: ContentPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    project = _get_accessible_project(db, code, current_user)
    plan = _get_plan_or_404(db, project, plan_id)
    updates = payload.model_dump(exclude_unset=True)
    if "periodicity" in updates and updates["periodicity"] is not None:
        updates["periodicity"] = payload.periodicity.model_dump()
    updated = content_plan_svc.update_plan(db, plan, updates)
    log_action(db, current_user.id, "update", "smm_content_plan", plan.id, {"project": code})
    return updated


@router.post("/projects/{code}/content-plans/{plan_id}/run-now", response_model=RunPlanResult)
async def run_content_plan_now(
    code: str,
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    """Немедленно прогнать периодичность плана (не дожидаясь фоновой задачи) —
    полезно сразу после настройки, чтобы увидеть результат."""
    project = _get_accessible_project(db, code, current_user)
    plan = _get_plan_or_404(db, project, plan_id)
    created = await content_plan_svc.ensure_plan_scheduled(db, current_user, project, plan)
    log_action(db, current_user.id, "run", "smm_content_plan", plan.id, {"project": code, "items_created": len(created)})
    return RunPlanResult(items_created=len(created))


@router.post("/projects/{code}/content-plans/{plan_id}/items", response_model=ContentPlanItemOut, status_code=status.HTTP_201_CREATED)
def add_content_plan_item(
    code: str,
    plan_id: int,
    payload: ContentPlanItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    project = _get_accessible_project(db, code, current_user)
    plan = _get_plan_or_404(db, project, plan_id)
    return content_plan_svc.add_item(db, plan, payload.model_dump())


@router.post("/projects/{code}/content-plans/{plan_id}/generate-items", response_model=List[ContentPlanItemOut])
async def generate_content_plan_items(
    code: str,
    plan_id: int,
    payload: ContentPlanGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    project = _get_accessible_project(db, code, current_user)
    plan = _get_plan_or_404(db, project, plan_id)
    try:
        items = await content_plan_svc.generate_items(
            db, current_user, project=project, plan=plan, count=payload.count, channels=payload.channels,
            goals=payload.goals, important_events=payload.important_events,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "smm_content_plan_items", plan.id, {"project": code, "count": len(items)})
    return items


@router.patch("/content-plan-items/{item_id}", response_model=ContentPlanItemOut)
def update_content_plan_item(
    item_id: int,
    payload: ContentPlanItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_content")),
):
    item = db.query(SmmContentPlanItem).filter(SmmContentPlanItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пункт плана не найден")
    plan = db.query(SmmContentPlan).filter(SmmContentPlan.id == item.plan_id).first()
    project = db.query(SmmProject).filter(SmmProject.id == plan.project_id).first()
    access_svc.ensure_project_access(db, current_user, project)
    try:
        updated = content_plan_svc.update_item(db, item, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return updated


@router.delete("/content-plan-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_content_plan_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_content")),
):
    item = db.query(SmmContentPlanItem).filter(SmmContentPlanItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пункт плана не найден")
    plan = db.query(SmmContentPlan).filter(SmmContentPlan.id == item.plan_id).first()
    project = db.query(SmmProject).filter(SmmProject.id == plan.project_id).first()
    access_svc.ensure_project_access(db, current_user, project)
    content_plan_svc.delete_item(db, item)


# ─── Assets ──────────────────────────────────────────────────────────────

@router.post("/content/{content_id}/render-image", response_model=AssetOut)
async def render_content_image(
    content_id: int,
    payload: RenderImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.generate")),
):
    content = _get_content_or_404(db, content_id)
    project = _project_for_content(db, content, current_user)
    try:
        asset = await assets_svc.render_image(db, current_user, project=project, content=content, prompt=payload.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "smm_content_asset", asset.id, {"content_id": content_id})
    return asset


@router.get("/content/{content_id}/assets", response_model=List[AssetOut])
def list_content_assets(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    content = _get_content_or_404(db, content_id)
    _project_for_content(db, content, current_user)
    return assets_svc.list_assets(db, content)


@router.post("/content/{content_id}/select-asset", response_model=AssetOut)
def select_content_asset(
    content_id: int,
    payload: SelectAssetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.manage_content")),
):
    content = _get_content_or_404(db, content_id)
    _project_for_content(db, content, current_user)
    try:
        asset = assets_svc.select_asset(db, content, payload.asset_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    log_action(db, current_user.id, "update", "smm_content_asset", asset.id, {"content_id": content_id, "selected": True})
    return asset


# ─── Publishing ──────────────────────────────────────────────────────────

@router.post("/content/{content_id}/publish", response_model=PublishLogOut)
async def publish_content(
    content_id: int,
    payload: PublishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.publish")),
):
    content = _get_content_or_404(db, content_id)
    project = _project_for_content(db, content, current_user)
    try:
        log = await publishing_svc.publish(db, current_user, project=project, content=content, channel=payload.channel)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_action(db, current_user.id, "create", "smm_publish_log", log.id, {"content_id": content_id, "channel": payload.channel})
    return log


@router.post("/content/{content_id}/publish-bundle", response_model=List[PublicationOut], status_code=status.HTTP_202_ACCEPTED)
def publish_bundle(
    content_id: int,
    payload: PublishBundleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.publish")),
):
    anchor = _get_content_or_404(db, content_id)
    project = _project_for_content(db, anchor, current_user)
    items = [item.model_dump() for item in payload.publications]
    if not items:
        items = [{"channel": anchor.channel, "content_id": anchor.id, "asset_id": anchor.selected_asset_id}]
    try:
        rows = publishing_svc.create_publications(db, current_user, project=project, items=items, publish_at=payload.publish_at)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    from app.background_tasks import task_smm_publication
    for row in rows:
        if row.status == "approved":
            task_smm_publication.send(row.id)
    log_action(db, current_user.id, "publish", "smm_publication_bundle", anchor.id, {"count": len(rows), "scheduled": bool(payload.publish_at)})
    return rows


@router.get("/content/{content_id}/publications", response_model=List[PublicationOut])
def list_publications(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    content = _get_content_or_404(db, content_id)
    _project_for_content(db, content, current_user)
    return publishing_svc.list_publications(db, content_id)


@router.post("/publications/{publication_id}/retry", response_model=PublicationOut, status_code=status.HTTP_202_ACCEPTED)
def retry_publication(
    publication_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.publish")),
):
    from app.models import SmmPublication

    row = db.query(SmmPublication).filter(SmmPublication.id == publication_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Публикация не найдена")
    project = db.query(SmmProject).filter(SmmProject.id == row.project_id).first()
    access_svc.ensure_project_access(db, current_user, project)
    if row.status != "error":
        raise HTTPException(status_code=409, detail="Повторить можно только публикацию с ошибкой")
    row.status = "approved"
    row.last_error = None
    db.commit()
    from app.background_tasks import task_smm_publication
    task_smm_publication.send(row.id)
    return row


@router.post("/publications/{publication_id}/cancel", response_model=PublicationOut)
def cancel_publication(
    publication_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.publish")),
):
    from app.models import SmmPublication

    row = db.query(SmmPublication).filter(SmmPublication.id == publication_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Публикация не найдена")
    project = db.query(SmmProject).filter(SmmProject.id == row.project_id).first()
    access_svc.ensure_project_access(db, current_user, project)
    if row.status not in ("approved", "scheduled", "error"):
        raise HTTPException(status_code=409, detail="Публикацию уже нельзя отменить")
    row.status = "cancelled"
    db.commit()
    log_action(db, current_user.id, "cancel_schedule", "smm_publication", row.id, {"content_id": row.content_id})
    return row


@router.get("/content/{content_id}/publish-logs", response_model=List[PublishLogOut])
def list_content_publish_logs(
    content_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("smm_projects.access")),
):
    content = _get_content_or_404(db, content_id)
    _project_for_content(db, content, current_user)
    return publishing_svc.list_publish_logs(db, content)
