"""Реализации функций формул — Phase 3.

Минимальный набор из ТЗ: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR,
ROUND, CONCAT, SUMIF, COUNTIF, VLOOKUP/XLOOKUP. IF/AND/OR требуют ленивого
вычисления аргументов (короткое замыкание) — обрабатываются отдельно в
engine.py, остальные получают уже вычисленные значения.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional

CellValue = Any  # str | float | bool | None | dict(error)


class FormulaValueError(Exception):
    """Приводит к #VALUE! на уровне engine."""


@dataclass
class RangeValue:
    """Результат резолва RangeRef — сетка значений (по строкам)."""
    rows: List[List[CellValue]]

    def flat(self) -> List[CellValue]:
        return [v for row in self.rows for v in row]


def is_error(v: CellValue) -> bool:
    return isinstance(v, dict) and "error" in v


def error_of(code: str) -> dict:
    return {"error": code}


def _to_number(v: CellValue) -> float:
    if v is None:
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        raise FormulaValueError(f"{v!r} — не число")


def _is_numeric(v: CellValue) -> bool:
    if v is None or isinstance(v, bool):
        return False
    if isinstance(v, (int, float)):
        return True
    try:
        float(str(v))
        return True
    except (TypeError, ValueError):
        return False


def _flatten(args: List[CellValue]) -> List[CellValue]:
    out: List[CellValue] = []
    for a in args:
        if isinstance(a, RangeValue):
            out.extend(a.flat())
        else:
            out.append(a)
    return out


def _truthy(v: CellValue) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return v != 0
    return str(v).strip() != ""


_CMP_OPS = {
    "<=": lambda a, b: a <= b,
    ">=": lambda a, b: a >= b,
    "<>": lambda a, b: a != b,
    "=": lambda a, b: a == b,
    "<": lambda a, b: a < b,
    ">": lambda a, b: a > b,
}


def _parse_criteria(criteria: CellValue):
    """'>10' / '<=5' / '<>text' / значение -> функция-предикат."""
    if isinstance(criteria, str):
        for op in ("<=", ">=", "<>", "<", ">", "="):
            if criteria.startswith(op):
                rest = criteria[len(op):].strip()
                cmp = _CMP_OPS[op]
                if _is_numeric(rest):
                    target = _to_number(rest)
                    return lambda v: _is_numeric(v) and cmp(_to_number(v), target)
                return lambda v: cmp(str(v if v is not None else ""), rest)
    # обычное значение — сравнение на равенство (с приведением типов, если оба числовые)
    if _is_numeric(criteria):
        target = _to_number(criteria)
        return lambda v: _is_numeric(v) and _to_number(v) == target
    return lambda v: str(v if v is not None else "") == str(criteria)


def fn_sum(args: List[CellValue]) -> CellValue:
    return sum(_to_number(v) for v in _flatten(args) if _is_numeric(v))


def fn_average(args: List[CellValue]) -> CellValue:
    nums = [_to_number(v) for v in _flatten(args) if _is_numeric(v)]
    if not nums:
        return error_of("#DIV/0!")
    return sum(nums) / len(nums)


def fn_min(args: List[CellValue]) -> CellValue:
    nums = [_to_number(v) for v in _flatten(args) if _is_numeric(v)]
    return min(nums) if nums else 0.0


def fn_max(args: List[CellValue]) -> CellValue:
    nums = [_to_number(v) for v in _flatten(args) if _is_numeric(v)]
    return max(nums) if nums else 0.0


def fn_count(args: List[CellValue]) -> CellValue:
    return float(sum(1 for v in _flatten(args) if _is_numeric(v)))


def fn_counta(args: List[CellValue]) -> CellValue:
    return float(sum(1 for v in _flatten(args) if v is not None and v != ""))


def fn_round(args: List[CellValue]) -> CellValue:
    if len(args) not in (1, 2):
        raise FormulaValueError("ROUND(число, [знаков])")
    digits = int(_to_number(args[1])) if len(args) == 2 else 0
    return round(_to_number(args[0]), digits)


def fn_concat(args: List[CellValue]) -> CellValue:
    parts = []
    for v in _flatten(args):
        if v is None:
            continue
        parts.append(str(v))
    return "".join(parts)


