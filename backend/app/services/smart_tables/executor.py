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

Phase 1: структурные операции над строками/колонками и set_cell.
Phase 2: format_range/set_conditional_format/sort_rows.
Phase 3: set_formula — после любой операции, способной повлиять на значения
(см. _VALUE_AFFECTING_OPS), весь лист пересчитывается через FormulaEngine
(app/services/smart_tables/formula/engine.py). Для обычных (нe-формульных)
ячеек computed_value — это raw_value с приведением типа под column.type.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import SmartTableCell, SmartTableColumn, SmartTableOperationLog, SmartTableRow, SmartTableSheet
from app.schemas.smart_tables import SpreadsheetOperation
from app.services.smart_tables.formula.engine import FormulaEngine


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


_VALUE_AFFECTING_OPS = {
    "set_cell", "set_formula", "insert_row", "delete_row", "insert_column", "delete_column",
    "_restore_row", "_restore_column", "paste_range", "_restore_paste_range",
}


class OperationExecutor:
    def __init__(self, db: Session, sheet: SmartTableSheet, user_id: int):
        self.db = db
        self.sheet = sheet
        self.user_id = user_id
        self._formula_engine: Optional[FormulaEngine] = None

    @property
    def formula_engine(self) -> FormulaEngine:
        if self._formula_engine is None:
            self._formula_engine = FormulaEngine(self.db, self.sheet.workbook_id)
        return self._formula_engine

    # ── public ──────────────────────────────────────────────────

    def apply_batch(self, ops: list[SpreadsheetOperation]) -> int:
        applied = 0
        needs_recalc = False
        for op in ops:
            # exclude_unset: поля, которые клиент не прислал (в т.ч. вложенные в
            # CellFormatting), не попадают в dict — это даёт format_range
            # patch-семантику "не трогать", а не "сбросить в default".
            op_dict = op.model_dump(mode="json", exclude_unset=True)
            op_dict["type"] = op.type  # дискриминатор нужен диспетчеру всегда, даже если не был "set" явно
            inverse = self._apply_one(op_dict)
            if op_dict["type"] in _VALUE_AFFECTING_OPS:
                needs_recalc = True
            self.db.add(
                SmartTableOperationLog(
                    sheet_id=self.sheet.id,
                    user_id=self.user_id,
                    operation=op_dict,
                    inverse_operation=inverse,
                )
            )
            applied += 1
        if needs_recalc:
            self.formula_engine.recalculate_sheet(self.sheet.id)
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
        if last.inverse_operation.get("type") in _VALUE_AFFECTING_OPS:
            self.formula_engine.recalculate_sheet(self.sheet.id)
        self.db.flush()
        return True

    # ── helpers ─────────────────────────────────────────────────

    def _fresh_rows(self) -> list[SmartTableRow]:
        # self.sheet.rows — закэшированная ORM-relationship: после db.add()+flush()
        # новой строки в этом же методе она не обновляется автоматически (мы не
        # трогаем сам объект relationship, только FK). Внутри одного batch это
        # давало коллизии позиций у нескольких insert_row подряд — поэтому здесь
        # всегда свежий запрос, а не self.sheet.rows.
        return (
            self.db.query(SmartTableRow)
            .filter(SmartTableRow.sheet_id == self.sheet.id)
            .order_by(SmartTableRow.position)
            .all()
        )

    def _fresh_columns(self) -> list[SmartTableColumn]:
        return (
            self.db.query(SmartTableColumn)
            .filter(SmartTableColumn.sheet_id == self.sheet.id)
            .order_by(SmartTableColumn.position)
            .all()
        )

    # ── dispatch ────────────────────────────────────────────────

    def _apply_one(self, op: dict) -> dict:
        handler = getattr(self, f"_op_{op['type']}", None)
        if handler is None:
            raise OperationError(f"Операция {op['type']} пока не поддерживается")
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
        positions = [r.position for r in self._fresh_rows()]
        row = SmartTableRow(sheet_id=self.sheet.id, position=_position_after(positions, after_pos), cells_snapshot={})
        self.db.add(row)
        self.db.flush()
        return {"type": "delete_row", "row_id": row.id}

    def _op_delete_row(self, op: dict) -> dict:
        row = self.db.get(SmartTableRow, op["row_id"])
        if row is None or row.sheet_id != self.sheet.id:
            raise OperationError("row_id не найден на этом листе")
        rows_sorted = self._fresh_rows()
        idx = next((i for i, r in enumerate(rows_sorted) if r.id == row.id), None)
        after_row_id = rows_sorted[idx - 1].id if idx and idx > 0 else None
        cells = {
            str(c.column_id): {"raw_value": c.raw_value, "formula": c.formula, "formatting": c.formatting or {}}
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
        positions = [r.position for r in self._fresh_rows()]
        row = SmartTableRow(sheet_id=self.sheet.id, position=_position_after(positions, after_pos), cells_snapshot={})
        self.db.add(row)
        self.db.flush()
        for column_id, payload in op["cells"].items():
            column = self.db.get(SmartTableColumn, int(column_id))
            if column is None:
                continue
            self._write_cell(row, column, payload.get("raw_value"), payload.get("formula"))
            if payload.get("formatting"):
                cell = self._get_or_create_cell(row, column)
                cell.formatting = dict(payload["formatting"])
                self._sync_snapshot(row, column, cell)
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
        positions = [c.position for c in self._fresh_columns()]
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
        columns_sorted = self._fresh_columns()
        idx = next((i for i, c in enumerate(columns_sorted) if c.id == column.id), None)
        after_column_id = columns_sorted[idx - 1].id if idx and idx > 0 else None
        name, column_type, config = column.name, column.type, dict(column.config or {})
        cells = {
            str(c.row_id): {"raw_value": c.raw_value, "formula": c.formula, "formatting": c.formatting or {}}
            for c in self.db.query(SmartTableCell).filter(SmartTableCell.column_id == column.id).all()
        }
        self.db.delete(column)
        self.db.flush()
        for row in self._fresh_rows():
            snapshot = dict(row.cells_snapshot or {})
            snapshot.pop(str(op["column_id"]), None)
            row.cells_snapshot = snapshot
        return {
            "type": "_restore_column",
            "after_column_id": after_column_id,
            "name": name,
            "column_type": column_type,
            "config": config,
            "cells": cells,
        }

    def _op__restore_column(self, op: dict) -> dict:
        after_pos = None
        after_column_id = op.get("after_column_id")
        if after_column_id is not None:
            after_col = self.db.get(SmartTableColumn, after_column_id)
            after_pos = after_col.position if after_col else None
        positions = [c.position for c in self._fresh_columns()]
        column = SmartTableColumn(
            sheet_id=self.sheet.id,
            name=op["name"],
            type=op["column_type"],
            position=_position_after(positions, after_pos),
            config=dict(op.get("config") or {}),
        )
        self.db.add(column)
        self.db.flush()
        for row_id, payload in op["cells"].items():
            row = self.db.get(SmartTableRow, int(row_id))
            if row is None:
                continue
            self._write_cell(row, column, payload.get("raw_value"), payload.get("formula"))
            if payload.get("formatting"):
                cell = self._get_or_create_cell(row, column)
                cell.formatting = dict(payload["formatting"])
                self._sync_snapshot(row, column, cell)
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
        # если в ячейке была формула — undo должен вернуть формулу, а не её
        # последний computed_value (иначе откат set_cell поверх формульной
        # ячейки необратимо стирает формулу)
        if existing is not None and existing.formula:
            inverse = {"type": "set_formula", "row_id": row.id, "column_id": column.id, "formula": existing.formula}
        else:
            inverse = {"type": "set_cell", "row_id": row.id, "column_id": column.id, "value": existing.raw_value if existing else None}
        self._write_cell(row, column, op.get("value"), formula=None)
        return inverse

    def _op_set_formula(self, op: dict) -> dict:
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
        if existing is not None and existing.formula:
            inverse = {"type": "set_formula", "row_id": row.id, "column_id": column.id, "formula": existing.formula}
        else:
            inverse = {"type": "set_cell", "row_id": row.id, "column_id": column.id, "value": existing.raw_value if existing else None}
        # computed_value для формульной ячейки считает FormulaEngine.recalculate_sheet(),
        # которую apply_batch/undo_last вызывают сразу после применения этой операции
        # (set_formula входит в _VALUE_AFFECTING_OPS) — здесь только сохраняем текст формулы.
        self._write_cell(row, column, None, formula=op["formula"])
        return inverse

    def _op_paste_range(self, op: dict) -> dict:
        # Единственная операция, реализующая spreadsheet-style paste: сама
        # досоздаёт недостающие строки/колонки (переиспользуя _op_insert_row/
        # _op_insert_column — именно поэтому клиент не может прислать это как
        # набор insert_* + set_cell в одном батче: он не знает id ещё не
        # созданных строк/колонок), пишет ячейки через тот же _write_cell, что
        # и set_cell/set_formula, и возвращает ОДИН составной inverse — так
        # один paste = одна строка в operation log = одна отмена.
        anchor_row = self.db.get(SmartTableRow, op["anchor_row_id"])
        if anchor_row is None or anchor_row.sheet_id != self.sheet.id:
            raise OperationError("anchor_row_id не найден на этом листе")
        anchor_column = self.db.get(SmartTableColumn, op["anchor_column_id"])
        if anchor_column is None or anchor_column.sheet_id != self.sheet.id:
            raise OperationError("anchor_column_id не найден на этом листе")

        matrix: list[list[dict]] = op["cells"]
        n_rows = len(matrix)
        n_cols = max((len(r) for r in matrix), default=0)
        if n_rows == 0 or n_cols == 0:
            raise OperationError("Пустой диапазон вставки")

        rows = self._fresh_rows()
        columns = self._fresh_columns()
        row_start = next((i for i, r in enumerate(rows) if r.id == anchor_row.id), None)
        col_start = next((i for i, c in enumerate(columns) if c.id == anchor_column.id), None)
        if row_start is None or col_start is None:
            raise OperationError("anchor_row_id/anchor_column_id не найдены на этом листе")

        inserted_row_ids: list[int] = []
        inserted_column_ids: list[int] = []

        last_row_id = rows[-1].id if rows else None
        for _ in range(max(0, row_start + n_rows - len(rows))):
            inverse = self._op_insert_row({"after_row_id": last_row_id})
            last_row_id = inverse["row_id"]
            inserted_row_ids.append(last_row_id)

        last_column_id = columns[-1].id if columns else None
        next_col_number = len(columns) + 1
        for _ in range(max(0, col_start + n_cols - len(columns))):
            inverse = self._op_insert_column({
                "after_column_id": last_column_id,
                "name": f"Колонка {next_col_number}",
                "column_type": "text",
            })
            last_column_id = inverse["column_id"]
            inserted_column_ids.append(last_column_id)
            next_col_number += 1

        target_rows = self._fresh_rows()[row_start:row_start + n_rows]
        target_columns = self._fresh_columns()[col_start:col_start + n_cols]
        inserted_row_set, inserted_column_set = set(inserted_row_ids), set(inserted_column_ids)
        cell_restores: list[dict] = []

        for i, row in enumerate(target_rows):
            cell_row = matrix[i] if i < len(matrix) else []
            for j, column in enumerate(target_columns):
                if j >= len(cell_row):
                    continue
                entry = cell_row[j]
                if row.id not in inserted_row_set and column.id not in inserted_column_set:
                    existing = (
                        self.db.query(SmartTableCell)
                        .filter(SmartTableCell.row_id == row.id, SmartTableCell.column_id == column.id)
                        .first()
                    )
                    cell_restores.append({
                        "row_id": row.id,
                        "column_id": column.id,
                        "raw_value": existing.raw_value if existing else None,
                        "formula": existing.formula if existing else None,
                    })
                if entry.get("formula") is not None:
                    self._write_cell(row, column, None, formula=entry["formula"])
                else:
                    self._write_cell(row, column, entry.get("value"), formula=None)

        return {
            "type": "_restore_paste_range",
            "inserted_row_ids": inserted_row_ids,
            "inserted_column_ids": inserted_column_ids,
            "cell_restores": cell_restores,
            "redo": {
                "anchor_row_id": op["anchor_row_id"],
                "anchor_column_id": op["anchor_column_id"],
                "cells": op["cells"],
            },
        }

    def _op__restore_paste_range(self, op: dict) -> dict:
        # inverse-only: убирает то, что досоздал paste_range, восстанавливает
        # значения ранее существовавших ячеек, которые он перезаписал; своим
        # собственным inverse возвращает исходный paste_range (симметрично
        # паре delete_row/_restore_row и т.п. — так работает и повторная отмена/redo).
        for column_id in reversed(op.get("inserted_column_ids") or []):
            self._op_delete_column({"column_id": column_id})
        for row_id in reversed(op.get("inserted_row_ids") or []):
            self._op_delete_row({"row_id": row_id})
        for entry in op.get("cell_restores") or []:
            row = self.db.get(SmartTableRow, entry["row_id"])
            column = self.db.get(SmartTableColumn, entry["column_id"])
            if row is None or column is None:
                continue
            self._write_cell(row, column, entry.get("raw_value"), entry.get("formula"))
        return {"type": "paste_range", **op["redo"]}

    def _get_or_create_cell(self, row: SmartTableRow, column: SmartTableColumn) -> SmartTableCell:
        cell = (
            self.db.query(SmartTableCell)
            .filter(SmartTableCell.row_id == row.id, SmartTableCell.column_id == column.id)
            .first()
        )
        if cell is None:
            cell = SmartTableCell(row_id=row.id, column_id=column.id, formatting={})
            self.db.add(cell)
            self.db.flush()
        return cell

    def _sync_snapshot(self, row: SmartTableRow, column: SmartTableColumn, cell: SmartTableCell) -> None:
        snapshot = dict(row.cells_snapshot or {})
        if cell.computed_value is None and not cell.formatting and not cell.formula:
            snapshot.pop(str(column.id), None)
        else:
            snapshot[str(column.id)] = {
                "value": cell.computed_value,
                "formula": cell.formula,
                "formatting": cell.formatting or {},
            }
        row.cells_snapshot = snapshot

    def _write_cell(self, row: SmartTableRow, column: SmartTableColumn, raw_value, formula: Optional[str]):
        computed = _coerce_value(raw_value, column.type)
        cell = self._get_or_create_cell(row, column)
        cell.raw_value = None if raw_value is None else str(raw_value)
        cell.formula = formula
        cell.computed_value = computed
        self._sync_snapshot(row, column, cell)
        self.db.flush()

    # ── formatting (Phase 2) ───────────────────────────────────────

    def _op_format_range(self, op: dict) -> dict:
        row_ids, column_ids = op["row_ids"], op["column_ids"]
        rows = {r.id: r for r in self._fresh_rows() if r.id in row_ids}
        columns = {c.id: c for c in self._fresh_columns() if c.id in column_ids}
        missing_rows = set(row_ids) - set(rows)
        missing_cols = set(column_ids) - set(columns)
        if missing_rows or missing_cols:
            raise OperationError("row_ids/column_ids содержат элементы не с этого листа")

        # apply_batch сериализует операции через model_dump(exclude_unset=True), так что
        # op["formatting"] уже содержит только явно переданные клиентом ключи (patch-семантика:
        # отсутствующий ключ — не трогать, ключ со значением null — явно сбросить атрибут).
        patch: dict = op["formatting"]
        prev: list[dict] = []
        for row_id in row_ids:
            row = rows[row_id]
            for column_id in column_ids:
                column = columns[column_id]
                cell = self._get_or_create_cell(row, column)
                prev.append({"row_id": row_id, "column_id": column_id, "formatting": dict(cell.formatting or {})})
                new_formatting = dict(cell.formatting or {})
                for key, value in patch.items():
                    if value is None:
                        new_formatting.pop(key, None)
                    else:
                        new_formatting[key] = value
                cell.formatting = new_formatting
                self._sync_snapshot(row, column, cell)
        self.db.flush()
        return {"type": "_restore_format", "cells": prev}

    def _op__restore_format(self, op: dict) -> dict:
        prev_for_inverse: list[dict] = []
        for entry in op["cells"]:
            row = self.db.get(SmartTableRow, entry["row_id"])
            column = self.db.get(SmartTableColumn, entry["column_id"])
            if row is None or column is None:
                continue
            cell = self._get_or_create_cell(row, column)
            prev_for_inverse.append({"row_id": row.id, "column_id": column.id, "formatting": dict(cell.formatting or {})})
            cell.formatting = dict(entry["formatting"] or {})
            self._sync_snapshot(row, column, cell)
        self.db.flush()
        return {"type": "_restore_format", "cells": prev_for_inverse}

    def _op_set_conditional_format(self, op: dict) -> dict:
        column = self.db.get(SmartTableColumn, op["column_id"])
        if column is None or column.sheet_id != self.sheet.id:
            raise OperationError("column_id не найден на этом листе")
        prev_rules = list((column.config or {}).get("conditional_formats") or [])
        config = dict(column.config or {})
        config["conditional_formats"] = op["rules"]
        column.config = config
        self.db.flush()
        return {"type": "set_conditional_format", "column_id": column.id, "rules": prev_rules}

    # ── sort (Phase 2) ───────────────────────────────────────────

    def _op_sort_rows(self, op: dict) -> dict:
        column = self.db.get(SmartTableColumn, op["column_id"])
        if column is None or column.sheet_id != self.sheet.id:
            raise OperationError("column_id не найден на этом листе")
        rows = self._fresh_rows()
        prev_positions = [{"row_id": r.id, "position": r.position} for r in rows]

        def sort_key(row: SmartTableRow):
            snapshot = (row.cells_snapshot or {}).get(str(column.id))
            value = snapshot.get("value") if isinstance(snapshot, dict) else None
            is_null = value is None
            return (is_null, value if not is_null and isinstance(value, (int, float)) else str(value or ""))

        reverse = op.get("direction") == "desc"
        try:
            rows.sort(key=sort_key, reverse=reverse)
        except TypeError:
            # смешанные типы (число и текст) — fallback на сортировку по строковому представлению
            rows.sort(key=lambda r: str(sort_key(r)[1]), reverse=reverse)
        for i, row in enumerate(rows):
            row.position = float(i)
        self.db.flush()
        return {"type": "_restore_positions", "positions": prev_positions}

    def _op__restore_positions(self, op: dict) -> dict:
        rows = {r.id: r for r in self._fresh_rows()}
        prev_for_inverse = [{"row_id": r.id, "position": r.position} for r in rows.values()]
        for entry in op["positions"]:
            row = rows.get(entry["row_id"])
            if row is not None:
                row.position = entry["position"]
        self.db.flush()
        return {"type": "_restore_positions", "positions": prev_for_inverse}
