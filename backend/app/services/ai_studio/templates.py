from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import AiContentTemplate, AiWorkspace


def list_templates(db: Session, workspace: AiWorkspace, *, active_only: bool = True) -> List[AiContentTemplate]:
    q = db.query(AiContentTemplate).filter(AiContentTemplate.workspace_id == workspace.id)
    if active_only:
        q = q.filter(AiContentTemplate.is_active.is_(True))
    return q.order_by(AiContentTemplate.sort_order, AiContentTemplate.id).all()


def get_by_code(db: Session, workspace: AiWorkspace, code: str) -> Optional[AiContentTemplate]:
    return (
        db.query(AiContentTemplate)
        .filter(AiContentTemplate.workspace_id == workspace.id, AiContentTemplate.code == code)
        .first()
    )
