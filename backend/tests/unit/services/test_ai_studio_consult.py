import pytest

from app.models import AiWorkspace
from app.services.ai_studio import consult


async def _async_empty():
    return []


class _MsgQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def all(self):
        return self._rows


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
        return _MsgQuery([])


def _workspace():
    w = AiWorkspace()
    w.id = 1
    w.code = "kodarena"
    return w


@pytest.mark.asyncio
async def test_ask_rejects_empty_message():
    with pytest.raises(ValueError, match="пустым"):
        await consult.ask(_FakeDB(), object(), workspace=_workspace(), message="   ")


@pytest.mark.asyncio
async def test_ask_creates_dialog_when_none_given(monkeypatch):
    monkeypatch.setattr(consult.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(consult.knowledge_svc, "search", lambda *a, **k: _async_empty())

    db = _FakeDB()
    message = await consult.ask(db, object(), workspace=_workspace(), message="Проанализируй направление")
    assert message.role == "assistant"
    dialogs = [obj for obj in db.added if obj.__class__.__name__ == "AiDialog"]
    assert len(dialogs) == 1
    assert dialogs[0].workspace_id == 1


@pytest.mark.asyncio
async def test_ask_fallback_text_when_gateway_not_configured(monkeypatch):
    monkeypatch.setattr(consult.ai_gateway, "is_configured", lambda purpose="text": False)
    monkeypatch.setattr(consult.knowledge_svc, "search", lambda *a, **k: _async_empty())

    message = await consult.ask(_FakeDB(), object(), workspace=_workspace(), message="вопрос")
    assert "недоступен" in message.content
