import pytest
from fastapi import HTTPException

from app.permissions import VALID_PERMISSION_KEYS
from app.routers import academy_ai
from app.schemas.academy_ai import (
    BusinessProfileUpdate,
    ConsultRequest,
    ContentExampleCreate,
    ContentExampleUpdate,
    ContentGenerateRequest,
)


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


class _Profile:
    def __init__(self):
        self.id = 1
        from app.services.academy_ai.business_profile import FIELDS

        for field in FIELDS:
            setattr(self, field, None)
        self.updated_by_id = None


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def order_by(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None


class _DB:
    def __init__(self, rows):
        self._rows = rows

    def query(self, _model):
        return _Query(self._rows)

    def add(self, obj):
        self._rows.append(obj)

    def delete(self, obj):
        if obj in self._rows:
            self._rows.remove(obj)

    def commit(self):
        pass

    def refresh(self, _obj):
        pass


class _User:
    id = 5


def test_get_business_profile_creates_when_missing():
    db = _DB([])
    profile = academy_ai.get_business_profile(db=db, current_user=_User())
    assert profile in db._rows


def test_update_business_profile_applies_fields():
    profile = _Profile()
    db = _DB([profile])
    updated = academy_ai.update_business_profile(
        BusinessProfileUpdate(mission="Учим программировать", usp="Индивидуальный формат"),
        db=db,
        current_user=_User(),
    )
    assert updated.mission == "Учим программировать"
    assert updated.usp == "Индивидуальный формат"
    assert updated.updated_by_id == 5


class _Example:
    def __init__(self, id=1, kind="post", body="текст"):
        self.id = id
        self.kind = kind
        self.direction = None
        self.title = None
        self.body = body
        self.is_active = True


def test_create_content_example_rejects_unknown_kind():
    with pytest.raises(HTTPException) as exc:
        academy_ai.create_content_example(
            ContentExampleCreate(kind="banner", body="текст"), db=_DB([]), current_user=_User()
        )
    assert exc.value.status_code == 422


def test_create_content_example_stores_example():
    db = _DB([])
    example = academy_ai.create_content_example(
        ContentExampleCreate(kind="post", body="Хук! Польза. Призыв к действию."), db=db, current_user=_User()
    )
    assert example.kind == "post"
    assert example.created_by_id == 5


def test_update_content_example_rejects_unknown_kind():
    example = _Example()
    with pytest.raises(HTTPException) as exc:
        academy_ai.update_content_example(
            example.id, ContentExampleUpdate(kind="banner"), db=_DB([example]), current_user=_User()
        )
    assert exc.value.status_code == 422


def test_update_content_example_applies_fields():
    example = _Example()
    updated = academy_ai.update_content_example(
        example.id, ContentExampleUpdate(title="Новый пример"), db=_DB([example]), current_user=_User()
    )
    assert updated.title == "Новый пример"


def test_delete_content_example_missing_raises_404():
    with pytest.raises(HTTPException) as exc:
        academy_ai.delete_content_example(999, db=_DB([]), current_user=_User())
    assert exc.value.status_code == 404
