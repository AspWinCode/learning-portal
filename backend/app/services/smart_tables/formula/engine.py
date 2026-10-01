"""Движок пересчёта формул — Phase 3.

Пересчитывает ВСЕ формульные ячейки листа за один проход: строит граф
зависимостей между формульными ячейками этого листа, топологически
сортирует (Kahn), ячейки в цикле (или зависящие от цикла) получают
#CIRCULAR, остальные вычисляются в порядке, гарантирующем, что все
прямые зависимости уже посчитаны. Это проще и для MVP достаточно
быстро (сотни формул на лист, см. docs/smart-tables-architecture.md
раздел D) — инкрементальный пересчёт только изменённого поддерева
можно добавить позже без смены формата хранения.

Межлистовые ссылки поддержаны на чтение: значение из другого листа
берётся из его последнего посчитанного computed_value, но правка
листа A не триггерит пересчёт формул в листе B, которые на него
ссылаются (в B это произойдёт при следующей операции над листом B).
"""
from __future__ import annotations

from collections import deque
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import SmartTableCell, SmartTableColumn, SmartTableRow, SmartTableSheet
from app.services.smart_tables.formula.functions import (
    EAGER_FUNCTIONS,
    LAZY_FUNCTIONS,
    FormulaValueError,
    RangeValue,
    _truthy,
    error_of,
    is_error,
)
from app.services.smart_tables.formula.parser import (
    BinOp,
    BoolLit,
    CellRef,
    FormulaSyntaxError,
    FuncCall,
    Node,
    NumberLit,
    RangeRef,
    StringLit,
    UnaryOp,
    col_letters_to_index,
    parse_formula,
)

CellKey = Tuple[int, int]  # (row_id, column_id)


class _SheetLayout:
    __slots__ = ("sheet_id", "columns", "rows", "col_index", "row_index")

    def __init__(self, sheet_id: int, columns: List[SmartTableColumn], rows: List[SmartTableRow]):
        self.sheet_id = sheet_id
        self.columns = columns
        self.rows = rows
        self.col_index = {c.id: i for i, c in enumerate(columns)}
        self.row_index = {r.id: i for i, r in enumerate(rows)}

    def column_id_at(self, letters: str) -> Optional[int]:
        idx = col_letters_to_index(letters)
        return self.columns[idx].id if 0 <= idx < len(self.columns) else None

    def row_id_at(self, number: int) -> Optional[int]:
        idx = number - 1
        return self.rows[idx].id if 0 <= idx < len(self.rows) else None


