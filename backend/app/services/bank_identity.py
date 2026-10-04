"""Идентичность банковской операции (Точка и импорт выписок).

Разделяем два понятия:
- source — откуда мы получили запись: tochka_webhook, tochka_statement, xlsx;
- identity — какой реальной банковской операции она соответствует.

Одна операция может прийти разными источниками с разными внешними ID
(paymentId у вебхука, transactionId у выписки), поэтому сопоставление идёт в два уровня:
1. точный внешний ID (BankTransaction.operation_id или BankTransactionAlias.external_id);
2. семантическое сопоставление по каноническим банковским полям, только если
   кандидат ровно один. Два кандидата — не склеиваем.

Правило источников: один и тот же источник не может дважды подтвердить одну и ту же
запись. Если кандидат уже подтверждён выпиской (statement), вторая выписочная строка
с той же суммой/датой/именем — это отдельная операция, а не дубль.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional, Tuple

# Банк работает по московскому времени: датам с часовым поясом приводим к нему.
BANK_TZ = timezone(timedelta(hours=3))

SOURCE_TOCHKA_WEBHOOK = "tochka_webhook"
SOURCE_TOCHKA_STATEMENT = "tochka_statement"
SOURCE_XLSX = "xlsx"

STRATEGY_EXACT = "exact_operation_id"
STRATEGY_SAME_PAYMENT = "semantic_same_payment"
STRATEGY_GENERIC_TO_REAL = "generic_to_real"
STRATEGY_NORMALIZED_DATE = "normalized_date_match"
STRATEGY_AMBIGUOUS = "ambiguous"

_GENERIC_MARKERS = ("банк точка", "bank tochka")

_DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATE_RU_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
_ISO_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})"
    r"(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?)?"
    r"\s*(Z|[+-]\d{2}:?\d{2})?$",
    re.IGNORECASE,
)


def normalize_bank_operation_date(value: Any) -> str:
    """Каноническая дата операции: YYYY-MM-DD.

    Принимает date/datetime, «2026-09-30», «2026-09-30T10:15:22», «2026-09-30T10:15:22+03:00»,
    «2026-09-30T10:15:22Z», «2026-09-30 10:15:22», «30.09.2026», «2026-09-30T10:15:22.123+03:00».
    Если в строке есть смещение, дата считается в часовом поясе банка (UTC+3).
    Без смещения берётся дата, как она записана банком (это уже банковская дата).
    Нераспознанное значение возвращается обрезанным, но не падает.
    """
    if value is None:
        return ""
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(BANK_TZ).date().isoformat()
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()

    text = str(value).strip()
    if not text:
        return ""
    if _DATE_ONLY_RE.match(text):
        return text
    ru = _DATE_RU_RE.match(text)
    if ru:
        day, month, year = ru.groups()
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return text

    match = _ISO_RE.match(text)
    if not match:
        return text[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", text) else text

    year, month, day, hour, minute, second, offset = match.groups()
    if not offset or not (hour and minute):
        return f"{year}-{month}-{day}"

    offset = offset.upper()
    if offset == "Z":
        tz = timezone.utc
    else:
        sign = 1 if offset[0] == "+" else -1
        digits = offset[1:].replace(":", "")
        tz = timezone(sign * timedelta(hours=int(digits[:2]), minutes=int(digits[2:4])))
    try:
        aware = datetime(
            int(year), int(month), int(day), int(hour), int(minute), int(second or 0), tzinfo=tz
        )
    except ValueError:
        return f"{year}-{month}-{day}"
    return aware.astimezone(BANK_TZ).date().isoformat()


def normalize_payer_name(name: Optional[str]) -> str:
    """Имя для сравнения: нижний регистр, без кавычек и лишних пробелов."""
    if not name or not isinstance(name, str):
        return ""
    return " ".join(name.replace('"', "").replace("'", "").lower().split())


def is_generic_counterparty(name: Optional[str]) -> bool:
    """Заглушка банка вместо реального плательщика («ООО Банк Точка»)."""
    normalized = normalize_payer_name(name)
    return any(marker in normalized for marker in _GENERIC_MARKERS)


def normalize_purpose(text: Optional[str]) -> str:
    return " ".join((text or "").lower().split())


def normalize_phone_digits(phone: Optional[str]) -> str:
    return re.sub(r"\D", "", phone or "")


@dataclass(frozen=True)
class IncomingBankOperation:
    """Операция из любого источника в каноническом виде."""

    source: str
    external_id: str
    canonical_date: str
    amount: float
    is_expense: bool
    payer_name: str = ""
    payer_phone: str = ""
    purpose: str = ""


def _names_match(candidate_name: str, incoming_name: str) -> Optional[str]:
    """Возвращает стратегию, если имена совместимы, иначе None.

    Нужно позитивное подтверждение: два реальных имени совпадают, либо одно из них —
    заглушка банка. Пустое имя ни с чем не совместимо.
    """
    cand_generic = is_generic_counterparty(candidate_name)
    inc_generic = is_generic_counterparty(incoming_name)
    if not candidate_name or not incoming_name:
        return None
    if not cand_generic and not inc_generic:
        return STRATEGY_SAME_PAYMENT if normalize_payer_name(candidate_name) == normalize_payer_name(incoming_name) else None
    if cand_generic != inc_generic:
        return STRATEGY_GENERIC_TO_REAL
    return None


def match_strategy(candidate: Any, incoming: IncomingBankOperation) -> Optional[str]:
    """Стратегия семантического совпадения или None. Вызывается только для кандидатов
    с той же датой (в каноническом виде), суммой и направлением.

    candidate: объект с атрибутами payer_name, payer_phone, purpose.
    """
    cand_phone = normalize_phone_digits(getattr(candidate, "payer_phone", None))
    inc_phone = normalize_phone_digits(incoming.payer_phone)
    if cand_phone and inc_phone and cand_phone != inc_phone:
        return None

    cand_name = getattr(candidate, "payer_name", None) or ""
    name_strategy = _names_match(cand_name, incoming.payer_name)

    if incoming.is_expense:
        # У расхода банк часто пишет заглушку с обеих сторон: тогда различаем назначением.
        cand_purpose = normalize_purpose(getattr(candidate, "purpose", None))
        inc_purpose = normalize_purpose(incoming.purpose)
        if name_strategy is None and is_generic_counterparty(cand_name) and is_generic_counterparty(incoming.payer_name):
            if cand_purpose and cand_purpose == inc_purpose:
                return STRATEGY_SAME_PAYMENT
            return None
        if name_strategy is None:
            return None
        if cand_purpose and inc_purpose and cand_purpose != inc_purpose:
            return None
        return name_strategy

    # Приход: имя плательщика обязательно. Заглушка-приход с заглушкой не сопоставляется.
    return name_strategy


def candidate_is_expense(candidate: Any) -> bool:
    """Направление кандидата. В BankTransaction нет отдельного поля: расход — status == 'expense'."""
    status = getattr(candidate, "status", None)
    if isinstance(status, str):
        return status == "expense"
    return bool(getattr(candidate, "is_expense", False))


def pick_semantic_match(
    candidates: Iterable[Any],
    incoming: IncomingBankOperation,
    sources_of: Callable[[Any], set],
    candidate_canonical_date: Callable[[Any], str] = lambda c: normalize_bank_operation_date(c.payment_date),
) -> Tuple[Optional[Any], Optional[str]]:
    """Выбирает единственного подходящего кандидата.

    Возвращает (candidate, strategy). Если подходящих несколько — (None, STRATEGY_AMBIGUOUS):
    такие операции не склеиваются автоматически.
    """
    eligible = []
    for candidate in candidates:
        # Тот же источник уже подтвердил эту запись другой операцией — это другая реальная операция.
        if incoming.source in sources_of(candidate):
            continue
        if candidate_canonical_date(candidate) != incoming.canonical_date:
            continue
        if abs(float(candidate.amount or 0)) != abs(incoming.amount):
            continue
        if candidate_is_expense(candidate) != incoming.is_expense:
            continue
        strategy = match_strategy(candidate, incoming)
        if strategy is None:
            continue
        if (getattr(candidate, "payment_date", None) or "") != incoming.canonical_date:
            # Запись сохранена в сыром виде (например, с временем) — для диагностики это главное
            strategy = STRATEGY_NORMALIZED_DATE
        eligible.append((candidate, strategy))

    if not eligible:
        return None, None
    if len(eligible) > 1:
        return None, STRATEGY_AMBIGUOUS
    return eligible[0]


def stable_fingerprint_operation_id(prefix: str, parts: Iterable[Any], occurrence: int = 0) -> str:
    """Стабильный ID операции из содержимого строки, без номера строки в файле.

    occurrence — порядковый номер среди полностью одинаковых строк файла. Две реальные
    одинаковые операции получают разные ID, а перестановка строк ID не меняет.
    """
    import hashlib

    seed = "|".join(str(p if p is not None else "") for p in parts)
    if occurrence:
        seed = f"{seed}|#{occurrence}"
    return prefix + hashlib.sha256(seed.encode("utf-8")).hexdigest()
