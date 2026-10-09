import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, AvatarGroup, Box, Button, Card, CardActionArea, CardContent, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UndoIcon from '@mui/icons-material/Undo';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Grid from '../components/smartTables/Grid';
import SmartLinkDialog from '../components/smartTables/SmartLinkDialog';
import AICommandBar from '../components/smartTables/AICommandBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FormDialog from '../components/ui/FormDialog';
import { smartTablesApi } from '../services/api/smartTables';
import { useSmartTableRealtime } from '../hooks/useSmartTableRealtime';
import type { ActiveCell } from '../components/smartTables/Grid';
import type { CellSnapshot, SheetDetail, SmartLinkTarget, Workbook } from '../types/smartTables';

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

interface WorkbookViewProps {
  workbook: Workbook;
  requestedSheetId: number | null;
  focusTarget: ActiveCell | null;
  onBack: () => void;
  onOpenSheet: (sheetId: number, focus?: ActiveCell | null, replace?: boolean) => void;
  onOpenWorkbook: (workbookId: number, sheetId?: number | null, focus?: ActiveCell | null) => void;
}

const WorkbookView: React.FC<WorkbookViewProps> = ({
  workbook, requestedSheetId, focusTarget, onBack, onOpenSheet, onOpenWorkbook,
}) => {
  const [sheets, setSheets] = useState<{ id: number; name: string }[]>([]);
  const [sheetsLoaded, setSheetsLoaded] = useState(false);
  const [activeSheetId, setActiveSheetId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SheetDetail | null>(null);
  const [error, setError] = useState('');
  const [targetError, setTargetError] = useState('');
  const [loading, setLoading] = useState(false);

  const canEdit = workbook.role !== 'viewer';
  const canDeleteSheet = workbook.role === 'owner';

  const [tabMenu, setTabMenu] = useState<{ anchor: HTMLElement; sheetId: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkEditor, setLinkEditor] = useState<{
    rowId: number;
    columnId: number;
    snapshot?: CellSnapshot;
  } | null>(null);

  const { presence, connected } = useSmartTableRealtime(activeSheetId, {
    onSheetUpdate: (sheet) => setDetail(sheet),
  });

  const loadSheets = useCallback(async () => {
    const list = await smartTablesApi.listSheets(workbook.id);
    setSheets(list.map((s) => ({ id: s.id, name: s.name })));
    if (requestedSheetId !== null) {
      if (list.some((sheet) => sheet.id === requestedSheetId)) {
        setActiveSheetId(requestedSheetId);
      } else {
        setActiveSheetId(null);
        setError('Лист больше не существует');
      }
    } else if (list.length) {
      setActiveSheetId(list[0].id);
      onOpenSheet(list[0].id, null, true);
    }
    setSheetsLoaded(true);
  }, [workbook.id, requestedSheetId, onOpenSheet]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  useEffect(() => {
    if (requestedSheetId !== null) setActiveSheetId(requestedSheetId);
  }, [requestedSheetId]);

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

  useEffect(() => {
    if (!detail || !focusTarget) {
      setTargetError('');
      return;
    }
    const rowExists = detail.rows.some((row) => row.id === focusTarget.rowId);
    const columnExists = detail.columns.some((column) => column.id === focusTarget.columnId);
    setTargetError(rowExists && columnExists ? '' : 'Целевая ячейка больше не существует');
  }, [detail, focusTarget]);

  const handleAddSheet = async () => {
    const sheet = await smartTablesApi.createSheet(workbook.id, `Лист ${sheets.length + 1}`);
    await loadSheets();
    setActiveSheetId(sheet.sheet.id);
    onOpenSheet(sheet.sheet.id);
  };

  const openRename = (sheet: { id: number; name: string }) => {
    setTabMenu(null);
    setRenameTarget(sheet);
    setRenameValue(sheet.name);
    setRenameError('');
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameError('Введите название'); return; }
    if (trimmed.length > 255) { setRenameError('Название слишком длинное (максимум 255 символов)'); return; }
    const duplicate = sheets.some((s) => s.id !== renameTarget.id && s.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setRenameError('Лист с таким названием уже существует'); return; }
    setRenaming(true);
    try {
      await smartTablesApi.renameSheet(renameTarget.id, trimmed);
      setSheets((prev) => prev.map((s) => (s.id === renameTarget.id ? { ...s, name: trimmed } : s)));
      setRenameTarget(null);
    } catch (e: any) {
      setRenameError(e?.response?.data?.detail || 'Не удалось переименовать лист');
    } finally {
      setRenaming(false);
    }
  };

  const openDelete = (sheet: { id: number; name: string }) => {
    setTabMenu(null);
    setDeleteTarget(sheet);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await smartTablesApi.deleteSheet(deleteTarget.id);
      const oldIdx = sheets.findIndex((s) => s.id === deleteTarget.id);
      const remaining = sheets.filter((s) => s.id !== deleteTarget.id);
      setSheets(remaining);
      if (activeSheetId === deleteTarget.id) {
        const prevNeighbor = oldIdx > 0 ? sheets[oldIdx - 1] : null;
        const nextNeighbor = oldIdx < sheets.length - 1 ? sheets[oldIdx + 1] : null;
        const newActive = prevNeighbor ?? nextNeighbor ?? null;
        setActiveSheetId(newActive ? newActive.id : null);
        if (newActive) onOpenSheet(newActive.id);
        else onBack();
        if (!newActive) setDetail(null);
      }
      setDeleteTarget(null);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось удалить лист');
    } finally {
      setDeleting(false);
    }
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
      onOpenSheet(sheet.sheet.id);
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

  const handleOpenSmartLink = (target: SmartLinkTarget) => {
    if (target.type === 'external_url') {
      let parsed: URL;
      try { parsed = new URL(target.url); } catch { setError('Некорректная внешняя ссылка'); return; }
      if (!['http:', 'https:'].includes(parsed.protocol)) { setError('Разрешены только http/https ссылки'); return; }
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
      return;
    }
    onOpenWorkbook(
      target.workbook_id,
      target.sheet_id,
      target.row_id != null && target.column_id != null
        ? { rowId: target.row_id, columnId: target.column_id }
        : null,
    );
  };

  const saveSmartLink = async (label: string, target: SmartLinkTarget) => {
    if (!linkEditor) return;
    await withOps([{
      type: 'set_smart_link', row_id: linkEditor.rowId, column_id: linkEditor.columnId, label, target,
    }]);
    setLinkEditor(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
        <Typography variant="h5">{workbook.name}</Typography>
        <Box sx={{ flex: 1 }} />
        {presence.length > 0 && (
          <Tooltip title={connected ? presence.map((u) => u.name).join(', ') : 'Соединение восстанавливается…'}>
            <AvatarGroup max={5} sx={{ mr: 1, '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 13 } }}>
              {presence.map((u) => (
                <Avatar key={u.id} sx={{ bgcolor: connected ? 'primary.main' : 'grey.400' }}>
                  {u.name.slice(0, 1).toUpperCase()}
                </Avatar>
              ))}
            </AvatarGroup>
          </Tooltip>
        )}
        <Button startIcon={<UndoIcon />} onClick={handleUndo}>Отменить</Button>
      </Box>

      {sheets.length > 0 && (
        <Tabs value={activeSheetId ?? false} onChange={(_, v) => { setActiveSheetId(v); onOpenSheet(v); }} sx={{ mb: 1 }}>
          {sheets.map((s) => (
            <Tab
              key={s.id}
              value={s.id}
              onDoubleClick={() => { if (canEdit) openRename(s); }}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{s.name}</span>
                  {canEdit && (
                    <IconButton
                      size="small"
                      component="span"
                      sx={{ p: 0.25 }}
                      onClick={(e) => { e.stopPropagation(); setTabMenu({ anchor: e.currentTarget, sheetId: s.id }); }}
                    >
                      <MoreVertIcon fontSize="inherit" />
                    </IconButton>
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>
      )}
      <Menu open={!!tabMenu} anchorEl={tabMenu?.anchor} onClose={() => setTabMenu(null)}>
        <MenuItem onClick={() => { const s = sheets.find((x) => x.id === tabMenu?.sheetId); if (s) openRename(s); }}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} /> Переименовать
        </MenuItem>
        {canDeleteSheet && (
          <MenuItem onClick={() => { const s = sheets.find((x) => x.id === tabMenu?.sheetId); if (s) openDelete(s); }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Удалить
          </MenuItem>
        )}
      </Menu>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {canEdit && <Button size="small" startIcon={<AddIcon />} onClick={handleAddSheet}>Добавить лист</Button>}
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
      {targetError && <Alert severity="warning" sx={{ mb: 2 }}>{targetError}</Alert>}

      {activeSheetId !== null && <AICommandBar sheetId={activeSheetId} onSheetUpdated={setDetail} />}

      {!sheetsLoaded ? (
        <CircularProgress />
      ) : sheets.length === 0 ? (
        <Typography color="text.secondary">
          В этой таблице пока нет ни одного листа. Нажмите «Добавить лист» выше, чтобы начать.
        </Typography>
      ) : loading || !detail ? (
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
          onResizeColumn={(columnId, width) => withOps([{ type: 'resize_column', column_id: columnId, width }])}
          onResizeRow={(rowId, height) => withOps([{ type: 'resize_row', row_id: rowId, height }])}
          onFormatRange={(rowIds, columnIds, formatting) =>
            withOps([{ type: 'format_range', row_ids: rowIds, column_ids: columnIds, formatting }])}
          onSetConditionalFormat={(columnId, rules) =>
            withOps([{ type: 'set_conditional_format', column_id: columnId, rules }])}
          onSortColumn={(columnId, direction) => withOps([{ type: 'sort_rows', column_id: columnId, direction }])}
          onPasteRange={(anchorRowId, anchorColumnId, cells) =>
            withOps([{ type: 'paste_range', anchor_row_id: anchorRowId, anchor_column_id: anchorColumnId, cells }])}
          focusTarget={focusTarget}
          onOpenSmartLink={handleOpenSmartLink}
          onEditSmartLink={(rowId, columnId, snapshot) => setLinkEditor({ rowId, columnId, snapshot })}
          onClearSmartLink={(rowId, columnId) =>
            withOps([{ type: 'set_cell', row_id: rowId, column_id: columnId, value: null }])}
          readOnly={!canEdit}
        />
      )}

      <SmartLinkDialog
        open={!!linkEditor}
        currentWorkbookId={workbook.id}
        snapshot={linkEditor?.snapshot}
        onClose={() => setLinkEditor(null)}
        onSave={saveSmartLink}
      />

      <FormDialog
        open={!!renameTarget}
        title="Переименовать лист"
        onClose={() => setRenameTarget(null)}
        onSubmit={submitRename}
        submitLabel="Сохранить"
        submitDisabled={renaming}
      >
        <TextField
          autoFocus fullWidth label="Название" value={renameValue}
          onChange={(e) => { setRenameValue(e.target.value); setRenameError(''); }}
          error={!!renameError}
          helperText={renameError}
          sx={{ mt: 1 }}
        />
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Удалить лист «${deleteTarget?.name ?? ''}»?`}
        description="Все данные этого листа будут удалены. Это действие нельзя отменить обычной кнопкой «Отменить»."
        confirmLabel={deleting ? 'Удаляю…' : 'Удалить'}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
      />
    </Box>
  );
};

const SmartTablesPage: React.FC = () => {
  const navigate = useNavigate();
  const { workbookId: workbookIdParam, sheetId: sheetIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const [openWorkbook, setOpenWorkbook] = useState<Workbook | null>(null);
  const [loadingWorkbook, setLoadingWorkbook] = useState(false);
  const [routeError, setRouteError] = useState('');
  const workbookId = workbookIdParam ? Number(workbookIdParam) : null;
  const sheetId = sheetIdParam ? Number(sheetIdParam) : null;
  const rowId = searchParams.get('row') ? Number(searchParams.get('row')) : null;
  const columnId = searchParams.get('column') ? Number(searchParams.get('column')) : null;
  const focusTarget = Number.isFinite(rowId) && Number.isFinite(columnId) && rowId !== null && columnId !== null
    ? { rowId, columnId }
    : null;

  useEffect(() => {
    if (workbookId === null || !Number.isFinite(workbookId)) {
      setOpenWorkbook(null);
      setRouteError('');
      return;
    }
    setLoadingWorkbook(true);
    smartTablesApi.listWorkbooks().then((workbooks) => {
      const workbook = workbooks.find((item) => item.id === workbookId) || null;
      setOpenWorkbook(workbook);
      setRouteError(workbook ? '' : 'Таблица удалена или недоступна');
    }).catch(() => {
      setOpenWorkbook(null);
      setRouteError('У вас нет доступа к этой таблице');
    }).finally(() => setLoadingWorkbook(false));
  }, [workbookId]);

  const openSheet = useCallback((nextSheetId: number, focus: ActiveCell | null = null, replace = false) => {
    if (workbookId === null) return;
    const query = focus ? `?row=${focus.rowId}&column=${focus.columnId}` : '';
    navigate(`/smart-tables/${workbookId}/sheets/${nextSheetId}${query}`, { replace });
  }, [navigate, workbookId]);

  const openTarget = useCallback((targetWorkbookId: number, targetSheetId?: number | null, focus?: ActiveCell | null) => {
    if (!targetSheetId) {
      navigate(`/smart-tables/${targetWorkbookId}`);
      return;
    }
    const query = focus ? `?row=${focus.rowId}&column=${focus.columnId}` : '';
    navigate(`/smart-tables/${targetWorkbookId}/sheets/${targetSheetId}${query}`);
  }, [navigate]);

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        {routeError ? (
          <Alert severity="warning">{routeError}</Alert>
        ) : loadingWorkbook ? (
          <CircularProgress />
        ) : openWorkbook ? (
          <WorkbookView
            workbook={openWorkbook}
            requestedSheetId={sheetId}
            focusTarget={focusTarget}
            onBack={() => navigate('/smart-tables')}
            onOpenSheet={openSheet}
            onOpenWorkbook={openTarget}
          />
        ) : (
          <WorkbookList onOpen={(workbook) => navigate(`/smart-tables/${workbook.id}`)} />
        )}
      </Box>
    </Layout>
  );
};

export default SmartTablesPage;
