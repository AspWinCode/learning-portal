import io

import pytest
from PIL import Image

from app.models import SmmContent, SmmKnowledgeItem, SmmProject
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
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])

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
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])

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


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color="red").save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_render_image_retries_without_references_when_provider_refuses(monkeypatch):
    """Gemini can answer finish_reason=STOP with no image and no explicit
    block_reason when given reference photos it won't blend into the result
    (commonly real people in the project's own reference images) — the fix is
    to retry the same prompt without references rather than surfacing a dead
    end to the editor."""
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)

    knowledge_item = SmmKnowledgeItem()
    knowledge_item.source_type = "image_reference"
    knowledge_item.storage_key = "ref_key.png"
    knowledge_item.content_type = "image/png"
    knowledge_item.original_filename = "ref.png"
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [knowledge_item])
    monkeypatch.setattr(assets.storage, "read_bytes", lambda key: _png_bytes())

    calls = []

    async def fake_generate_image(**kwargs):
        calls.append(kwargs)
        if kwargs.get("input_references"):
            return ai_gateway.GatewayResult(ok=False, provider="tunnel", error="Google: Gemini could not generate an image (STOP)")
        return ai_gateway.GatewayResult(ok=True, provider="tunnel", model="gemini", data=[{"url": "https://cdn.example/retry.png"}])

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _Client(_Response(b"retry-bytes")))
    monkeypatch.setattr(assets.storage, "save_bytes", lambda data, filename: "retry_storage_key.png")

    asset = await assets.render_image(_FakeDB(), None, project=_project(), content=_content(), prompt="draw a cat")

    assert len(calls) == 2
    assert calls[0]["input_references"]
    assert "input_references" not in calls[1] or not calls[1]["input_references"]
    assert asset.url == "https://cdn.example/retry.png"


@pytest.mark.asyncio
async def test_render_image_raises_when_retry_without_references_also_fails(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])

    async def fake_generate_image(**kwargs):
        return ai_gateway.GatewayResult(ok=False, provider="tunnel", error="Google: Gemini could not generate an image (STOP)")

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)

    with pytest.raises(ValueError, match="STOP"):
        await assets.render_image(_FakeDB(), None, project=_project(), content=_content(), prompt="draw a cat")
