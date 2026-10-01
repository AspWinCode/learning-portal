// Типы «Умных таблиц» — зеркало backend/app/schemas/smart_tables.py.
// Phase 1 (ядро грида) + Phase 2 (форматирование/sort/filter). См. docs/smart-tables-architecture.md.

export type ColumnType =
  | 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'multi_select' | 'formula' | 'ai';

export type CellValue = string | number | boolean | null;

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

export type ConditionOperator = 'less_than' | 'greater_than' | 'equals' | 'contains';

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
  formatting: CellFormatting;
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

export type SpreadsheetOperation =
  | { type: 'insert_row'; after_row_id: number | null }
  | { type: 'delete_row'; row_id: number }
  | { type: 'resize_row'; row_id: number; height: number }
  | { type: 'insert_column'; after_column_id: number | null; name: string; column_type: ColumnType }
  | { type: 'delete_column'; column_id: number }
  | { type: 'resize_column'; column_id: number; width: number }
  | { type: 'set_cell'; row_id: number; column_id: number; value: CellValue }
  | { type: 'format_range'; row_ids: number[]; column_ids: number[]; formatting: CellFormatting }
  | { type: 'set_conditional_format'; column_id: number; rules: ConditionalFormatRule[] }
  | { type: 'sort_rows'; column_id: number; direction: 'asc' | 'desc' };

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
