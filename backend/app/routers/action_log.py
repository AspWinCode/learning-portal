from sqlalchemy.orm import Session
from app.models import ActionLog
from typing import Optional, Dict, Any


def log_action(
    db: Session,
    user_id: Optional[int],
    action_type: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Логирование действий пользователей"""
    log_entry = ActionLog(
        user_id=user_id,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details
    )
    db.add(log_entry)
    db.commit()

