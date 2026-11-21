import io

import pytest
from PIL import Image

from app.models import SmmContent, SmmContentAsset, SmmKnowledgeItem, SmmProject
from app.services import ai_gateway
from app.services.smm_projects import assets


def test_image_prompt_always_contains_russian_text_guard():
    prompt = assets._with_image_text_guard("draw a social media character")

    assert "только русский язык и кириллицу" in prompt
    assert "латинские буквы" in prompt
    assert assets._with_image_text_guard(prompt) == prompt


@pytest.mark.asyncio
async def test_image_prompt_uses_selected_project_identity_without_kodarena_defaults(monkeypatch):
    project = _project("tirskix_academy")
    project.name = "TirSkix Academy"
    project.brand_context = {"visual_style": "минималистичная образовательная графика", "visual_palette": "синий и белый"}
    content = _content()
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])
    monkeypatch.setattr(assets.knowledge_svc, "content_items", lambda db, project: [])
    monkeypatch.setattr(assets.ai_gateway, "is_configured", lambda purpose: False)

    prompt = await assets.build_image_prompt(db=None, project=project, content=content, user=None)

    assert "TirSkix Academy" in prompt
    assert "минималистичная образовательная графика" in prompt
    assert "КодАрена" not in prompt
    assert "4:5" in prompt


def test_visual_input_references_include_successful_project_archive(monkeypatch):
    archived = SmmContentAsset()
    archived.id = 77
    archived.content_id = 42
    archived.storage_key = "archive.png"
    archived.content_type = "image/png"
    archived.original_filename = "archive.png"

    class _ArchiveQuery:
        def join(self, *args):
            return self

        def filter(self, *args):
            return self

        def order_by(self, *args):
            return self

        def limit(self, *args):
            return self

        def all(self):
            return [archived]

    class _ArchiveDB:
        def query(self, model):
            return _ArchiveQuery()

    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])
    monkeypatch.setattr(assets.storage, "read_bytes", lambda key: _png_bytes())

    references = assets._visual_input_references(_ArchiveDB(), _project(), content_id=2)
    _, details = assets._visual_input_references(
        _ArchiveDB(), _project(), content_id=2, include_details=True,
    )

    assert len(references) == 1
    assert references[0]["image_url"]["url"].startswith("data:image/png;base64,")
    assert details == [{
        "key": "archive:77",
        "source": "published_archive",
        "source_id": 42,
        "title": "Архив публикаций · материал #42",
        "role": "archive",
        "role_label": "Опубликованный визуал",
    }]


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


def _matches(obj, condition) -> bool:
    try:
        return getattr(obj, condition.left.key, object()) == condition.right.value
    except AttributeError:
        return True


class _Query:
    def __init__(self, items):
        self._items = items

    def filter(self, *conditions):
        items = self._items
        for condition in conditions:
            items = [obj for obj in items if _matches(obj, condition)]
        return _Query(items)

    def first(self):
        return self._items[0] if self._items else None

    def update(self, values, synchronize_session=False):
        for item in self._items:
            for key, value in values.items():
                setattr(item, key, value)
        return len(self._items)


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
        return _Query([obj for obj in self.added if isinstance(obj, model)])


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
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _Client(_Response(_png_bytes())))

    saved = {}

    def fake_save_bytes(data, filename):
        saved["data"] = data
        saved["filename"] = filename
        return "fake_storage_key.png"

    monkeypatch.setattr(assets.storage, "save_bytes", fake_save_bytes)

    content = _content()
    asset = await assets.render_image(_FakeDB(), None, project=_project(), content=content, prompt="draw a cat")

    assert asset.url == "https://cdn.example/slide.png"
    assert asset.storage_key == "fake_storage_key.png"
    assert saved["data"].startswith(b"\x89PNG\r\n\x1a\n")
    assert saved["filename"].endswith("universal.png")
    assert content.selected_asset_id == asset.id


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

    content = _content()
    asset = await assets.render_image(_FakeDB(), None, project=_project(), content=content, prompt="draw a cat")

    assert asset.url == "https://cdn.example/slide.png"
    assert asset.storage_key is None
    assert content.selected_asset_id == asset.id


