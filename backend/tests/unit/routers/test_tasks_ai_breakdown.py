from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routers.tasks import create_task_ai_breakdown
from app.schemas.tasks import TaskAiBreakdownRequest
from app.services.claude_task_breakdown import normalize_claude_breakdown


@pytest.mark.asyncio
async def test_create_task_ai_breakdown_returns_editable_task_draft(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

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
    assert result.provider == "rules"
    assert len(result.subtasks) >= 4
    assert result.subtasks[0]["text"] == "Уточнить критерий готовности и срок"


def test_normalize_claude_breakdown_accepts_valid_json_shape():
    result = normalize_claude_breakdown(
        {
            "title": "Launch campaign",
            "description": "Prepare and launch campaign",
            "category": "parents",
            "priority": "medium",
            "subtasks": [{"text": "Define done criteria"}, {"text": "Check launch result"}],
        },
        fallback_text="fallback",
        fallback_category="schools",
    )

    assert result is not None
    assert result["category"] == "parents"
    assert result["priority"] == "normal"
    assert len(result["subtasks"]) == 2


@pytest.mark.asyncio
async def test_create_task_ai_breakdown_rejects_too_short_text():
    with pytest.raises(HTTPException) as exc:
        await create_task_ai_breakdown(
            TaskAiBreakdownRequest(text="ok", category="schools"),
            current_user=MagicMock(),
        )

    assert exc.value.status_code == 400
