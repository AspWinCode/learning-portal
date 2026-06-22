"""
Unit-тесты сервиса student_account_finance (ТЗ: создание счёта ученика через Finance).
"""
import pytest
from unittest.mock import MagicMock

from app.services.student_account_finance import (
    DEFAULT_STUDENT_ACCOUNT_NAME,
    create_student_account,
    ensure_default_student_account,
)
from app.models import Student, StudentAccount


def test_create_student_account_student_not_found():
    """Ученик не найден -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Student not found"):
        create_student_account(db, 999, "Основной")


def test_create_student_account_name_empty():
    """Пустое имя -> ValueError."""
    db = MagicMock()
    mock_student = MagicMock()
    mock_student.id = 1
    db.query.return_value.filter.return_value.first.return_value = mock_student

    with pytest.raises(ValueError, match="Название счета обязательно"):
        create_student_account(db, 1, "")
    with pytest.raises(ValueError, match="Название счета обязательно"):
        create_student_account(db, 1, "   ")


def test_create_student_account_success():
    """Успешное создание счёта: db.add вызван с StudentAccount, flush и refresh вызваны."""
    db = MagicMock()
    mock_student = MagicMock()
    mock_student.id = 1
    db.query.return_value.filter.return_value.first.return_value = mock_student

    result = create_student_account(db, 1, "Основной")

    assert result is not None
    assert isinstance(result, StudentAccount)
    assert result.student_id == 1
    assert result.name == "Основной"
    assert result.balance == 0.0
    db.add.assert_called_once()
    db.flush.assert_called_once()
    db.refresh.assert_called_once_with(result)


def test_ensure_default_student_account_returns_existing():
    db = MagicMock()
    mock_account = MagicMock(spec=StudentAccount)
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_account

    result = ensure_default_student_account(db, 1)

    assert result is mock_account
    db.add.assert_not_called()


def test_ensure_default_student_account_creates_missing_account():
    db = MagicMock()
    account_query = MagicMock()
    student_query = MagicMock()
    account_query.filter.return_value.order_by.return_value.first.return_value = None
    student_query.filter.return_value.first.return_value = MagicMock(spec=Student)
    db.query.side_effect = [account_query, student_query]

    result = ensure_default_student_account(db, 1)

    assert isinstance(result, StudentAccount)
    assert result.student_id == 1
    assert result.name == DEFAULT_STUDENT_ACCOUNT_NAME
    assert result.balance == 0.0
    db.add.assert_called_once()
