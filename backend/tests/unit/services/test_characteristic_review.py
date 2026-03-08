"""
Unit-тесты сервиса characteristic_review (ТЗ: submit/approve/reject характеристики).
"""
import pytest
from unittest.mock import MagicMock

from app.services.characteristic_review import (
    submit_characteristic_for_review,
    approve_characteristic,
    reject_characteristic,
)
from app.models import CharacteristicStatus


def test_submit_characteristic_not_found():
    """Характеристика не найдена -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Characteristic not found"):
        submit_characteristic_for_review(db, 1, trainer_id=100)


def test_submit_characteristic_wrong_trainer():
    """Характеристика принадлежит другому тренеру -> ValueError (not found)."""
    db = MagicMock()
    mock_char = MagicMock()
    mock_char.id = 1
    mock_char.trainer_id = 99
    db.query.return_value.filter.return_value.first.return_value = mock_char

    with pytest.raises(ValueError, match="Characteristic not found"):
        submit_characteristic_for_review(db, 1, trainer_id=100)


def test_submit_characteristic_wrong_status():
    """Статус не draft/rejected -> ValueError."""
    db = MagicMock()
    mock_char = MagicMock()
    mock_char.id = 1
    mock_char.trainer_id = 100
    mock_char.status = CharacteristicStatus.PENDING
    mock_char.data = {}
    # first() для Characteristic, затем для CharacteristicTemplate
    db.query.return_value.filter.return_value.first.return_value = mock_char

    with pytest.raises(ValueError, match="cannot be submitted"):
        submit_characteristic_for_review(db, 1, trainer_id=100)


def test_approve_characteristic_not_found():
    """При одобрении характеристика не найдена -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Characteristic not found"):
        approve_characteristic(db, 1, comment="Ok")


def test_approve_characteristic_not_pending():
    """Статус не pending -> ValueError."""
    db = MagicMock()
    mock_char = MagicMock()
    mock_char.status = CharacteristicStatus.DRAFT
    db.query.return_value.filter.return_value.first.return_value = mock_char

    with pytest.raises(ValueError, match="not pending"):
        approve_characteristic(db, 1, comment="Ok")


def test_reject_characteristic_not_found():
    """При отклонении характеристика не найдена -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Characteristic not found"):
        reject_characteristic(db, 1, comment="Доработать")


def test_reject_characteristic_not_pending():
    """Статус не pending -> ValueError."""
    db = MagicMock()
    mock_char = MagicMock()
    mock_char.status = CharacteristicStatus.APPROVED
    db.query.return_value.filter.return_value.first.return_value = mock_char

    with pytest.raises(ValueError, match="not pending"):
        reject_characteristic(db, 1, comment="Доработать")
