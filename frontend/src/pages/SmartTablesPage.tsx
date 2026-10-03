import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import Layout from '../components/Layout';
import Grid from '../components/smartTables/Grid';
import AICommandBar from '../components/smartTables/AICommandBar';
import { smartTablesApi } from '../services/api/smartTables';
import type { SheetDetail, Workbook } from '../types/smartTables';

// Phase 1 страница: список workbooks -> открыть workbook (листы + грид).
// Запись данных — только через applyOperations (OperationExecutor на бэке),
// см. docs/smart-tables-architecture.md.

const WorkbookList: React.FC<{ onOpen: (w: Workbook) => void }> = ({ onOpen }) => {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkbooks(await smartTablesApi.listWorkbooks());
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось загрузить таблицы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const wb = await smartTablesApi.createWorkbook(name.trim());
      setCreateOpen(false);
      setName('');
      await load();
      onOpen(wb);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось создать таблицу');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Умные таблицы</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
          Новая таблица
        </Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <CircularProgress />
      ) : workbooks.length === 0 ? (
        <Typography color="text.secondary">Пока нет ни одной таблицы.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
          {workbooks.map((w) => (
            <Card key={w.id}>
              <CardActionArea onClick={() => onOpen(w)}>
                <CardContent>
                  <Typography variant="subtitle1" noWrap>{w.name}</Typography>
                  <Typography variant="caption" color="text.secondary">роль: {w.role}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Новая таблица</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="Название" value={name}
            onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={creating || !name.trim()} onClick={handleCreate}>Создать</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const WorkbookView: React.FC<{ workbook: Workbook; onBack: () => void }> = ({ workbook, onBack }) => {
  const [sheets, setSheets] = useState<{ id: number; name: string }[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SheetDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSheets = useCallback(async () => {
    const list = await smartTablesApi.listSheets(workbook.id);
    setSheets(list.map((s) => ({ id: s.id, name: s.name })));
    if (list.length && activeSheetId === null) setActiveSheetId(list[0].id);
  }, [workbook.id, activeSheetId]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const loadSheetDetail = useCallback(async (sheetId: number) => {
    setLoading(true);
    try {
      setDetail(await smartTablesApi.getSheet(sheetId));
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось загрузить лист');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSheetId !== null) loadSheetDetail(activeSheetId);
  }, [activeSheetId, loadSheetDetail]);

  const handleAddSheet = async () => {
    const sheet = await smartTablesApi.createSheet(workbook.id, `Лист ${sheets.length + 1}`);
    await loadSheets();
    setActiveSheetId(sheet.sheet.id);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const sheet = await smartTablesApi.importFile(workbook.id, file);
      await loadSheets();
      setActiveSheetId(sheet.sheet.id);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Не удалось импортировать файл');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExportMenuAnchor(null);
    if (activeSheetId === null) return;
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    try {
      await smartTablesApi.exportFile(activeSheetId, format, `${activeSheet?.name || 'sheet'}.${format}`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Не удалось экспортировать лист');
    }
  };

  const withOps = useCallback(async (ops: Parameters<typeof smartTablesApi.applyOperations>[1]) => {
    if (activeSheetId === null) return;
    try {
      const result = await smartTablesApi.applyOperations(activeSheetId, ops);
      setDetail(result.sheet);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Операция не выполнена');
    }
  }, [activeSheetId]);

  const handleUndo = async () => {
    if (activeSheetId === null) return;
    try {
      const result = await smartTablesApi.undo(activeSheetId);
      setDetail(result.sheet);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Нечего отменять');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
        <Typography variant="h5">{workbook.name}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<UndoIcon />} onClick={handleUndo}>Отменить</Button>
      </Box>

      <Tabs value={activeSheetId ?? false} onChange={(_, v) => setActiveSheetId(v)} sx={{ mb: 1 }}>
        {sheets.map((s) => <Tab key={s.id} value={s.id} label={s.name} />)}
      </Tabs>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={handleAddSheet}>Добавить лист</Button>
        <Button
          size="small" startIcon={<UploadFileIcon />} disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? 'Импортирую…' : 'Импорт CSV/XLSX'}
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" hidden onChange={handleImportFile} />
        <Button
          size="small" startIcon={<DownloadIcon />} disabled={activeSheetId === null}
          onClick={(e) => setExportMenuAnchor(e.currentTarget)}
        >
          Экспорт
        </Button>
        <Menu open={!!exportMenuAnchor} anchorEl={exportMenuAnchor} onClose={() => setExportMenuAnchor(null)}>
          <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
          <MenuItem onClick={() => handleExport('xlsx')}>XLSX</MenuItem>
        </Menu>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {activeSheetId !== null && <AICommandBar sheetId={activeSheetId} onSheetUpdated={setDetail} />}

      {loading || !detail ? (
        <CircularProgress />
      ) : (
        <Grid
          columns={detail.columns}
          rows={detail.rows}
          onSetCell={(rowId, columnId, value) =>
            withOps([{ type: 'set_cell', row_id: rowId, column_id: columnId, value: value === '' ? null : value }])}
          onSetFormula={(rowId, columnId, formula) =>
            withOps([{ type: 'set_formula', row_id: rowId, column_id: columnId, formula }])}
          onInsertRow={(afterRowId) => withOps([{ type: 'insert_row', after_row_id: afterRowId }])}
          onDeleteRow={(rowId) => withOps([{ type: 'delete_row', row_id: rowId }])}
          onInsertColumn={(afterColumnId) =>
            withOps([{ type: 'insert_column', after_column_id: afterColumnId, name: 'Новая колонка', column_type: 'text' }])}
          onDeleteColumn={(columnId) => withOps([{ type: 'delete_column', column_id: columnId }])}
          onFormatRange={(rowIds, columnIds, formatting) =>
            withOps([{ type: 'format_range', row_ids: rowIds, column_ids: columnIds, formatting }])}
          onSetConditionalFormat={(columnId, rules) =>
            withOps([{ type: 'set_conditional_format', column_id: columnId, rules }])}
          onSortColumn={(columnId, direction) => withOps([{ type: 'sort_rows', column_id: columnId, direction }])}
        />
      )}
    </Box>
  );
};

const SmartTablesPage: React.FC = () => {
  const [openWorkbook, setOpenWorkbook] = useState<Workbook | null>(null);

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        {openWorkbook ? (
          <WorkbookView workbook={openWorkbook} onBack={() => setOpenWorkbook(null)} />
        ) : (
          <WorkbookList onOpen={setOpenWorkbook} />
        )}
      </Box>
    </Layout>
  );
};

export default SmartTablesPage;
