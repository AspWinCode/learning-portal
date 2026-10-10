from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models import MaxBroadcast, MaxBroadcastTarget
from app.services.max_client import MaxRateLimitedError, get_max_client

logger = logging.getLogger(__name__)


def process_max_broadcast_target(target_id: int) -> None:
    db = SessionLocal()
    try:
        target = db.query(MaxBroadcastTarget).filter(MaxBroadcastTarget.id == target_id).with_for_update().first()
        if target is None or target.status in {"success", "sending"}:
            return
        broadcast = db.query(MaxBroadcast).filter(MaxBroadcast.id == target.broadcast_id).first()
        if broadcast is None:
            return
        target.status = "sending"
        target.attempts = int(target.attempts or 0) + 1
        broadcast.status = "sending"
        broadcast.started_at = broadcast.started_at or datetime.now(timezone.utc)
        db.commit()
        try:
            get_max_client().send_message(target.external_chat_id, broadcast.message)
        except MaxRateLimitedError:
            target.status = "pending"
            db.commit()
            raise
        except Exception as exc:
            target.status = "failed"
            target.last_error = str(exc)[:1000]
            db.commit()
            logger.warning("max_broadcast_target_failed target_id=%s error=%s", target_id, exc)
            _refresh_broadcast(db, broadcast)
            return
        target.status = "success"
        target.sent_at = datetime.now(timezone.utc)
        target.last_error = None
        db.commit()
        _refresh_broadcast(db, broadcast)
    finally:
        db.close()


def _refresh_broadcast(db, broadcast: MaxBroadcast) -> None:
    targets = db.query(MaxBroadcastTarget).filter(MaxBroadcastTarget.broadcast_id == broadcast.id).all()
    broadcast.total_targets = len(targets)
    broadcast.success_count = sum(t.status == "success" for t in targets)
    broadcast.failed_count = sum(t.status == "failed" for t in targets)
    if targets and all(t.status in {"success", "failed"} for t in targets):
        broadcast.status = "completed" if broadcast.failed_count == 0 else "completed_with_errors"
        broadcast.finished_at = datetime.now(timezone.utc)
    db.commit()
