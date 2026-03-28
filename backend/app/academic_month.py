"""Учебный месяц для лимита «8 занятий».

До 31.08 включительно: окно 10 число → 9 число следующего месяца.
С 01.09: календарный месяц (1 → последнее число).
"""
from datetime import date, timedelta
from typing import Tuple


def get_academic_window(lesson_date: date) -> Tuple[date, date]:
    """Вернуть (start_date, end_date) учебного месяца для даты занятия."""
    if lesson_date.month >= 9:
        # Сентябрь — декабрь: календарный месяц (1 — последнее число)
        start = date(lesson_date.year, lesson_date.month, 1)
        if lesson_date.month == 12:
            end = date(lesson_date.year, 12, 31)
        else:
            next_first = date(lesson_date.year, lesson_date.month + 1, 1)
            end = next_first - timedelta(days=1)
        return (start, end)
    # Январь — август: 10 число текущего месяца → 9 число следующего
    start = date(lesson_date.year, lesson_date.month, 10)
    if lesson_date.month == 12:
        end = date(lesson_date.year + 1, 1, 9)
    else:
        end = date(lesson_date.year, lesson_date.month + 1, 9)
    return (start, end)
