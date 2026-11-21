import pytest

from app.models import SmmContent, SmmContentAsset, SmmProject, SmmPublication, SmmPublicationStatus
from app.services.smm_projects import publishing


def _project(code="test_project"):
    p = SmmProject()
    p.id = 1
    p.code = code
    return p


def _content(status="approved", text="Текст поста", selected_asset_id=None):
    c = SmmContent()
    c.id = 1
    c.project_id = 1
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


def _matches(obj, condition) -> bool:
    try:
        return getattr(obj, condition.left.key, object()) == condition.right.value
    except AttributeError:
        return True


class _BundleQuery:
    def __init__(self, items):
        self._items = items

    def filter(self, *conditions):
        items = self._items
        for condition in conditions:
            items = [obj for obj in items if _matches(obj, condition)]
        return _BundleQuery(items)

    def first(self):
        return self._items[0] if self._items else None


class _BundleDB:
    def __init__(self, *, content, assets=None, publications=None):
        self._rows = {SmmContent: [content], SmmContentAsset: list(assets or []), SmmPublication: list(publications or [])}
        self.added = []

    def query(self, model):
        return _BundleQuery(self._rows.get(model, []))

    def add(self, obj):
        self.added.append(obj)
        self._rows.setdefault(type(obj), []).append(obj)

    def commit(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = len(self.added)

    def refresh(self, obj):
        pass


def _publication(idempotency_key, status, error="old error"):
    row = SmmPublication()
    row.id = 1
    row.idempotency_key = idempotency_key
    row.status = status
    row.last_error = error
    row.external_id = "old_external_id"
    row.external_url = "https://example/old"
    return row


def test_create_publications_retries_a_previously_failed_attempt():
    """create_publications() dedups by idempotency_key, which for an
    immediate ("now") publish never changes across attempts — without special
    handling, clicking "Опубликовать" again after a failure (e.g. the VK
    token got fixed) just returns the same stale error row and never calls
    the publisher again."""
    content = _content()
    stale = _publication("publication:1:vk:now", SmmPublicationStatus.ERROR.value)
    db = _BundleDB(content=content, publications=[stale])

    rows = publishing.create_publications(
        db, object(), project=_project(), items=[{"channel": "vk", "content_id": 1}], publish_at=None,
    )

    assert rows == [stale]
    assert stale.status == SmmPublicationStatus.APPROVED.value
    assert stale.last_error is None
    assert stale.external_id is None
    assert stale.external_url is None


def test_create_publications_does_not_retry_a_successful_attempt():
    content = _content()
    success = _publication("publication:1:vk:now", SmmPublicationStatus.SUCCESS.value, error=None)
    db = _BundleDB(content=content, publications=[success])

    rows = publishing.create_publications(
        db, object(), project=_project(), items=[{"channel": "vk", "content_id": 1}], publish_at=None,
    )

    assert rows == [success]
    assert success.status == SmmPublicationStatus.SUCCESS.value
    assert success.external_id == "old_external_id"


def test_create_publications_creates_new_row_when_none_exists():
    content = _content()
    db = _BundleDB(content=content, publications=[])

    rows = publishing.create_publications(
        db, object(), project=_project(), items=[{"channel": "vk", "content_id": 1}], publish_at=None,
    )

    assert len(rows) == 1
    assert rows[0].status == SmmPublicationStatus.APPROVED.value
    assert rows[0].idempotency_key == "publication:1:vk:now"
