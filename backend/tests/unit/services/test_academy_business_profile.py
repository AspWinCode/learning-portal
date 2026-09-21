from app.services.academy_ai import business_profile as bp


class _Profile:
    def __init__(self, **kwargs):
        self.id = 1
        for field in bp.FIELDS:
            setattr(self, field, None)
        self.updated_by_id = None
        for key, value in kwargs.items():
            setattr(self, key, value)


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def order_by(self, *a, **k):
        return self

    def first(self):
        return self._rows[0] if self._rows else None


class _DB:
    def __init__(self, rows=None):
        self._rows = rows or []
        self.added = []
        self.committed = False
        self.refreshed = []

    def query(self, _model):
        return _Query(self._rows)

    def add(self, obj):
        self.added.append(obj)
        self._rows.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        self.refreshed.append(obj)


def test_get_or_create_returns_existing():
    existing = _Profile(mission="Учим программировать")
    db = _DB([existing])
    assert bp.get_or_create(db) is existing
    assert db.added == []


def test_get_or_create_creates_when_missing():
    db = _DB([])
    profile = bp.get_or_create(db)
    assert profile in db.added
    assert db.committed


def test_update_sets_only_known_fields_and_stamps_editor():
    profile = _Profile()
    db = _DB([profile])
    updated = bp.update(db, profile, {"mission": "Новая миссия", "unknown_field": "x"}, user_id=7)
    assert updated.mission == "Новая миссия"
    assert not hasattr(updated, "unknown_field") or updated.unknown_field != "x"
    assert updated.updated_by_id == 7
    assert db.committed


def test_as_prompt_block_empty_when_no_fields_filled():
    assert bp.as_prompt_block(_Profile()) == ""


def test_as_prompt_block_includes_only_filled_fields():
    profile = _Profile(mission="Учим программировать", usp="Индивидуальный формат")
    block = bp.as_prompt_block(profile)
    assert "ПРОФИЛЬ АКАДЕМИИ" in block
    assert "Учим программировать" in block
    assert "Индивидуальный формат" in block
    assert "Целевая аудитория" not in block


def test_brand_visual_style_returns_trimmed_text():
    profile = _Profile(brand_visual_style="  Пастельная палитра  ")
    assert bp.brand_visual_style(profile) == "Пастельная палитра"


def test_brand_visual_style_empty_when_not_set():
    assert bp.brand_visual_style(_Profile()) == ""
