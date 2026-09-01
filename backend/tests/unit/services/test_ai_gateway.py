import httpx
import pytest

from app.services import ai_gateway


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeAsyncClient:
    """Подменяет httpx.AsyncClient: возвращает заранее заданный JSON на POST."""

    payload = {}
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, **kwargs):
        _FakeAsyncClient.calls.append((url, kwargs))
        return _FakeResponse(_FakeAsyncClient.payload)


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    for key in (
        "AI_PROVIDER",
        "AI_TUNNEL_BASE_URL",
        "AI_TUNNEL_API_KEY",
        "AI_TUNNEL_MODEL_TEXT",
        "AI_TUNNEL_MODEL_VISION",
        "AI_TUNNEL_MODEL_IMAGE",
        "AI_TUNNEL_MODEL_EMBED",
        "RANVIK_API_KEY",
        "RANVIK_BASE_URL",
        "RANVIK_MODEL",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_MODEL",
    ):
        monkeypatch.delenv(key, raising=False)
    _FakeAsyncClient.calls = []


def test_provider_order_default():
    assert ai_gateway._provider_order() == ["tunnel", "ranvik", "claude"]


def test_provider_order_explicit(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "claude")
    assert ai_gateway._provider_order()[0] == "claude"
    assert set(ai_gateway._provider_order()) == {"tunnel", "ranvik", "claude"}


def test_is_configured_false_without_env():
    assert ai_gateway.is_configured("text") is False
    assert ai_gateway.is_configured("embed") is False


@pytest.mark.asyncio
async def test_complete_text_no_provider_returns_not_ok():
    result = await ai_gateway.complete_text(feature="unit", prompt="привет")
    assert result.ok is False
    assert result.provider is None


@pytest.mark.asyncio
async def test_complete_text_uses_openai_tunnel(monkeypatch):
    monkeypatch.setenv("AI_TUNNEL_BASE_URL", "https://tunnel.example/v1")
    monkeypatch.setenv("AI_TUNNEL_API_KEY", "k")
    monkeypatch.setenv("AI_TUNNEL_MODEL_TEXT", "some-model")
    _FakeAsyncClient.payload = {
        "choices": [{"message": {"content": '{"ok": true}'}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14},
    }
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    result = await ai_gateway.complete_text(feature="unit", prompt="сделай json", json_mode=True)

    assert result.ok is True
    assert result.provider == "tunnel"
    assert result.model == "some-model"
    assert result.total_tokens == 14
    assert result.json_object() == {"ok": True}
    url, kwargs = _FakeAsyncClient.calls[0]
    assert url == "https://tunnel.example/v1/chat/completions"
    assert kwargs["json"]["response_format"] == {"type": "json_object"}


@pytest.mark.asyncio
async def test_complete_text_anthropic_fallback(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    _FakeAsyncClient.payload = {
        "content": [{"type": "text", "text": "ответ"}],
        "usage": {"input_tokens": 7, "output_tokens": 3},
    }
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    result = await ai_gateway.complete_text(feature="unit", prompt="вопрос")

    assert result.ok is True
    assert result.provider == "claude"
    assert result.text == "ответ"
    assert result.total_tokens == 10


@pytest.mark.asyncio
async def test_embed_returns_vectors(monkeypatch):
    monkeypatch.setenv("AI_TUNNEL_BASE_URL", "https://tunnel.example/v1")
    monkeypatch.setenv("AI_TUNNEL_API_KEY", "k")
    monkeypatch.setenv("AI_TUNNEL_MODEL_EMBED", "embed-model")
    _FakeAsyncClient.payload = {"data": [{"embedding": [0.1, 0.2]}, {"embedding": [0.3, 0.4]}]}
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    result = await ai_gateway.embed(feature="unit", inputs=["a", "b"])

    assert result.ok is True
    assert result.data == [[0.1, 0.2], [0.3, 0.4]]


def test_parse_json_object_strips_code_fence():
    assert ai_gateway._parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert ai_gateway._parse_json_object("noise {\"a\": 2} trailer") == {"a": 2}
    assert ai_gateway._parse_json_object("not json") is None
