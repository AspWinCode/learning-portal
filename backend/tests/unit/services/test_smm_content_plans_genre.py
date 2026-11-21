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


def _plan(news_items=None, items=None):
    plan = SmmContentPlan()
    plan.id = 1
    plan.project_id = 1
    plan.created_by_id = None
    plan.news_items = news_items
    plan.items = items if items is not None else []
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


def test_pick_news_item_cycles_across_programming_news_siblings():
    other = _plan_item(genre="Экспертный")
    other.id, other.position = 2, 0
    first = _plan_item(genre=content_plans.GENRE_PROGRAMMING_NEWS)
    first.id, first.position = 3, 1
    second = _plan_item(genre=content_plans.GENRE_PROGRAMMING_NEWS)
    second.id, second.position = 4, 2
    plan = _plan(news_items=["Новость A", "Новость Б"], items=[other, first, second])

    assert content_plans._pick_news_item(plan, other) is None
    assert content_plans._pick_news_item(plan, first) == "Новость A"
    assert content_plans._pick_news_item(plan, second) == "Новость Б"


def test_pick_news_item_none_when_plan_has_no_news():
    item = _plan_item(genre=content_plans.GENRE_PROGRAMMING_NEWS)
    assert content_plans._pick_news_item(_plan(news_items=None, items=[item]), item) is None


@pytest.mark.asyncio
async def test_generate_item_draft_grounds_programming_news_in_pasted_item(monkeypatch):
    monkeypatch.setattr(content_plans.knowledge_svc, "content_items", lambda db, project: [])
    captured = {}

    async def fake_complete_text(**kwargs):
        captured.update(kwargs)
        return ai_gateway.GatewayResult(ok=True, text="готовый текст")

    monkeypatch.setattr(content_plans.ai_gateway, "is_configured", lambda purpose="text": True)
    monkeypatch.setattr(content_plans.ai_gateway, "complete_text", fake_complete_text)

    db = _FakeDB(_project())
    item = _plan_item(genre=content_plans.GENRE_PROGRAMMING_NEWS)
    plan = _plan(news_items=["Unity выпустила новую версию движка"], items=[item])
    await content_plans._generate_item_draft(db, plan=plan, item=item, materialize_media=False)

    assert "Unity выпустила новую версию движка" in captured["prompt"]
    assert "бери факты ТОЛЬКО отсюда" in captured["prompt"]


@pytest.mark.asyncio
async def test_generate_item_draft_adds_genre_instruction_for_organizer_thoughts(monkeypatch):
    monkeypatch.setattr(content_plans.knowledge_svc, "content_items", lambda db, project: [])
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
    monkeypatch.setattr(content_plans.knowledge_svc, "content_items", lambda db, project: [])
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