class FormulaEngine:
    def __init__(self, db: Session, workbook_id: int):
        self.db = db
        self.workbook_id = workbook_id
        self._layouts: Dict[int, _SheetLayout] = {}
        self._sheet_name_to_id: Optional[Dict[str, int]] = None
        self._value_cache: Dict[int, Dict[CellKey, object]] = {}

    # ── layout / resolving ──────────────────────────────────────

    def _layout(self, sheet_id: int) -> _SheetLayout:
        cached = self._layouts.get(sheet_id)
        if cached is not None:
            return cached
        columns = (
            self.db.query(SmartTableColumn)
            .filter(SmartTableColumn.sheet_id == sheet_id)
            .order_by(SmartTableColumn.position)
            .all()
        )
        rows = (
            self.db.query(SmartTableRow)
            .filter(SmartTableRow.sheet_id == sheet_id)
            .order_by(SmartTableRow.position)
            .all()
        )
        layout = _SheetLayout(sheet_id, columns, rows)
        self._layouts[sheet_id] = layout
        return layout

    def _resolve_sheet_id(self, name: Optional[str], default_sheet_id: int) -> Optional[int]:
        if name is None:
            return default_sheet_id
        if self._sheet_name_to_id is None:
            sheets = (
                self.db.query(SmartTableSheet)
                .filter(SmartTableSheet.workbook_id == self.workbook_id)
                .all()
            )
            self._sheet_name_to_id = {s.name: s.id for s in sheets}
        return self._sheet_name_to_id.get(name)

    def _resolve_cell(self, ref: CellRef, default_sheet_id: int) -> Optional[CellKey]:
        sheet_id = self._resolve_sheet_id(ref.sheet, default_sheet_id)
        if sheet_id is None:
            return None
        layout = self._layout(sheet_id)
        column_id = layout.column_id_at(ref.col_letters)
        row_id = layout.row_id_at(ref.row_number)
        if column_id is None or row_id is None:
            return None
        return (row_id, column_id)

    def _resolve_range(self, ref: RangeRef, default_sheet_id: int) -> Tuple[Optional[int], List[List[CellKey]]]:
        """Возвращает (sheet_id, сетка ключей по строкам). sheet_id=None при ошибке резолва."""
        sheet_id = self._resolve_sheet_id(ref.start.sheet or ref.end.sheet, default_sheet_id)
        if sheet_id is None:
            return None, []
        layout = self._layout(sheet_id)
        c1, c2 = col_letters_to_index(ref.start.col_letters), col_letters_to_index(ref.end.col_letters)
        r1, r2 = ref.start.row_number - 1, ref.end.row_number - 1
        c_from, c_to = sorted((c1, c2))
        r_from, r_to = sorted((r1, r2))
        grid: List[List[CellKey]] = []
        for ri in range(r_from, r_to + 1):
            if ri < 0 or ri >= len(layout.rows):
                continue
            row_cells = []
            for ci in range(c_from, c_to + 1):
                if ci < 0 or ci >= len(layout.columns):
                    continue
                row_cells.append((layout.rows[ri].id, layout.columns[ci].id))
            if row_cells:
                grid.append(row_cells)
        return sheet_id, grid

    # ── value cache (чтение уже посчитанных cells, не являющихся частью текущего пересчёта) ──

    def _cell_values(self, sheet_id: int) -> Dict[CellKey, object]:
        cached = self._value_cache.get(sheet_id)
        if cached is not None:
            return cached
        rows = self.db.query(SmartTableCell.row_id, SmartTableCell.column_id, SmartTableCell.computed_value).join(
            SmartTableRow, SmartTableCell.row_id == SmartTableRow.id
        ).filter(SmartTableRow.sheet_id == sheet_id).all()
        values = {(row_id, column_id): value for row_id, column_id, value in rows}
        self._value_cache[sheet_id] = values
        return values

    def invalidate(self, sheet_id: int) -> None:
        self._value_cache.pop(sheet_id, None)

    # ── recalculation ───────────────────────────────────────────

    def recalculate_sheet(self, sheet_id: int) -> None:
        self.invalidate(sheet_id)
        cells = (
            self.db.query(SmartTableCell)
            .join(SmartTableRow, SmartTableCell.row_id == SmartTableRow.id)
            .filter(SmartTableRow.sheet_id == sheet_id, SmartTableCell.formula.isnot(None))
            .all()
        )
        if not cells:
            return

        parsed: Dict[CellKey, Tuple[SmartTableCell, Optional[Node]]] = {}
        for cell in cells:
            key = (cell.row_id, cell.column_id)
            text = cell.formula.lstrip()
            if text.startswith("="):
                text = text[1:]
            try:
                parsed[key] = (cell, parse_formula(text))
            except FormulaSyntaxError:
                parsed[key] = (cell, None)

        depends_on: Dict[CellKey, set] = {k: set() for k in parsed}
        for key, (_cell, ast) in parsed.items():
            if ast is None:
                continue
            for ref_key in self._refs_in(ast, sheet_id):
                if ref_key in parsed and ref_key != key:
                    depends_on[key].add(ref_key)

        order, cyclic = self._topo_sort(depends_on)

        results: Dict[CellKey, object] = {}
        for key in cyclic:
            results[key] = error_of("#CIRCULAR")
        for key in order:
            cell, ast = parsed[key]
            if ast is None:
                results[key] = error_of("#ERROR!")
                continue
            try:
                results[key] = self._eval(ast, sheet_id, results)
            except FormulaValueError:
                results[key] = error_of("#VALUE!")
            except ZeroDivisionError:
                results[key] = error_of("#DIV/0!")

        rows_touched: Dict[int, SmartTableRow] = {}
        for (row_id, column_id), (cell, _ast) in parsed.items():
            value = results.get((row_id, column_id), error_of("#ERROR!"))
            cell.computed_value = value
            row = rows_touched.get(row_id) or cell.row
            rows_touched[row_id] = row
            snapshot = dict(row.cells_snapshot or {})
            snapshot[str(column_id)] = {
                "value": value,
                "formula": cell.formula,
                "formatting": cell.formatting or {},
            }
            row.cells_snapshot = snapshot
        self.db.flush()
        self.invalidate(sheet_id)

    @staticmethod
    def _topo_sort(depends_on: Dict[CellKey, set]) -> Tuple[List[CellKey], set]:
        dependents: Dict[CellKey, set] = {k: set() for k in depends_on}
        for k, deps in depends_on.items():
            for d in deps:
                dependents[d].add(k)
        in_degree = {k: len(v) for k, v in depends_on.items()}
        queue = deque([k for k, d in in_degree.items() if d == 0])
        order: List[CellKey] = []
        while queue:
            k = queue.popleft()
            order.append(k)
            for dep in dependents.get(k, ()):
                in_degree[dep] -= 1
                if in_degree[dep] == 0:
                    queue.append(dep)
        cyclic = set(depends_on) - set(order)
        return order, cyclic

    def _refs_in(self, node: Node, default_sheet_id: int):
        if isinstance(node, CellRef):
            key = self._resolve_cell(node, default_sheet_id)
            if key is not None:
                yield key
        elif isinstance(node, RangeRef):
            sheet_id, grid = self._resolve_range(node, default_sheet_id)
            if sheet_id is not None:
                for row in grid:
                    for key in row:
                        yield key
        elif isinstance(node, FuncCall):
            for arg in node.args:
                yield from self._refs_in(arg, default_sheet_id)
        elif isinstance(node, BinOp):
            yield from self._refs_in(node.left, default_sheet_id)
            yield from self._refs_in(node.right, default_sheet_id)
        elif isinstance(node, UnaryOp):
            yield from self._refs_in(node.operand, default_sheet_id)

    # ── evaluation ──────────────────────────────────────────────

    def _eval(self, node: Node, default_sheet_id: int, results: Dict[CellKey, object]):
        if isinstance(node, NumberLit):
            return node.value
        if isinstance(node, StringLit):
            return node.value
        if isinstance(node, BoolLit):
            return node.value
        if isinstance(node, CellRef):
            sheet_id = self._resolve_sheet_id(node.sheet, default_sheet_id)
            if sheet_id is None:
                return error_of("#REF!")
            key = self._resolve_cell(node, default_sheet_id)
            if key is None:
                return None
            if sheet_id == default_sheet_id and key in results:
                return results[key]
            return self._cell_values(sheet_id).get(key)
        if isinstance(node, RangeRef):
            sheet_id, grid = self._resolve_range(node, default_sheet_id)
            if sheet_id is None:
                return error_of("#REF!")
            rows_values = []
            for row in grid:
                row_values = []
                for key in row:
                    if sheet_id == default_sheet_id and key in results:
                        row_values.append(results[key])
                    else:
                        row_values.append(self._cell_values(sheet_id).get(key))
                rows_values.append(row_values)
            return RangeValue(rows_values)
        if isinstance(node, UnaryOp):
            v = self._eval(node.operand, default_sheet_id, results)
            if is_error(v):
                return v
            return -_num(v)
        if isinstance(node, BinOp):
            return self._eval_binop(node, default_sheet_id, results)
        if isinstance(node, FuncCall):
            return self._eval_funccall(node, default_sheet_id, results)
        raise FormulaValueError(f"Неизвестный узел формулы {node!r}")

    def _eval_binop(self, node: BinOp, default_sheet_id: int, results):
        left = self._eval(node.left, default_sheet_id, results)
        if is_error(left):
            return left
        right = self._eval(node.right, default_sheet_id, results)
        if is_error(right):
            return right
        op = node.op
        if op == "&":
            return (str(left) if left is not None else "") + (str(right) if right is not None else "")
        if op in ("=", "<>", "<", ">", "<=", ">="):
            if op == "=":
                return _loose_eq(left, right)
            if op == "<>":
                return not _loose_eq(left, right)
            ln, rn = _num(left), _num(right)
            return {"<": ln < rn, ">": ln > rn, "<=": ln <= rn, ">=": ln >= rn}[op]
        ln, rn = _num(left), _num(right)
        if op == "+":
            return ln + rn
        if op == "-":
            return ln - rn
        if op == "*":
            return ln * rn
        if op == "/":
            if rn == 0:
                return error_of("#DIV/0!")
            return ln / rn
        if op == "^":
            return ln ** rn
        raise FormulaValueError(f"Неизвестный оператор {op!r}")

    def _eval_funccall(self, node: FuncCall, default_sheet_id: int, results):
        name = node.name
        if name == "IF":
            if len(node.args) not in (2, 3):
                raise FormulaValueError("IF(условие, значение_если_истина, [значение_если_ложь])")
            cond = self._eval(node.args[0], default_sheet_id, results)
            if is_error(cond):
                return cond
            if _truthy(cond):
                return self._eval(node.args[1], default_sheet_id, results)
            if len(node.args) == 3:
                return self._eval(node.args[2], default_sheet_id, results)
            return False
        if name == "AND":
            result = True
            for arg in node.args:
                v = self._eval(arg, default_sheet_id, results)
                if is_error(v):
                    return v
                result = result and _truthy(v)
            return result
        if name == "OR":
            result = False
            for arg in node.args:
                v = self._eval(arg, default_sheet_id, results)
                if is_error(v):
                    return v
                result = result or _truthy(v)
            return result
        if name not in EAGER_FUNCTIONS:
            return error_of("#NAME?")
        values = []
        for arg in node.args:
            v = self._eval(arg, default_sheet_id, results)
            if is_error(v):
                return v
            values.append(v)
        return EAGER_FUNCTIONS[name](values)


def _num(v) -> float:
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


def _loose_eq(a, b) -> bool:
    if isinstance(a, (int, float)) and not isinstance(a, bool) and isinstance(b, (int, float)) and not isinstance(b, bool):
        return float(a) == float(b)
    return a == b
