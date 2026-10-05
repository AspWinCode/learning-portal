import pytest

from app.models import AiWorkspace
from app.services.ai_studio import knowledge


class _Result:
    def __init__(self, first=None, scalar=0):
        self._first = first
        self._scalar = scalar

    def first(self):
        return self._first

    def scalar(self):
        return self._scalar


class _DB:
    """Отдаёт ответы по подстроке в SQL — тот же приём, что в
    test_academy_retrieval.py (знание направления изолировано только
    фильтром workspace_id, а не отдельной БД, поэтому проверяем именно SQL)."""

    def __init__(self, rules):
        self.rules = rules

    def execute(self, statement, params=None):
        sql = str(statement)
        for needle, result in self.rules.items():
            if needle in sql:
                return result
        return _Result()


def _workspace():
    w = AiWorkspace()
    w.id = 1
    w.code = "kodarena"
    return w


@pytest.fixture(autouse=True)
def _reset_caps():
    knowledge._caps = None
    yield
    knowledge._caps = None


def test_capabilities_false_by_default():
    db = _DB(rules={})
    caps = knowledge.capabilities(db)
    assert caps == {"pgvector": False, "fts": False}
    assert knowledge.search_backend(db) == "ilike"


def test_capabilities_detects_fts_column():
    db = _DB(rules={"information_schema.columns": _Result(first=(1,))})
    caps = knowledge.capabilities(db)
    assert caps["fts"] is True
    assert caps["pgvector"] is False
    assert knowledge.search_backend(db) == "fts"


def test_capabilities_detects_pgvector_takes_priority_over_fts():
    db = _DB(
        rules={
            "pg_extension": _Result(first=(1,)),
            "information_schema.columns": _Result(first=(1,)),
        }
    )
    caps = knowledge.capabilities(db)
    assert caps["pgvector"] is True
    assert knowledge.search_backend(db) == "vector"


def test_capabilities_cached_until_refresh():
    db = _DB(rules={"pg_extension": _Result(first=(1,))})
    first = knowledge.capabilities(db)
    db.rules = {}  # БД "перестала" поддерживать pgvector, но кэш не тронут
    cached = knowledge.capabilities(db)
    assert cached == first
    refreshed = knowledge.capabilities(db, refresh=True)
    assert refreshed["pgvector"] is False


def test_pending_embeddings_zero_without_pgvector():
    db = _DB(rules={})
    assert knowledge.pending_embeddings(db, _workspace()) == 0


@pytest.mark.asyncio
async def test_index_pending_skips_when_no_pgvector(monkeypatch):
    db = _DB(rules={})
    result = await knowledge.index_pending(db, _workspace())
    assert result["indexed"] == 0
    assert result["reason"] == "pgvector unavailable"


@pytest.mark.asyncio
async def test_search_empty_query_returns_empty():
    db = _DB(rules={})
    assert await knowledge.search(db, _workspace(), "") == []
