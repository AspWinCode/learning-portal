from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, List

from sqlalchemy.orm import Session

from app.models import OwnerWorkspaceCounterparty, OwnerWorkspaceTask


COUNTERPARTY_DOCUMENT_CATEGORIES = [
    ("contract", "Договор"),
    ("act", "Акт"),
    ("invoice", "Счет"),
    ("template", "Шаблон"),
    ("financial_model", "Финансовая модель"),
    ("tz", "ТЗ"),
    ("business_plan", "Бизнес-план"),
]

COUNTERPARTY_DOCUMENT_CATEGORY_SET = {item[0] for item in COUNTERPARTY_DOCUMENT_CATEGORIES}
COUNTERPARTY_DOCUMENT_CATEGORY_LABELS = dict(COUNTERPARTY_DOCUMENT_CATEGORIES)


COUNTERPARTY_DEFAULT_TASKS = [
    ("contract", "Создать договор", 2),
    ("contract", "Подписать договор", 5),
    ("contract", "Загрузить экземпляр договора", 7),
    ("act", "Подготовить акт", 10),
    ("act", "Подписать акт", 12),
    ("act", "Загрузить подписанный акт", 14),
    ("invoice", "Выставить счет", 1),
    ("invoice", "Проверить оплату", 4),
    ("invoice", "Прикрепить счет", 6),
]


def create_default_counterparty_tasks(
    db: Session,
    *,
    counterparty: OwnerWorkspaceCounterparty,
    project_ids: Iterable[int | None],
    creator_id: int,
) -> List[OwnerWorkspaceTask]:
    created: List[OwnerWorkspaceTask] = []
    project_ids_list = list(project_ids) or [None]
    now = datetime.now(timezone.utc)

    for project_id in project_ids_list:
        for category, title, days_offset in COUNTERPARTY_DEFAULT_TASKS:
            task = OwnerWorkspaceTask(
                title=title,
                description=f"Автосоздано для контрагента: {counterparty.full_name}",
                status="new",
                priority="medium",
                deadline_at=now + timedelta(days=days_offset),
                creator_id=creator_id,
                project_id=project_id,
                counterparty_id=counterparty.id,
                tags=[
                    "counterparty",
                    f"counterparty:{counterparty.id}",
                    f"counterparty_doc:{category}",
                ],
            )
            db.add(task)
            created.append(task)
    return created

