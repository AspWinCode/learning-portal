from app.models import SmmContent, SmmContentAsset, SmmProject, SmmPublication
from app.services.smm_projects import publishing


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *conditions):
        # The fake only needs to distinguish the content lookup from the
        # asset/publication lookups used by create_publications().
        return self

    def first(self):
        return self.rows[0] if self.rows else None


class _DB:
    def __init__(self, content, asset):
        self.content, self.asset = content, asset
        self.added = []

    def query(self, model):
        if model is SmmContent:
            return _Query([self.content])
        if model is SmmContentAsset:
            return _Query([self.asset])
        if model is SmmPublication:
            return _Query([])
        return _Query([])

    def add(self, row):
        self.added.append(row)

    def commit(self):
        pass

    def refresh(self, row):
        pass


def test_scheduled_publication_keeps_assets_except_for_vk():
    content = SmmContent(id=1, project_id=1, status="approved", output_text="Текст", selected_asset_id=7)
    asset = SmmContentAsset(id=7, content_id=1, storage_key="content_1.png")
    db = _DB(content, asset)
    project = SmmProject(id=1, code="test_project")

    rows = publishing.create_publications(
        db, object(), project=project,
        items=[
            {"channel": "telegram", "content_id": 1},
            {"channel": "vk", "content_id": 1},
        ],
        publish_at=None,
    )

    assert rows[0].asset_id == 7
    assert rows[1].asset_id is None
