"""
Unit-тесты сервиса manual_lesson (ТЗ: создание ручного урока / отработки).
"""
from datetime import date, time
from unittest.mock import MagicMock

import pytest

from app.services.manual_lesson import create_manual_lesson


def test_create_manual_lesson_trainer_not_found():
    """Тренер не найден -> ValueError."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="Тренер не найден"):
        create_manual_lesson(
            db,
            title="Урок",
            lesson_date=date(2025, 2, 1),
            start_time=time(10, 0),
            end_time=None,
            trainer_id=999,
            lesson_type="makeup",
            comment=None,
            students=[],
            created_by_id=1,
        )


def test_create_manual_lesson_student_not_found():
    """Ученик не найден -> ValueError."""
    db = MagicMock()
    mock_trainer = MagicMock()
    mock_trainer.id = 1
    mock_student_chain = MagicMock()
    mock_student_chain.filter.return_value.first.return_value = None
    db.query.return_value.filter.return_value.first.return_value = mock_trainer
    # В цикле по students вызов query(Student).filter(Student.id == student_id).first()
    def _query(model):
        c = MagicMock()
        c.filter.return_value.first.return_value = None
        return c
    db.query.side_effect = _query
    # Первый вызов query(User) — тренер
    first_chain = MagicMock()
    first_chain.filter.return_value.first.return_value = mock_trainer
    second_chain = MagicMock()
    second_chain.filter.return_value.first.return_value = None
    call_count = [0]
    def _query_side(model):
        call_count[0] += 1
        if call_count[0] == 1:
            return first_chain
        return second_chain
    db.query.side_effect = _query_side

    with pytest.raises(ValueError, match="Ученик 999 не найден"):
        create_manual_lesson(
            db,
            title="Урок",
            lesson_date=date(2025, 2, 1),
            start_time=time(10, 0),
            end_time=None,
            trainer_id=1,
            lesson_type="makeup",
            comment=None,
            students=[(999, None)],
            created_by_id=1,
        )


def test_create_manual_lesson_absence_not_for_student():
    """Пропуск не принадлежит ученику -> ValueError."""
    db = MagicMock()
    mock_trainer = MagicMock()
    mock_trainer.id = 1
    mock_student = MagicMock()
    mock_student.id = 10
    mock_absence = MagicMock()
    mock_absence.id = 5
    mock_absence.student_id = 99  # другой ученик
    query_returns = [mock_trainer, mock_student, mock_absence]
    r = [0]
    def _first():
        if r[0] < len(query_returns):
            v = query_returns[r[0]]
            r[0] += 1
            return v
        return None
    chain = MagicMock()
    chain.filter.return_value.first.side_effect = _first
    chain.filter.return_value.order_by.return_value.first.return_value = None
    db.query.return_value = chain

    with pytest.raises(ValueError, match="Пропуск 5 не найден для этого ученика"):
        create_manual_lesson(
            db,
            title="Урок",
            lesson_date=date(2025, 2, 1),
            start_time=time(10, 0),
            end_time=None,
            trainer_id=1,
            lesson_type="makeup",
            comment=None,
            students=[(10, 5)],
            created_by_id=1,
        )
