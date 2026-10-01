"""OperationExecutor — единственный путь изменения данных листа.

Ни UI, ни (в будущих фазах) AI не пишут в smart_table_* таблицы напрямую:
всё идёт через apply_batch(). Каждая применённая операция тут же
инвертируется и пишется в smart_table_operation_log, так что undo — это
просто "примени inverse_operation как обычную операцию" (см.
docs/smart-tables-architecture.md, раздел J).

Внутри диспетчера операции всегда представлены как dict (а не как
pydantic-модель): это позволяет одинаково прогонять через _apply_one и
операции, присланные с фронта (провалидированные Pydantic'ом на входе
роутера), и "псевдо-операции" вида _restore_row/_restore_column, которые
существуют только как inverse_operation в логе и никогда не приходят
снаружи — им не нужна отдельная публичная schema.

Phase 1: только структурные операции над строками/колонками и set_cell.
Формулы и пересчёт зависимостей — Phase 3, здесь computed_value == raw_value
(с приведением типа для number/boolean).
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import SmartTableCell, SmartTableColumn, SmartTableOperationLog, SmartTableRow, SmartTableSheet
from app.schemas.smart_tables import SpreadsheetOperation


class OperationError(ValueError):
    """Невалидная операция (не найдена сущность, нарушение инварианта и т.п.)."""


def _position_after(positions: list[float], after_pos: Optional[float]) -> float:
    """Float-позиция для вставки после `after_pos` (или в начало, если None)."""
    ordered = sorted(positions)
    if after_pos is None:
        return (ordered[0] - 1.0) if ordered else 0.0
    greater = [p for p in ordered if p > after_pos]
    next_pos = greater[0] if greater else after_pos + 2.0
    return (after_pos + next_pos) / 2.0


def _coerce_value(value, column_type: str):
    if value is None:
        return None
    if column_type in ("number", "currency", "percentage"):
        try:
            return float(value)
        except (TypeError, ValueError):
            raise OperationError(f"Значение {value!r} не приводится к числу для колонки типа {column_type}")
    if column_type == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "да", "yes")
    return value


class OperationExecutor:
    def __init__(self, db: Session, sheet: SmartTableSheet, user_id: int):
        self.db = db
        self.sheet = sheet
        self.user_id = user_id

    # ── public ──────────────────────────────────────────────────

    def apply_batch(self, ops: list[SpreadsheetOperation]) -> int:
        applied = 0
        for op in ops:
            op_dict = op.model_dump(mode="json")
            inverse = self._apply_one(op_dict)
            self.db.add(
                SmartTableOperationLog(
                    sheet_id=self.sheet.id,
                    user_id=self.user_id,
                    operation=op_dict,
                    inverse_operation=inverse,
                )
            )
            applied += 1
        self.db.flush()
        return applied

    def undo_last(self) -> bool:
        """Откатывает последнюю операцию этого листа, применяя её inverse. Возвращает False, если истории нет."""
        last = (
            self.db.query(SmartTableOperationLog)
            .filter(SmartTableOperationLog.sheet_id == self.sheet.id)
            .order_by(SmartTableOperationLog.id.desc())
            .first()
        )
        if last is None:
            return False
        inverse = self._apply_one(last.inverse_operation)
        self.db.add(
            SmartTableOperationLog(
                sheet_id=self.sheet.id,
                user_id=self.user_id,
                operation=last.inverse_operation,
                inverse_operation=inverse,
            )
        )
        self.db.flush()
        return True

    # ── dispatch ────────────────────────────────────────────────

    def _apply_one(self, op: dict) -> dict:
        handler = getattr(self, f"_op_{op['type']}", None)
        if handler is None:
            raise OperationError(f"Операция {op['type']} не поддерживается в Phase 1")
        return handler(op)

    # ── rows ────────────────────────────────────────────────────

    def _op_insert_row(self, op: dict) -> dict:
        after_pos = None
        after_row_id = op.get("after_row_id")
        if after_row_id is not None:
            after_row = self.db.get(SmartTableRow, after_row_id)
            if after_row is None or after_row.sheet_id != self.sheet.id:
                raise OperationError("after_row_id не найден на этом листе")
            after_pos = after_row.position
        positions = [r.position for r in self.sheet.rows]
        row = SmartTableRow(sheet_id=self.sheet.id, position=_position_after(positions, after_pos), cells_snapshot={})
        self.db.add(row)
        self.db.flush()
        return {"type": "delete_row", "row_id": row.id}

    def _op_delete_row(self, op: dict) -> dict:
        row = self.db.get(SmartTableRow, op["row_id"])
        if row is None or row.sheet_id != self.sheet.id:
            raise OperationError("row_id не найден на этом листе")
        rows_sorted = sorted(self.sheet.rows, key=lambda r: r.position)
        idx = next((i for i, r in enumerate(rows_sorted) if r.id == row.id), None)
        after_row_id = rows_sorted[idx - 1].id if idx and idx > 0 else None
        cells = {
            str(c.column_id): {"raw_value": c.raw_value, "formula": c.formula}
            for c in row.cells
        }
        self.db.delete(row)
        self.db.flush()
        return {"type": "_restore_row", "after_row_id": after_row_id, "cells": cells}

    def _op__restore_row(self, op: dict) -> dict:
        # inverse-only псевдо-операция: воссоздаёт удалённую строку с её ячейками
        after_pos = None
        after_row_id = op.get("after_row_id")
        if after_row_id is not None:
            after_row = self.db.get(SmartTableRow, after_row_id)
            after_pos = after_row.position if after_row else None
        positions = [r.position for r in self.sheet.rows]
        row = SmartTableRow(sheet_id=self.sheet.id, position=_position_after(positions, after_pos), cells_snapshot={})
        self.db.add(row)
        self.db.flush()
        for column_id, payload in op["cells"].items():
            column = self.db.get(SmartTableColumn, int(column_id))
            if column is None:
                continue
            self._write_cell(row, column, payload.get("raw_value"), payload.get("formula"))
        return {"type": "delete_row", "row_id": row.id}

    def _op_resize_row(self, op: dict) -> dict:
        row = self.db.get(SmartTableRow, op["row_id"])
        if row is None or row.sheet_id != self.sheet.id:
            raise OperationError("row_id не найден на этом листе")
        prev_height = row.height
        row.height = op["height"]
        return {"type": "resize_row", "row_id": row.id, "height": prev_height}

    # ── columns ─────────────────────────────────────────────────

    def _op_insert_column(self, op: dict) -> dict:
        after_pos = None
        after_column_id = op.get("after_column_id")
        if after_column_id is not None:
            after_col = self.db.get(SmartTableColumn, after_column_id)
            if after_col is None or after_col.sheet_id != self.sheet.id:
                raise OperationError("after_column_id не найден на этом листе")
            after_pos = after_col.position
        positions = [c.position for c in self.sheet.columns_]
        column = SmartTableColumn(
            sheet_id=self.sheet.id,
            name=op["name"],
            type=op.get("column_type", "text"),
            position=_position_after(positions, after_pos),
            config={},
        )
        self.db.add(column)
        self.db.flush()
        return {"type": "delete_column", "column_id": column.id}

    def _op_delete_column(self, op: dict) -> dict:
        column = self.db.get(SmartTableColumn, op["column_id"])
        if column is None or column.sheet_id != self.sheet.id:
            raise OperationError("column_id не найден на этом листе")
        columns_sorted = sorted(self.sheet.columns_, key=lambda c: c.position)
        idx = next((i for i, c in enumerate(columns_sorted) if c.id == column.id), None)
        after_column_id = columns_sorted[idx - 1].id if idx and idx > 0 else None
        name, column_type = column.name, column.type
        cells = {
            str(c.row_id): {"raw_value": c.raw_value, "formula": c.formula}
            for c in self.db.query(SmartTableCell).filter(SmartTableCell.column_id == column.id).all()
        }
        self.db.delete(column)
        self.db.flush()
        for row in self.sheet.rows:
            snapshot = dict(row.cells_snapshot or {})
            snapshot.pop(str(op["column_id"]), None)
            row.cells_snapshot = snapshot
        return {
            "type": "_restore_column",
            "after_column_id": after_column_id,
            "name": name,
            "column_type": column_type,
            "cells": cells,
        }

    def _op__restore_column(self, op: dict) -> dict:
        after_pos = None
        after_column_id = op.get("after_column_id")
        if after_column_id is not None:
            after_col = self.db.get(SmartTableColumn, after_column_id)
            after_pos = after_col.position if after_col else None
        positions = [c.position for c in self.sheet.columns_]
        column = SmartTableColumn(
            sheet_id=self.sheet.id,
            name=op["name"],
            type=op["column_type"],
            position=_position_after(positions, after_pos),
            config={},
        )
        self.db.add(column)
        self.db.flush()
        for row_id, payload in op["cells"].items():
            row = self.db.get(SmartTableRow, int(row_id))
            if row is None:
                continue
            self._write_cell(row, column, payload.get("raw_value"), payload.get("formula"))
        return {"type": "delete_column", "column_id": column.id}

    def _op_resize_column(self, op: dict) -> dict:
        column = self.db.get(SmartTableColumn, op["column_id"])
        if column is None or column.sheet_id != self.sheet.id:
            raise OperationError("column_id не найден на этом листе")
        prev_width = column.width
        column.width = op["width"]
        return {"type": "resize_column", "column_id": column.id, "width": prev_width}

    # ── cells ───────────────────────────────────────────────────

    def _op_set_cell(self, op: dict) -> dict:
        row = self.db.get(SmartTableRow, op["row_id"])
        if row is None or row.sheet_id != self.sheet.id:
            raise OperationError("row_id не найден на этом листе")
        column = self.db.get(SmartTableColumn, op["column_id"])
        if column is None or column.sheet_id != self.sheet.id:
            raise OperationError("column_id не найден на этом листе")

        existing = (
            self.db.query(SmartTableCell)
            .filter(SmartTableCell.row_id == row.id, SmartTableCell.column_id == column.id)
            .first()
        )
        prev_value = existing.raw_value if existing else None
        self._write_cell(row, column, op.get("value"), formula=None)
        return {"type": "set_cell", "row_id": row.id, "column_id": column.id, "value": prev_value}

    def _write_cell(self, row: SmartTableRow, column: SmartTableColumn, raw_value, formula: Optional[str]):
        computed = _coerce_value(raw_value, column.type)
        cell = (
            self.db.query(SmartTableCell)
            .filter(SmartTableCell.row_id == row.id, SmartTableCell.column_id == column.id)
            .first()
        )
        if cell is None:
            cell = SmartTableCell(row_id=row.id, column_id=column.id)
            self.db.add(cell)
        cell.raw_value = None if raw_value is None else str(raw_value)
        cell.formula = formula
        cell.computed_value = computed
        snapshot = dict(row.cells_snapshot or {})
        snapshot[str(column.id)] = computed
        row.cells_snapshot = snapshot
        self.db.flush()
