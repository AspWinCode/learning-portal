"""
Unit-тесты сервиса absence_link_tasks (создание задач на отправку ссылок для отработок).
"""
from datetime import date, datetime, time
from unittest.mock import MagicMock, call, patch

import pytest

from app.services.absence_link_tasks import (
    _get_sales_assignee,
    create_link_task_on_assign,
    create_morning_link_tasks,
)


# ---------------------------------------------------------------------------
# _get_sales_assignee
# ---------------------------------------------------------------------------

def test_get_sales_assignee_returns_user_id():
    """Если найден активный sales-менеджер, возвращается его id."""
    db = MagicMock()
    mock_user = MagicMock()
    mock_user.id = 7
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_user

    result = _get_sales_assignee(db)

    assert result == 7


def test_get_sales_assignee_returns_none_when_no_user():
    """Нет активных sales-менеджеров -> None."""
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

    result = _get_sales_assignee(db)

    assert result is None


# ---------------------------------------------------------------------------
# create_link_task_on_assign
# ---------------------------------------------------------------------------

def _make_absence(makeup_group_id=10, makeup_lesson_date=date(2025, 6, 15), student_id=1):
    absence = MagicMock()
    absence.makeup_group_id = makeup_group_id
    absence.makeup_lesson_date = makeup_lesson_date
    absence.student_id = student_id
    return absence


def test_create_link_task_on_assign_skips_if_no_makeup_group_id():
    """Нет makeup_group_id -> задача не создаётся, db.add не вызывается."""
    db = MagicMock()
    absence = _make_absence(makeup_group_id=None)

    create_link_task_on_assign(db, absence)

    db.add.assert_not_called()


def test_create_link_task_on_assign_skips_if_no_makeup_lesson_date():
    """Нет makeup_lesson_date -> задача не создаётся."""
    db = MagicMock()
    absence = _make_absence(makeup_lesson_date=None)

    create_link_task_on_assign(db, absence)

    db.add.assert_not_called()


def test_create_link_task_on_assign_skips_if_student_not_found():
    """Ученик не найден -> задача не создаётся."""
    db = MagicMock()
    # student query returns None, group query returns something
    db.query.return_value.filter.return_value.first.side_effect = [None, MagicMock()]
    absence = _make_absence()

    create_link_task_on_assign(db, absence)

    db.add.assert_not_called()


def test_create_link_task_on_assign_skips_if_group_not_found():
    """Группа не найдена -> задача не создаётся."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = [MagicMock(), None]
    absence = _make_absence()

    create_link_task_on_assign(db, absence)

    db.add.assert_not_called()


def test_create_link_task_on_assign_creates_task_with_correct_title():
    """Задача создаётся с правильным заголовком и due_at 09:00 в дату отработки."""
    db = MagicMock()
    mock_student = MagicMock()
    mock_student.full_name = "Иванов Иван"
    mock_group = MagicMock()
    mock_group.name = "Группа А"
    # student -> mock_student, group -> mock_group, then _get_sales_assignee
    db.query.return_value.filter.return_value.first.side_effect = [
        mock_student,
        mock_group,
        MagicMock(id=5),  # sales assignee
    ]

    lesson_date = date(2025, 6, 15)
    absence = _make_absence(makeup_lesson_date=lesson_date)

    create_link_task_on_assign(db, absence)

    db.add.assert_called_once()
    task = db.add.call_args[0][0]
    assert "Иванов Иван" in task.title
    assert "Группа А" in task.title
    db.flush.assert_called_once()


def test_create_link_task_on_assign_creates_task_without_assignee():
    """Нет sales-менеджера -> задача всё равно создаётся (assigned_to_id=None)."""
    db = MagicMock()
    mock_student = MagicMock()
    mock_student.full_name = "Петров Пётр"
    mock_group = MagicMock()
    mock_group.name = "Группа Б"
    db.query.return_value.filter.return_value.first.side_effect = [
        mock_student,
        mock_group,
        None,  # no sales assignee
    ]
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

    absence = _make_absence()

    create_link_task_on_assign(db, absence)

    db.add.assert_called_once()
    task = db.add.call_args[0][0]
    assert task.assigned_to_id is None


# ---------------------------------------------------------------------------
# create_morning_link_tasks
# ---------------------------------------------------------------------------

def test_create_morning_link_tasks_returns_zero_if_no_items():
    """Нет отработок на дату -> возвращает 0."""
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []

    result = create_morning_link_tasks(db, target_date=date(2025, 6, 15))

    assert result == 0
    db.add.assert_not_called()


def test_create_morning_link_tasks_uses_today_if_no_date():
    """Без target_date используется date.today()."""
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []

    with patch("app.services.absence_link_tasks.date") as mock_date:
        mock_date.today.return_value = date(2025, 6, 20)
        create_morning_link_tasks(db)
        mock_date.today.assert_called_once()


def test_create_morning_link_tasks_skips_item_if_student_missing():
    """Если ученик не найден — пропускаем, задача не создаётся."""
    db = MagicMock()
    mock_absence = MagicMock()
    mock_absence.student_id = 1
    mock_absence.makeup_group_id = 10
    db.query.return_value.filter.return_value.all.return_value = [mock_absence]
    # student query returns None
    db.query.return_value.filter.return_value.first.return_value = None

    result = create_morning_link_tasks(db, target_date=date(2025, 6, 15))

    assert result == 0
    db.add.assert_not_called()


def test_create_morning_link_tasks_creates_tasks_for_each_item():
    """Для каждой отработки с найденными студентом и группой создаётся задача."""
    db = MagicMock()

    absence1 = MagicMock()
    absence1.student_id = 1
    absence1.makeup_group_id = 10
    absence2 = MagicMock()
    absence2.student_id = 2
    absence2.makeup_group_id = 11

    db.query.return_value.filter.return_value.all.return_value = [absence1, absence2]

    mock_student = MagicMock()
    mock_student.full_name = "Студент"
    mock_group = MagicMock()
    mock_group.name = "Группа"
    mock_sales = MagicMock()
    mock_sales.id = 3

    # Each absence: student -> group -> sales assignee
    db.query.return_value.filter.return_value.first.side_effect = [
        mock_student, mock_group, mock_sales,
        mock_student, mock_group, mock_sales,
    ]
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_sales

    result = create_morning_link_tasks(db, target_date=date(2025, 6, 15))

    assert result == 2
    assert db.add.call_count == 2
    db.flush.assert_called_once()


def test_create_morning_link_tasks_task_title_contains_student_and_group():
    """Заголовок задачи содержит имя ученика и название группы."""
    db = MagicMock()

    absence = MagicMock()
    absence.student_id = 1
    absence.makeup_group_id = 10
    db.query.return_value.filter.return_value.all.return_value = [absence]

    mock_student = MagicMock()
    mock_student.full_name = "Сидоров Сидор"
    mock_group = MagicMock()
    mock_group.name = "Группа В"
    db.query.return_value.filter.return_value.first.side_effect = [
        mock_student, mock_group, None,
    ]
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

    create_morning_link_tasks(db, target_date=date(2025, 6, 15))

    task = db.add.call_args[0][0]
    assert "Сидоров Сидор" in task.title
    assert "Группа В" in task.title
