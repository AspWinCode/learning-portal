import pytest

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
