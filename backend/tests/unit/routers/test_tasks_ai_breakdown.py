from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routers.tasks import create_task_ai_breakdown
from app.schemas.tasks import TaskAiBreakdownRequest


@pytest.mark.asyncio
async def test_create_task_ai_breakdown_returns_editable_task_draft():
    result = await create_task_ai_breakdown(
        TaskAiBreakdownRequest(
            text="Срочно подготовить запуск интенсива. Собрать расписание. Написать родителям.",
            category="parents",
        ),
        current_user=MagicMock(),
    )

    assert result.title == "Срочно подготовить запуск интенсива"
    assert result.category == "parents"
    assert result.priority == "high"
    assert len(result.subtasks) >= 4
    assert result.subtasks[0]["text"] == "Уточнить критерий готовности и срок"


@pytest.mark.asyncio
async def test_create_task_ai_breakdown_rejects_too_short_text():
    with pytest.raises(HTTPException) as exc:
        await create_task_ai_breakdown(
            TaskAiBreakdownRequest(text="ok", category="schools"),
            current_user=MagicMock(),
        )

    assert exc.value.status_code == 400
