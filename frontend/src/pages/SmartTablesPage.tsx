import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Layout from '../components/Layout';
import Grid from '../components/smartTables/Grid';
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
      <Button size="small" startIcon={<AddIcon />} onClick={handleAddSheet} sx={{ mb: 2 }}>Добавить лист</Button>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading || !detail ? (
        <CircularProgress />
      ) : (
        <Grid
          columns={detail.columns}
          rows={detail.rows}
          onSetCell={(rowId, columnId, value) =>
            withOps([{ type: 'set_cell', row_id: rowId, column_id: columnId, value: value === '' ? null : value }])}
          onInsertRow={(afterRowId) => withOps([{ type: 'insert_row', after_row_id: afterRowId }])}
          onDeleteRow={(rowId) => withOps([{ type: 'delete_row', row_id: rowId }])}
          onInsertColumn={(afterColumnId) =>
            withOps([{ type: 'insert_column', after_column_id: afterColumnId, name: 'Новая колонка', column_type: 'text' }])}
          onDeleteColumn={(columnId) => withOps([{ type: 'delete_column', column_id: columnId }])}
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