@pytest.mark.asyncio
async def test_instagram_asset_is_normalized_to_public_jpeg(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _Client(_Response(_png_bytes())))
    monkeypatch.setenv("PORTAL_BASE_URL", "https://portal.example/")

    saved = {}

    def fake_save_bytes(data, filename):
        saved["data"] = data
        saved["filename"] = filename
        return "instagram.jpg"

    monkeypatch.setattr(assets.storage, "save_bytes", fake_save_bytes)

    async def fake_generate_image(**kwargs):
        return ai_gateway.GatewayResult(
            ok=True, provider="tunnel", model="gemini", data=[{"url": "https://cdn.example/image.png"}],
        )

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)
    asset = await assets.render_image(
        _FakeDB(), None, project=_project(), content=_content(), prompt="draw a cat",
        target_channel="instagram",
    )

    with Image.open(io.BytesIO(saved["data"])) as image:
        assert image.format == "JPEG"
        assert image.size == (1080, 1350)
    assert saved["filename"].endswith("instagram.jpg")
    assert asset.meta["content_type"] == "image/jpeg"
    assert asset.url == f"https://portal.example/api/v1/smm-projects/assets/{asset.id}/file"
    assert asset.storage_key == "instagram.jpg"


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color="red").save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_render_image_retries_with_one_reference_when_provider_refuses(monkeypatch):
    """Gemini can answer finish_reason=STOP with no image and no explicit
    block_reason when given several reference photos — retry with one visual
    anchor instead of generating an unrelated image without references."""
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)

    knowledge_items = []
    for index in range(2):
        knowledge_item = SmmKnowledgeItem()
        knowledge_item.id = index + 1
        knowledge_item.project_id = 1
        knowledge_item.title = f"Style {index + 1}"
        knowledge_item.content = ""
        knowledge_item.source_type = "image_reference"
        knowledge_item.visual_role = "style"
        knowledge_item.storage_key = f"ref_key_{index}.png"
        knowledge_item.content_type = "image/png"
        knowledge_item.original_filename = f"ref_{index}.png"
        knowledge_items.append(knowledge_item)
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: knowledge_items)
    monkeypatch.setattr(assets.storage, "read_bytes", lambda key: _png_bytes())

    calls = []

    async def fake_generate_image(**kwargs):
        calls.append(kwargs)
        if kwargs.get("input_references") and len(kwargs["input_references"]) > 1:
            return ai_gateway.GatewayResult(ok=False, provider="tunnel", error="Google: Gemini could not generate an image (STOP)")
        return ai_gateway.GatewayResult(ok=True, provider="tunnel", model="gemini", data=[{"url": "https://cdn.example/retry.png"}])

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _Client(_Response(b"retry-bytes")))
    monkeypatch.setattr(assets.storage, "save_bytes", lambda data, filename: "retry_storage_key.png")

    content = _content()
    asset = await assets.render_image(_FakeDB(), None, project=_project(), content=content, prompt="draw a cat")

    assert len(calls) == 2
    assert calls[0]["input_references"]
    assert assets._VISUAL_REFERENCE_GUARD in calls[0]["prompt"]
    assert "Не копируй референс целиком" in calls[0]["prompt"]
    assert "Не добавляй элементы других брендов" in calls[0]["prompt"]
    assert len(calls[1]["input_references"]) == 1
    assert asset.url == "https://cdn.example/retry.png"
    assert content.selected_asset_id == asset.id


@pytest.mark.asyncio
async def test_render_image_switches_selection_to_the_newly_generated_asset(monkeypatch):
    """The SMM editor has no separate "pick this visual" step — "Создать
    визуал" is the only action — so generating a second image for the same
    draft must move content.selected_asset_id to it, or publishing keeps
    attaching the stale one (or none, if the draft never had one selected)."""
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: _Client(_Response(_png_bytes())))
    monkeypatch.setattr(assets.storage, "save_bytes", lambda data, filename: "storage_key.png")

    calls = []

    async def fake_generate_image(**kwargs):
        calls.append(kwargs)
        return ai_gateway.GatewayResult(ok=True, provider="tunnel", model="gemini", data=[{"url": "https://cdn.example/img.png"}])

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)

    db = _FakeDB()
    content = _content()
    first = await assets.render_image(db, None, project=_project(), content=content, prompt="first")
    assert content.selected_asset_id == first.id
    assert first.is_selected is True

    second = await assets.render_image(
        db, None, project=_project(), content=content, prompt="second", target_channel="telegram",
    )

    assert content.selected_asset_id == second.id
    assert second.is_selected is True
    assert first.is_selected is False
    assert calls[0]["aspect_ratio"] == "4:5"
    assert calls[1]["aspect_ratio"] == "1:1"
    assert second.meta["visual_format"]["target_channel"] == "telegram"


@pytest.mark.asyncio
async def test_render_image_raises_when_retry_without_references_also_fails(monkeypatch):
    monkeypatch.setattr(ai_gateway, "is_configured", lambda purpose: True)
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [])

    async def fake_generate_image(**kwargs):
        return ai_gateway.GatewayResult(ok=False, provider="tunnel", error="Google: Gemini could not generate an image (STOP)")

    monkeypatch.setattr(ai_gateway, "generate_image", fake_generate_image)

    with pytest.raises(ValueError, match="STOP"):
        await assets.render_image(_FakeDB(), None, project=_project(), content=_content(), prompt="draw a cat")
