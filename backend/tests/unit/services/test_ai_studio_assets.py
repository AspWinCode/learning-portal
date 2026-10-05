import pytest

from app.models import AiGeneratedContent, AiWorkspace
from app.services.ai_studio import assets


def _workspace():
    w = AiWorkspace()
    w.id = 1
    w.code = "kodarena"
    return w


def _content(output_text="обложка турнира", title="Турнир"):
    c = AiGeneratedContent()
    c.id = 7
    c.output_text = output_text
    c.title = title
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


@pytest.mark.asyncio
async def test_render_image_requires_a_prompt(monkeypatch):
    monkeypatch.setattr(assets.ai_gateway, "is_configured", lambda purpose="image": True)
    with pytest.raises(ValueError, match="Нет промпта"):
        await assets.render_image(
            _FakeDB(), object(), workspace=_workspace(), content=_content(output_text="", title="")
        )


@pytest.mark.asyncio
async def test_render_image_requires_image_gateway_configured(monkeypatch):
    monkeypatch.setattr(assets.ai_gateway, "is_configured", lambda purpose="image": False)
    with pytest.raises(ValueError, match="не настроен"):
        await assets.render_image(_FakeDB(), object(), workspace=_workspace(), content=_content())


@pytest.mark.asyncio
async def test_render_image_uses_url_from_gateway(monkeypatch):
    class _Result:
        ok = True
        error = None
        provider = "tunnel"
        model = "img-1"
        data = [{"url": "https://example.com/cover.png"}]

    monkeypatch.setattr(assets.ai_gateway, "is_configured", lambda purpose="image": True)

    async def _fake_generate_image(**kwargs):
        return _Result()

    monkeypatch.setattr(assets.ai_gateway, "generate_image", _fake_generate_image)

    db = _FakeDB()
    asset = await assets.render_image(db, object(), workspace=_workspace(), content=_content(), prompt="обложка")
    assert asset.url == "https://example.com/cover.png"
    assert asset.storage_key is None
    assert asset.asset_type == "image"


@pytest.mark.asyncio
async def test_render_image_raises_on_gateway_failure(monkeypatch):
    class _Result:
        ok = False
        error = "provider timeout"
        data = None

    monkeypatch.setattr(assets.ai_gateway, "is_configured", lambda purpose="image": True)

    async def _fake_generate_image(**kwargs):
        return _Result()

    monkeypatch.setattr(assets.ai_gateway, "generate_image", _fake_generate_image)

    with pytest.raises(ValueError, match="provider timeout"):
        await assets.render_image(_FakeDB(), object(), workspace=_workspace(), content=_content(), prompt="обложка")
