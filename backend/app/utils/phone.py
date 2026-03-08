"""
Нормализация телефона для единообразного хранения и матчинга (карточки, банк, привязки).
Формат: +79025768265 (без пробелов, тире, скобок; 8 в начале заменяется на +7).
"""

import re
from typing import Optional


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
