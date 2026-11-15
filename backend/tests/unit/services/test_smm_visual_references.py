from app.models import SmmKnowledgeItem, SmmProject
from app.services.smm_projects import assets


def test_visual_references_rotate_between_characters(monkeypatch):
    project = SmmProject(id=1, code="test_project")
    items = []
    for index, name in enumerate(("plague.png", "mage.png", "robot.png", "archer.png", "ninja.png"), start=1):
        item = SmmKnowledgeItem(
            id=index,
            project_id=1,
            source_type="file",  # ZIP imports may have a generic source type.
            original_filename=name,
            content_type="application/octet-stream",
            storage_key=f"ref-{index}",
        )
        items.append(item)

    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: items)
    monkeypatch.setattr(assets.storage, "read_bytes", lambda key: b"not-an-image")

    # The test only checks candidate rotation; invalid bytes are skipped by the
    # image normalizer, so use the selection helper's candidate list indirectly.
    selected = []
    original_read = assets.storage.read_bytes

    def read_and_track(key):
        selected.append(key)
        return original_read(key)

    monkeypatch.setattr(assets.storage, "read_bytes", read_and_track)
    assets._visual_input_references(None, project, content_id=1)
    first_batch = selected[:]
    selected.clear()
    assets._visual_input_references(None, project, content_id=2)
    second_batch = selected[:]

    assert first_batch != second_batch
    assert "ref-1" in first_batch
    assert "ref-5" in second_batch
