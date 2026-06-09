from typing import Dict, List, Optional, Tuple

import csv
import hashlib
from datetime import date, datetime, timedelta
from io import StringIO, BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import db_transaction, get_db
from app.models import (
    User,
    UserRole,
    FinanceTransaction,
    FinanceAccount,
    FinanceAccountOwnerScope,
    FinanceTarget,
    FinanceArticle,
    FinanceArticleDirection,
    FinanceArticleCostKind,
    FinanceArticleScope,
    FinanceTransactionDirection,
    FinanceTransactionStatus,
    FinanceRecognitionRule,
    FinanceModel,
    BudgetEntry,
    MetricDefinition,
    DashboardWidget,
    Student,
    StudentAccount,
    StudentAccountTransaction,
    StudentAccountTransactionKind,
)
from app.schemas.finance import (
    BankTransactionApplyRequest,
    BankTransactionResponse,
    FinanceAccountBalance,
    FinanceAccountCreate,
    FinanceAccountResponse,
    FinanceTargetCreate,
    FinanceAnalyticsExpenseBreakdownRow,
    FinanceAnalyticsKpiBlock,
    FinanceAnalyticsSummaryResponse,
    FinanceAnalyticsTargetBreakdownRow,
    FinanceArticleCreate,
    FinanceArticleResponse,
    FinanceArticleTreeItem,
    FinanceArticleUpdate,
    FinanceModelCreate,
    FinanceModelResponse,
    FinanceModelUpdate,
    BudgetEntryResponse,
    BudgetSaveRequest,
    MetricComputeResponse,
    MetricDefinitionCreate,
    MetricDefinitionResponse,
    MetricDefinitionUpdate,
    DashboardWidgetCreate,
    DashboardWidgetComputedResponse,
    DashboardWidgetResponse,
    DashboardWidgetUpdate,
    FinanceLedgerBankRow,
    FinanceLedgerTransactionRow,
    FinanceManualTransactionCreate,
    FinanceModelTemplateCreate,
    FinanceModelTemplateResponse,
    FinanceModelTemplateUpdate,
    FinancePnlRow,
    FinanceStudentAccountCreate,
    FinanceTargetResponse,
    FinanceTransactionApplyStudentRequest,
    FinanceTransactionUpdate,
    StudentAccountResponse,
)
from app.services.finance_metric_engine import compute_metric_formula
from app.services.finance_templates import get_template, list_templates
from app.services.finance_ledger import apply_recognition_rules
from app.services.student_account_finance import create_student_account as finance_create_student_account
from app.services.bank_operation import apply_bank_operation_to_student as bank_operation_apply
from app.services.payment_status import get_payment_status_summary
from app.dependencies import require_finance_access as dep_require_finance_access


router = APIRouter()


