"""Простая аналитика направления: расход токенов/вызовов из AiGatewayCallLog
(фильтр по feature-префиксу "ai_studio:<code>:") + счётчики диалогов и базы
знаний. Генерация контента для публикаций сюда не входит — см. smm_projects."""
from __future__ import annotations

from typing import Any, Dict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AiDialog, AiGatewayCallLog, AiKnowledgeItem, AiWorkspace


def workspace_summary(db: Session, workspace: AiWorkspace) -> Dict[str, Any]:
    feature_prefix = f"ai_studio:{workspace.code}:%"

    total_calls = (
        db.query(func.count(AiGatewayCallLog.id)).filter(AiGatewayCallLog.feature.like(feature_prefix)).scalar() or 0
    )
    error_calls = (
        db.query(func.count(AiGatewayCallLog.id))
        .filter(AiGatewayCallLog.feature.like(feature_prefix), AiGatewayCallLog.status == "error")
        .scalar()
        or 0
    )
    total_tokens = (
        db.query(func.coalesce(func.sum(AiGatewayCallLog.total_tokens), 0))
        .filter(AiGatewayCallLog.feature.like(feature_prefix))
        .scalar()
        or 0
    )
    total_cost = (
        db.query(func.coalesce(func.sum(AiGatewayCallLog.cost_usd), 0))
        .filter(AiGatewayCallLog.feature.like(feature_prefix))
        .scalar()
        or 0
    )
    dialogs_count = db.query(func.count(AiDialog.id)).filter(AiDialog.workspace_id == workspace.id).scalar() or 0
    knowledge_count = (
        db.query(func.count(AiKnowledgeItem.id))
        .filter(AiKnowledgeItem.workspace_id == workspace.id, AiKnowledgeItem.is_active.is_(True))
        .scalar()
        or 0
    )

    return {
        "ai_calls_total": int(total_calls),
        "ai_calls_error": int(error_calls),
        "ai_tokens_total": int(total_tokens),
        "ai_cost_usd_total": float(total_cost),
        "dialogs_total": int(dialogs_count),
        "knowledge_items_active": int(knowledge_count),
    }
