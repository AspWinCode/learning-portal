import pytest

from app.services.max_client import MaxClient, MaxForbiddenError, MaxRateLimitedError


class Response:
    def __init__(self, status_code=200, payload=None, headers=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = headers or {}
        self.text = ""

    def json(self):
        return self._payload


def test_send_message_uses_official_api_and_keeps_token_out_of_payload(monkeypatch):
    calls = []
    monkeypatch.setenv("MAX_ENABLED", "1")
    def request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return Response(payload={"message": {"id": "m-1"}})
    monkeypatch.setattr("app.services.max_client.requests.request", request)

    result = MaxClient(base_url="https://platform-api2.max.ru", token="secret").send_message("123", "hello")

    assert result == "m-1"
    assert calls[0][0:2] == ("POST", "https://platform-api2.max.ru/messages")
    assert calls[0][2]["headers"]["Authorization"] == "secret"
    assert calls[0][2]["params"] == {"chat_id": "123"}
    assert calls[0][2]["json"] == {"text": "hello"}


def test_429_is_normalized(monkeypatch):
    monkeypatch.setattr("app.services.max_client.requests.request", lambda *a, **k: Response(429, headers={"Retry-After": "4"}))
    with pytest.raises(MaxRateLimitedError) as exc:
        MaxClient(token="secret").get_chat("1")
    assert exc.value.retry_after == 4


def test_403_is_normalized(monkeypatch):
    monkeypatch.setattr("app.services.max_client.requests.request", lambda *a, **k: Response(403))
    with pytest.raises(MaxForbiddenError):
        MaxClient(token="secret").get_chat("1")
