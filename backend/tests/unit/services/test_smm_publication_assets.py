from app.models import SmmContent, SmmContentAsset, SmmProject, SmmPublication
from app.services.smm_projects import publishing


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *conditions):
        for condition in conditions:
            try:
                key = condition.left.key
                expected = condition.right.value
                self.rows = [row for row in self.rows if getattr(row, key, None) == expected]
            except AttributeError:
                pass
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def order_by(self, *args):
        return self

    def all(self):
        return self.rows


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


def test_publication_uses_visual_created_for_its_channel():
    content = SmmContent(id=1, project_id=1, status="approved", output_text="Текст", selected_asset_id=7)
    instagram = SmmContentAsset(
        id=7, content_id=1, storage_key="instagram.png",
        meta={"visual_format": {"target_channel": "instagram", "aspect_ratio": "4:5"}},
    )
    telegram = SmmContentAsset(
        id=8, content_id=1, storage_key="telegram.png",
        meta={"visual_format": {"target_channel": "telegram", "aspect_ratio": "1:1"}},
    )
    db = _DB(content, instagram)
    db.assets = [instagram, telegram]
    original_query = db.query

    def query(model):
        if model is SmmContentAsset:
            return _Query(db.assets)
        return original_query(model)

    db.query = query
    project = SmmProject(id=1, code="test_project")

    rows = publishing.create_publications(
        db, object(), project=project,
        items=[
            {"channel": "instagram", "content_id": 1},
            {"channel": "telegram", "content_id": 1},
        ],
        publish_at=None,
    )

    assert [row.asset_id for row in rows] == [7, 8]
