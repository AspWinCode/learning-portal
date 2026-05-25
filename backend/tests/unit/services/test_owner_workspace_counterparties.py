from app.models import OwnerWorkspaceContact, OwnerWorkspaceTask
from app.services.owner_workspace_counterparties import (
    COUNTERPARTY_DOCUMENT_CATEGORY_SET,
    create_default_counterparty_tasks,
)


class DummyDb:
    def __init__(self):
        self.tasks = []

    def add(self, item):
        if isinstance(item, OwnerWorkspaceTask):
            item.id = len(self.tasks) + 1
            self.tasks.append(item)


def test_counterparty_document_categories_cover_expected_keys():
    assert {
        "contract",
        "act",
        "invoice",
        "template",
        "financial_model",
        "tz",
        "business_plan",
    } == COUNTERPARTY_DOCUMENT_CATEGORY_SET


def test_create_default_counterparty_tasks_creates_blueprint_for_each_project():
    db = DummyDb()
    counterparty = OwnerWorkspaceContact(id=42, full_name="ООО Ромашка")

    created = create_default_counterparty_tasks(
        db,
        counterparty=counterparty,
        project_ids=[10, 11],
        creator_id=7,
    )

    assert len(created) == 18
    assert len(db.tasks) == 18
    assert all(task.contact_id == 42 for task in created)
    assert {task.project_id for task in created} == {10, 11}
    assert all(task.deadline_at is not None for task in created)
    assert all("counterparty" in (task.tags or []) for task in created)


def test_create_default_counterparty_tasks_without_projects_creates_owner_level_tasks():
    db = DummyDb()
    counterparty = OwnerWorkspaceContact(id=99, full_name="ИП Тест")

    created = create_default_counterparty_tasks(
        db,
        counterparty=counterparty,
        project_ids=[],
        creator_id=5,
    )

    assert len(created) == 9
    assert {task.project_id for task in created} == {None}

