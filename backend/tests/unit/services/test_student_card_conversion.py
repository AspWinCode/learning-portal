"""
Unit-тесты сервиса student_card_conversion (ТЗ: конвертация анкеты в ученика).
"""
from unittest.mock import MagicMock, patch

import pytest

from app.services.student_card_conversion import (
    convert_student_card_to_student,
    ConvertStudentCardResult,
    StudentCardConvertConflict,
)


def test_convert_student_card_card_not_found():
    """Карточка не найдена -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Карточка не найдена"):
        convert_student_card_to_student(db, 999)


def test_convert_student_card_already_converted_returns_existing():
    """Карточка уже конвертирована -> возврат без изменений."""
    db = MagicMock()
    mock_card = MagicMock()
    mock_card.id = 1
    mock_card.student_id = 10
    mock_card.anketa_status = "converted"
    db.query.return_value.filter.return_value.first.return_value = mock_card

    result = convert_student_card_to_student(db, 1)

    assert isinstance(result, ConvertStudentCardResult)
    assert result.student_id == 10
    assert result.card is mock_card
    db.commit.assert_not_called()


def test_convert_student_card_no_email():
    """Нет email родителя в анкете -> ValueError."""
    db = MagicMock()
    mock_card = MagicMock()
    mock_card.id = 1
    mock_card.student_id = None
    mock_card.anketa_status = "new"
    mock_card.student_full_name = "Иван"
    mock_card.parent_email = None
    mock_card.parent_full_name = None
    db.query.return_value.filter.return_value.first.return_value = mock_card

    with pytest.raises(ValueError, match="Укажите email родителя"):
        convert_student_card_to_student(db, 1)


def test_convert_student_card_use_existing_student_not_found():
    """use_existing_student_id задан, ученик не найден -> ValueError."""
    db = MagicMock()
    mock_card = MagicMock()
    mock_card.id = 1
    mock_card.student_id = None
    mock_card.anketa_status = "new"
    db.query.return_value.filter.return_value.first.side_effect = [mock_card, None]

    with pytest.raises(ValueError, match="Ученик не найден"):
        convert_student_card_to_student(db, 1, use_existing_student_id=999)


def test_convert_student_card_use_existing_parent_not_found():
    """use_existing_parent_id задан, родитель не найден -> ValueError."""
    db = MagicMock()
    mock_card = MagicMock()
    mock_card.id = 1
    mock_card.student_id = None
    mock_card.anketa_status = "new"
    mock_card.student_full_name = "Иван"
    mock_card.parent_email = "a@b.com"
    mock_card.parent_full_name = "Родитель"
    # first: card, then User (parent), then no same_name
    db.query.return_value.filter.return_value.first.side_effect = [mock_card, None]

    with pytest.raises(ValueError, match="Родитель не найден"):
        convert_student_card_to_student(db, 1, use_existing_parent_id=5)


def test_convert_student_card_existing_parent_same_name_conflict():
    """Родитель с таким email есть, ученик с таким ФИО уже есть -> StudentCardConvertConflict."""
    db = MagicMock()
    mock_card = MagicMock()
    mock_card.id = 1
    mock_card.student_id = None
    mock_card.anketa_status = "new"
    mock_card.student_full_name = "Иван"
    mock_card.parent_email = "a@b.com"
    mock_card.parent_full_name = "Родитель"
    mock_parent = MagicMock()
    mock_parent.id = 2
    mock_parent.students = []
    mock_student = MagicMock()
    mock_student.id = 3
    mock_student.full_name = "Иван"
    db.query.return_value.filter.return_value.first.side_effect = [
        mock_card,
        mock_parent,
        mock_student,
    ]

    with pytest.raises(StudentCardConvertConflict) as exc_info:
        convert_student_card_to_student(db, 1)

    assert exc_info.value.detail.get("code") == "existing_student"
    assert "ФИО" in (exc_info.value.detail.get("message") or "")


def test_convert_student_card_existing_parent_no_same_name_conflict():
    """Родитель с email есть, ученика с таким ФИО нет -> конфликт existing_parent (выбор)."""
    db = MagicMock()
    mock_card = MagicMock()
    mock_card.id = 1
    mock_card.student_id = None
    mock_card.anketa_status = "new"
    mock_card.student_full_name = "Иван"
    mock_card.parent_email = "a@b.com"
    mock_card.parent_full_name = "Родитель"
    mock_parent = MagicMock()
    mock_parent.id = 2
    mock_parent.students = []
    # first: card, then existing_parent, then same_name (None)
    db.query.return_value.filter.return_value.first.side_effect = [mock_card, mock_parent, None]

    with pytest.raises(StudentCardConvertConflict) as exc_info:
        convert_student_card_to_student(db, 1)

    assert exc_info.value.detail.get("code") == "existing_parent"
    assert exc_info.value.detail.get("existing_parent_id") == 2
