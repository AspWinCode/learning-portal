import pytest

from app.services.smm_projects.publishers.vk import VkPublisher


class _FakeResponse:
    def __init__(self, json_data):
        self._json = json_data

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, responses):
        self._responses = list(responses)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, **kwargs):
        return self._responses.pop(0)


def _client_factory(responses):
    def _factory(*a, **k):
        return _FakeAsyncClient(responses)

    return _factory


@pytest.fixture
def publisher():
    return VkPublisher()


def test_is_configured_requires_token_and_group_id(publisher):
    assert publisher.is_configured("kodarena", {"token": "t", "group_id": "1"}) is True
    assert publisher.is_configured("kodarena", {"token": "", "group_id": "1"}) is False
    assert publisher.is_configured("kodarena", None) is False


@pytest.mark.asyncio
async def test_verify_not_configured_without_calling_api(publisher):
    result = await publisher.verify("kodarena", {"token": "", "group_id": ""})
    assert result.ok is False
    assert "не настроен" in result.error


@pytest.mark.asyncio
async def test_verify_invalid_token_returns_understandable_error(monkeypatch, publisher):
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([_FakeResponse({"error": {"error_code": 5, "error_msg": "User authorization failed"}})]),
    )
    result = await publisher.verify("kodarena", {"token": "bad", "group_id": "1"})
    assert result.ok is False
    assert result.error == "Недействительный токен VK"


@pytest.mark.asyncio
async def test_verify_wrong_group_id_returns_understandable_error(monkeypatch, publisher):
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([_FakeResponse({"error": {"error_code": 100, "error_msg": "One of the parameters specified was missing or invalid"}})]),
    )
    result = await publisher.verify("kodarena", {"token": "t", "group_id": "999999999"})
    assert result.ok is False
    assert result.error == "Сообщество не найдено: неверный ID"


@pytest.mark.asyncio
async def test_verify_token_without_wall_permission_fails(monkeypatch, publisher):
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([
            _FakeResponse({"response": {"groups": [{"id": 1, "name": "КодАрена"}]}}),
            _FakeResponse({"response": {"mask": 8, "permissions": [{"name": "messages", "setting": 8}]}}),
        ]),
    )
    result = await publisher.verify("kodarena", {"token": "t", "group_id": "1"})
    assert result.ok is False
    assert "wall" in result.error


@pytest.mark.asyncio
async def test_verify_valid_token_and_wall_permission_succeeds(monkeypatch, publisher):
    monkeypatch.setattr(
        "httpx.AsyncClient",
        _client_factory([
            _FakeResponse({"response": {"groups": [{"id": 1, "name": "КодАрена"}]}}),
            _FakeResponse({"response": {"mask": 8192, "permissions": [{"name": "wall", "setting": 8192}]}}),
        ]),
    )
    result = await publisher.verify("kodarena", {"token": "t", "group_id": "1"})
    assert result.ok is True
    assert result.detail == {"chat_id": "1", "chat_title": "КодАрена"}
