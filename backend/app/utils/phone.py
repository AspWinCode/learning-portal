"""
Нормализация телефона для единообразного хранения и матчинга (карточки, банк, привязки).
Формат: +79025768265 (без пробелов, тире, скобок; 8 в начале заменяется на +7).
"""

import re
from typing import Optional, Tuple

# Коды стран и ожидаемая длина цифр (с кодом): код -> (длина_цифр, название)
PHONE_COUNTRY_RULES = {
    "7": (11, "Россия"),      # +7 900 123-45-67
    "375": (12, "Беларусь"),  # +375 29 123-45-67
    "48": (11, "Польша"),     # +48 123 456 789
    "77": (11, "Казахстан"),  # +7 7xx ...
    "1": (11, "США/Канада"),  # +1 234 567 8901
    "996": (12, "Киргизия"),
    "998": (12, "Узбекистан"),
    "992": (12, "Таджикистан"),
    "993": (12, "Туркменистан"),
    "994": (12, "Азербайджан"),
    "995": (12, "Грузия"),
    "373": (11, "Молдова"),
    "380": (12, "Украина"),
    "371": (11, "Латвия"),
    "372": (11, "Эстония"),
    "370": (11, "Литва"),
}


def normalize_phone(raw: Optional[str] = None) -> str:
    """
    Приводит телефон к виду +79025768265.
    - Убирает пробелы, тире, скобки.
    - Если начинается с 8 — заменяет на +7.
    - Если без + в начале — добавляет + (для 10 цифр добавляет +7).
    """
    if not raw or not isinstance(raw, str):
        return ""
    digits = re.sub(r"\D", "", raw.strip())
    if not digits:
        return ""
    if len(digits) == 10:
        return "+7" + digits
    if len(digits) == 11 and digits.startswith("8"):
        return "+7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+" + digits
    return "+" + digits if not digits.startswith("+") else digits


def validate_phone_for_lead(raw: Optional[str] = None) -> Tuple[str, Optional[str]]:
    """
    Валидация телефона для лид-формы с учётом страны.
    Возвращает (normalized_e164, error_message). error_message не None при ошибке.
    """
    if not raw or not isinstance(raw, str):
        return "", "Введите номер телефона"
    digits = re.sub(r"\D", "", raw.strip())
    if not digits:
        return "", "Введите номер телефона"

    # Россия / Казахстан: 8... или 7... → 11 цифр
    if digits.startswith("8") and len(digits) in (10, 11):
        digits = "7" + (digits[1:] if len(digits) == 11 else digits)
    if digits.startswith("7") and len(digits) == 11:
        return "+7" + digits[1:], None
    if digits.startswith("7") and len(digits) != 11:
        return "", "Для России/Казахстана введите 10 цифр после +7 (например +7 900 123-45-67)"

    # Беларусь: +375, 12 цифр
    if digits.startswith("375") and len(digits) == 12:
        return "+375" + digits[3:], None
    if digits.startswith("375") and len(digits) != 12:
        return "", "Для Беларуси введите 9 цифр после +375"

    # Другие страны: минимум 10 цифр, начинается не с 0
    if digits.startswith("0"):
        return "", "Введите номер с кодом страны (например +7 для России)"
    if len(digits) < 10:
        return "", "Номер слишком короткий (минимум 10 цифр)"
    return "+" + digits, None
