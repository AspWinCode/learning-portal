"""
Unit-тесты сервиса lead_conversion (ТЗ: конвертация лида в ученика).
"""
from unittest.mock import MagicMock

import pytest

from app.services.lead_conversion import convert_lead_to_student, ConvertLeadToStudentResult


def test_convert_lead_to_student_lead_not_found():
    """Лид не найден -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Лид не найден"):
        convert_lead_to_student(db, 999)


def test_convert_lead_to_student_no_email():
    """У лида нет email -> ValueError."""
    db = MagicMock()
    mock_lead = MagicMock()
    mock_lead.id = 1
    mock_lead.converted_to_student_id = None
    mock_lead.email = None
    mock_lead.parent_full_name = None
    mock_lead.contact_name = None
    mock_lead.child_full_name = None
    mock_lead.questionnaire_data = None
    db.query.return_value.filter.return_value.first.return_value = mock_lead

    with pytest.raises(ValueError, match="не указан email"):
        convert_lead_to_student(db, 1)


def test_convert_lead_to_student_already_converted_returns_existing():
    """Лид уже конвертирован -> возвращает существующего ученика без изменений."""
    db = MagicMock()
    mock_lead = MagicMock()
    mock_lead.id = 1
    mock_lead.converted_to_student_id = 42
    mock_lead.email = "a@b.com"
    mock_student = MagicMock()
    mock_student.id = 42
    db.query.return_value.filter.return_value.first.side_effect = [mock_lead, mock_student]

    result = convert_lead_to_student(db, 1)

    assert isinstance(result, ConvertLeadToStudentResult)
    assert result.student_id == 42
    assert result.lead is mock_lead
    db.commit.assert_not_called()