def _require_finance_access(user: User) -> None:
    """Права доступа к финансовому журналу: admin / owner / sales."""
    if not auth.has_permission(user, "finance.access"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав для работы с финансовым журналом")


def _slug(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(value or "").strip())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_")[:96] or "item"


def _article_response(article: FinanceArticle) -> FinanceArticleResponse:
    return FinanceArticleResponse(
        id=article.id,
        code=article.code,
        target_id=article.target_id,
        parent_id=article.parent_id,
        name=article.name,
        direction=str(getattr(article.direction, "value", article.direction)),
        cost_kind=str(getattr(article.cost_kind, "value", article.cost_kind)),
        scope=str(getattr(article.scope, "value", article.scope)),
        color=article.color,
        sort_order=int(article.sort_order or 0),
        is_active=bool(article.is_active),
    )


def _model_response(model: FinanceModel) -> FinanceModelResponse:
    target = getattr(model, "target", None)
    return FinanceModelResponse(
        id=model.id,
        target_id=model.target_id,
        target_code=getattr(target, "code", None),
        target_name=getattr(target, "name", None),
        name=model.name,
        template_key=model.template_key,
        currency=model.currency,
        period_type=model.period_type,
        settings_json=model.settings_json,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _metric_response(metric: MetricDefinition) -> MetricDefinitionResponse:
    target = getattr(metric, "target", None)
    return MetricDefinitionResponse(
        id=metric.id,
        target_id=metric.target_id,
        target_name=getattr(target, "name", None),
        name=metric.name,
        formula=metric.formula,
        unit=metric.unit,
        goal_value=metric.goal_value,
        sort_order=int(metric.sort_order or 0),
        created_at=metric.created_at,
        updated_at=metric.updated_at,
    )


def _widget_response(widget: DashboardWidget) -> DashboardWidgetResponse:
    metric = getattr(widget, "metric", None)
    target = getattr(widget, "target", None)
    return DashboardWidgetResponse(
        id=widget.id,
        owner_id=widget.owner_id,
        metric_id=widget.metric_id,
        metric_name=getattr(metric, "name", None),
        target_id=widget.target_id,
        target_name=getattr(target, "name", None),
        widget_type=widget.widget_type,
        period_type=widget.period_type,
        position_x=int(widget.position_x or 0),
        position_y=int(widget.position_y or 0),
        width=int(widget.width or 1),
        title_override=widget.title_override,
    )


def _create_article_from_template(
    db: Session,
    target_id: int,
    item: Dict[str, object],
    parent_id: Optional[int] = None,
    sort_order: int = 0,
) -> FinanceArticle:
    code = _slug(str(item.get("code") or item.get("name") or "article"))
    existing = (
        db.query(FinanceArticle)
        .filter(FinanceArticle.target_id == target_id, FinanceArticle.code == code)
        .first()
    )
    if existing:
        article = existing
    else:
        direction = str(item.get("direction") or "expense")
        cost_kind = str(item.get("cost_kind") or "none")
        article = FinanceArticle(
            target_id=target_id,
            parent_id=parent_id,
            code=code,
            name=str(item.get("name") or code),
            direction=FinanceArticleDirection(direction),
            cost_kind=FinanceArticleCostKind(cost_kind),
            scope=FinanceArticleScope.ANY,
            sort_order=sort_order,
            is_active=True,
        )
        db.add(article)
        db.flush()
    children = item.get("children") or []
    if isinstance(children, list):
        for index, child in enumerate(children):
            if isinstance(child, dict):
                _create_article_from_template(db, target_id, child, article.id, index)
    return article


@router.get("/accounts", response_model=List[FinanceAccountResponse])
async def list_finance_accounts(
    only_active: bool = Query(True, description="Только активные счета"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceAccountResponse]:
    """Справочник счетов (банк/карта) для единого финансового журнала."""
    _require_finance_access(current_user)
    q = db.query(FinanceAccount)
    if only_active:
        q = q.filter(FinanceAccount.is_active.is_(True))
    accounts = q.order_by(FinanceAccount.code).all()
    return [
        FinanceAccountResponse(
            id=a.id,
            code=a.code,
            name=a.name,
            owner_scope=str(getattr(a.owner_scope, "value", a.owner_scope)),
            is_active=bool(a.is_active),
        )
        for a in accounts
    ]


@router.post("/accounts", response_model=FinanceAccountResponse, status_code=201)
async def create_finance_account(
    payload: FinanceAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceAccountResponse:
    """Создать новый счёт для импорта выписок."""
    _require_finance_access(current_user)
    code = payload.code.strip().lower().replace(" ", "_")
    if db.query(FinanceAccount).filter(FinanceAccount.code == code).first():
        raise HTTPException(status_code=400, detail=f"Счёт с кодом '{code}' уже существует")
    try:
        scope = FinanceAccountOwnerScope(payload.owner_scope)
    except ValueError:
        scope = FinanceAccountOwnerScope.BUSINESS
    account = FinanceAccount(code=code, name=payload.name.strip(), owner_scope=scope, is_active=True)
    db.add(account)
    db.commit()
    db.refresh(account)
    return FinanceAccountResponse(
        id=account.id,
        code=account.code,
        name=account.name,
        owner_scope=str(getattr(account.owner_scope, "value", account.owner_scope)),
        is_active=bool(account.is_active),
    )


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_finance_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> None:
    """Удалить (деактивировать) счёт для импорта."""
    _require_finance_access(current_user)
    account = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    account.is_active = False
    db.commit()


@router.get("/targets", response_model=List[FinanceTargetResponse])
async def list_finance_targets(
    only_active: bool = Query(True, description="Только активные цели/проекты"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceTargetResponse]:
    """Справочник targets (academy, personal, leninets, gogol_mogol и т.п.)."""
    _require_finance_access(current_user)
    q = db.query(FinanceTarget)
    if only_active:
        q = q.filter(FinanceTarget.is_active.is_(True))
    targets = q.order_by(FinanceTarget.code).all()
    return [
        FinanceTargetResponse(
            id=t.id,
            code=t.code,
            name=t.name,
            is_active=bool(t.is_active),
        )
        for t in targets
    ]


@router.post("/targets", response_model=FinanceTargetResponse, status_code=201)
async def create_finance_target(
    payload: FinanceTargetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceTargetResponse:
    """Создать новый проект/цель."""
    _require_finance_access(current_user)
    code = payload.code.strip().lower().replace(" ", "_")
    if db.query(FinanceTarget).filter(FinanceTarget.code == code).first():
        raise HTTPException(status_code=400, detail=f"Проект с кодом '{code}' уже существует")
    target = FinanceTarget(code=code, name=payload.name.strip(), is_active=True)
    db.add(target)
    db.commit()
    db.refresh(target)
    return FinanceTargetResponse(id=target.id, code=target.code, name=target.name, is_active=bool(target.is_active))


@router.delete("/targets/{target_id}", status_code=204)
async def delete_finance_target(
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> None:
    """Деактивировать проект/цель."""
    _require_finance_access(current_user)
    target = db.query(FinanceTarget).filter(FinanceTarget.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Проект не найден")
    target.is_active = False
    db.commit()


@router.get("/model-templates", response_model=List[FinanceModelTemplateResponse])
async def list_finance_model_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceModelTemplateResponse]:
    _require_finance_access(current_user)
    from app.models import FinanceModelTemplate
    rows = db.query(FinanceModelTemplate).order_by(FinanceModelTemplate.sort_order, FinanceModelTemplate.id).all()
    return rows


@router.post("/model-templates", response_model=FinanceModelTemplateResponse)
async def create_finance_model_template(
    payload: FinanceModelTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceModelTemplateResponse:
    _require_finance_access(current_user)
    from app.models import FinanceModelTemplate
    key = payload.key.strip().lower().replace(" ", "_")
    if not key:
        raise HTTPException(status_code=400, detail="Ключ шаблона не может быть пустым")
    if db.query(FinanceModelTemplate).filter(FinanceModelTemplate.key == key).first():
        raise HTTPException(status_code=400, detail="Шаблон с таким ключом уже существует")
    row = FinanceModelTemplate(
        key=key,
        name=payload.name.strip(),
        articles_json=[a.model_dump(exclude_none=True) for a in payload.articles],
        metrics_json=[m.model_dump(exclude_none=True) for m in payload.metrics],
        is_system=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/model-templates/{template_id}", response_model=FinanceModelTemplateResponse)
async def update_finance_model_template(
    template_id: int,
    payload: FinanceModelTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceModelTemplateResponse:
    _require_finance_access(current_user)
    from app.models import FinanceModelTemplate
    row = db.query(FinanceModelTemplate).filter(FinanceModelTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if payload.name is not None:
        row.name = payload.name.strip() or row.name
    if payload.articles is not None:
        row.articles_json = [a.model_dump(exclude_none=True) for a in payload.articles]
    if payload.metrics is not None:
        row.metrics_json = [m.model_dump(exclude_none=True) for m in payload.metrics]
    db.commit()
    db.refresh(row)
    return row


@router.delete("/model-templates/{template_id}", status_code=204)
async def delete_finance_model_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> None:
    _require_finance_access(current_user)
    from app.models import FinanceModelTemplate
    row = db.query(FinanceModelTemplate).filter(FinanceModelTemplate.id == template_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if row.is_system:
        raise HTTPException(status_code=400, detail="Системный шаблон нельзя удалить")
    db.delete(row)
    db.commit()


@router.get("/models", response_model=List[FinanceModelResponse])
async def list_finance_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceModelResponse]:
    _require_finance_access(current_user)
    rows = (
        db.query(FinanceModel)
        .options(joinedload(FinanceModel.target))
        .order_by(FinanceModel.created_at.desc(), FinanceModel.id.desc())
        .all()
    )
    return [_model_response(row) for row in rows]


@router.post("/models", response_model=FinanceModelResponse, status_code=201)
async def create_finance_model(
    payload: FinanceModelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceModelResponse:
    _require_finance_access(current_user)
    target: Optional[FinanceTarget] = None
    if payload.target_id is not None:
        target = db.query(FinanceTarget).filter(FinanceTarget.id == payload.target_id).first()
    elif payload.target_code:
        code = _slug(payload.target_code)
        target = db.query(FinanceTarget).filter(FinanceTarget.code == code).first()
        if target is None:
            target = FinanceTarget(code=code, name=(payload.target_name or payload.name).strip(), is_active=True)
            db.add(target)
            db.flush()
    if target is None:
        raise HTTPException(status_code=400, detail="target_id or target_code is required")

    model = FinanceModel(
        target_id=target.id,
        name=payload.name.strip(),
        template_key=payload.template_key or "blank",
        currency=(payload.currency or "RUB").strip().upper()[:8],
        period_type=payload.period_type or "month",
        settings_json=payload.settings_json,
    )
    template = get_template(model.template_key, db=db)
    try:
        with db_transaction(db):
            db.add(model)
            db.flush()
            for index, item in enumerate(template.get("articles") or []):
                if isinstance(item, dict):
                    _create_article_from_template(db, target.id, item, None, index)
            for index, metric_data in enumerate(template.get("metrics") or []):
                if isinstance(metric_data, dict):
                    metric = MetricDefinition(
                        target_id=target.id,
                        name=str(metric_data.get("name") or "Metric"),
                        formula=str(metric_data.get("formula") or "0"),
                        unit=metric_data.get("unit") if metric_data.get("unit") is not None else None,
                        sort_order=index,
                    )
                    db.add(metric)
                    db.flush()
                    db.add(
                        DashboardWidget(
                            owner_id=current_user.id,
                            metric_id=metric.id,
                            target_id=target.id,
                            widget_type="number",
                            period_type="current_month",
                            position_x=index % 4,
                            position_y=index // 4,
                            width=1,
                        )
                    )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Finance model with this name already exists for target")
    db.refresh(model)
    db.refresh(model, ["target"])
    return _model_response(model)


@router.get("/models/{model_id}", response_model=FinanceModelResponse)
async def get_finance_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceModelResponse:
    _require_finance_access(current_user)
    row = db.query(FinanceModel).options(joinedload(FinanceModel.target)).filter(FinanceModel.id == model_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Finance model not found")
    return _model_response(row)


@router.patch("/models/{model_id}", response_model=FinanceModelResponse)
async def update_finance_model(
    model_id: int,
    payload: FinanceModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceModelResponse:
    _require_finance_access(current_user)
    row = db.query(FinanceModel).options(joinedload(FinanceModel.target)).filter(FinanceModel.id == model_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Finance model not found")
    if payload.name is not None:
        row.name = payload.name.strip() or row.name
    if payload.template_key is not None:
        row.template_key = payload.template_key or row.template_key
    if payload.currency is not None:
        row.currency = payload.currency.strip().upper()[:8] or row.currency
    if payload.period_type is not None:
        row.period_type = payload.period_type or row.period_type
    if payload.settings_json is not None:
        row.settings_json = payload.settings_json
    db.commit()
    db.refresh(row)
    db.refresh(row, ["target"])
    return _model_response(row)


@router.delete("/models/{model_id}", status_code=204)
async def delete_finance_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> None:
    _require_finance_access(current_user)
    row = db.query(FinanceModel).filter(FinanceModel.id == model_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Finance model not found")
    db.delete(row)
    db.commit()
    return None


@router.get("/articles/tree", response_model=List[FinanceArticleTreeItem])
async def get_finance_articles_tree(
    target_id: int = Query(...),
    only_active: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceArticleTreeItem]:
    _require_finance_access(current_user)
    q = db.query(FinanceArticle).filter(FinanceArticle.target_id == target_id)
    if only_active:
        q = q.filter(FinanceArticle.is_active.is_(True))
    articles = q.order_by(FinanceArticle.sort_order.asc(), FinanceArticle.name.asc()).all()
    by_parent: Dict[Optional[int], List[FinanceArticle]] = {}
    for article in articles:
        by_parent.setdefault(article.parent_id, []).append(article)

    def build(parent_id: Optional[int]) -> List[FinanceArticleTreeItem]:
        nodes: List[FinanceArticleTreeItem] = []
        for article in by_parent.get(parent_id, []):
            data = _article_response(article).model_dump()
            data["children"] = build(article.id)
            nodes.append(FinanceArticleTreeItem(**data))
        return nodes

    return build(None)


@router.get("/articles", response_model=List[FinanceArticleResponse])
async def list_finance_articles(
    only_active: bool = Query(True, description="Только активные статьи"),
    scope: Optional[str] = Query(None, description="Фильтр по scope: academy | personal | any"),
    direction: Optional[str] = Query(None, description="Фильтр по direction: income | expense"),
    target_id: Optional[int] = Query(None, description="Filter by finance_targets.id"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceArticleResponse]:
    """Единый справочник статей доходов/расходов."""
    _require_finance_access(current_user)
    q = db.query(FinanceArticle)
    if only_active:
        q = q.filter(FinanceArticle.is_active.is_(True))
    if scope:
        q = q.filter(FinanceArticle.scope == scope)
    if direction:
        q = q.filter(FinanceArticle.direction == direction)
    if target_id is not None:
        q = q.filter(FinanceArticle.target_id == target_id)
    arts = q.order_by(FinanceArticle.sort_order.asc(), FinanceArticle.name.asc()).all()
    return [_article_response(a) for a in arts]


@router.post("/articles", response_model=FinanceArticleResponse)
async def create_finance_article(
    payload: FinanceArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceArticleResponse:
    """Создание статьи дохода/расхода в едином справочнике."""
    _require_finance_access(current_user)

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    direction_value = payload.direction
    if direction_value not in {d.value for d in FinanceArticleDirection}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное значение direction")
    direction = FinanceArticleDirection(direction_value)  # type: ignore[call-arg]

    scope_value = payload.scope or "personal"
    if scope_value not in {s.value for s in FinanceArticleScope}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное значение scope")
    scope = FinanceArticleScope(scope_value)  # type: ignore[call-arg]

    cost_kind_value = payload.cost_kind or "none"
    if cost_kind_value not in {c.value for c in FinanceArticleCostKind}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное значение cost_kind")
    cost_kind = FinanceArticleCostKind(cost_kind_value)  # type: ignore[call-arg]

    art = FinanceArticle(
        code=_slug(payload.code or name),
        target_id=payload.target_id,
        parent_id=payload.parent_id,
        name=name,
        direction=direction,
        cost_kind=cost_kind,
        scope=scope,
        color=payload.color,
        sort_order=payload.sort_order or 0,
        is_active=True,
    )
    db.add(art)
    db.commit()
    db.refresh(art)

    return _article_response(art)


@router.patch("/articles/{article_id}", response_model=FinanceArticleResponse)
async def update_finance_article(
    article_id: int,
    payload: FinanceArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceArticleResponse:
    """Частичное обновление статьи (переименование, смена типа, деактивация)."""
    _require_finance_access(current_user)

    art = db.query(FinanceArticle).filter(FinanceArticle.id == article_id).first()
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    if payload.name is not None:
        art.name = payload.name.strip() or art.name
    if payload.code is not None:
        art.code = _slug(payload.code) if payload.code else None
    if payload.target_id is not None:
        if payload.target_id and not db.query(FinanceTarget.id).filter(FinanceTarget.id == payload.target_id).first():
            raise HTTPException(status_code=400, detail="target_id not found")
        art.target_id = payload.target_id
    if payload.parent_id is not None:
        if payload.parent_id == art.id:
            raise HTTPException(status_code=400, detail="Article cannot be its own parent")
        if payload.parent_id and not db.query(FinanceArticle.id).filter(FinanceArticle.id == payload.parent_id).first():
            raise HTTPException(status_code=400, detail="parent_id not found")
        art.parent_id = payload.parent_id

    if payload.direction is not None:
        if payload.direction not in {d.value for d in FinanceArticleDirection}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение direction")
        art.direction = FinanceArticleDirection(payload.direction)  # type: ignore[call-arg]

    if payload.scope is not None:
        if payload.scope not in {s.value for s in FinanceArticleScope}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение scope")
        art.scope = FinanceArticleScope(payload.scope)  # type: ignore[call-arg]

    if payload.cost_kind is not None:
        if payload.cost_kind not in {c.value for c in FinanceArticleCostKind}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение cost_kind")
        art.cost_kind = FinanceArticleCostKind(payload.cost_kind)  # type: ignore[call-arg]
    if payload.color is not None:
        art.color = payload.color[:16] if payload.color else None
    if payload.sort_order is not None:
        art.sort_order = int(payload.sort_order)

    if payload.is_active is not None:
        art.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(art)

    return _article_response(art)


@router.delete("/articles/{article_id}")
async def delete_finance_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """
    Удаление статьи.
    По умолчанию делаем мягкое удаление (is_active = False),
    чтобы не ломать ссылки из существующих транзакций.
    """
    _require_finance_access(current_user)

    art = db.query(FinanceArticle).filter(FinanceArticle.id == article_id).first()
    if not art:
        raise HTTPException(status_code=404, detail="Статья не найдена")

    art.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/budget", response_model=List[BudgetEntryResponse])
async def list_budget_entries(
    target_id: int = Query(...),
    period: str = Query(..., min_length=7, max_length=7),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[BudgetEntryResponse]:
    _require_finance_access(current_user)
    rows = (
        db.query(BudgetEntry)
        .options(joinedload(BudgetEntry.article))
        .filter(BudgetEntry.target_id == target_id, BudgetEntry.period == period)
        .order_by(BudgetEntry.id.asc())
        .all()
    )
    return [
        BudgetEntryResponse(
            id=row.id,
            target_id=row.target_id,
            article_id=row.article_id,
            article_name=getattr(row.article, "name", None),
            period=row.period,
            amount_plan=float(row.amount_plan or 0),
        )
        for row in rows
    ]


@router.put("/budget", response_model=List[BudgetEntryResponse])
async def save_budget_entries(
    payload: BudgetSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[BudgetEntryResponse]:
    _require_finance_access(current_user)
    if len(payload.period) != 7:
        raise HTTPException(status_code=400, detail="period must have YYYY-MM format")
    with db_transaction(db):
        for item in payload.entries:
            article = (
                db.query(FinanceArticle)
                .filter(FinanceArticle.id == item.article_id, FinanceArticle.target_id == payload.target_id)
                .first()
            )
            if not article:
                raise HTTPException(status_code=400, detail=f"article_id {item.article_id} not found for target")
            row = (
                db.query(BudgetEntry)
                .filter(
                    BudgetEntry.target_id == payload.target_id,
                    BudgetEntry.article_id == item.article_id,
                    BudgetEntry.period == payload.period,
                )
                .first()
            )
            if row is None:
                row = BudgetEntry(target_id=payload.target_id, article_id=item.article_id, period=payload.period)
                db.add(row)
            row.amount_plan = item.amount_plan
    return await list_budget_entries(payload.target_id, payload.period, db, current_user)


@router.get("/metrics", response_model=List[MetricDefinitionResponse])
async def list_metrics(
    target_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[MetricDefinitionResponse]:
    _require_finance_access(current_user)
    q = db.query(MetricDefinition).options(joinedload(MetricDefinition.target))
    if target_id is not None:
        q = q.filter(MetricDefinition.target_id == target_id)
    rows = q.order_by(MetricDefinition.sort_order.asc(), MetricDefinition.name.asc()).all()
    return [_metric_response(row) for row in rows]


@router.post("/metrics", response_model=MetricDefinitionResponse, status_code=201)
async def create_metric(
    payload: MetricDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> MetricDefinitionResponse:
    _require_finance_access(current_user)
    if not db.query(FinanceTarget.id).filter(FinanceTarget.id == payload.target_id).first():
        raise HTTPException(status_code=400, detail="target_id not found")
    row = MetricDefinition(
        target_id=payload.target_id,
        name=payload.name.strip(),
        formula=payload.formula.strip(),
        unit=payload.unit,
        goal_value=payload.goal_value,
        sort_order=payload.sort_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["target"])
    return _metric_response(row)


@router.patch("/metrics/{metric_id}", response_model=MetricDefinitionResponse)
async def update_metric(
    metric_id: int,
    payload: MetricDefinitionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> MetricDefinitionResponse:
    _require_finance_access(current_user)
    row = db.query(MetricDefinition).options(joinedload(MetricDefinition.target)).filter(MetricDefinition.id == metric_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Metric not found")
    if payload.name is not None:
        row.name = payload.name.strip() or row.name
    if payload.formula is not None:
        row.formula = payload.formula.strip() or row.formula
    if payload.unit is not None:
        row.unit = payload.unit or None
    if payload.goal_value is not None:
        row.goal_value = payload.goal_value
    if payload.sort_order is not None:
        row.sort_order = int(payload.sort_order)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["target"])
    return _metric_response(row)


@router.get("/metrics/{metric_id}/compute", response_model=MetricComputeResponse)
async def compute_metric(
    metric_id: int,
    period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> MetricComputeResponse:
    _require_finance_access(current_user)
    row = db.query(MetricDefinition).filter(MetricDefinition.id == metric_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Metric not found")
    try:
        value = compute_metric_formula(db, row.target_id, row.formula, period)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return MetricComputeResponse(
        metric_id=row.id,
        name=row.name,
        formula=row.formula,
        value=value,
        unit=row.unit,
        goal_value=row.goal_value,
        period=period,
    )


@router.delete("/metrics/{metric_id}", status_code=204)
async def delete_metric(
    metric_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> None:
    _require_finance_access(current_user)
    row = db.query(MetricDefinition).filter(MetricDefinition.id == metric_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Metric not found")
    db.delete(row)
    db.commit()
    return None


@router.get("/dashboard", response_model=List[DashboardWidgetResponse])
async def list_dashboard_widgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[DashboardWidgetResponse]:
    _require_finance_access(current_user)
    rows = (
        db.query(DashboardWidget)
        .options(joinedload(DashboardWidget.metric), joinedload(DashboardWidget.target))
        .filter(DashboardWidget.owner_id == current_user.id)
        .order_by(DashboardWidget.position_y.asc(), DashboardWidget.position_x.asc(), DashboardWidget.id.asc())
        .all()
    )
    return [_widget_response(row) for row in rows]


@router.post("/dashboard/widgets", response_model=DashboardWidgetResponse, status_code=201)
async def create_dashboard_widget(
    payload: DashboardWidgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> DashboardWidgetResponse:
    _require_finance_access(current_user)
    row = DashboardWidget(
        owner_id=current_user.id,
        metric_id=payload.metric_id,
        target_id=payload.target_id,
        widget_type=payload.widget_type,
        period_type=payload.period_type,
        position_x=payload.position_x,
        position_y=payload.position_y,
        width=payload.width,
        title_override=payload.title_override,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["metric", "target"])
    return _widget_response(row)


@router.patch("/dashboard/widgets/{widget_id}", response_model=DashboardWidgetResponse)
async def update_dashboard_widget(
    widget_id: int,
    payload: DashboardWidgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> DashboardWidgetResponse:
    _require_finance_access(current_user)
    row = (
        db.query(DashboardWidget)
        .options(joinedload(DashboardWidget.metric), joinedload(DashboardWidget.target))
        .filter(DashboardWidget.id == widget_id, DashboardWidget.owner_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Widget not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    db.refresh(row, ["metric", "target"])
    return _widget_response(row)


@router.delete("/dashboard/widgets/{widget_id}", status_code=204)
async def delete_dashboard_widget(
    widget_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> None:
    _require_finance_access(current_user)
    row = db.query(DashboardWidget).filter(DashboardWidget.id == widget_id, DashboardWidget.owner_id == current_user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Widget not found")
    db.delete(row)
    db.commit()
    return None


@router.get("/dashboard/compute", response_model=List[DashboardWidgetComputedResponse])
async def compute_dashboard_widgets(
    period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[DashboardWidgetComputedResponse]:
    _require_finance_access(current_user)
    rows = (
        db.query(DashboardWidget)
        .options(joinedload(DashboardWidget.metric), joinedload(DashboardWidget.target))
        .filter(DashboardWidget.owner_id == current_user.id)
        .order_by(DashboardWidget.position_y.asc(), DashboardWidget.position_x.asc(), DashboardWidget.id.asc())
        .all()
    )
    result: List[DashboardWidgetComputedResponse] = []
    for row in rows:
        base = _widget_response(row).model_dump()
        metric = getattr(row, "metric", None)
        value = None
        unit = None
        goal_value = None
        if metric is not None:
            try:
                value = compute_metric_formula(db, metric.target_id, metric.formula, period)
            except ValueError:
                value = None
            unit = metric.unit
            goal_value = metric.goal_value
        result.append(DashboardWidgetComputedResponse(**base, value=value, unit=unit, goal_value=goal_value))
    return result


@router.get("/ledger/transactions", response_model=List[FinanceLedgerTransactionRow])
async def list_finance_ledger_transactions(
    target_codes: Optional[List[str]] = Query(
        None,
        description="Фильтр по кодам target (personal, leninets, gogol_mogol, academy). Пусто = все эти цели.",
    ),
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    limit: int = Query(5000, ge=1, le=50000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceLedgerTransactionRow]:
    """
    Список транзакций единого журнала для дашборда личных финансов.
    По умолчанию возвращаются операции с любым target (personal, leninets, gogol_mogol, academy).
    """
    _require_finance_access(current_user)

    q = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(
            FinanceTransaction.direction.in_(
                [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
            )
        )
    )

    if target_codes:
        targets = db.query(FinanceTarget.id).filter(FinanceTarget.code.in_(target_codes)).all()
        target_ids = [t[0] for t in targets]
        if target_ids:
            q = q.filter(FinanceTransaction.target_id.in_(target_ids))
        else:
            return []
    else:
        # по умолчанию — только «личные» цели (для дашборда)
        default_codes = ["personal", "leninets", "gogol_mogol", "academy"]
        targets = db.query(FinanceTarget.id).filter(FinanceTarget.code.in_(default_codes)).all()
        target_ids = [t[0] for t in targets]
        if target_ids:
            q = q.filter(FinanceTransaction.target_id.in_(target_ids))
        else:
            return []

    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

    q = q.order_by(FinanceTransaction.occurred_at.desc())
    items: List[FinanceTransaction] = q.limit(limit).all()

    rows: List[FinanceLedgerTransactionRow] = []
    for tx in items:
        target = getattr(tx, "target", None)
        article = getattr(tx, "article", None)
        rows.append(
            FinanceLedgerTransactionRow(
                id=tx.id,
                occurred_at=tx.occurred_at,
                amount=float(tx.amount or 0.0),
                direction=str(getattr(tx.direction, "value", tx.direction)),
                target_code=getattr(target, "code", None) if target else None,
                target_name=getattr(target, "name", None) if target else None,
                article_id=tx.article_id,
                article_name=getattr(article, "name", None) if article else None,
                counterparty_name=tx.counterparty_name,
                description_raw=tx.description_raw,
            )
        )
    return rows


@router.get("/balances", response_model=List[FinanceAccountBalance])
async def get_finance_account_balances(
    as_of: Optional[date] = Query(None, description="Дата, на которую считать остатки (по occurred_at <= as_of)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceAccountBalance]:
    """
    Остатки по счетам (finance_accounts) на указанную дату с оборотами доходов/расходов.
    Transfer-операции учитываются как перевод между своими счетами и не попадают в обороты.
    """
    _require_finance_access(current_user)

    # Базовый набор счетов
    accounts = db.query(FinanceAccount).filter(FinanceAccount.is_active.is_(True)).all()
    balance_map: Dict[int, Dict[str, float]] = {}
    for acc in accounts:
        balance_map[acc.id] = {
            "income": 0.0,
            "expense": 0.0,
            "balance": 0.0,
        }

    # Все транзакции до указанной даты
    q = db.query(FinanceTransaction)
    if as_of is not None:
        q = q.filter(FinanceTransaction.occurred_at <= as_of)
    txs: List[FinanceTransaction] = q.all()

    for tx in txs:
        # Доход / расход: учитываем только по account_id
        if tx.direction == FinanceTransactionDirection.INCOME:
            if tx.account_id and tx.account_id in balance_map:
                balance_map[tx.account_id]["income"] += float(tx.amount or 0.0)
                balance_map[tx.account_id]["balance"] += float(tx.amount or 0.0)
        elif tx.direction == FinanceTransactionDirection.EXPENSE:
            if tx.account_id and tx.account_id in balance_map:
                amt = float(tx.amount or 0.0)
                # amount для расхода может быть отрицательным; расход считаем по модулю
                balance_map[tx.account_id]["expense"] += abs(amt)
                balance_map[tx.account_id]["balance"] += amt
        elif tx.direction == FinanceTransactionDirection.TRANSFER:
            # Перевод между своими счетами: не считаем в доход/расход, только в балансах
            amt = abs(float(tx.amount or 0.0))
            if tx.account_id and tx.account_id in balance_map:
                balance_map[tx.account_id]["balance"] -= amt
            if tx.to_account_id and tx.to_account_id in balance_map:
                balance_map[tx.to_account_id]["balance"] += amt

    result: List[FinanceAccountBalance] = []
    for acc in accounts:
        data = balance_map.get(acc.id) or {"income": 0.0, "expense": 0.0, "balance": 0.0}
        result.append(
            FinanceAccountBalance(
                account_id=acc.id,
                account_code=acc.code,
                account_name=acc.name,
                income_total=round(data["income"], 2),
                expense_total=round(data["expense"], 2),
                balance=round(data["balance"], 2),
            )
        )
    # Сортируем по коду счета для стабильного вывода
    result.sort(key=lambda x: x.account_code)
    return result


@router.get("/pnl", response_model=List[FinancePnlRow])
async def get_finance_pnl(
    target_code: str = Query("academy", description="Код проекта/кошелька (finance_targets.code)"),
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    group_by: str = Query("month", description="Группировка: 'month' или 'date'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinancePnlRow]:
    """
    P&L по операциям журнала для выбранного проекта (target).
    Учитываются только direction = income/expense; transfer-операции исключаются.
    """
    _require_finance_access(current_user)

    target = db.query(FinanceTarget).filter(FinanceTarget.code == target_code).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target с таким кодом не найден")

    q = db.query(FinanceTransaction).filter(
        FinanceTransaction.target_id == target.id,
        FinanceTransaction.direction.in_(
            [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
        ),
    )
    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= date_from)
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at <= date_to)

    txs: List[FinanceTransaction] = q.all()

    buckets: Dict[str, Dict[str, float]] = {}
    for tx in txs:
        if not tx.occurred_at:
            continue
        if group_by == "date":
            key = tx.occurred_at.date().isoformat()
        else:
            # month: YYYY-MM
            key = f"{tx.occurred_at.year:04d}-{tx.occurred_at.month:02d}"

        if key not in buckets:
            buckets[key] = {"income": 0.0, "expense": 0.0}

        amt = float(tx.amount or 0.0)
        if tx.direction == FinanceTransactionDirection.INCOME:
            buckets[key]["income"] += amt
        elif tx.direction == FinanceTransactionDirection.EXPENSE:
            buckets[key]["expense"] += abs(amt)

    rows: List[FinancePnlRow] = []
    for key in sorted(buckets.keys()):
        income = buckets[key]["income"]
        expense = buckets[key]["expense"]
        rows.append(
            FinancePnlRow(
                period=key,
                income=round(income, 2),
                expense=round(expense, 2),
                profit=round(income - expense, 2),
            )
        )
    return rows


@router.get("/analytics/summary", response_model=FinanceAnalyticsSummaryResponse)
async def get_finance_analytics_summary(
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    group_by: str = Query("month", description="Группировка P&L: month | date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(dep_require_finance_access),
) -> FinanceAnalyticsSummaryResponse:
    import traceback as _tb
    try:
        return _finance_analytics_impl(date_from, date_to, group_by, db)
    except HTTPException:
        raise
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).error("finance analytics error: %s\n%s", exc, _tb.format_exc())
        raise HTTPException(status_code=500, detail=f"Ошибка аналитики: {type(exc).__name__}: {exc}")


def _finance_analytics_impl(
    date_from: Optional[date],
    date_to: Optional[date],
    group_by: str,
    db: Session,
) -> FinanceAnalyticsSummaryResponse:
    if date_to is None:
        date_to = date.today()
    if date_from is None:
        date_from = date(date_to.year, 1, 1)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be <= date_to")

    period_start = datetime.combine(date_from, datetime.min.time())
    period_end = datetime.combine(date_to, datetime.max.time())
    days_span = max(1, (date_to - date_from).days + 1)
    prev_date_to = date_from - timedelta(days=1)
    prev_date_from = prev_date_to - timedelta(days=days_span - 1)
    prev_start = datetime.combine(prev_date_from, datetime.min.time())
    prev_end = datetime.combine(prev_date_to, datetime.max.time())

    def _sum_period(start_dt: datetime, end_dt: datetime) -> Dict[str, float]:
        rows = (
            db.query(FinanceTransaction.amount, FinanceTransaction.direction)
            .filter(
                FinanceTransaction.occurred_at >= start_dt,
                FinanceTransaction.occurred_at <= end_dt,
                FinanceTransaction.direction.in_(
                    [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
                ),
            )
            .all()
        )
        income_total = 0.0
        expense_total = 0.0
        for amount, direction in rows:
            amt = float(amount or 0.0)
            if direction == FinanceTransactionDirection.INCOME:
                income_total += amt
            elif direction == FinanceTransactionDirection.EXPENSE:
                expense_total += abs(amt)
        return {
            "income": round(income_total, 2),
            "expense": round(expense_total, 2),
            "profit": round(income_total - expense_total, 2),
        }

    current_totals = _sum_period(period_start, period_end)
    previous_totals = _sum_period(prev_start, prev_end)

    payment_summary = get_payment_status_summary(db, today=date_to)

    unclassified_rows = (
        db.query(FinanceTransaction.amount, FinanceTransaction.direction)
        .filter(
            FinanceTransaction.occurred_at >= period_start,
            FinanceTransaction.occurred_at <= period_end,
            (FinanceTransaction.target_id.is_(None)) | (FinanceTransaction.article_id.is_(None)),
        )
        .all()
    )
    unclassified_amount = 0.0
    for amount, direction in unclassified_rows:
        amt = float(amount or 0.0)
        if direction == FinanceTransactionDirection.EXPENSE:
            unclassified_amount += abs(amt)
        else:
            unclassified_amount += amt

    pnl_query = (
        db.query(FinanceTransaction)
        .filter(
            FinanceTransaction.occurred_at >= period_start,
            FinanceTransaction.occurred_at <= period_end,
            FinanceTransaction.direction.in_(
                [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
            ),
        )
        .all()
    )
    pnl_buckets: Dict[str, Dict[str, float]] = {}
    for tx in pnl_query:
        if not tx.occurred_at:
            continue
        key = tx.occurred_at.date().isoformat() if group_by == "date" else f"{tx.occurred_at.year:04d}-{tx.occurred_at.month:02d}"
        if key not in pnl_buckets:
            pnl_buckets[key] = {"income": 0.0, "expense": 0.0}
        amt = float(tx.amount or 0.0)
        if tx.direction == FinanceTransactionDirection.INCOME:
            pnl_buckets[key]["income"] += amt
        elif tx.direction == FinanceTransactionDirection.EXPENSE:
            pnl_buckets[key]["expense"] += abs(amt)
    pnl_rows = [
        FinancePnlRow(
            period=key,
            income=round(values["income"], 2),
            expense=round(values["expense"], 2),
            profit=round(values["income"] - values["expense"], 2),
        )
        for key, values in sorted(pnl_buckets.items())
    ]

    target_rows = (
        db.query(
            FinanceTarget.id,
            FinanceTarget.code,
            FinanceTarget.name,
            FinanceTransaction.amount,
            FinanceTransaction.direction,
        )
        .join(FinanceTarget, FinanceTarget.id == FinanceTransaction.target_id, isouter=True)
        .filter(
            FinanceTransaction.occurred_at >= period_start,
            FinanceTransaction.occurred_at <= period_end,
            FinanceTransaction.direction.in_(
                [FinanceTransactionDirection.INCOME, FinanceTransactionDirection.EXPENSE]
            ),
        )
        .all()
    )
    target_buckets: Dict[str, Dict[str, object]] = {}
    for target_id, code, name, amount, direction in target_rows:
        bucket_key = str(code or "__unassigned__")
        if bucket_key not in target_buckets:
            target_buckets[bucket_key] = {
                "target_id": target_id,
                "target_code": code or "unassigned",
                "target_name": name or "Не распределено",
                "income": 0.0,
                "expense": 0.0,
            }
        amt = float(amount or 0.0)
        if direction == FinanceTransactionDirection.INCOME:
            target_buckets[bucket_key]["income"] = float(target_buckets[bucket_key]["income"]) + amt
        elif direction == FinanceTransactionDirection.EXPENSE:
            target_buckets[bucket_key]["expense"] = float(target_buckets[bucket_key]["expense"]) + abs(amt)
    target_breakdown = sorted(
        [
            FinanceAnalyticsTargetBreakdownRow(
                target_id=data["target_id"],
                target_code=str(data["target_code"]),
                target_name=str(data["target_name"]),
                income=round(float(data["income"]), 2),
                expense=round(float(data["expense"]), 2),
                profit=round(float(data["income"]) - float(data["expense"]), 2),
            )
            for data in target_buckets.values()
        ],
        key=lambda row: abs(row.profit),
        reverse=True,
    )

    expense_rows = (
        db.query(
            FinanceArticle.id,
            FinanceArticle.name,
            FinanceArticle.cost_kind,
            FinanceTransaction.amount,
        )
        .join(FinanceArticle, FinanceArticle.id == FinanceTransaction.article_id, isouter=True)
        .filter(
            FinanceTransaction.occurred_at >= period_start,
            FinanceTransaction.occurred_at <= period_end,
            FinanceTransaction.direction == FinanceTransactionDirection.EXPENSE,
        )
        .all()
    )
    expense_buckets: Dict[str, Dict[str, object]] = {}
    for article_id, name, cost_kind, amount in expense_rows:
        bucket_key = str(article_id or "__unassigned__")
        if bucket_key not in expense_buckets:
            expense_buckets[bucket_key] = {
                "article_id": article_id,
                "article_name": name or "Без статьи",
                "cost_kind": str(getattr(cost_kind, "value", cost_kind)) if cost_kind is not None else None,
                "amount": 0.0,
            }
        expense_buckets[bucket_key]["amount"] = float(expense_buckets[bucket_key]["amount"]) + abs(float(amount or 0.0))
    expense_breakdown = sorted(
        [
            FinanceAnalyticsExpenseBreakdownRow(
                article_id=data["article_id"],
                article_name=str(data["article_name"]),
                cost_kind=data["cost_kind"],
                amount=round(float(data["amount"]), 2),
            )
            for data in expense_buckets.values()
        ],
        key=lambda row: row.amount,
        reverse=True,
    )[:12]

    accounts = db.query(FinanceAccount).filter(FinanceAccount.is_active.is_(True)).all()
    balance_map: Dict[int, Dict[str, float]] = {
        acc.id: {"income": 0.0, "expense": 0.0, "balance": 0.0} for acc in accounts
    }
    balance_rows = db.query(FinanceTransaction).filter(FinanceTransaction.occurred_at <= period_end).all()
    for tx in balance_rows:
        if tx.direction == FinanceTransactionDirection.INCOME and tx.account_id in balance_map:
            amt = float(tx.amount or 0.0)
            balance_map[tx.account_id]["income"] += amt
            balance_map[tx.account_id]["balance"] += amt
        elif tx.direction == FinanceTransactionDirection.EXPENSE and tx.account_id in balance_map:
            amt = float(tx.amount or 0.0)
            balance_map[tx.account_id]["expense"] += abs(amt)
            balance_map[tx.account_id]["balance"] += amt
        elif tx.direction == FinanceTransactionDirection.TRANSFER:
            amt = abs(float(tx.amount or 0.0))
            if tx.account_id in balance_map:
                balance_map[tx.account_id]["balance"] -= amt
            if tx.to_account_id in balance_map:
                balance_map[tx.to_account_id]["balance"] += amt
    account_balances = [
        FinanceAccountBalance(
            account_id=acc.id,
            account_code=acc.code,
            account_name=acc.name,
            income_total=round(balance_map[acc.id]["income"], 2),
            expense_total=round(balance_map[acc.id]["expense"], 2),
            balance=round(balance_map[acc.id]["balance"], 2),
        )
        for acc in sorted(accounts, key=lambda item: item.code)
    ]

    return FinanceAnalyticsSummaryResponse(
        date_from=date_from,
        date_to=date_to,
        kpi=FinanceAnalyticsKpiBlock(
            income_total=current_totals["income"],
            expense_total=current_totals["expense"],
            profit_total=current_totals["profit"],
            prev_income_total=previous_totals["income"],
            prev_expense_total=previous_totals["expense"],
            prev_profit_total=previous_totals["profit"],
            income_delta=round(current_totals["income"] - previous_totals["income"], 2),
            expense_delta=round(current_totals["expense"] - previous_totals["expense"], 2),
            profit_delta=round(current_totals["profit"] - previous_totals["profit"], 2),
            overdue_payments_3_count=int(payment_summary["overdue_3_count"]),
            overdue_payments_10_count=int(payment_summary["overdue_10_count"]),
            unclassified_transactions_count=len(unclassified_rows),
            unclassified_transactions_amount=round(unclassified_amount, 2),
        ),
        pnl=pnl_rows,
        target_breakdown=target_breakdown,
        expense_breakdown=expense_breakdown,
        account_balances=account_balances,
    )


@router.post("/import")
async def import_finance_transactions(
    account_code: str = Form(..., description="Код счёта (finance_accounts.code)"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, int]:
    """
    Импорт операций из CSV/XLSX напрямую в единый финансовый журнал.

    Минимальный CSV-формат: колонки
      date,amount,counterparty,description,bank_operation_id(optional)
    """
    _require_finance_access(current_user)

    account = db.query(FinanceAccount).filter(FinanceAccount.code == account_code).first()
    if not account:
        raise HTTPException(status_code=400, detail="account_code не найден в finance_accounts")

    filename = (file.filename or "").lower()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    created = 0
    skipped = 0

    def _upsert_row(
        date_str: str,
        amount_val: float,
        counterparty: str,
        description: str,
        bank_operation_id: Optional[str],
        bank_source: str,
    ) -> None:
        nonlocal created, skipped
        if not date_str or not amount_val:
            skipped += 1
            return
        # Нормализуем строку даты: поддерживаем "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS" и т.п.
        try:
            ds = date_str.strip()
            # Если дата пришла как "2026-03-09 00:00:00" (из Excel), берём только часть до пробела
            if " " in ds and "T" not in ds:
                ds = ds.split(" ")[0]
            occurred_at = datetime.fromisoformat(ds + "T12:00:00")
        except Exception:
            skipped += 1
            return

        direction = "income" if amount_val > 0 else "expense"
        # v2: версионированный dedup_seed, чтобы избежать конфликтов со старыми импортами
        dedup_seed = f"v2|{bank_source}|{date_str}|{amount_val}|{counterparty.strip()}|{description.strip()}"
        dedup_hash = hashlib.sha1(dedup_seed.encode("utf-8")).hexdigest()

        # Проверка на дубликат.
        # Если есть bank_operation_id — считаем дубликатом по нему.
        # Если operation_id отсутствует — используем dedup_hash.
        if bank_operation_id:
            existing = (
                db.query(FinanceTransaction.id)
                .filter(
                    FinanceTransaction.bank_source == bank_source,
                    FinanceTransaction.bank_operation_id == bank_operation_id,
                )
                .first()
            )
        else:
            existing = (
                db.query(FinanceTransaction.id)
                .filter(
                    FinanceTransaction.bank_source == bank_source,
                    FinanceTransaction.dedup_hash == dedup_hash,
                )
                .first()
            )
        if existing:
            skipped += 1
            return

        tx = FinanceTransaction(
            occurred_at=occurred_at,
            amount=amount_val,
            direction=direction,
            account_id=account.id,
            to_account_id=None,
            transfer_group_id=None,
            counterparty_name=counterparty.strip() or None,
            counterparty_phone=None,
            description_raw=description.strip() or None,
            bank_source=bank_source,
            bank_operation_id=bank_operation_id,
            dedup_hash=dedup_hash,
            target_id=None,
            article_id=None,
            student_id=None,
            group_id=None,
            teacher_id=None,
            status=FinanceTransactionStatus.NEW,
        )
        try:
            with db_transaction(db):
                db.add(tx)
                # авто-классификация по правилам для новых импортированных операций
                apply_recognition_rules(db, tx)
            created += 1
        except IntegrityError:
            # Дубликат по уникальному индексу или другой конфликт — пропускаем строку
            skipped += 1

    if filename.endswith(".csv"):
        bank_source = "import_csv"
        text = content.decode("utf-8", errors="ignore")
        reader = csv.DictReader(StringIO(text))
        for row in reader:
            date_str = (row.get("date") or "").strip()
            amount_raw = (row.get("amount") or "").replace(" ", "").replace(",", ".")
            try:
                amount_val = float(amount_raw)
            except ValueError:
                skipped += 1
                continue
            counterparty = (row.get("counterparty") or "").strip()
            description = (row.get("description") or "").strip()
            bank_operation_id = (row.get("bank_operation_id") or "").strip() or None
            _upsert_row(date_str, amount_val, counterparty, description, bank_operation_id, bank_source)
    elif filename.endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl не установлен в окружении сервера")

        # Для нового импорта Excel используем отдельный bank_source,
        # чтобы не конфликтовать со старыми записями ("import_xlsx").
        bank_source = "import_xlsx_v2"
        wb = load_workbook(filename=BytesIO(content), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise HTTPException(status_code=400, detail="Файл .xlsx без строк")

        # Нормализуем заголовки: поддерживаем как минимальный формат
        # (date, amount, counterparty, description, bank_operation_id),
        # так и русские выгрузки из банка (Дата, Сумма, Контрагент, Описание / источник, Тип).
        raw_header = [str(v).strip().lower() if v is not None else "" for v in rows[0]]
        rus_to_std = {
            "дата": "date",
            "сумма": "amount",
            "контрагент": "counterparty",
            "описание / источник": "description",
            "описание/источник": "description",
            "описание": "description",
            "тип": "type",
        }
        header = [rus_to_std.get(name, name) for name in raw_header]
        col_index = {name: idx for idx, name in enumerate(header)}

        for r in rows[1:]:
            if not any(r):
                continue

            def _get(col: str) -> str:
                idx = col_index.get(col)
                if idx is None or idx >= len(r):
                    return ""
                val = r[idx]
                return "" if val is None else str(val).strip()

            date_str = _get("date")
            # Поддержка формата дат dd.mm.yyyy (банковская выгрузка) и ISO yyyy-mm-dd
            if date_str and "." in date_str and "-" not in date_str:
                from datetime import datetime as _dt

                try:
                    parsed = _dt.strptime(date_str, "%d.%m.%Y")
                    date_str = parsed.date().isoformat()
                except Exception:
                    # Некорректные даты отфильтрует _upsert_row
                    pass

            amount_raw = _get("amount").replace(" ", "").replace(",", ".")
            try:
                amount_val = float(amount_raw)
            except ValueError:
                skipped += 1
                continue

            # Для банковских выгрузок, где сумма всегда положительная,
            # используем колонку "Тип" (Доход / Расход), если она есть.
            tx_type = _get("type").lower()
            if tx_type.startswith("расход"):
                amount_val = -abs(amount_val)
            elif tx_type.startswith("доход"):
                amount_val = abs(amount_val)

            counterparty = _get("counterparty")
            description = _get("description")
            bank_operation_id = _get("bank_operation_id") or None
            _upsert_row(date_str, amount_val, counterparty, description, bank_operation_id, bank_source)
    else:
        raise HTTPException(status_code=400, detail="Поддерживаются только форматы .csv и .xlsx")

    # Итоговые числа по импортированным и пропущенным строкам
    return {"imported": created, "skipped": skipped}


@router.post("/manual-transaction", response_model=FinanceLedgerBankRow)
async def create_manual_transaction(
    payload: FinanceManualTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerBankRow:
    """
    Ручное добавление операции в единый журнал (например, наличные — счёт «Наличка»).
    Операция создаётся сразу с статусом classified.
    """
    _require_finance_access(current_user)

    amount = float(payload.amount or 0.0)
    if amount == 0:
        raise HTTPException(status_code=400, detail="Сумма не может быть нулевой")

    if payload.direction not in {d.value for d in FinanceTransactionDirection}:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="Некорректное направление: income или expense")

    account = db.query(FinanceAccount).filter(FinanceAccount.id == payload.account_id, FinanceAccount.is_active.is_(True)).first()
    if not account:
        raise HTTPException(status_code=400, detail="Счёт не найден или неактивен")

    if payload.article_id and not db.query(FinanceArticle.id).filter(FinanceArticle.id == payload.article_id).first():
        raise HTTPException(status_code=400, detail="Статья не найдена")
    if payload.target_id and not db.query(FinanceTarget.id).filter(FinanceTarget.id == payload.target_id).first():
        raise HTTPException(status_code=400, detail="Цель/проект не найден")

    occurred_at = datetime.combine(payload.occurred_at, datetime.min.time())
    description = (payload.description or "").strip() or None

    tx = FinanceTransaction(
        occurred_at=occurred_at,
        amount=abs(amount),
        direction=FinanceTransactionDirection(payload.direction),  # type: ignore[call-arg]
        account_id=payload.account_id,
        to_account_id=None,
        transfer_group_id=None,
        counterparty_name=description,
        counterparty_phone=None,
        description_raw=description,
        bank_source="manual",
        bank_operation_id=None,
        dedup_hash=None,
        target_id=payload.target_id,
        article_id=payload.article_id,
        student_id=None,
        group_id=None,
        teacher_id=None,
        status=FinanceTransactionStatus.CLASSIFIED,
    )
    with db_transaction(db):
        db.add(tx)
    db.refresh(tx)

    tx = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.id == tx.id)
        .first()
    )
    account = getattr(tx, "account", None)
    to_account = getattr(tx, "to_account", None)
    target = getattr(tx, "target", None)
    article = getattr(tx, "article", None)

    return FinanceLedgerBankRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=float(tx.amount or 0.0),
        direction=str(getattr(tx.direction, "value", tx.direction)),
        status=str(getattr(tx.status, "value", tx.status)),
        account_id=tx.account_id,
        account_code=getattr(account, "code", None),
        account_name=getattr(account, "name", None),
        to_account_id=tx.to_account_id,
        to_account_code=getattr(to_account, "code", None),
        to_account_name=getattr(to_account, "name", None),
        transfer_group_id=tx.transfer_group_id,
        counterparty_name=tx.counterparty_name,
        counterparty_phone=tx.counterparty_phone,
        bank_source=tx.bank_source,
        bank_operation_id=tx.bank_operation_id,
        target_id=tx.target_id,
        target_code=getattr(target, "code", None),
        target_name=getattr(target, "name", None),
        article_id=tx.article_id,
        article_name=getattr(article, "name", None),
        student_id=tx.student_id,
    )


@router.get("/ledger/bank", response_model=List[FinanceLedgerBankRow])
async def list_finance_ledger_bank(
    status_filter: Optional[List[str]] = Query(
        None,
        description="Фильтр по статусу finance_transactions: new, classified, applied",
    ),
    unclassified_only: bool = Query(
        False,
        description="Только неразобранные операции (target_id IS NULL OR article_id IS NULL)",
    ),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceLedgerBankRow]:
    """
    Операции из единого финансового журнала, которые пришли из банков (bank_source не NULL),
    для использования на вкладке «Операции банка».
    """
    _require_finance_access(current_user)

    q = (
        db.query(FinanceTransaction)
        .outerjoin(FinanceAccount, FinanceAccount.id == FinanceTransaction.account_id)
        .outerjoin(FinanceAccount, FinanceAccount.id == FinanceTransaction.to_account_id)
    )
    # Чтобы не путать алиасы, сделаем отдельные выборки ниже через joinedload
    q = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.bank_source.isnot(None))
        .order_by(FinanceTransaction.created_at.desc())
    )

    if status_filter:
        allowed = {s.value for s in FinanceTransactionStatus}  # type: ignore[attr-defined]
        invalid = [s for s in status_filter if s not in allowed]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Некорректный status: {', '.join(invalid)}",
            )
        q = q.filter(FinanceTransaction.status.in_(status_filter))

    if unclassified_only:
        q = q.filter(
            (FinanceTransaction.target_id.is_(None))
            | (FinanceTransaction.article_id.is_(None))
        )

    items: List[FinanceTransaction] = q.limit(limit).all()

    rows: List[FinanceLedgerBankRow] = []
    for tx in items:
        account: Optional[FinanceAccount] = getattr(tx, "account", None)
        to_account: Optional[FinanceAccount] = getattr(tx, "to_account", None)
        target: Optional[FinanceTarget] = getattr(tx, "target", None)
        article: Optional[FinanceArticle] = getattr(tx, "article", None)

        rows.append(
            FinanceLedgerBankRow(
                id=tx.id,
                occurred_at=tx.occurred_at,
                amount=tx.amount,
                direction=str(getattr(tx.direction, "value", tx.direction)),
                status=str(getattr(tx.status, "value", tx.status)),
                account_id=tx.account_id,
                account_code=getattr(account, "code", None),
                account_name=getattr(account, "name", None),
                to_account_id=tx.to_account_id,
                to_account_code=getattr(to_account, "code", None),
                to_account_name=getattr(to_account, "name", None),
                transfer_group_id=tx.transfer_group_id,
                counterparty_name=tx.counterparty_name,
                counterparty_phone=tx.counterparty_phone,
                bank_source=tx.bank_source,
                bank_operation_id=tx.bank_operation_id,
                target_id=tx.target_id,
                target_code=getattr(target, "code", None),
                target_name=getattr(target, "name", None),
                article_id=tx.article_id,
                article_name=getattr(article, "name", None),
                student_id=tx.student_id,
            )
        )
    return rows


@router.get("/transactions", response_model=List[FinanceLedgerBankRow])
async def list_finance_transactions(
    account_ids: Optional[List[int]] = Query(
        None,
        description="Фильтр по счетам (finance_accounts.id). Пусто = все активные счета.",
    ),
    target_ids: Optional[List[int]] = Query(
        None,
        description="Фильтр по проектам (finance_targets.id). Пусто = все.",
    ),
    article_ids: Optional[List[int]] = Query(
        None,
        description="Фильтр по статьям (finance_articles.id). Пусто = все.",
    ),
    direction: Optional[str] = Query(
        None,
        description="Фильтр по типу операции: income | expense | transfer",
    ),
    status: Optional[List[str]] = Query(
        None,
        description="Фильтр по статусу finance_transactions: new, classified, applied (если используется). Пусто = все.",
    ),
    unclassified_only: bool = Query(
        False,
        description="Только неразобранные операции (target_id IS NULL OR article_id IS NULL)",
    ),
    date_from: Optional[date] = Query(None, description="Начало периода (включительно)"),
    date_to: Optional[date] = Query(None, description="Конец периода (включительно)"),
    limit: int = Query(5000, ge=1, le=50000),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> List[FinanceLedgerBankRow]:
    """
    Каноничный список операций единого финансового журнала.

    Используется вкладкой «Все операции» в разделе Финансы → Журнал.
    Возвращает те же поля, что и /finance/ledger/bank, но без фильтра по bank_source
    (включает как банковские операции, так и ручные / импортированные записи).
    """
    _require_finance_access(current_user)

    q = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .order_by(FinanceTransaction.occurred_at.desc(), FinanceTransaction.id.desc())
    )

    if account_ids:
        q = q.filter(FinanceTransaction.account_id.in_(account_ids))
    if target_ids:
        q = q.filter(FinanceTransaction.target_id.in_(target_ids))
    if article_ids:
        q = q.filter(FinanceTransaction.article_id.in_(article_ids))
    if direction:
        if direction not in {d.value for d in FinanceTransactionDirection}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение direction")
        q = q.filter(FinanceTransaction.direction == FinanceTransactionDirection(direction))  # type: ignore[call-arg]
    if status:
        allowed = {s.value for s in FinanceTransactionStatus}  # type: ignore[attr-defined]
        invalid = [s for s in status if s not in allowed]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Некорректный status: {', '.join(invalid)}",
            )
        q = q.filter(FinanceTransaction.status.in_(status))
    if unclassified_only:
        q = q.filter(
            (FinanceTransaction.target_id.is_(None))
            | (FinanceTransaction.article_id.is_(None))
        )
    if date_from is not None:
        q = q.filter(FinanceTransaction.occurred_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        q = q.filter(FinanceTransaction.occurred_at <= datetime.combine(date_to, datetime.max.time()))

    items: List[FinanceTransaction] = q.limit(limit).all()

    rows: List[FinanceLedgerBankRow] = []
    for tx in items:
        account: Optional[FinanceAccount] = getattr(tx, "account", None)
        to_account: Optional[FinanceAccount] = getattr(tx, "to_account", None)
        target: Optional[FinanceTarget] = getattr(tx, "target", None)
        article: Optional[FinanceArticle] = getattr(tx, "article", None)

        rows.append(
            FinanceLedgerBankRow(
                id=tx.id,
                occurred_at=tx.occurred_at,
                amount=float(tx.amount or 0.0),
                direction=str(getattr(tx.direction, "value", tx.direction)),
                status=str(getattr(tx.status, "value", tx.status)),
                account_id=tx.account_id,
                account_code=getattr(account, "code", None),
                account_name=getattr(account, "name", None),
                to_account_id=tx.to_account_id,
                to_account_code=getattr(to_account, "code", None),
                to_account_name=getattr(to_account, "name", None),
                transfer_group_id=tx.transfer_group_id,
                counterparty_name=tx.counterparty_name,
                counterparty_phone=tx.counterparty_phone,
                bank_source=tx.bank_source,
                bank_operation_id=tx.bank_operation_id,
                target_id=tx.target_id,
                target_code=getattr(target, "code", None),
                target_name=getattr(target, "name", None),
                article_id=tx.article_id,
                article_name=getattr(article, "name", None),
                student_id=tx.student_id,
            )
        )

    return rows


@router.patch("/transactions/{transaction_id}", response_model=FinanceLedgerBankRow)
async def update_finance_transaction(
    transaction_id: int,
    payload: FinanceTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerBankRow:
    """
    Частичное обновление транзакции журнала (смена направления, target/article, счетов, статуса).
    Используется для ручной классификации во фронтенде.
    """
    _require_finance_access(current_user)

    tx = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.id == transaction_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Транзакция не найдена")

    if payload.direction is not None:
        if payload.direction not in {d.value for d in FinanceTransactionDirection}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение direction")
        tx.direction = FinanceTransactionDirection(payload.direction)  # type: ignore[call-arg]

    if payload.status is not None:
        if payload.status not in {s.value for s in FinanceTransactionStatus}:  # type: ignore[attr-defined]
            raise HTTPException(status_code=400, detail="Некорректное значение status")
        tx.status = FinanceTransactionStatus(payload.status)  # type: ignore[call-arg]

    if payload.account_id is not None:
        if payload.account_id and not db.query(FinanceAccount.id).filter(FinanceAccount.id == payload.account_id).first():
            raise HTTPException(status_code=400, detail="account_id не найден")
        tx.account_id = payload.account_id

    if payload.to_account_id is not None:
        if payload.to_account_id and not db.query(FinanceAccount.id).filter(FinanceAccount.id == payload.to_account_id).first():
            raise HTTPException(status_code=400, detail="to_account_id не найден")
        tx.to_account_id = payload.to_account_id

    if payload.target_id is not None:
        if payload.target_id and not db.query(FinanceTarget.id).filter(FinanceTarget.id == payload.target_id).first():
            raise HTTPException(status_code=400, detail="target_id не найден")
        tx.target_id = payload.target_id

    if payload.article_id is not None:
        if payload.article_id and not db.query(FinanceArticle.id).filter(FinanceArticle.id == payload.article_id).first():
            raise HTTPException(status_code=400, detail="article_id не найден")
        tx.article_id = payload.article_id

    if payload.transfer_group_id is not None:
        tx.transfer_group_id = payload.transfer_group_id or None

    with db_transaction(db):
        pass
    db.refresh(tx)

    account: Optional[FinanceAccount] = getattr(tx, "account", None)
    to_account: Optional[FinanceAccount] = getattr(tx, "to_account", None)
    target: Optional[FinanceTarget] = getattr(tx, "target", None)
    article: Optional[FinanceArticle] = getattr(tx, "article", None)

    return FinanceLedgerBankRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=tx.amount,
        direction=str(getattr(tx.direction, "value", tx.direction)),
        status=str(getattr(tx.status, "value", tx.status)),
        account_id=tx.account_id,
        account_code=getattr(account, "code", None),
        account_name=getattr(account, "name", None),
        to_account_id=tx.to_account_id,
        to_account_code=getattr(to_account, "code", None),
        to_account_name=getattr(to_account, "name", None),
        counterparty_name=tx.counterparty_name,
        counterparty_phone=tx.counterparty_phone,
        bank_source=tx.bank_source,
        bank_operation_id=tx.bank_operation_id,
        target_id=tx.target_id,
        target_code=getattr(target, "code", None),
        target_name=getattr(target, "name", None),
        article_id=tx.article_id,
        article_name=getattr(article, "name", None),
        student_id=tx.student_id,
    )


@router.delete("/transactions/{transaction_id}")
async def delete_finance_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> Dict[str, bool]:
    """Удаление транзакции журнала (используется только в личных финансах)."""
    _require_finance_access(current_user)

    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Транзакция не найдена")

    with db_transaction(db):
        db.delete(tx)
    return {"ok": True}


@router.post("/transactions/{transaction_id}/apply-student", response_model=FinanceLedgerBankRow)
async def apply_finance_transaction_to_student(
    transaction_id: int,
    payload: FinanceTransactionApplyStudentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
) -> FinanceLedgerBankRow:
    """
    Зачислить операцию журнала на счёт ученика.

    Используется журналом (Финансы → Журнал), чтобы не идти в таб «Операции банка».
    Создаёт StudentAccountTransaction, обновляет баланс счёта и помечает транзакцию как applied.
    """
    _require_finance_access(current_user)

    tx = (
        db.query(FinanceTransaction)
        .options(
            joinedload(FinanceTransaction.account),
            joinedload(FinanceTransaction.to_account),
            joinedload(FinanceTransaction.target),
            joinedload(FinanceTransaction.article),
        )
        .filter(FinanceTransaction.id == transaction_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Транзакция не найдена")

    if tx.direction != FinanceTransactionDirection.INCOME:
        raise HTTPException(status_code=400, detail="Зачислить ученику можно только доходную операцию")

    amount = float(tx.amount or 0.0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма операции должна быть больше 0")

    try:
        pay_date = tx.occurred_at.date() if tx.occurred_at else date.today()
    except Exception:
        pay_date = date.today()
    note = tx.counterparty_name or tx.description_raw or "Платёж из журнала"
    try:
        from app.services.student_account_payment import add_payment_to_student_account
        add_payment_to_student_account(db, payload.student_id, amount, note, pay_date)
    except ValueError as e:
        if "не найден" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))

    with db_transaction(db):
        tx.status = FinanceTransactionStatus.APPLIED
        tx.student_id = payload.student_id
    db.refresh(tx)

    account_obj: Optional[FinanceAccount] = getattr(tx, "account", None)
    to_account_obj: Optional[FinanceAccount] = getattr(tx, "to_account", None)
    target_obj: Optional[FinanceTarget] = getattr(tx, "target", None)
    article_obj: Optional[FinanceArticle] = getattr(tx, "article", None)

    return FinanceLedgerBankRow(
        id=tx.id,
        occurred_at=tx.occurred_at,
        amount=float(tx.amount or 0.0),
        direction=str(getattr(tx.direction, "value", tx.direction)),
        status=str(getattr(tx.status, "value", tx.status)),
        account_id=tx.account_id,
        account_code=getattr(account_obj, "code", None),
        account_name=getattr(account_obj, "name", None),
        to_account_id=tx.to_account_id,
        to_account_code=getattr(to_account_obj, "code", None),
        to_account_name=getattr(to_account_obj, "name", None),
        transfer_group_id=tx.transfer_group_id,
        counterparty_name=tx.counterparty_name,
        counterparty_phone=tx.counterparty_phone,
        bank_source=tx.bank_source,
        bank_operation_id=tx.bank_operation_id,
        target_id=tx.target_id,
        target_code=getattr(target_obj, "code", None),
        target_name=getattr(target_obj, "name", None),
        article_id=tx.article_id,
        article_name=getattr(article_obj, "name", None),
        student_id=tx.student_id,
    )


# --- Счета учеников (StudentAccount): канонический API Finance по ТЗ ---


@router.post("/student-accounts", response_model=StudentAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_student_account_finance(
    payload: FinanceStudentAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(dep_require_finance_access),
) -> StudentAccountResponse:
    """Создать счёт ученику. Канонический API Finance (ТЗ этап 4)."""
    try:
        account = finance_create_student_account(db, payload.student_id, payload.name or "")
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    with db_transaction(db):
        pass
    db.refresh(account)
    return StudentAccountResponse.model_validate(account)


# --- Банковские операции (BankTransaction): канонический API Finance по ТЗ ---


@router.post("/bank-transactions/{transaction_id}/apply", response_model=BankTransactionResponse)
async def apply_bank_transaction_to_student(
    transaction_id: int,
    payload: BankTransactionApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(dep_require_finance_access),
) -> BankTransactionResponse:
    """
    Зачислить банковскую операцию (BankTransaction) на выбранного ученика.
    Канонический API Finance; дублирует функциональность POST /api/sales/bank-transactions/{id}/apply (compatibility layer).
    """
    try:
        with db_transaction(db):
            result = bank_operation_apply(db, transaction_id, payload.student_id)
    except ValueError as e:
        msg = str(e)
        if "не найден" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    db.refresh(result.transaction)
    return BankTransactionResponse.model_validate(result.transaction)
