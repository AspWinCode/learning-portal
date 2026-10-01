"""Pydantic-схемы для модуля «Умные таблицы».

SpreadsheetOperation — discriminated union, единственный способ изменить
данные листа (см. app/services/smart_tables/executor.py). Phase 1 покрывает
базовый набор операций (создание/переименование, строки/колонки, set_cell);
формулы, форматирование, sort/filter — следующие фазы (docs/smart-tables-architecture.md).
"""
from datetime import datetime
from typing import Annotated, Any, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


ColumnType = Literal[
    "text", "number", "currency", "percentage", "date", "datetime",
    "boolean", "select", "multi_select", "formula", "ai",
]

CellValue = Union[str, float, bool, None]


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


class CellOut(BaseModel):
    column_id: int
    raw_value: Optional[str] = None
    formula: Optional[str] = None
    computed_value: Any = None
    metadata: dict = Field(default_factory=dict)
    formatting: dict = Field(default_factory=dict)


class RowOut(BaseModel):
    id: int
    sheet_id: int
    position: float
    height: int
    cells: dict[str, CellValue]  # {columnId(str): computedValue} — из cells_snapshot

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


SpreadsheetOperation = Annotated[
    Union[
        OpInsertRow,
        OpDeleteRow,
        OpInsertColumn,
        OpDeleteColumn,
        OpResizeColumn,
        OpResizeRow,
        OpSetCell,
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
