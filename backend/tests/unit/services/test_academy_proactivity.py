import pytest

from app.services.academy_ai import proactivity as pro


def test_all_generator_kinds_are_auto_resolvable():
    # каждый вид, который генерируем, должен уметь авто-закрываться
    kinds = {"audit_stale", "audit_from_new_material", "kb_gap", "expertise_empty", "embeddings_pending", "drafts_waiting"}
    assert kinds == pro._AUTO_RESOLVABLE


def test_sections_cover_audit_sections():
    assert set(pro._SECTIONS) == {"niche", "finance", "marketing", "sales", "clients", "team"}


def test_candidate_shape():
    c = pro._candidate("k", "kind", "warn", "T", "B", {"x": 1})
    assert set(c) == {"dedup_key", "kind", "severity", "title", "body", "meta"}
    assert c["meta"] == {"x": 1}
    assert pro._candidate("k", "kind", "info", "T", None)["meta"] == {}


class _OpenInsight:
    def __init__(self, dedup_key, kind, status="open"):
        self.dedup_key = dedup_key
        self.kind = kind
        self.status = status
        self.resolved_at = None


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def all(self):
        return self._rows


class _DB:
    def __init__(self, open_insights):
        self._open = open_insights
        self.added = []
        self.committed = False

    def query(self, _model):
        return _Query(self._open)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True


@pytest.fixture
def patched_generators(monkeypatch):
    def _set(candidates):
        monkeypatch.setattr(pro, "_GENERATORS", (lambda db: list(candidates),))

    return _set


def test_scan_creates_new_insight(patched_generators):
    patched_generators([pro._candidate("expertise_empty", "expertise_empty", "info", "T", "B")])
    db = _DB(open_insights=[])
    out = pro.scan(db)
    assert out["created"] == ["expertise_empty"]
    assert len(db.added) == 1
    assert db.committed


def test_scan_dedups_against_open(patched_generators):
    patched_generators([pro._candidate("expertise_empty", "expertise_empty", "info", "T", "B")])
    db = _DB(open_insights=[_OpenInsight("expertise_empty", "expertise_empty")])
    out = pro.scan(db)
    assert out["created"] == []
    assert db.added == []


def test_scan_auto_resolves_gone_condition(patched_generators):
    patched_generators([])  # ни одного кандидата
    stale = _OpenInsight("kb_gap:finance", "kb_gap")
    db = _DB(open_insights=[stale])
    out = pro.scan(db)
    assert out["resolved"] == ["kb_gap:finance"]
    assert stale.status == "resolved" and stale.resolved_at is not None


def test_scan_keeps_non_auto_resolvable(patched_generators, monkeypatch):
    patched_generators([])
    other = _OpenInsight("custom", "custom_kind")
    db = _DB(open_insights=[other])
    out = pro.scan(db)
    assert out["resolved"] == []
    assert other.status == "open"


def test_scan_survives_failing_generator(monkeypatch):
    def _boom(db):
        raise RuntimeError("boom")

    monkeypatch.setattr(pro, "_GENERATORS", (_boom,))
    db = _DB(open_insights=[])
    out = pro.scan(db)
    assert out["created"] == [] and out["resolved"] == []
