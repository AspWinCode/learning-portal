import json

import pytest

from app.services.smm_projects.publishers.base import PublicationContext
from app.services.smm_projects.publishers.instagram import InstagramPublisher
from app.services.smm_projects.publishers.telegram import TelegramPublisher
from app.services.smm_projects.publishers.vk import VkPublisher


class _Response:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


class _Client:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.responses.pop(0)


@pytest.mark.asyncio
async def test_telegram_sends_all_slides_as_media_group(monkeypatch):
    client = _Client([_Response({"ok": True, "result": [{"message_id": 101}, {"message_id": 102}]})])
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: client)

    result = await TelegramPublisher().publish(PublicationContext(
        project_code="kodarena", channel="telegram", text="Текст",
        asset_bytes=b"one", asset_bytes_list=[b"one", b"two"],
        config={"token": "token", "chat_id": "1", "username": "kodarena"},
    ))

    assert result.external_id == "101"
    assert client.calls[0][0].endswith("/sendMediaGroup")
    media = json.loads(client.calls[0][1]["data"]["media"])
    assert len(media) == 2
    assert media[0]["caption"] == "Текст"
    assert len(client.calls[0][1]["files"]) == 2


@pytest.mark.asyncio
async def test_vk_attaches_all_slides_to_one_wall_post(monkeypatch):
    client = _Client([
        _Response({"response": {"upload_url": "upload-1"}}), _Response({"response": {"server": 1, "photo": "p1", "hash": "h1"}}), _Response({"response": [{"owner_id": -1, "id": 11}]}),
        _Response({"response": {"upload_url": "upload-2"}}), _Response({"response": {"server": 2, "photo": "p2", "hash": "h2"}}), _Response({"response": [{"owner_id": -1, "id": 22}]}),
        _Response({"response": {"post_id": 99}}),
    ])
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: client)

    result = await VkPublisher().publish(PublicationContext(
        project_code="kodarena", channel="vk", text="Текст",
        asset_bytes_list=[b"one", b"two"], config={"token": "token", "group_id": "1"},
    ))

    assert result.external_id == "99"
    wall_call = client.calls[-1]
    assert wall_call[1]["data"]["attachments"] == "photo-1_11,photo-1_22"


@pytest.mark.asyncio
async def test_instagram_creates_carousel_container(monkeypatch):
    client = _Client([
        _Response({"id": "child-1"}), _Response({"id": "child-2"}),
        _Response({"id": "carousel-1"}), _Response({"id": "published-1"}),
    ])
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: client)

    result = await InstagramPublisher().publish(PublicationContext(
        project_code="kodarena", channel="instagram", text="Текст",
        asset_urls=["https://cdn/one.png", "https://cdn/two.png"],
        config={"token": "token", "account_id": "1"},
    ))

    assert result.external_id == "published-1"
    carousel_data = client.calls[2][1]["data"]
    assert carousel_data["media_type"] == "CAROUSEL"
    assert carousel_data["children"] == "child-1,child-2"
