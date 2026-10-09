// Типы «Умных таблиц» — зеркало backend/app/schemas/smart_tables.py.
// Phase 1 (ядро грида) + Phase 2 (форматирование/sort/filter) + Phase 3 (формулы).
// См. docs/smart-tables-architecture.md.

export type ColumnType =
  | 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'multi_select' | 'formula' | 'ai' | 'smart_link';

export type SmartLinkTarget =
  | {
      type: 'smart_table';
      workbook_id: number;
      sheet_id?: number | null;
      row_id?: number | null;
      column_id?: number | null;
    }
  | { type: 'external_url'; url: string };

export interface SmartLinkMetadata {
  type: 'smart_link';
  target: SmartLinkTarget;
}

export interface FormulaError {
  error: string; // '#CIRCULAR' | '#DIV/0!' | '#VALUE!' | '#REF!' | '#N/A' | '#NAME?' | '#ERROR!'
}

export type CellValue = string | number | boolean | FormulaError | null;

export function isFormulaError(v: CellValue): v is FormulaError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export type WorkbookRole = 'owner' | 'editor' | 'viewer';

export interface Workbook {
  id: number;
  name: string;
  owner_id: number;
  role: WorkbookRole;
  created_at: string;
  updated_at: string | null;
}

export interface SheetSummary {
  id: number;
  workbook_id: number;
  name: string;
  position: number;
  frozen_rows: number;
  frozen_columns: number;
}

export type TextAlign = 'left' | 'center' | 'right';

// Частичный патч (как у backend CellFormatting): отсутствующее поле — не
// трогать, поле со значением null — явно сбросить. Используется и как
// "текущее форматирование ячейки" (тогда все заданные поля не-null), и как
// operation-патч при format_range.
export interface CellFormatting {
  bold?: boolean | null;
  italic?: boolean | null;
  align?: TextAlign | null;
  bg_color?: string | null;
  text_color?: string | null;
  number_format?: string | null;
}

export type ConditionOperator =
  | 'less_than' | 'greater_than' | 'equals' | 'contains' | 'is_empty' | 'is_not_empty';

export interface ConditionalFormatRule {
  operator: ConditionOperator;
  value: string | number;
  bg_color?: string | null;
  text_color?: string | null;
  bold?: boolean | null;
}

export interface ColumnConfig {
  conditional_formats?: ConditionalFormatRule[];
  [key: string]: unknown;
}

export interface ColumnOut {
  id: number;
  sheet_id: number;
  name: string;
  position: number;
  type: ColumnType;
  width: number;
  config: ColumnConfig;
}

export interface CellSnapshot {
  value: CellValue;
  formula: string | null; // исходный текст формулы (с '='), если ячейка формульная
  formatting: CellFormatting;
  metadata?: SmartLinkMetadata | Record<string, unknown>;
}

export interface RowOut {
  id: number;
  sheet_id: number;
  position: number;
  height: number;
  cells: Record<string, CellSnapshot>; // columnId(string) -> {value, formatting}
}

export interface SheetDetail {
  sheet: SheetSummary;
  columns: ColumnOut[];
  rows: RowOut[];
}

// ── SpreadsheetOperation (Phase 1 + Phase 2, discriminated union) ──

// Одна ячейка диапазона вставки: ровно одно из value/formula (см. backend
// PasteCell). pустая строка clipboard-ячейки превращается в {value: null}
// (явная очистка), а не отсутствие записи.
export type PasteCell = { value: CellValue; formula?: undefined } | { formula: string; value?: undefined };

export type SpreadsheetOperation =
  | { type: 'insert_row'; after_row_id: number | null }
  | { type: 'delete_row'; row_id: number }
  | { type: 'resize_row'; row_id: number; height: number }
  | { type: 'insert_column'; after_column_id: number | null; name: string; column_type: ColumnType }
  | { type: 'delete_column'; column_id: number }
  | { type: 'resize_column'; column_id: number; width: number }
  | { type: 'set_cell'; row_id: number; column_id: number; value: CellValue }
  | { type: 'set_formula'; row_id: number; column_id: number; formula: string }
  | { type: 'set_smart_link'; row_id: number; column_id: number; label: string; target: SmartLinkTarget }
  | { type: 'format_range'; row_ids: number[]; column_ids: number[]; formatting: CellFormatting }
  | { type: 'set_conditional_format'; column_id: number; rules: ConditionalFormatRule[] }
  | { type: 'sort_rows'; column_id: number; direction: 'asc' | 'desc' }
  | { type: 'paste_range'; anchor_row_id: number; anchor_column_id: number; cells: PasteCell[][] };

export interface OperationResult {
  sheet: SheetDetail;
  applied: number;
}

export interface OperationLogEntry {
  id: number;
  user_id: number;
  operation: Record<string, unknown>;
  created_at: string;
}

// ── AI (Phase 5) ────────────────────────────────────────────────
// AI не имеет отдельного write-пути: "безопасные" действия executor применяет
// сразу на сервере (видно в applied[]); деструктивные — только превью (pending),
// применяет их тот же applyOperations(), что и обычный ввод пользователя.

export interface AiAppliedSummary {
  action: string;
  description: string;
}

export interface AiPendingAction {
  description: string;
  ops: SpreadsheetOperation[];
  affected_rows: number;
}

export interface AiCommandResponse {
  mode: 'answer' | 'actions';
  answer?: string | null;
  applied: AiAppliedSummary[];
  pending?: AiPendingAction | null;
  sheet: SheetDetail;
}
