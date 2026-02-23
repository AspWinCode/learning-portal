from datetime import date, datetime
from sqlalchemy.orm import Session
from app.models import ActionLog
from typing import Optional, Dict, Any


def _details_for_json(details: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Преобразует date/datetime в строки ISO для записи в JSON."""
    if details is None:
        return None
    out = {}
    for k, v in details.items():
        if isinstance(v, date) and not isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


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
        details=_details_for_json(details)
    )
    db.add(log_entry)
    db.commit()

