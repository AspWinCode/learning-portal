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
