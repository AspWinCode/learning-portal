"""
Unit-тесты утилит нормализации и валидации телефона (app/utils/phone.py).
"""

from app.utils.phone import normalize_phone, validate_phone_for_lead


# ─────────────────────── normalize_phone ───────────────────────


class TestNormalizePhone:
    def test_none_returns_empty(self):
        assert normalize_phone(None) == ""

    def test_empty_string_returns_empty(self):
        assert normalize_phone("") == ""

    def test_not_a_string_returns_empty(self):
        assert normalize_phone(12345) == ""  # type: ignore[arg-type]

    def test_only_whitespace_returns_empty(self):
        assert normalize_phone("   ") == ""

    def test_10_digits_prepends_plus7(self):
        """10 цифр → +7XXXXXXXXXX."""
        assert normalize_phone("9025768265") == "+79025768265"

    def test_11_digits_starting_8(self):
        """8XXXXXXXXXX → +7XXXXXXXXXX."""
        assert normalize_phone("89025768265") == "+79025768265"

    def test_11_digits_starting_7(self):
        """7XXXXXXXXXX → +7XXXXXXXXXX."""
        assert normalize_phone("79025768265") == "+79025768265"

    def test_formatted_with_spaces_and_dashes(self):
        """+7 (902) 576-82-65 → +79025768265."""
        assert normalize_phone("+7 (902) 576-82-65") == "+79025768265"

    def test_belarus_format(self):
        """+375291234567 нормализуется корректно."""
        result = normalize_phone("+375291234567")
        assert result == "+375291234567"

    def test_already_e164_unchanged(self):
        """+79025768265 остаётся без изменений."""
        assert normalize_phone("+79025768265") == "+79025768265"


# ─────────────────────── validate_phone_for_lead ───────────────────────


class TestValidatePhoneForLead:
    def test_none_returns_error(self):
        normalized, error = validate_phone_for_lead(None)
        assert error is not None
        assert normalized == ""

    def test_empty_string_returns_error(self):
        normalized, error = validate_phone_for_lead("")
        assert error is not None

    def test_valid_russian_plus7(self):
        normalized, error = validate_phone_for_lead("+79025768265")
        assert error is None
        assert normalized == "+79025768265"

    def test_valid_russian_8xx(self):
        normalized, error = validate_phone_for_lead("89025768265")
        assert error is None
        assert normalized == "+79025768265"

    def test_valid_russian_10_digits(self):
        """10 цифр без кода страны: validate_phone_for_lead не добавляет +7 автоматически,
        в отличие от normalize_phone. Нужно передавать с 7/8 в начале."""
        normalized, error = validate_phone_for_lead("79025768265")
        assert error is None
        assert normalized == "+79025768265"

    def test_russian_wrong_length_returns_error(self):
        normalized, error = validate_phone_for_lead("+7902576")
        assert error is not None

    def test_valid_belarus(self):
        normalized, error = validate_phone_for_lead("+375291234567")
        assert error is None
        assert normalized == "+375291234567"

    def test_belarus_wrong_length_returns_error(self):
        """Неправильное количество цифр для Беларуси."""
        normalized, error = validate_phone_for_lead("+37529123")
        assert error is not None

    def test_starts_with_zero_returns_error(self):
        """Номер начинается с 0 -> нужен код страны."""
        normalized, error = validate_phone_for_lead("0123456789")
        assert error is not None

    def test_too_short_returns_error(self):
        normalized, error = validate_phone_for_lead("1234")
        assert error is not None

    def test_formatted_russian_with_spaces(self):
        normalized, error = validate_phone_for_lead("+7 (902) 576-82-65")
        assert error is None
        assert normalized == "+79025768265"
