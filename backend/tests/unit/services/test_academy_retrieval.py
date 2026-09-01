import pytest

from app.services.academy_ai import retrieval


class _Result:
    def __init__(self, first=None, scalar=0, rows=None):
        self._first = first
        self._scalar = scalar
        self._rows = rows or []

    def first(self):
        return self._first

    def scalar(self):
        return self._scalar

    def all(self):
        return self._rows


class _DB:
    """Отдаёт ответы по подстроке в SQL."""

    def __init__(self, rules):
        self.rules = rules
        self.commits = 0

    def execute(self, statement, params=None):
        sql = str(statement)
        for needle, result in self.rules.items():
            if needle in sql:
                return result
        return _Result()

    def commit(self):
        self.commits += 1


@pytest.fixture(autouse=True)
def _reset_caps():
    retrieval._caps = None
    yield
    retrieval._caps = None


def test_vec_literal_format():
    assert retrieval._vec_literal([0.1, -0.2, 3]) == "[0.100000,-0.200000,3.000000]"


def test_search_backend_ilike_when_nothing_available():
    db = _DB({})
    assert retrieval.search_backend(db) == "ilike"


def test_search_backend_fts():
    db = _DB({"pg_extension": _Result(first=None), "information_schema.columns": _Result(first=(1,))})
    assert retrieval.search_backend(db) == "fts"


def test_search_backend_vector():
    db = _DB({"pg_extension": _Result(first=(1,)), "information_schema.columns": _Result(first=(1,))})
    assert retrieval.search_backend(db) == "vector"


@pytest.mark.asyncio
async def test_search_empty_query_returns_nothing():
    assert await retrieval.search(_DB({}), "   ") == []


@pytest.mark.asyncio
async def test_index_pending_without_pgvector():
    db = _DB({})  # нет расширения vector
    out = await retrieval.index_pending(db)
    assert out["indexed"] == 0
    assert out["reason"] == "pgvector unavailable"


@pytest.mark.asyncio
async def test_search_ilike_path_builds_hits():
    db = _DB(
        {
            "pg_extension": _Result(first=None),
            "information_schema.columns": _Result(first=None),
            "academy_kb_chunks": _Result(rows=[(5, 2, "Заголовок", "текст чанка", 0.0)]),
        }
    )
    hits = await retrieval.search(db, "чанк", scopes=("kb",), k=5)
    assert len(hits) == 1
    assert hits[0].scope == "kb"
    assert hits[0].method == "ilike"
    assert hits[0].ref_id == 2
