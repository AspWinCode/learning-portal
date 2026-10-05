import pytest

from app.models import AiContentTemplate, AiGeneratedContent, AiWorkspace
from app.services.ai_studio import generation


class _Query:
    def __init__(self, result=None):
        self._result = result

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._result


class _FakeDB:
    """add/commit/refresh достаточно для generation.*, которое не делает
    сложных выборок помимо необязательного template_id lookup (здесь всегда
    None, поэтому query() не вызывается)."""

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
        return _Query(None)


def _template():
    tpl = AiContentTemplate()
    tpl.id = 1
    tpl.code = "event_announcement"
    tpl.name = "Анонс мероприятия"
    tpl.prompt_template = "Название: {title}"
    tpl.output_format = "json"
    tpl.input_schema_json = {"fields": [{"key": "title", "label": "Название", "type": "text", "required": True}]}
    return tpl


def _workspace():
    w = AiWorkspace()
    w.id = 2
    w.code = "kodarena"
    return w


@pytest.mark.asyncio
async def test_generate_rejects_missing_required_fields():
    with pytest.raises(ValueError, match="title"):
        await generation.generate(
            db=None,
            user=object(),
            workspace=_workspace(),
            template=_template(),
            input_data={},
        )


def _source_content(group_key=None):
    source = AiGeneratedContent()
    source.id = 5
    source.template_id = None
    source.output_text = "текст"
    source.title = "т"
    source.channel = None
    source.group_key = group_key
    return source


@pytest.mark.asyncio
async def test_transform_rejects_unknown_action():
    with pytest.raises(ValueError, match="Неизвестное действие"):
        await generation.transform(
            db=None,
            user=object(),
            workspace=_workspace(),
            source=_source_content(),
            action="not_a_real_action",
        )


@pytest.mark.asyncio
async def test_generate_assigns_a_group_key(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: [])

    content = await generation.generate(
        db=_FakeDB(), user=object(), workspace=_workspace(), template=_template(), input_data={"title": "Турнир"}
    )
    assert content.group_key


@pytest.mark.asyncio
async def test_transform_inherits_existing_group_key(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: [])

    source = _source_content(group_key="abc123")
    result = await generation.transform(db=_FakeDB(), user=object(), workspace=_workspace(), source=source, action="shorter")
    assert result.group_key == "abc123"
    assert result.parent_content_id == source.id


@pytest.mark.asyncio
async def test_transform_backfills_group_key_when_source_has_none(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: [])

    source = _source_content(group_key=None)
    result = await generation.transform(db=_FakeDB(), user=object(), workspace=_workspace(), source=source, action="shorter")
    assert result.group_key
    assert source.group_key == result.group_key


@pytest.mark.asyncio
async def test_create_variant_sets_requested_channel(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: [])

    source = _source_content(group_key="grp-1")
    result = await generation.create_variant(db=_FakeDB(), user=object(), workspace=_workspace(), source=source, channel="telegram")
    assert result.channel == "telegram"
    assert result.group_key == "grp-1"


@pytest.mark.asyncio
async def test_event_pack_creates_linked_items_without_fabricating_facts(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: [])

    items = await generation.event_pack(
        db=_FakeDB(), user=object(), workspace=_workspace(),
        event_data={"event_name": "Турнир КодАрены", "date": "2026-11-01"},
    )
    assert len(items) == len(generation.EVENT_PACK_ITEMS)
    group_keys = {item.group_key for item in items}
    assert len(group_keys) == 1  # все материалы пакета связаны одним group_key
    # без AI Tunnel факты не выдумываются — fallback-текст ссылается на событие, а не на абстрактный шаблон
    assert all("Турнир КодАрены" in (item.output_text or "") or "Турнир КодАрены" in item.title for item in items)
