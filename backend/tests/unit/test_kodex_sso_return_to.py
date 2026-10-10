"""SSO launch token carries a `return_to` claim so external platforms
(Codelab) can render a "back to cabinet" link without trusting a URL
supplied by the browser — the destination is baked into the HMAC-signed
JWT by the portal itself, not passed as a query param."""
from types import SimpleNamespace

from jose import jwt

from app.services import kodex_sso


def _student(student_id=42):
    return SimpleNamespace(id=student_id, full_name="Иванов Иван Александрович", group_students=[])


def _catalog_item(code="codelab-7", external_url="https://codelab.tirskix.space/api/auth/sso?course=7"):
    return SimpleNamespace(code=code, external_url=external_url)


def test_return_to_claim_points_at_student_portal(monkeypatch):
    monkeypatch.setattr(kodex_sso, "SSO_KODEX_SHARED_SECRET", "test-shared-secret")
    monkeypatch.setattr(kodex_sso, "PORTAL_BASE_URL", "https://tirskix.space")

    url = kodex_sso.build_launch_redirect_url(_student(), _catalog_item())
    assert url is not None
    token = url.split("token=", 1)[1]

    payload = jwt.decode(token, "test-shared-secret", algorithms=["HS256"], audience="codelab")
    assert payload["return_to"] == "https://tirskix.space/student-portal"
    assert payload["external_ref"] == "lp-student-42"


def test_return_to_respects_configured_portal_base_url(monkeypatch):
    monkeypatch.setattr(kodex_sso, "SSO_KODEX_SHARED_SECRET", "test-shared-secret")
    monkeypatch.setattr(kodex_sso, "PORTAL_BASE_URL", "https://custom.example/")

    url = kodex_sso.build_launch_redirect_url(_student(), _catalog_item())
    token = url.split("token=", 1)[1]
    payload = jwt.decode(token, "test-shared-secret", algorithms=["HS256"], audience="codelab")

    # Trailing slash on the configured base must not produce a double slash.
    assert payload["return_to"] == "https://custom.example/student-portal"


def test_no_secret_configured_returns_none(monkeypatch):
    monkeypatch.setattr(kodex_sso, "SSO_KODEX_SHARED_SECRET", "")
    assert kodex_sso.build_launch_redirect_url(_student(), _catalog_item()) is None
