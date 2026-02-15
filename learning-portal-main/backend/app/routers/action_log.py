from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import ActionLog


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    return str(value)


def log_action(
    db: Session,
    user_id: Optional[int],
    action_type: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None
):
    """Логирование действий пользователей"""
    safe_details = _json_safe(details) if details is not None else None
    log_entry = ActionLog(
        user_id=user_id,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        details=safe_details,
    )
    db.add(log_entry)
    db.commit()

