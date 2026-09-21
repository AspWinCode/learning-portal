import pytest

from app.models import AcademyBusinessProfile
from app.services import ai_gateway
from app.services.academy_ai import content_gen as cg


def test_valid_kinds():
    assert set(cg.VALID_KINDS) == {"post", "summary", "image_prompt", "newsletter", "script"}


def test_tone_hint_variants():
    assert cg._tone_hint(None) == ""
    assert cg._tone_hint({}) == ""
    out = cg._tone_hint({"voice": "экспертный", "length": "короткий", "emoji": False})
    assert "экспертный" in out and "короткий" in out and "без эмодзи" in out


class _Draft:
    def __init__(self):
        self.status = "draft"
        self.feedback_note = None


class _DB:
    def commit(self):
        pass

    def refresh(self, _):
        pass


def test_set_status_valid_and_feedback():
    d = _Draft()
    cg.set_status(_DB(), d, "rejected", feedback="не тот тон")
    assert d.status == "rejected"
    assert d.feedback_note == "не тот тон"


def test_set_status_rejects_unknown():
    with pytest.raises(ValueError):
        cg.set_status(_DB(), _Draft(), "yolo")


def test_kind_specs_shape():
    for kind, spec in cg._KIND_SPECS.items():
        assert "instruction" in spec and "json" in spec and "max_tokens" in spec


@pytest.mark.asyncio
async def test_generate_rejects_bad_kind():
    with pytest.raises(ValueError):
        await cg.generate(_DB(), object(), kind="banner", brief="x")


class _ImageDraft:
    def __init__(self, image_prompt="дети программируют за ноутбуком", based_on=None):
        self.id = 1
        self.image_prompt = image_prompt
        self.body = ""
        self.based_on = based_on
        self.image_storage_key = None


class _ProfileQuery:
    def __init__(self, rows):
        self._rows = rows

    def order_by(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None


class _ProfileDB(_DB):
    def __init__(self, profile=None):
        self._rows = [profile] if profile else []

    def query(self, _model):
        return _ProfileQuery(self._rows)

    def add(self, obj):
        self._rows.append(obj)


def _profile(brand_visual_style=None):
    p = AcademyBusinessProfile()
    p.brand_visual_style = brand_visual_style
    return p


@pytest.mark.asyncio
async def test_render_image_injects_brand_style(monkeypatch):
    captured = {}

    async def _fake_generate_image(*, feature, prompt, user_id=None, **kwargs):
        captured["prompt"] = prompt

        class _Result:
            ok = True
            data = [{"b64_json": "aGVsbG8="}]  # "hello"

        return _Result()

    monkeypatch.setattr(ai_gateway, "generate_image", _fake_generate_image)
    monkeypatch.setattr(
        "app.services.academy_ai.storage.save_bytes", lambda data, name: "kb/fake.png"
    )

    db = _ProfileDB(_profile(brand_visual_style="Пастельная палитра, плоские иллюстрации, без фото людей"))
    draft = _ImageDraft()
    result = await cg.render_image(db, draft)

    assert result["ok"] is True
    assert "Пастельная палитра" in captured["prompt"]
    assert "дети программируют" in captured["prompt"]


@pytest.mark.asyncio
async def test_render_image_without_brand_style_uses_plain_prompt(monkeypatch):
    captured = {}

    async def _fake_generate_image(*, feature, prompt, user_id=None, **kwargs):
        captured["prompt"] = prompt

        class _Result:
            ok = True
            data = [{"b64_json": "aGVsbG8="}]

        return _Result()

    monkeypatch.setattr(ai_gateway, "generate_image", _fake_generate_image)
    monkeypatch.setattr(
        "app.services.academy_ai.storage.save_bytes", lambda data, name: "kb/fake.png"
    )

    db = _ProfileDB(_profile(brand_visual_style=None))
    draft = _ImageDraft()
    result = await cg.render_image(db, draft)

    assert result["ok"] is True
    assert captured["prompt"] == "дети программируют за ноутбуком"
