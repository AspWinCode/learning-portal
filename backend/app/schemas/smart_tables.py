"""Pydantic-схемы для модуля «Умные таблицы».

SpreadsheetOperation — discriminated union, единственный способ изменить
данные листа (см. app/services/smart_tables/executor.py). Phase 1 покрывает
базовый набор операций (создание/переименование, строки/колонки, set_cell).
Phase 2 добавляет format_range/set_conditional_format/sort_rows. Phase 3
добавляет set_formula (пересчёт — app/services/smart_tables/formula/).
Import/export (Phase 4) и AI (Phase 5) — следующие фазы
(docs/smart-tables-architecture.md).
"""
from datetime import datetime
from typing import Annotated, Any, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


ColumnType = Literal[
    "text", "number", "currency", "percentage", "date", "datetime",
    "boolean", "select", "multi_select", "formula", "ai",
]

class FormulaErrorOut(BaseModel):
    """Результат формулы, завершившейся ошибкой (#DIV/0!, #CIRCULAR, #VALUE! и т.п.)."""
    error: str


CellValue = Union[str, float, bool, FormulaErrorOut, None]

ConditionOperator = Literal["less_than", "greater_than", "equals", "contains"]

TextAlign = Literal["left", "center", "right"]


class CellFormatting(BaseModel):
    """Частичный патч форматирования — поля, которых нет в запросе, не трогаются.
    None у присутствующего поля — явный сброс этого атрибута."""
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    align: Optional[TextAlign] = None
    bg_color: Optional[str] = None
    text_color: Optional[str] = None
    number_format: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ConditionalFormatRule(BaseModel):
    operator: ConditionOperator
    value: Union[str, float]
    bg_color: Optional[str] = None
    text_color: Optional[str] = None
    bold: Optional[bool] = None


# ── Сущности ────────────────────────────────────────────────────

class WorkbookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class WorkbookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class WorkbookResponse(BaseModel):
    id: int
    name: str
    owner_id: int
    role: str  # эффективная роль текущего пользователя: owner|editor|viewer
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MemberAdd(BaseModel):
    user_id: int
    role: Literal["owner", "editor", "viewer"] = "viewer"


class MemberResponse(BaseModel):
    user_id: int
    role: str

    model_config = ConfigDict(from_attributes=True)


class SheetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    after_sheet_id: Optional[int] = None


class SheetSummary(BaseModel):
    id: int
    workbook_id: int
    name: str
    position: float
    frozen_rows: int
    frozen_columns: int

    model_config = ConfigDict(from_attributes=True)


class ColumnOut(BaseModel):
    id: int
    sheet_id: int
    name: str
    position: float
    type: ColumnType
    width: int
    config: dict

    model_config = ConfigDict(from_attributes=True)


class CellSnapshot(BaseModel):
    """Значение из cells_snapshot (Row.cells_snapshot[columnId]) — см. раздел C документа.
    value — computed_value (для формул: результат вычисления, не текст формулы).
    formula — исходный текст формулы (с ведущим '='), если ячейка формульная; иначе None."""
    value: CellValue = None
    formula: Optional[str] = None
    formatting: dict = Field(default_factory=dict)


class RowOut(BaseModel):
    id: int
    sheet_id: int
    position: float
    height: int
    cells: dict[str, CellSnapshot]  # {columnId(str): {value, formatting}} — из cells_snapshot

    model_config = ConfigDict(from_attributes=True)


class SheetDetail(BaseModel):
    sheet: SheetSummary
    columns: List[ColumnOut]
    rows: List[RowOut]


# ── Operations (SpreadsheetOperation discriminated union) ────────

# create_sheet / rename_sheet / delete_sheet operate at workbook scope (not a
# single existing sheet) and are exposed as plain REST endpoints below instead
# of going through the sheet-scoped batch executor — see docs section F.

class OpInsertRow(BaseModel):
    type: Literal["insert_row"] = "insert_row"
    after_row_id: Optional[int] = None


class OpDeleteRow(BaseModel):
    type: Literal["delete_row"] = "delete_row"
    row_id: int


class OpInsertColumn(BaseModel):
    type: Literal["insert_column"] = "insert_column"
    after_column_id: Optional[int] = None
    name: str
    column_type: ColumnType = "text"


class OpDeleteColumn(BaseModel):
    type: Literal["delete_column"] = "delete_column"
    column_id: int


class OpResizeColumn(BaseModel):
    type: Literal["resize_column"] = "resize_column"
    column_id: int
    width: int = Field(..., ge=40, le=1000)


class OpResizeRow(BaseModel):
    type: Literal["resize_row"] = "resize_row"
    row_id: int
    height: int = Field(..., ge=16, le=500)


class OpSetCell(BaseModel):
    type: Literal["set_cell"] = "set_cell"
    row_id: int
    column_id: int
    value: CellValue = None


class OpSetFormula(BaseModel):
    type: Literal["set_formula"] = "set_formula"
    row_id: int
    column_id: int
    formula: str = Field(..., min_length=1, max_length=2000)  # с ведущим '=' или без — парсер сам срежет


class OpFormatRange(BaseModel):
    type: Literal["format_range"] = "format_range"
    row_ids: List[int] = Field(..., min_length=1, max_length=5000)
    column_ids: List[int] = Field(..., min_length=1, max_length=500)
    formatting: CellFormatting


class OpSetConditionalFormat(BaseModel):
    type: Literal["set_conditional_format"] = "set_conditional_format"
    column_id: int
    rules: List[ConditionalFormatRule] = Field(default_factory=list, max_length=20)


class OpSortRows(BaseModel):
    type: Literal["sort_rows"] = "sort_rows"
    column_id: int
    direction: Literal["asc", "desc"] = "asc"


SpreadsheetOperation = Annotated[
    Union[
        OpInsertRow,
        OpDeleteRow,
        OpInsertColumn,
        OpDeleteColumn,
        OpResizeColumn,
        OpResizeRow,
        OpSetCell,
        OpSetFormula,
        OpFormatRange,
        OpSetConditionalFormat,
        OpSortRows,
    ],
    Field(discriminator="type"),
]


class OperationBatch(BaseModel):
    ops: List[SpreadsheetOperation] = Field(..., min_length=1, max_length=500)


class OperationResult(BaseModel):
    sheet: SheetDetail
    applied: int


class OperationLogEntry(BaseModel):
    id: int
    user_id: int
    operation: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
