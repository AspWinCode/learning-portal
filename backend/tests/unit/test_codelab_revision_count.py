"""Агрегат revision_required_count (StudentCourseProgress) для бейджа
"N работ требует доработки" на карточке курса в Student Portal (п.20).
Обновляется из admin_review_project_submission по разнице между старым
статусом сдачи и только что принятым решением тренера — без копирования
самих сдач с Codelab."""
from types import SimpleNamespace

from app.routers import codelab


class _FakeCatalogItem:
    def __init__(self, id, code):
        self.id = id
        self.code = code


class _FakeProgress:
    def __init__(self, student_id, catalog_item_id, revision_required_count=0):
        self.student_id = student_id
        self.catalog_item_id = catalog_item_id
        self.revision_required_count = revision_required_count


class _FakeDb:
    """Достаточно query(...).filter(...).first() с нужной выборкой —
    как в реальном коде, но без СУБД."""

    def __init__(self, catalog_items=None, progress_rows=None):
        self.catalog_items = catalog_items or []
        self.progress_rows = progress_rows or []
        self.added = []
        self.commits = 0

    def query(self, model):
        if model is codelab.CourseCatalogItem:
            return _Query(self.catalog_items, kind="catalog")
        if model is codelab.StudentCourseProgress:
            return _Query(self.progress_rows, kind="progress")
        raise AssertionError(f"unexpected model {model}")

    def add(self, obj):
        self.added.append(obj)
        self.progress_rows.append(obj)

    def commit(self):
        self.commits += 1


class _Query:
    def __init__(self, rows, kind):
        self._rows = rows
        self._kind = kind
        self._filtered = rows

    def filter(self, *conditions):
        # Фильтрация здесь не нужна по-настоящему — тесты держат по одной
        # подходящей записи в rows; реальная фильтрация проверяется
        # интеграционными тестами с настоящей БД.
        return self

    def first(self):
        return self._filtered[0] if self._filtered else None


def test_delta_plus_one_creates_progress_row_when_missing():
    db = _FakeDb(catalog_items=[_FakeCatalogItem(id=9, code="codelab-4")], progress_rows=[])
    codelab._adjust_revision_required_count(db, student_id=101, course_id=4, delta=1)
    assert len(db.progress_rows) == 1
    assert db.progress_rows[0].revision_required_count == 1
    assert db.commits == 1


def test_delta_minus_one_decrements_existing_row():
    progress = _FakeProgress(student_id=101, catalog_item_id=9, revision_required_count=2)
    db = _FakeDb(catalog_items=[_FakeCatalogItem(id=9, code="codelab-4")], progress_rows=[progress])
    codelab._adjust_revision_required_count(db, student_id=101, course_id=4, delta=-1)
    assert progress.revision_required_count == 1


def test_count_never_goes_negative():
    progress = _FakeProgress(student_id=101, catalog_item_id=9, revision_required_count=0)
    db = _FakeDb(catalog_items=[_FakeCatalogItem(id=9, code="codelab-4")], progress_rows=[progress])
    codelab._adjust_revision_required_count(db, student_id=101, course_id=4, delta=-1)
    assert progress.revision_required_count == 0


def test_delta_zero_is_a_noop_even_without_catalog_item():
    db = _FakeDb(catalog_items=[], progress_rows=[])
    codelab._adjust_revision_required_count(db, student_id=101, course_id=4, delta=0)
    assert db.commits == 0
    assert db.progress_rows == []


def test_missing_catalog_item_does_not_create_progress_row():
    db = _FakeDb(catalog_items=[], progress_rows=[])
    codelab._adjust_revision_required_count(db, student_id=101, course_id=4, delta=1)
    assert db.progress_rows == []
    assert db.commits == 0


def test_review_endpoint_increments_on_needs_revision_and_decrements_on_accept(monkeypatch):
    """Полный путь decision->delta: старый статус submitted -> needs_revision
    увеличивает счётчик; needs_revision -> accepted уменьшает."""
    import asyncio

    from app.schemas.codelab import CodelabProjectReviewIn

    trainer = SimpleNamespace(id=7)
    progress = _FakeProgress(student_id=101, catalog_item_id=9, revision_required_count=0)
    db = _FakeDb(catalog_items=[_FakeCatalogItem(id=9, code="codelab-4")], progress_rows=[progress])

    async def fake_authorize(*_args, **_kwargs):
        return {"id": 1, "status": "submitted", "student_external_ref": "lp-student-101"}

    async def fake_review(*_args, **_kwargs):
        return {"id": 1, "status": "needs_revision"}

    monkeypatch.setattr(codelab, "_get_and_authorize_project_row", fake_authorize)
    monkeypatch.setattr(codelab.cl, "review_project_submission", fake_review)
    monkeypatch.setattr(codelab, "log_action", lambda *a, **k: None)
    monkeypatch.setattr(codelab, "_notify_student_revision_requested", lambda *a, **k: None)

    payload = CodelabProjectReviewIn(decision="needs_revision", score=None, comment="Исправь цикл")
    asyncio.run(codelab.admin_review_project_submission(4, 2, 1, payload, trainer, db))
    assert progress.revision_required_count == 1

    async def fake_authorize_pending(*_args, **_kwargs):
        return {"id": 1, "status": "needs_revision", "student_external_ref": "lp-student-101"}

    async def fake_review_accept(*_args, **_kwargs):
        return {"id": 1, "status": "accepted"}

    monkeypatch.setattr(codelab, "_get_and_authorize_project_row", fake_authorize_pending)
    monkeypatch.setattr(codelab.cl, "review_project_submission", fake_review_accept)

    payload = CodelabProjectReviewIn(decision="accepted", score=5, comment="Отлично")
    asyncio.run(codelab.admin_review_project_submission(4, 2, 1, payload, trainer, db))
    assert progress.revision_required_count == 0
