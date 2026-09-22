"""NPS: опрос «оцените от 0 до 10, порекомендуете ли нас» в кабинете родителя,
не чаще раза в квартал. NPS = %Промоутеров(9-10) - %Детракторов(0-6)."""

from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.models import NpsResponse


def current_period_label(now: datetime) -> str:
    quarter = (now.month - 1) // 3 + 1
    return f"{now.year:04d}-Q{quarter}"


def get_nps_prompt_status(db: Session, *, parent_id: int, now: datetime) -> Dict[str, object]:
    period_label = current_period_label(now)
    existing = (
        db.query(NpsResponse)
        .filter(NpsResponse.parent_id == parent_id, NpsResponse.period_label == period_label)
        .first()
    )
    return {
        "should_prompt": existing is None,
        "period_label": period_label,
    }


def submit_nps_response(
    db: Session,
    *,
    parent_id: int,
    score: int,
    comment: Optional[str],
    now: datetime,
) -> NpsResponse:
    if score < 0 or score > 10:
        raise ValueError("score must be between 0 and 10")
    period_label = current_period_label(now)
    existing = (
        db.query(NpsResponse)
        .filter(NpsResponse.parent_id == parent_id, NpsResponse.period_label == period_label)
        .first()
    )
    if existing:
        existing.score = score
        existing.comment = comment
        db.commit()
        db.refresh(existing)
        return existing

    response = NpsResponse(parent_id=parent_id, period_label=period_label, score=score, comment=comment)
    db.add(response)
    db.commit()
    db.refresh(response)
    return response


def build_nps_summary(db: Session, *, period_start: datetime, period_end: datetime) -> Dict[str, object]:
    rows = (
        db.query(NpsResponse.score)
        .filter(NpsResponse.created_at >= period_start, NpsResponse.created_at < period_end)
        .all()
    )
    scores = [int(row[0]) for row in rows]
    total = len(scores)
    promoters = sum(1 for s in scores if s >= 9)
    detractors = sum(1 for s in scores if s <= 6)
    passives = total - promoters - detractors
    nps_score = round(((promoters - detractors) / total) * 100, 1) if total else None
    return {
        "responses_count": total,
        "promoters_count": promoters,
        "passives_count": passives,
        "detractors_count": detractors,
        "nps_score": nps_score,
    }
