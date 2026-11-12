import pytest

from app.models import SmmContent, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import assets


def _project(code="test_project"):
    p = SmmProject()
    p.id = 1
    p.code = code
    return p


def _content():
    c = SmmContent()
    c.id = 1
    c.title = "Post"
    c.output_text = "Текст"
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


class _Response:
    def __init__(self, content=b"image-bytes"):
        self.content = content

    def raise_for_status(self):
        pass


class _Client:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url):
        return self._response


@pytest.mark.asyncio
async def test_render_image_downloads_url_only_response_for_byte_channels(monkeypatch):
    """Telegram/VK/MAX attach local bytes, not a remote url — a provider that
    returns only a url (e.g. Gemini via AI Tunnel) must still end up with a
    storage_key, or those channels silently publish without the image."""
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)

    async def fake_generate_image(**kwargs):
        return ai_gateway.GatewayResult(ok=True, provider="tunnel", model="gemini", data=[{"url": "https://cdn.example/slide.png"}])

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _Client(_Response(b"downloaded-bytes")))

    saved = {}

    def fake_save_bytes(data, filename):
        saved["data"] = data
        saved["filename"] = filename
        return "fake_storage_key.png"

    monkeypatch.setattr(assets.storage, "save_bytes", fake_save_bytes)

    asset = await assets.render_image(_FakeDB(), None, project=_project(), content=_content(), prompt="draw a cat")

    assert asset.url == "https://cdn.example/slide.png"
    assert asset.storage_key == "fake_storage_key.png"
    assert saved["data"] == b"downloaded-bytes"


@pytest.mark.asyncio
async def test_render_image_keeps_url_only_when_download_fails(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)

    async def fake_generate_image(**kwargs):
        return ai_gateway.GatewayResult(ok=True, provider="tunnel", model="gemini", data=[{"url": "https://cdn.example/slide.png"}])

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)

    class _BrokenClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            raise RuntimeError("network down")

    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _BrokenClient())

    def fail_save_bytes(data, filename):
        raise AssertionError("save_bytes must not be called when download fails")

    monkeypatch.setattr(assets.storage, "save_bytes", fail_save_bytes)

    asset = await assets.render_image(_FakeDB(), None, project=_project(), content=_content(), prompt="draw a cat")

    assert asset.url == "https://cdn.example/slide.png"
    assert asset.storage_key is None
