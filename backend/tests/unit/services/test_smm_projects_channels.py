import pytest

from app.models import SmmProject
from app.services.smm_projects import channels


class _Query:
    def __init__(self, result=None):
        self._result = result

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._result


class _FakeDB:
    def __init__(self):
        self.rows = {}
        self._next_id = 1

    def query(self, model):
        return _Query(None)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = self._next_id
            self._next_id += 1
        self.rows[(obj.project_id, obj.channel)] = obj

    def commit(self):
        pass

    def refresh(self, obj):
        pass


def _project():
    p = SmmProject()
    p.id = 1
    p.code = "test_project"
    return p


def test_set_channel_config_rejects_missing_required_fields(monkeypatch):
    db = _FakeDB()
    with pytest.raises(ValueError, match="group_id"):
        channels.set_channel_config(db, _project(), object(), "vk", {"token": "abc"})


def test_set_channel_config_rejects_unsupported_channel():
    db = _FakeDB()
    with pytest.raises(ValueError, match="не поддерживается"):
        channels.set_channel_config(db, _project(), object(), "whatsapp", {"token": "abc"})


def test_set_channel_config_encrypts_and_roundtrips(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    row = channels.set_channel_config(db, project, object(), "telegram", {"token": "secret-token", "chat_id": "42"})
    assert row.secret_encrypted != "secret-token"  # не хранится открытым текстом
    assert "secret-token" not in row.secret_encrypted

    config = channels.get_channel_config(db, project, "telegram")
    assert config == {"token": "secret-token", "chat_id": "42"}


def test_is_configured_false_without_db_row_or_env(monkeypatch):
    import os

    for var in list(os.environ):
        if var.startswith("SMM_VK_"):
            monkeypatch.delenv(var, raising=False)
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    assert channels.is_configured(db, _project(), "vk") is False


def test_disable_channel_marks_row_inactive(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    channels.set_channel_config(db, project, object(), "telegram", {"token": "t", "chat_id": "1"})
    channels.disable_channel(db, project, "telegram")
    row = db.rows[(project.id, "telegram")]
    assert row.is_enabled is False
    assert channels.get_channel_config(db, project, "telegram") is None


def test_channel_status_is_not_verified_right_after_configuring(monkeypatch):
    # Заполненные token/chat_id делают канал "configured", но без реального
    # API-чека UI не должен показывать "подключён" — см. постановку задачи.
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    channels.set_channel_config(db, project, object(), "max", {"token": "t", "chat_id": "123"})
    status = channels.channel_status(db, project, "max")
    assert status["configured"] is True
    assert status["verified"] is False


@pytest.mark.asyncio
async def test_verify_channel_without_config_reports_not_configured(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    result = await channels.verify_channel(db, project, "max")
    assert result == {"channel": "max", "configured": False, "verified": False, "error": "Канал не настроен"}


@pytest.mark.asyncio
async def test_verify_channel_marks_row_verified_on_success(monkeypatch):
    from app.services.smm_projects.publishers.base import VerifyResult

    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    channels.set_channel_config(db, project, object(), "max", {"token": "t", "chat_id": "123"})

    class _FakePublisher:
        async def verify(self, project_code, config):
            return VerifyResult(ok=True, detail={"chat_id": "123", "chat_title": "Код Арена"})

    monkeypatch.setitem(channels.PUBLISHERS, "max", _FakePublisher())
    result = await channels.verify_channel(db, project, "max")
    assert result == {"channel": "max", "configured": True, "verified": True, "chat_id": "123", "chat_title": "Код Арена"}
    row = db.rows[(project.id, "max")]
    assert row.verified is True
    assert row.verification_error is None
    assert row.verified_at is not None


@pytest.mark.asyncio
async def test_verify_channel_marks_row_with_error_on_failure(monkeypatch):
    from app.services.smm_projects.publishers.base import VerifyResult

    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    channels.set_channel_config(db, project, object(), "max", {"token": "bad", "chat_id": "123"})

    class _FakePublisher:
        async def verify(self, project_code, config):
            return VerifyResult(ok=False, error="Бот не имеет доступа к чату")

    monkeypatch.setitem(channels.PUBLISHERS, "max", _FakePublisher())
    result = await channels.verify_channel(db, project, "max")
    assert result["verified"] is False
    assert result["error"] == "Бот не имеет доступа к чату"
    row = db.rows[(project.id, "max")]
    assert row.verified is False
    assert row.verification_error == "Бот не имеет доступа к чату"


def test_zen_channel_requires_no_fields(monkeypatch):
    # У Дзена нет API и, соответственно, токена (см. publishers/zen.py) —
    # включение канала не должно требовать заполнения никаких полей.
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    row = channels.set_channel_config(db, project, object(), "zen", {})
    assert row.is_enabled is True
    assert channels.is_configured(db, project, "zen") is True


@pytest.mark.asyncio
async def test_zen_verify_always_succeeds_once_enabled(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    channels.set_channel_config(db, project, object(), "zen", {})
    result = await channels.verify_channel(db, project, "zen")
    assert result["verified"] is True
    assert "feed_url" in result


def test_set_channel_config_resets_previous_verification(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(channels, "_row", lambda db, project, channel: db.rows.get((project.id, channel)))
    project = _project()
    row = channels.set_channel_config(db, project, object(), "max", {"token": "t", "chat_id": "123"})
    row.verified, row.verification_error = True, None
    channels.set_channel_config(db, project, object(), "max", {"token": "new-token", "chat_id": "123"})
    assert row.verified is False
