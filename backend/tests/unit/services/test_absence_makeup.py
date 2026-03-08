"""
Unit-тесты сервиса absence_makeup (ТЗ: назначение отработки по пропуску).
"""
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.services.absence_makeup import assign_makeup_for_absence, AssignMakeupResult


def test_assign_makeup_absence_not_found():
    """Пропуск не найден -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Пропуск не найден"):
        assign_makeup_for_absence(db, 999, makeup_group_id=1, makeup_lesson_date=date(2025, 2, 1))


def test_assign_makeup_group_not_found():
    """Группа не найдена -> ValueError."""
    db = MagicMock()
    mock_absence = MagicMock()
    mock_absence.id = 1
    mock_absence.student_id = 10
    db.query.return_value.filter.return_value.first.side_effect = [mock_absence, None]

    with pytest.raises(ValueError, match="Группа не найдена"):
        assign_makeup_for_absence(db, 1, makeup_group_id=999, makeup_lesson_date=date(2025, 2, 1))


@patch("app.services.absence_link_tasks.create_link_task_on_assign")
def test_assign_makeup_success(mock_create_link):
    """Успех: absence обновлён, commit и refresh вызваны."""
    db = MagicMock()
    mock_absence = MagicMock()
    mock_absence.id = 1
    mock_absence.student_id = 10
    mock_group = MagicMock()
    mock_group.id = 2
    db.query.return_value.filter.return_value.first.side_effect = [mock_absence, mock_group]

    result = assign_makeup_for_absence(
        db, 1, makeup_group_id=2, makeup_lesson_date=date(2025, 2, 15)
    )

    assert isinstance(result, AssignMakeupResult)
    assert result.absence is mock_absence
    assert mock_absence.makeup_group_id == 2
    assert mock_absence.makeup_lesson_date == date(2025, 2, 15)
    assert mock_absence.stage == "assigned"
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(mock_absence)
    mock_create_link.assert_called_once_with(db, mock_absence)
