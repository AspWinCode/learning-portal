"""get_student_first_name: ФИО хранится как «Фамилия Имя Отчество»
(app/routers/sales.py:657) — приветствие в кабинете должно показывать имя
(второе слово), не фамилию (первое), которую раньше брал full_name.split(' ')[0]."""
from app.student_display import get_student_first_name


def test_three_word_full_name_returns_second_word():
    assert get_student_first_name("Иванов Иван Александрович") == "Иван"


def test_two_word_full_name_returns_second_word():
    assert get_student_first_name("Иванов Иван") == "Иван"


def test_single_word_falls_back_to_that_word():
    assert get_student_first_name("Иван") == "Иван"


def test_extra_whitespace_is_normalized():
    assert get_student_first_name("  Иванов   Иван   Александрович  ") == "Иван"


def test_empty_and_none_return_empty_string():
    assert get_student_first_name("") == ""
    assert get_student_first_name(None) == ""
    assert get_student_first_name("   ") == ""
