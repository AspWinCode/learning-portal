import pytest

from app.models import AiGeneratedContent, AiWorkspace
from app.services.ai_studio import publishing


def _workspace(code="kodarena"):
    w = AiWorkspace()
    w.id = 1
    w.code = code
    return w


def _content(text="Текст поста"):
    c = AiGeneratedContent()
    c.id = 1
    c.output_text = text
    return c


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


def test_channel_not_configured_by_default(monkeypatch):
    # Критично для безопасности: без явно настроенных env-переменных ни один
    # канал не должен считаться сконфигурированным — иначе можно случайно
    # "опубликовать" куда-то по умолчанию.
    for var in list(__import__("os").environ):
        if var.startswith("AI_STUDIO_VK_") or var.startswith("AI_STUDIO_TELEGRAM_"):
            monkeypatch.delenv(var, raising=False)
    assert publishing.is_channel_configured("vk", "kodarena") is False
    assert publishing.is_channel_configured("telegram", "kodarena") is False


def test_unsupported_channel_rejected():
    assert publishing.is_channel_configured("instagram", "kodarena") is False


@pytest.mark.asyncio
async def test_publish_raises_when_channel_not_configured(monkeypatch):
    monkeypatch.delenv("AI_STUDIO_VK_TOKEN_KODARENA", raising=False)
    monkeypatch.delenv("AI_STUDIO_VK_GROUP_ID_KODARENA", raising=False)
    with pytest.raises(ValueError, match="не настроен"):
        await publishing.publish(_FakeDB(), object(), workspace=_workspace(), content=_content(), channel="vk")


@pytest.mark.asyncio
async def test_publish_rejects_unsupported_channel():
    with pytest.raises(ValueError, match="не поддерживается"):
        await publishing.publish(_FakeDB(), object(), workspace=_workspace(), content=_content(), channel="instagram")


@pytest.mark.asyncio
async def test_publish_rejects_empty_content(monkeypatch):
    monkeypatch.setenv("AI_STUDIO_VK_TOKEN_KODARENA", "test-token")
    monkeypatch.setenv("AI_STUDIO_VK_GROUP_ID_KODARENA", "123")
    with pytest.raises(ValueError, match="нет текста"):
        await publishing.publish(
            _FakeDB(), object(), workspace=_workspace(), content=_content(text=""), channel="vk"
        )


@pytest.mark.asyncio
async def test_publish_vk_success_creates_audit_log(monkeypatch):
    monkeypatch.setenv("AI_STUDIO_VK_TOKEN_KODARENA", "test-token")
    monkeypatch.setenv("AI_STUDIO_VK_GROUP_ID_KODARENA", "123")

    class _Resp:
        def json(self):
            return {"response": {"post_id": 42}}

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return _Resp()

    monkeypatch.setattr(publishing.httpx, "AsyncClient", lambda **k: _FakeClient())

    db = _FakeDB()
    log = await publishing.publish(db, object(), workspace=_workspace(), content=_content(), channel="vk")
    assert log.status == "success"
    assert log.external_id == "42"
    assert "vk.com/wall-123_42" in log.external_url


@pytest.mark.asyncio
async def test_publish_vk_api_error_logged_and_raised(monkeypatch):
    monkeypatch.setenv("AI_STUDIO_VK_TOKEN_KODARENA", "test-token")
    monkeypatch.setenv("AI_STUDIO_VK_GROUP_ID_KODARENA", "123")

    class _Resp:
        def json(self):
            return {"error": {"error_msg": "Access denied"}}

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return _Resp()

    monkeypatch.setattr(publishing.httpx, "AsyncClient", lambda **k: _FakeClient())

    db = _FakeDB()
    with pytest.raises(ValueError, match="Access denied"):
        await publishing.publish(db, object(), workspace=_workspace(), content=_content(), channel="vk")
    # ошибка внешнего API всё равно попадает в аудит, а не глушится молча
    assert len(db.added) == 1
    assert db.added[0].status == "error"
