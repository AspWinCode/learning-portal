from io import BytesIO

from PIL import Image

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


def test_explicit_character_reference_is_included_and_project_scoped(monkeypatch):
    project = SmmProject(id=1, code="test_project")
    character = SmmKnowledgeItem(
        id=12, project_id=1, title="Mascot", content="Персонаж проекта",
        source_type="image_reference", visual_role="character", content_type="image/png",
        storage_key="character.png",
    )
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [character])
    image = BytesIO()
    Image.new("RGB", (20, 20), "red").save(image, format="PNG")
    monkeypatch.setattr(assets.storage, "read_bytes", lambda key: image.getvalue())

    references, details = assets._visual_input_references(
        None, project, content_id=1, include_details=True,
        selected_reference_keys=["project:12"],
    )

    assert len(references) == 1
    assert details[0]["key"] == "project:12"
    assert details[0]["role"] == "character"


def test_explicit_reference_from_another_project_is_rejected(monkeypatch):
    project = SmmProject(id=1, code="test_project")
    other_project_item = SmmKnowledgeItem(
        id=13, project_id=2, title="Other", content="",
        source_type="image_reference", visual_role="style", content_type="image/png",
        storage_key="other.png",
    )
    monkeypatch.setattr(assets.knowledge_svc, "list_items", lambda db, project: [other_project_item])

    try:
        assets._visual_input_references(
            None, project, selected_reference_keys=["project:13"],
        )
    except ValueError as exc:
        assert "недоступен в этом проекте" in str(exc)
    else:
        raise AssertionError("Cross-project visual reference should be rejected")
