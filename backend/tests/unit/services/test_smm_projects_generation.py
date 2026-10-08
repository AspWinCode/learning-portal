import pytest

from app.models import SmmContent, SmmContentTemplate, SmmProject
from app.services.smm_projects import generation


async def _async_empty():
    return []


class _Query:
    def __init__(self, result=None):
        self._result = result

    def filter(self, *a, **k):
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
        return _Query(None)


def _template():
    tpl = SmmContentTemplate()
    tpl.id = 1
    tpl.code = "social_post"
    tpl.name = "Пост"
    tpl.prompt_template = "Тема: {topic}"
    tpl.output_format = "json"
    tpl.input_schema_json = {"fields": [{"key": "topic", "label": "Тема", "type": "text", "required": True}]}
    return tpl


def _project():
    p = SmmProject()
    p.id = 1
    p.code = "test_project"
    return p


def _source(group_key=None):
    s = SmmContent()
    s.id = 5
    s.template_id = None
    s.output_text = "текст"
    s.title = "т"
    s.channel = None
    s.group_key = group_key
    return s


@pytest.mark.asyncio
async def test_generate_rejects_missing_required_fields():
    with pytest.raises(ValueError, match="topic"):
        await generation.generate(db=None, user=object(), project=_project(), template=_template(), input_data={})


@pytest.mark.asyncio
async def test_generate_assigns_group_key_and_auto_generated_flag(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: _async_empty())

    content = await generation.generate(
        db=_FakeDB(), user=object(), project=_project(), template=_template(),
        input_data={"topic": "Турнир"}, auto_generated=True,
    )
    assert content.group_key
    assert content.auto_generated is True


@pytest.mark.asyncio
async def test_transform_rejects_unknown_action():
    with pytest.raises(ValueError, match="Неизвестное действие"):
        await generation.transform(db=None, user=object(), project=_project(), source=_source(), action="nope")


@pytest.mark.asyncio
async def test_create_variant_sets_channel_and_shares_group_key(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: _async_empty())

    source = _source(group_key="grp-1")
    result = await generation.create_variant(db=_FakeDB(), user=object(), project=_project(), source=source, channel="instagram")
    assert result.channel == "instagram"
    assert result.group_key == "grp-1"


@pytest.mark.asyncio
async def test_event_pack_creates_linked_items(monkeypatch):
    monkeypatch.setattr(generation.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(generation.knowledge_svc, "search", lambda *a, **k: _async_empty())

    items = await generation.event_pack(
        db=_FakeDB(), user=object(), project=_project(), event_data={"event_name": "Турнир КодАрены"},
    )
    assert len(items) == len(generation.EVENT_PACK_ITEMS)
    assert len({item.group_key for item in items}) == 1
