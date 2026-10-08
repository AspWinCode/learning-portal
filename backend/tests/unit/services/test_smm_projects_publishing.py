import pytest

from app.models import SmmContent, SmmProject
from app.services.smm_projects import publishing


def _project(code="test_project"):
    p = SmmProject()
    p.id = 1
    p.code = code
    return p


def _content(status="approved", text="Текст поста", selected_asset_id=None):
    c = SmmContent()
    c.id = 1
    c.status = status
    c.output_text = text
    c.selected_asset_id = selected_asset_id
    return c


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

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = len(self.added)

    def refresh(self, obj):
        pass

    def query(self, model):
        return _Query(None)


@pytest.mark.asyncio
async def test_publish_requires_approved_status():
    with pytest.raises(ValueError, match="одобрения"):
        await publishing.publish(_FakeDB(), object(), project=_project(), content=_content(status="draft"), channel="vk")


@pytest.mark.asyncio
async def test_publish_rejects_unsupported_channel():
    with pytest.raises(ValueError, match="не поддерживается"):
        await publishing.publish(_FakeDB(), object(), project=_project(), content=_content(), channel="whatsapp")


@pytest.mark.asyncio
async def test_publish_rejects_empty_text():
    with pytest.raises(ValueError, match="нет текста"):
        await publishing.publish(_FakeDB(), object(), project=_project(), content=_content(text=""), channel="vk")


@pytest.mark.asyncio
async def test_publish_channel_not_configured_is_audited_as_error(monkeypatch):
    # Канал не настроен => _deliver бросает ValueError, который publish()
    # должен и залогировать в SmmPublishLog, и поднять наружу — не глушить.
    db = _FakeDB()
    with pytest.raises(ValueError, match="не настроен"):
        await publishing.publish(db, object(), project=_project(), content=_content(), channel="vk")
    logs = [obj for obj in db.added if obj.__class__.__name__ == "SmmPublishLog"]
    assert len(logs) == 1
    assert logs[0].status == "error"


def test_due_publication_ids_filters_by_status_and_time():
    class _DueQuery:
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

    class _DueDB:
        def query(self, *cols):
            return _DueQuery([(1,), (2,)])

    ids = publishing.due_publication_ids(_DueDB())
    assert ids == [1, 2]
