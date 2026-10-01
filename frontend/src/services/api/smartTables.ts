import { api } from './client';
import type {
  OperationResult,
  OperationLogEntry,
  SheetDetail,
  SheetSummary,
  SpreadsheetOperation,
  Workbook,
} from '../../types/smartTables';

const BASE = '/smart-tables';

export const smartTablesApi = {
  listWorkbooks: (): Promise<Workbook[]> =>
    api.get(`${BASE}/workbooks`).then(r => r.data),

  createWorkbook: (name: string): Promise<Workbook> =>
    api.post(`${BASE}/workbooks`, { name }).then(r => r.data),

  renameWorkbook: (workbookId: number, name: string): Promise<Workbook> =>
    api.patch(`${BASE}/workbooks/${workbookId}`, { name }).then(r => r.data),

  deleteWorkbook: (workbookId: number): Promise<void> =>
    api.delete(`${BASE}/workbooks/${workbookId}`),

  addMember: (workbookId: number, userId: number, role: 'owner' | 'editor' | 'viewer'): Promise<void> =>
    api.post(`${BASE}/workbooks/${workbookId}/members`, { user_id: userId, role }).then(r => r.data),

  listSheets: (workbookId: number): Promise<SheetSummary[]> =>
    api.get(`${BASE}/workbooks/${workbookId}/sheets`).then(r => r.data),

  createSheet: (workbookId: number, name: string, afterSheetId?: number | null): Promise<SheetDetail> =>
    api.post(`${BASE}/workbooks/${workbookId}/sheets`, { name, after_sheet_id: afterSheetId ?? null }).then(r => r.data),

  renameSheet: (sheetId: number, name: string): Promise<SheetSummary> =>
    api.patch(`${BASE}/sheets/${sheetId}`, { name }).then(r => r.data),

  deleteSheet: (sheetId: number): Promise<void> =>
    api.delete(`${BASE}/sheets/${sheetId}`),

  getSheet: (sheetId: number): Promise<SheetDetail> =>
    api.get(`${BASE}/sheets/${sheetId}`).then(r => r.data),

  applyOperations: (sheetId: number, ops: SpreadsheetOperation[]): Promise<OperationResult> =>
    api.post(`${BASE}/sheets/${sheetId}/operations`, { ops }).then(r => r.data),

  undo: (sheetId: number): Promise<OperationResult> =>
    api.post(`${BASE}/sheets/${sheetId}/undo`).then(r => r.data),

  listOperations: (sheetId: number, limit = 100): Promise<OperationLogEntry[]> =>
    api.get(`${BASE}/sheets/${sheetId}/operations`, { params: { limit } }).then(r => r.data),
};
