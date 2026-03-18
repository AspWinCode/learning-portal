"""
Unit-тесты модуля academic_month (ТЗ: учебный месяц для лимита «8 занятий»).
"""
from datetime import date

import pytest

from app.academic_month import get_academic_window


# ───────────────────────── Сентябрь–Декабрь: календарный месяц ─────────────────────────


def test_september_returns_calendar_month():
    """Сентябрь: 1.09 – 30.09."""
    start, end = get_academic_window(date(2024, 9, 15))
    assert start == date(2024, 9, 1)
    assert end == date(2024, 9, 30)


def test_october_returns_calendar_month():
    """Октябрь: 1.10 – 31.10."""
    start, end = get_academic_window(date(2024, 10, 1))
    assert start == date(2024, 10, 1)
    assert end == date(2024, 10, 31)


def test_november_returns_calendar_month():
    """Ноябрь: 1.11 – 30.11."""
    start, end = get_academic_window(date(2024, 11, 20))
    assert start == date(2024, 11, 1)
    assert end == date(2024, 11, 30)


def test_december_returns_calendar_month():
    """Декабрь: 1.12 – 31.12."""
    start, end = get_academic_window(date(2024, 12, 5))
    assert start == date(2024, 12, 1)
    assert end == date(2024, 12, 31)


# ───────────────────────── Январь–Август: окно 10→9 ─────────────────────────


def test_january_window():
    """Январь: 10.01 – 9.02."""
    start, end = get_academic_window(date(2025, 1, 15))
    assert start == date(2025, 1, 10)
    assert end == date(2025, 2, 9)


def test_february_window():
    """Февраль: 10.02 – 9.03."""
    start, end = get_academic_window(date(2025, 2, 1))
    assert start == date(2025, 2, 10)
    assert end == date(2025, 3, 9)


def test_march_window():
    """Март: 10.03 – 9.04."""
    start, end = get_academic_window(date(2025, 3, 25))
    assert start == date(2025, 3, 10)
    assert end == date(2025, 4, 9)


def test_august_window():
    """Август: 10.08 – 9.09."""
    start, end = get_academic_window(date(2025, 8, 31))
    assert start == date(2025, 8, 10)
    assert end == date(2025, 9, 9)


def test_window_start_boundary_sep():
    """1 сентября уже входит в calendar-режим."""
    start, end = get_academic_window(date(2024, 9, 1))
    assert start == date(2024, 9, 1)
    assert end == date(2024, 9, 30)


def test_window_start_boundary_aug():
    """31 августа: всё ещё окно 10.08 – 9.09."""
    start, end = get_academic_window(date(2024, 8, 31))
    assert start == date(2024, 8, 10)
    assert end == date(2024, 9, 9)
