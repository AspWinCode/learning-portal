"""Простая аналитика направления (п.28 ТЗ): расход токенов/вызовов из
AiGatewayCallLog (уже общий для всей платформы, фильтруем по feature-префиксу
"ai_studio:<code>:") + счётчики по контенту и базе знаний. Никаких секретов
провайдеров здесь не читаем и не возвращаем — только агрегаты."""
from __future__ import annotations

from typing import Any, Dict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AiGatewayCallLog, AiGeneratedContent, AiKnowledgeItem, AiWorkspace


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

    content_by_status = dict(
        db.query(AiGeneratedContent.status, func.count(AiGeneratedContent.id))
        .filter(AiGeneratedContent.workspace_id == workspace.id)
        .group_by(AiGeneratedContent.status)
        .all()
    )
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
        "content_by_status": {str(k): int(v) for k, v in content_by_status.items()},
        "knowledge_items_active": int(knowledge_count),
    }
