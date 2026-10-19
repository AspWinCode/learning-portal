import pytest

from app.services.smm_projects.publishers.base import PublicationContext
from app.services.smm_projects.publishers.max import MaxPublisher


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.text = text

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, responses, calls=None):
        self._responses = list(responses)
        self.calls = calls if calls is not None else []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self._responses.pop(0)

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self._responses.pop(0)


def _client_factory(responses, calls=None):
    def _factory(*a, **k):
        return _FakeAsyncClient(responses, calls=calls)

    return _factory


@pytest.fixture
def publisher():
    return MaxPublisher()


def test_is_configured_requires_token_and_chat_id(publisher):
    assert publisher.is_configured("kodarena", {"token": "t", "chat_id": "1"}) is True
    assert publisher.is_configured("kodarena", {"token": "", "chat_id": "1"}) is False
    assert publisher.is_configured("kodarena", None) is False


@pytest.mark.asyncio
async def test_verify_invalid_token_returns_understandable_error(monkeypatch, publisher):
    monkeypatch.setattr("httpx.AsyncClient", _client_factory([_FakeResponse(401)]))
    result = await publisher.verify("kodarena", {"token": "bad", "chat_id": "1"})
    assert result.ok is False
    assert result.error == "Недействительный токен MAX"


@pytest.mark.asyncio
async def test_verify_bot_without_chat_access_returns_understandable_error(monkeypatch, publisher):
    monkeypatch.setattr("httpx.AsyncClient", _client_factory([_FakeResponse(403)]))
    result = await publisher.verify("kodarena", {"token": "t", "chat_id": "1"})
    assert result.ok is False
    assert result.error == "Бот не имеет доступа к чату"


@pytest.mark.asyncio
async def test_verify_wrong_chat_id_returns_understandable_error(monkeypatch, publisher):
    monkeypatch.setattr("httpx.AsyncClient", _client_factory([_FakeResponse(404)]))
    result = await publisher.verify("kodarena", {"token": "t", "chat_id": "999"})
    assert result.ok is False
    assert result.error == "Чат MAX не найден"


@pytest.mark.asyncio
async def test_verify_rate_limited_returns_understandable_error(monkeypatch, publisher):
    monkeypatch.setattr("httpx.AsyncClient", _client_factory([_FakeResponse(429)]))
    result = await publisher.verify("kodarena", {"token": "t", "chat_id": "1"})
    assert result.ok is False
    assert result.error == "Превышен лимит MAX API"


@pytest.mark.asyncio
async def test_verify_valid_token_and_chat_succeeds(monkeypatch, publisher):
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([_FakeResponse(200, {"chat_id": "123", "title": "Код Арена"})]),
    )
    result = await publisher.verify("kodarena", {"token": "t", "chat_id": "123"})
    assert result.ok is True
    assert result.detail == {"chat_id": "123", "chat_title": "Код Арена"}


@pytest.mark.asyncio
async def test_verify_not_configured_without_calling_api(publisher):
    result = await publisher.verify("kodarena", {"token": "", "chat_id": ""})
    assert result.ok is False
    assert "не настроен" in result.error


@pytest.mark.asyncio
async def test_publish_text_success_returns_external_message_id(monkeypatch, publisher):
    # Реальная форма ответа MAX API: id сообщения лежит в message.body.mid,
    # а не message.message_id/message.id (проверено живым вызовом API).
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([_FakeResponse(200, {"message": {"body": {"mid": "mid.abc123", "seq": 1, "text": "Привет"}}})]),
    )
    context = PublicationContext(project_code="kodarena", channel="max", text="Привет", config={"token": "t", "chat_id": "1"})
    result = await publisher.publish(context)
    assert result.external_id == "mid.abc123"


@pytest.mark.asyncio
async def test_publish_with_image_extracts_token_from_real_photos_shape(monkeypatch, publisher):
    # Реальный ответ MAX на /uploads?type=image: {"photos": {"0": {"token": "..."}}}
    # — числовой индекс, а не "photoIds" (проверено живым вызовом API; на
    # старой форме парсинга падало с "MAX не вернул media token" на каждой
    # публикации с картинкой).
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([
            _FakeResponse(200, {"url": "https://iu.oneme.ru/uploadImage?r=token"}),
            _FakeResponse(200, {"photos": {"0": {"token": "media-token-xyz"}}}),
            _FakeResponse(200, {"message": {"body": {"mid": "mid.withimage", "seq": 1}}}),
        ]),
    )
    context = PublicationContext(
        project_code="kodarena", channel="max", text="Пост с картинкой",
        asset_bytes=b"fake-png-bytes", config={"token": "t", "chat_id": "1"},
    )
    result = await publisher.publish(context)
    assert result.external_id == "mid.withimage"


@pytest.mark.asyncio
async def test_publish_sends_markdown_format_so_max_renders_bold(monkeypatch, publisher):
    # Без format MAX отдаёт текст буквально — **bold** приходит со
    # звёздочками. Подтверждено живым вызовом: с format="markdown" MAX сам
    # разбирает разметку (возвращает markup: strong/emphasized).
    calls = []
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([_FakeResponse(200, {"message": {"body": {"mid": "mid.1"}}})], calls=calls),
    )
    context = PublicationContext(project_code="kodarena", channel="max", text="**жирный**", config={"token": "t", "chat_id": "1"})
    await publisher.publish(context)
    _, kwargs = calls[-1]
    assert kwargs["json"]["format"] == "markdown"


@pytest.mark.asyncio
async def test_publish_falls_back_to_message_id_field(monkeypatch, publisher):
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([_FakeResponse(200, {"message": {"message_id": "mid-1"}})]),
    )
    context = PublicationContext(project_code="kodarena", channel="max", text="Привет", config={"token": "t", "chat_id": "1"})
    result = await publisher.publish(context)
    assert result.external_id == "mid-1"


@pytest.mark.asyncio
async def test_publish_http_error_raises_understandable_message(monkeypatch, publisher):
    monkeypatch.setattr("httpx.AsyncClient", _client_factory([_FakeResponse(403)]))
    context = PublicationContext(project_code="kodarena", channel="max", text="Привет", config={"token": "t", "chat_id": "1"})
    with pytest.raises(ValueError, match="Бот не имеет доступа"):
        await publisher.publish(context)


@pytest.mark.asyncio
async def test_publish_without_config_raises(publisher):
    context = PublicationContext(project_code="unknown_project_xyz", channel="max", text="Привет", config=None)
    with pytest.raises(ValueError, match="не настроен"):
        await publisher.publish(context)
