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
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ColumnType = Literal[
    "text", "number", "currency", "percentage", "date", "datetime",
    "boolean", "select", "multi_select", "formula", "ai", "smart_link",
]

class FormulaErrorOut(BaseModel):
    """Результат формулы, завершившейся ошибкой (#DIV/0!, #CIRCULAR, #VALUE! и т.п.)."""
    error: str


# bool ДОЛЖЕН идти раньше float/str: bool — подкласс int в Python, и в
# Pydantic smart-режиме Union[str, float, bool] приводит True/False к 1.0/0.0,
# если float стоит раньше bool (поймано тестами при разработке Phase 4 на
# импорте boolean-колонки — '{"value": 1.0}' вместо true).
CellValue = Union[bool, float, str, FormulaErrorOut, None]

ConditionOperator = Literal["less_than", "greater_than", "equals", "contains", "is_empty", "is_not_empty"]

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
    value: Union[str, float] = ""  # не нужно для is_empty/is_not_empty
    bg_color: Optional[str] = None
    text_color: Optional[str] = None
    bold: Optional[bool] = None


class SmartTableLinkTarget(BaseModel):
    type: Literal["smart_table"] = "smart_table"
    workbook_id: int
    sheet_id: Optional[int] = None
    row_id: Optional[int] = None
    column_id: Optional[int] = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_cell_target(self) -> "SmartTableLinkTarget":
        has_row = self.row_id is not None
        has_column = self.column_id is not None
        if has_row != has_column:
            raise ValueError("row_id и column_id должны быть указаны вместе")
        if has_row and self.sheet_id is None:
            raise ValueError("Для перехода к ячейке требуется sheet_id")
        return self


class ExternalUrlLinkTarget(BaseModel):
    type: Literal["external_url"] = "external_url"
    url: str = Field(..., min_length=1, max_length=2048)

    model_config = ConfigDict(extra="forbid")

    @field_validator("url")
    @classmethod
    def _http_only(cls, value: str) -> str:
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Разрешены только абсолютные http/https URL")
        return value.strip()


SmartLinkTarget = Annotated[
    Union[SmartTableLinkTarget, ExternalUrlLinkTarget],
    Field(discriminator="type"),
]


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
    metadata: dict = Field(default_factory=dict)


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


class OpSetSmartLink(BaseModel):
    type: Literal["set_smart_link"] = "set_smart_link"
    row_id: int
    column_id: int
    label: str = Field(..., min_length=1, max_length=255)
    target: SmartLinkTarget


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


# Максимум ячеек в одной paste_range — защита от DoS-пэйлоада (вставка
# огромного диапазона). Один paste = один HTTP-запрос = одна запись в
# operation log = одна отмена, так что лимит считается от total cells, а не
# от числа операций в батче (OperationBatch.max_length здесь не применим —
# paste всегда один op).
MAX_PASTE_CELLS = 5000


class PasteCell(BaseModel):
    """Одна ячейка вставляемого диапазона: ровно одно из value/formula."""
    value: CellValue = None
    formula: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _exactly_one(self) -> "PasteCell":
        if self.formula is not None and self.value is not None:
            raise ValueError("В ячейке paste нельзя указывать и value, и formula одновременно")
        return self


class OpPasteRange(BaseModel):
    type: Literal["paste_range"] = "paste_range"
    anchor_row_id: int
    anchor_column_id: int
    cells: List[List[PasteCell]] = Field(..., min_length=1, max_length=5000)

    @model_validator(mode="after")
    def _check_size(self) -> "OpPasteRange":
        total = sum(len(row) for row in self.cells)
        if total == 0:
            raise ValueError("Пустой диапазон вставки")
        if total > MAX_PASTE_CELLS:
            raise ValueError("Слишком большой диапазон для вставки")
        return self


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
        OpSetSmartLink,
        OpFormatRange,
        OpSetConditionalFormat,
        OpSortRows,
        OpPasteRange,
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


# ── AI (Phase 5) ───────────────────────────────────────────────
# AI не имеет отдельного write-пути: "безопасные" действия (добавить
# колонку, подсветить строки, отсортировать) executor применяет сразу
# тем же OperationExecutor, что и обычный ввод пользователя — так же
# логируется и так же отменяется через undo. Деструктивное действие
# (delete_rows_where) НЕ применяется сервером — только резолвится в
# конкретные SpreadsheetOperation и возвращается клиенту для preview;
# применяет его тот же POST /sheets/{id}/operations, что и обычные
# правки (см. app/services/smart_tables/ai/service.py).

class AiCommandRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)


class AiAddColumn(BaseModel):
    action: Literal["add_column"] = "add_column"
    name: str
    column_type: ColumnType = "text"
    # формула для КАЖДОЙ строки, где {row} — номер строки (1-based), буквы
    # колонок — A1-нотация текущего листа, напр. "=(D{row}-E{row})/D{row}"
    formula_template: Optional[str] = None


class AiHighlightRowsWhere(BaseModel):
    action: Literal["highlight_rows_where"] = "highlight_rows_where"
    column_id: int
    operator: ConditionOperator
    value: Union[str, float] = ""
    bg_color: str = "#ffeeee"


class AiDeleteRowsWhere(BaseModel):
    action: Literal["delete_rows_where"] = "delete_rows_where"
    column_id: int
    operator: ConditionOperator
    value: Union[str, float] = ""


class AiSetConditionalFormat(BaseModel):
    action: Literal["set_conditional_format"] = "set_conditional_format"
    column_id: int
    rules: List[ConditionalFormatRule] = Field(default_factory=list, max_length=20)


class AiSortRows(BaseModel):
    action: Literal["sort_rows"] = "sort_rows"
    column_id: int
    direction: Literal["asc", "desc"] = "asc"


AiAction = Annotated[
    Union[AiAddColumn, AiHighlightRowsWhere, AiDeleteRowsWhere, AiSetConditionalFormat, AiSortRows],
    Field(discriminator="action"),
]


class AiResponseModel(BaseModel):
    """Ответ LLM, провалидированный в JSON-режиме (app/services/ai_gateway.py)."""
    mode: Literal["answer", "actions"]
    answer: Optional[str] = None
    actions: List[AiAction] = Field(default_factory=list)


class AiAppliedSummary(BaseModel):
    action: str
    description: str


class AiPendingAction(BaseModel):
    description: str
    ops: List[SpreadsheetOperation]
    affected_rows: int


class AiCommandResponse(BaseModel):
    mode: Literal["answer", "actions"]
    answer: Optional[str] = None
    applied: List[AiAppliedSummary] = Field(default_factory=list)
    pending: Optional[AiPendingAction] = None
    sheet: SheetDetail
