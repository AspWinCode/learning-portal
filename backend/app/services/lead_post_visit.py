"""
Use case: обновление стадии воронки «Дожать на обучение» после мероприятия (event_post_visit_lead_next_step).

Домен: CRM.
Источник: BACKEND_REFACTOR_USE_CASES.md.
Обновляет post_visit_stage, при course_agreed — статус лида и флаг для создания авто-задачи (задачу создаёт роутер).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.models import Lead, LeadStatus


@dataclass
class UpdatePostVisitStageResult:
    """Результат обновления стадии post-visit."""
    lead: Lead
    """True если роутеру нужно создать авто-задачу «контроль оплаты» (stage=course_agreed)."""
    need_auto_task: bool = False


def update_lead_post_visit_stage(
    db: Session,
    lead_id: int,
    stage: str,
    review: Optional[str] = None,
    project_date: Optional[datetime] = None,
    decline_reason: Optional[str] = None,
    get_default_lead_status_option_id: Optional[Callable] = None,
) -> UpdatePostVisitStageResult:
    """
    Обновляет стадию воронки post-visit по лиду. Для course_agreed выставляет статус INVOICE_SENT
    и возвращает need_auto_task=True, чтобы роутер создал задачу «контроль оплаты».
    Не выполняет commit — это делает вызывающий код.

    Raises:
        ValueError: лид не найден; не заполнены обязательные поля для stage.
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise ValueError("Lead not found")

    lead.post_visit_stage = stage
    need_auto_task = False

    if stage in ("project_offer", "course_offer", "new"):
        pass
    elif stage == "project_agreed":
        if not (review or "").strip():
            raise ValueError("Укажите отзыв по проекту")
        if project_date is None:
            raise ValueError("Укажите дату проведения проекта")
        lead.post_visit_review = (review or "").strip()
        lead.post_visit_project_date = project_date
    elif stage == "course_agreed":
        if not (review or "").strip():
            raise ValueError("Укажите отзыв перед записью на курс")
        lead.post_visit_review = (review or "").strip()
        lead.status = LeadStatus.INVOICE_SENT
        if get_default_lead_status_option_id:
            opt_id = get_default_lead_status_option_id(db, LeadStatus.INVOICE_SENT)
            if opt_id is not None:
                lead.status_option_id = opt_id
        need_auto_task = True
    elif stage == "declined":
        reason = (decline_reason or "").strip()
        if not reason:
            raise ValueError("Укажите причину отказа")
        lead.lost_reason = reason
        lead.status = LeadStatus.LOST
        if get_default_lead_status_option_id:
            opt_id = get_default_lead_status_option_id(db, LeadStatus.LOST)
            if opt_id is not None:
                lead.status_option_id = opt_id
    else:
        pass

    return UpdatePostVisitStageResult(lead=lead, need_auto_task=need_auto_task)
