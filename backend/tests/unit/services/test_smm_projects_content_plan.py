from datetime import datetime, timedelta, timezone

import pytest

from app.models import SmmContentPlan, SmmContentPlanItemStatus, SmmProject
from app.services.smm_projects import content_plan


def test_coerce_date_not_needed_scheduled_at_is_datetime():
    # scheduled_at — datetime, не date (в отличие от ai_studio content_plan),
    # поэтому отдельного coercion-хелпера здесь нет; проверяем парсинг в
    # _parse_plan_items напрямую.
    parsed = content_plan._parse_plan_items({"items": [{"date": "2026-11-05", "topic": "Турнир"}]})
    assert parsed[0]["scheduled_at"] == datetime(2026, 11, 5, tzinfo=timezone.utc)


def test_parse_plan_items_requires_dict():
    with pytest.raises(ValueError, match="не JSON"):
        content_plan._parse_plan_items(None)


def test_parse_plan_items_skips_invalid_date_gracefully():
    parsed = content_plan._parse_plan_items({"items": [{"date": "not-a-date", "topic": "Пост"}]})
    assert parsed[0]["scheduled_at"] is None


def test_cadence_interval_week():
    interval = content_plan._cadence_interval({"unit": "week", "times": 7})
    assert interval == timedelta(days=1)


def test_cadence_interval_day():
    interval = content_plan._cadence_interval({"unit": "day", "times": 2})
    assert interval == timedelta(hours=12)


def test_cadence_interval_defaults_to_one_per_week():
    interval = content_plan._cadence_interval({})
    assert interval == timedelta(days=7)


def _plan(periodicity=None, is_active=True, last_item_at=None):
    plan = SmmContentPlan()
    plan.id = 1
    plan.project_id = 1
    plan.periodicity = periodicity
    plan.is_active = is_active
    return plan


def _project():
    p = SmmProject()
    p.id = 1
    p.code = "test_project"
    return p


class _ItemQuery:
    def __init__(self, result=None):
        self._result = result

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self):
        self.added = []
        self._next_id = 1

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._next_id
                self._next_id += 1

    def refresh(self, obj):
        pass

    def query(self, model):
        return _ItemQuery(None)


@pytest.mark.asyncio
async def test_ensure_plan_scheduled_noop_without_periodicity():
    plan = _plan(periodicity=None)
    created = await content_plan.ensure_plan_scheduled(_FakeDB(), object(), _project(), plan)
    assert created == []


@pytest.mark.asyncio
async def test_ensure_plan_scheduled_noop_when_plan_inactive():
    plan = _plan(periodicity={"times": 3, "unit": "week"}, is_active=False)
    created = await content_plan.ensure_plan_scheduled(_FakeDB(), object(), _project(), plan)
    assert created == []


@pytest.mark.asyncio
async def test_ensure_plan_scheduled_creates_items_within_lookahead(monkeypatch):
    plan = _plan(periodicity={"unit": "day", "times": 1, "channels": ["vk", "telegram"], "lookahead_days": 3, "auto_publish": False})

    async def _noop_materialize(db, user, *, project, item, auto_publish):
        item.status = SmmContentPlanItemStatus.READY.value

    monkeypatch.setattr(content_plan, "_materialize_item", _noop_materialize)

    db = _FakeDB()
    created = await content_plan.ensure_plan_scheduled(db, object(), _project(), plan)
    # 1 раз в день на горизонте 3 дня -> 3 пункта
    assert len(created) == 3
    # каналы round-robin
    assert [item.channel for item in created] == ["vk", "telegram", "vk"]
    assert plan.last_generated_at is not None


@pytest.mark.asyncio
async def test_ensure_plan_scheduled_respects_max_items_cap(monkeypatch):
    plan = _plan(periodicity={"unit": "day", "times": 10, "channels": ["vk"], "lookahead_days": 30})

    async def _noop_materialize(db, user, *, project, item, auto_publish):
        pass

    monkeypatch.setattr(content_plan, "_materialize_item", _noop_materialize)
    created = await content_plan.ensure_plan_scheduled(_FakeDB(), object(), _project(), plan)
    assert len(created) == content_plan.MAX_ITEMS_PER_RUN
