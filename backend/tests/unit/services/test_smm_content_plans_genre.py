from datetime import date

import pytest

from app.models import SmmContentPlan, SmmContentPlanItem, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import content_plans


def test_fallback_items_cycles_requested_genres():
    payload = {
        "date_from": "2026-11-01", "date_to": "2026-11-15", "formats": ["Пост"],
        "genres": [content_plans.GENRE_ORGANIZER_THOUGHTS, content_plans.GENRE_PROGRAMMING_NEWS],
        "posts_per_week": 7,
    }
    items = content_plans._fallback_items(payload)
    assert items[0]["genre"] == content_plans.GENRE_ORGANIZER_THOUGHTS
    assert items[1]["genre"] == content_plans.GENRE_PROGRAMMING_NEWS
    assert items[2]["genre"] == content_plans.GENRE_ORGANIZER_THOUGHTS


def test_fallback_items_default_genres_when_none_requested():
    items = content_plans._fallback_items({"date_from": "2026-11-01", "date_to": "2026-11-03", "posts_per_week": 7})
    assert items[0]["genre"] in content_plans.DEFAULT_GENRES


def _project():
    p = SmmProject()
    p.id = 1
    p.code = "kodarena"
    p.system_prompt = p.audience_description = p.tone_of_voice = None
    p.brand_context = None
    p.name = "КодАрена"
    return p


def _plan_item(genre=None):
    item = SmmContentPlanItem()
    item.id = 1
    item.plan_id = 1
    item.publish_date = date(2026, 11, 20)
    item.position = 0
    item.rubric = "Рубрика"
    item.title = "Тема"
    item.brief = "Бриф"
    item.retention_mechanic = "Вопрос"
    item.content_format = "Пост"
    item.channel = "vk"
    item.status = "planned"
    item.generated_content_id = None
    item.genre = genre
    return item


def _plan():
    plan = SmmContentPlan()
    plan.id = 1
    plan.project_id = 1
    plan.created_by_id = None
    return plan


class _Query:
    def __init__(self, result):
        self._result = result

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self, project):
        self._project = project
        self.added = []

    def query(self, model):
        return _Query(self._project)

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = len(self.added)

    def commit(self):
        self.flush()

    def refresh(self, obj):
        pass


async def _async_empty(*a, **k):
    return []


@pytest.mark.asyncio
async def test_generate_item_draft_adds_genre_instruction_for_organizer_thoughts(monkeypatch):
    monkeypatch.setattr(content_plans.knowledge_svc, "list_items", lambda db, project: [])
    captured = {}

    async def fake_complete_text(**kwargs):
        captured.update(kwargs)
        return ai_gateway.GatewayResult(ok=True, text="готовый текст")

    monkeypatch.setattr(content_plans.ai_gateway, "is_configured", lambda purpose="text": True)
    monkeypatch.setattr(content_plans.ai_gateway, "complete_text", fake_complete_text)

    db = _FakeDB(_project())
    item = _plan_item(genre=content_plans.GENRE_ORGANIZER_THOUGHTS)
    created = await content_plans._generate_item_draft(db, plan=_plan(), item=item, materialize_media=False)

    assert created is True
    assert "личное размышление" in captured["system"]
    assert "НЕ анонс события" in captured["system"]


@pytest.mark.asyncio
async def test_generate_item_draft_skips_genre_instruction_for_generic_genre(monkeypatch):
    monkeypatch.setattr(content_plans.knowledge_svc, "list_items", lambda db, project: [])
    captured = {}

    async def fake_complete_text(**kwargs):
        captured.update(kwargs)
        return ai_gateway.GatewayResult(ok=True, text="готовый текст")

    monkeypatch.setattr(content_plans.ai_gateway, "is_configured", lambda purpose="text": True)
    monkeypatch.setattr(content_plans.ai_gateway, "complete_text", fake_complete_text)

    db = _FakeDB(_project())
    item = _plan_item(genre="Экспертный")
    await content_plans._generate_item_draft(db, plan=_plan(), item=item, materialize_media=False)

    assert "личное размышление" not in captured["system"]
    assert "новостной пост на стыке" not in captured["system"]
