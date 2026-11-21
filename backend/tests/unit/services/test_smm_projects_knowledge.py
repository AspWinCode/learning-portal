import pytest

from app.services.smm_projects import knowledge


def test_content_items_excludes_visual_references_from_shared_text_context(monkeypatch):
    project = type("Project", (), {"id": 1})()
    items = [
        type("Item", (), {"source_type": "file", "content_type": "text/plain", "title": "Бриф"})(),
        type("Item", (), {"source_type": "image_reference", "content_type": "image/png", "title": "Референс"})(),
    ]

    class Query:
        def filter(self, *_):
            return self

        def order_by(self, *_):
            return self

        def all(self):
            return items

    class DB:
        def query(self, *_):
            return Query()

    monkeypatch.setattr(knowledge.projects_svc, "content_source_projects", lambda db, target: [project])

    result = knowledge.content_items(DB(), project)

    assert [item.title for item in result] == ["Бриф"]


@pytest.mark.asyncio
async def test_personal_search_uses_other_projects_but_marks_their_visuals_excluded(monkeypatch):
    personal = type("Project", (), {"id": 1, "code": "personal_socials"})()
    academy = type("Project", (), {"id": 2, "code": "academy"})()
    calls = []

    def fake_search(db, project, query, limit, *, exclude_visual=False):
        calls.append((project.code, exclude_visual))
        return [type("Item", (), {"id": project.id})()]

    monkeypatch.setattr(knowledge.projects_svc, "content_source_projects", lambda db, target: [personal, academy])
    monkeypatch.setattr(knowledge, "capabilities", lambda db: {"pgvector": False, "fts": False})
    monkeypatch.setattr(knowledge, "_ilike_search", fake_search)

    result = await knowledge.search(object(), personal, "тема")

    assert [item.id for item in result] == [1, 2]
    assert calls == [("personal_socials", False), ("academy", True)]
