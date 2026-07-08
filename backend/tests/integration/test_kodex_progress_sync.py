"""Интеграционные тесты эндпоинта POST /api/student-portal/progress-sync."""
import hashlib
import hmac
import json
import os

import pytest

pytestmark = pytest.mark.integration


def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _body(**kwargs) -> bytes:
    defaults = {
        "external_ref": "lp-student-1",
        "catalog_item_code": "kodex",
        "cases_solved": 13,
        "cases_total": 39,
        "rank_name": "Оперативник",
        "badges_count": 5,
        "last_badge_name": "Художник",
    }
    defaults.update(kwargs)
    return json.dumps(defaults, ensure_ascii=False).encode()


SECRET = os.getenv("SSO_KODEX_SHARED_SECRET", "test-secret-for-ci")


class TestProgressSyncSignature:
    def test_no_signature_returns_401(self, client):
        body = _body()
        r = client.post(
            "/api/v1/student-portal/progress-sync",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 401

    def test_wrong_signature_returns_401(self, client):
        body = _body()
        r = client.post(
            "/api/v1/student-portal/progress-sync",
            content=body,
            headers={"Content-Type": "application/json", "X-Kodex-Signature": "deadbeef"},
        )
        assert r.status_code == 401

    def test_invalid_external_ref_returns_404(self, client):
        body = _body(external_ref="not-a-student-ref")
        sig = _sign(body, SECRET)
        r = client.post(
            "/api/v1/student-portal/progress-sync",
            content=body,
            headers={"Content-Type": "application/json", "X-Kodex-Signature": sig},
        )
        assert r.status_code == 404

    def test_nonexistent_student_returns_404(self, client):
        body = _body(external_ref="lp-student-999999")
        sig = _sign(body, SECRET)
        r = client.post(
            "/api/v1/student-portal/progress-sync",
            content=body,
            headers={"Content-Type": "application/json", "X-Kodex-Signature": sig},
        )
        assert r.status_code == 404
