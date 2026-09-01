import pytest
from fastapi import HTTPException

from app.permissions import VALID_PERMISSION_KEYS
from app.routers import academy_ai
from app.schemas.academy_ai import ConsultRequest, ContentGenerateRequest


ACADEMY_KEYS = {
    "academy_ai.access",
    "academy_ai.audit",
    "academy_ai.knowledge_view",
    "academy_ai.knowledge_manage",
    "academy_ai.expertise_manage",
    "academy_ai.generate",
    "academy_ai.scheduler_manage",
    "academy_ai.finance_context",
    "academy_ai.settings",
}


def test_all_academy_ai_permission_keys_registered():
    assert ACADEMY_KEYS <= VALID_PERMISSION_KEYS


def test_module_enabled_flag(monkeypatch):
    monkeypatch.delenv("ACADEMY_AI_ENABLED", raising=False)
    assert academy_ai._module_enabled() is False
    monkeypatch.setenv("ACADEMY_AI_ENABLED", "1")
    assert academy_ai._module_enabled() is True


@pytest.mark.asyncio
async def test_consult_disabled_returns_404(monkeypatch):
    monkeypatch.delenv("ACADEMY_AI_ENABLED", raising=False)
    with pytest.raises(HTTPException) as exc:
        await academy_ai.consult(ConsultRequest(message="привет"), db=None, current_user=object())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_generate_rejects_unknown_kind(monkeypatch):
    monkeypatch.setenv("ACADEMY_AI_ENABLED", "1")
    with pytest.raises(HTTPException) as exc:
        await academy_ai.generate_content(
            ContentGenerateRequest(kind="banner", brief="набор на курс"), db=None, current_user=object()
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_generate_blocked_when_module_disabled(monkeypatch):
    monkeypatch.delenv("ACADEMY_AI_ENABLED", raising=False)
    with pytest.raises(HTTPException) as exc:
        await academy_ai.generate_content(
            ContentGenerateRequest(kind="post", brief="набор на курс"), db=None, current_user=object()
        )
    assert exc.value.status_code == 404
