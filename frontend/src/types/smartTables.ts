// Типы «Умных таблиц» — зеркало backend/app/schemas/smart_tables.py (Phase 1).
// См. docs/smart-tables-architecture.md.

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

export interface ColumnOut {
  id: number;
  sheet_id: number;
  name: string;
  position: number;
  type: ColumnType;
  width: number;
  config: Record<string, unknown>;
}

export interface RowOut {
  id: number;
  sheet_id: number;
  position: number;
  height: number;
  cells: Record<string, CellValue>; // columnId(string) -> computed value
}

export interface SheetDetail {
  sheet: SheetSummary;
  columns: ColumnOut[];
  rows: RowOut[];
}

// ── SpreadsheetOperation (подмножество Phase 1, discriminated union) ──

export type SpreadsheetOperation =
  | { type: 'insert_row'; after_row_id: number | null }
  | { type: 'delete_row'; row_id: number }
  | { type: 'resize_row'; row_id: number; height: number }
  | { type: 'insert_column'; after_column_id: number | null; name: string; column_type: ColumnType }
  | { type: 'delete_column'; column_id: number }
  | { type: 'resize_column'; column_id: number; width: number }
  | { type: 'set_cell'; row_id: number; column_id: number; value: CellValue };

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