def _sumif_countif_pairs(range_arg: CellValue, sum_range_arg: Optional[CellValue]):
    if not isinstance(range_arg, RangeValue):
        raise FormulaValueError("SUMIF/COUNTIF: первый аргумент должен быть диапазоном")
    criteria_values = range_arg.flat()
    if sum_range_arg is None:
        sum_values = criteria_values
    else:
        if not isinstance(sum_range_arg, RangeValue):
            raise FormulaValueError("SUMIF: sum_range должен быть диапазоном")
        sum_values = sum_range_arg.flat()
    if len(sum_values) != len(criteria_values):
        raise FormulaValueError("SUMIF: диапазоны разного размера")
    return criteria_values, sum_values


def fn_sumif(args: List[CellValue]) -> CellValue:
    if len(args) not in (2, 3):
        raise FormulaValueError("SUMIF(диапазон, критерий, [диапазон_суммирования])")
    criteria_values, sum_values = _sumif_countif_pairs(args[0], args[2] if len(args) == 3 else None)
    predicate = _parse_criteria(args[1])
    return sum(_to_number(s) for c, s in zip(criteria_values, sum_values) if predicate(c) and _is_numeric(s))


def fn_countif(args: List[CellValue]) -> CellValue:
    if len(args) != 2:
        raise FormulaValueError("COUNTIF(диапазон, критерий)")
    if not isinstance(args[0], RangeValue):
        raise FormulaValueError("COUNTIF: первый аргумент должен быть диапазоном")
    predicate = _parse_criteria(args[1])
    return float(sum(1 for v in args[0].flat() if predicate(v)))


def fn_vlookup(args: List[CellValue]) -> CellValue:
    # MVP: поддержан только точный поиск (4-й аргумент range_lookup игнорируется —
    # приближённый поиск по отсортированной таблице не реализован).
    if len(args) not in (3, 4):
        raise FormulaValueError("VLOOKUP(значение, таблица, номер_колонки, [range_lookup])")
    lookup_value, table, col_index = args[0], args[1], int(_to_number(args[2]))
    if not isinstance(table, RangeValue):
        raise FormulaValueError("VLOOKUP: второй аргумент должен быть диапазоном")
    for row in table.rows:
        if row and _values_equal(row[0], lookup_value):
            if col_index < 1 or col_index > len(row):
                return error_of("#REF!")
            return row[col_index - 1]
    return error_of("#N/A")


def _values_equal(a: CellValue, b: CellValue) -> bool:
    if _is_numeric(a) and _is_numeric(b):
        return _to_number(a) == _to_number(b)
    return str(a if a is not None else "") == str(b if b is not None else "")


def fn_xlookup(args: List[CellValue]) -> CellValue:
    if len(args) not in (3, 4):
        raise FormulaValueError("XLOOKUP(значение, диапазон_поиска, диапазон_результата, [если_не_найдено])")
    lookup_value, lookup_range, return_range = args[0], args[1], args[2]
    if not isinstance(lookup_range, RangeValue) or not isinstance(return_range, RangeValue):
        raise FormulaValueError("XLOOKUP: второй и третий аргумент должны быть диапазонами")
    lookup_flat, return_flat = lookup_range.flat(), return_range.flat()
    for lv, rv in zip(lookup_flat, return_flat):
        if _values_equal(lv, lookup_value):
            return rv
    if len(args) == 4:
        return args[3]
    return error_of("#N/A")


# IF/AND/OR — ленивые, обрабатываются в engine.py напрямую (не здесь)
EAGER_FUNCTIONS = {
    "SUM": fn_sum,
    "AVERAGE": fn_average,
    "MIN": fn_min,
    "MAX": fn_max,
    "COUNT": fn_count,
    "COUNTA": fn_counta,
    "ROUND": fn_round,
    "CONCAT": fn_concat,
    "SUMIF": fn_sumif,
    "COUNTIF": fn_countif,
    "VLOOKUP": fn_vlookup,
    "XLOOKUP": fn_xlookup,
}

LAZY_FUNCTIONS = {"IF", "AND", "OR"}
