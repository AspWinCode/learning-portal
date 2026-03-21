"""Юнит-тесты правил видимости задач owner workspace (без БД)."""

from app.services.owner_workspace_access import task_visible_for_limited


def test_task_visible_assignee():
    assert task_visible_for_limited(
        assignee_id=5,
        creator_id=99,
        project_id=1,
        contact_id=10,
        user_id=5,
        project_ids=set(),
        contact_ids=set(),
    )


def test_task_visible_project():
    assert task_visible_for_limited(
        assignee_id=None,
        creator_id=None,
        project_id=3,
        contact_id=None,
        user_id=1,
        project_ids={3, 4},
        contact_ids=set(),
    )


def test_task_visible_contact():
    assert task_visible_for_limited(
        assignee_id=None,
        creator_id=None,
        project_id=None,
        contact_id=7,
        user_id=1,
        project_ids=set(),
        contact_ids={7},
    )


def test_task_not_visible():
    assert not task_visible_for_limited(
        assignee_id=2,
        creator_id=3,
        project_id=9,
        contact_id=1,
        user_id=1,
        project_ids={8},
        contact_ids={2},
    )
