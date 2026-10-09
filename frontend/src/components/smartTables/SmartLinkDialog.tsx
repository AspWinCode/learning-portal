import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  FormControlLabel, InputLabel, MenuItem, Radio, RadioGroup, Select, TextField,
} from '@mui/material';
import { smartTablesApi } from '../../services/api/smartTables';
import type {
  CellSnapshot, SheetDetail, SheetSummary, SmartLinkMetadata, SmartLinkTarget, Workbook,
} from '../../types/smartTables';

interface SmartLinkDialogProps {
  open: boolean;
  currentWorkbookId: number;
  snapshot?: CellSnapshot;
  onClose: () => void;
  onSave: (label: string, target: SmartLinkTarget) => void;
}

function columnLetters(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function cellAddress(detail: SheetDetail, rowId?: number | null, columnId?: number | null): string {
  if (rowId == null || columnId == null) return '';
  const rowIndex = detail.rows.findIndex((row) => row.id === rowId);
  const columnIndex = detail.columns.findIndex((column) => column.id === columnId);
  return rowIndex >= 0 && columnIndex >= 0 ? `${columnLetters(columnIndex)}${rowIndex + 1}` : '';
}

function resolveAddress(detail: SheetDetail, address: string): { rowId: number; columnId: number } | null {
  const match = /^([A-Za-z]+)([1-9]\d*)$/.exec(address.trim());
  if (!match) return null;
  const columnIndex = match[1].toUpperCase().split('').reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const rowIndex = Number(match[2]) - 1;
  const row = detail.rows[rowIndex];
  const column = detail.columns[columnIndex];
  return row && column ? { rowId: row.id, columnId: column.id } : null;
}

const SmartLinkDialog: React.FC<SmartLinkDialogProps> = ({
  open, currentWorkbookId, snapshot, onClose, onSave,
}) => {
  const existing = snapshot?.metadata?.type === 'smart_link'
    ? (snapshot.metadata as SmartLinkMetadata).target
    : null;
  const [label, setLabel] = useState('Открыть');
  const [kind, setKind] = useState<'smart_table' | 'external_url'>('smart_table');
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [workbookId, setWorkbookId] = useState<number>(currentWorkbookId);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [sheetId, setSheetId] = useState<number | ''>('');
  const [useCell, setUseCell] = useState(false);
  const [address, setAddress] = useState('');
  const [sheetDetail, setSheetDetail] = useState<SheetDetail | null>(null);
  const [url, setUrl] = useState('https://');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLabel(String(snapshot?.value || 'Открыть'));
    setKind(existing?.type || 'smart_table');
    setWorkbookId(existing?.type === 'smart_table' ? existing.workbook_id : currentWorkbookId);
    setSheetId(existing?.type === 'smart_table' && existing.sheet_id ? existing.sheet_id : '');
    setUseCell(existing?.type === 'smart_table' && existing.row_id != null && existing.column_id != null);
    setUrl(existing?.type === 'external_url' ? existing.url : 'https://');
    setAddress('');
    setSheetDetail(null);
    setError('');
    smartTablesApi.listWorkbooks().then(setWorkbooks).catch(() => setError('Не удалось загрузить доступные таблицы'));
  }, [open, currentWorkbookId, snapshot]);

  useEffect(() => {
    if (!open || kind !== 'smart_table') return;
    smartTablesApi.listSheets(workbookId).then(setSheets).catch(() => {
      setSheets([]);
      setError('У вас нет доступа к этой таблице');
    });
  }, [open, kind, workbookId]);

  useEffect(() => {
    if (!open || kind !== 'smart_table' || sheetId === '') {
      setSheetDetail(null);
      return;
    }
    smartTablesApi.getSheet(sheetId).then((detail) => {
      setSheetDetail(detail);
      if (existing?.type === 'smart_table' && existing.sheet_id === sheetId) {
        setAddress(cellAddress(detail, existing.row_id, existing.column_id));
      }
    }).catch(() => setError('Лист больше не существует или недоступен'));
  }, [open, kind, sheetId]);

  const validExternal = useMemo(() => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, [url]);

  const submit = () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) { setError('Введите текст кнопки'); return; }
    if (kind === 'external_url') {
      if (!validExternal) { setError('Разрешены только абсолютные http/https ссылки'); return; }
      onSave(trimmedLabel, { type: 'external_url', url: url.trim() });
      return;
    }
    if (useCell) {
      if (sheetId === '' || !sheetDetail) { setError('Выберите лист'); return; }
      const resolved = resolveAddress(sheetDetail, address);
      if (!resolved) { setError('Ячейка не найдена. Используйте адрес вроде D27'); return; }
      onSave(trimmedLabel, {
        type: 'smart_table', workbook_id: workbookId, sheet_id: sheetId,
        row_id: resolved.rowId, column_id: resolved.columnId,
      });
      return;
    }
    onSave(trimmedLabel, {
      type: 'smart_table', workbook_id: workbookId,
      ...(sheetId === '' ? {} : { sheet_id: sheetId }),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Умная ссылка</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mt: 1, mb: 1 }}>{error}</Alert>}
        <TextField
          autoFocus fullWidth label="Текст кнопки" value={label}
          onChange={(event) => setLabel(event.target.value)} sx={{ mt: 1, mb: 2 }}
        />
        <RadioGroup row value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          <FormControlLabel value="smart_table" control={<Radio />} label="Умные таблицы" />
          <FormControlLabel value="external_url" control={<Radio />} label="Внешняя ссылка" />
        </RadioGroup>
        {kind === 'external_url' ? (
          <TextField fullWidth label="URL" value={url} onChange={(event) => setUrl(event.target.value)} sx={{ mt: 1 }} />
        ) : (
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Таблица</InputLabel>
              <Select label="Таблица" value={workbookId} onChange={(event) => { setWorkbookId(Number(event.target.value)); setSheetId(''); }}>
                {workbooks.map((workbook) => <MenuItem key={workbook.id} value={workbook.id}>{workbook.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Лист</InputLabel>
              <Select label="Лист" value={sheetId} onChange={(event) => setSheetId(event.target.value === '' ? '' : Number(event.target.value))}>
                <MenuItem value=""><em>Только открыть таблицу</em></MenuItem>
                {sheets.map((sheet) => <MenuItem key={sheet.id} value={sheet.id}>{sheet.name}</MenuItem>)}
              </Select>
            </FormControl>
            <RadioGroup row value={useCell ? 'cell' : 'sheet'} onChange={(event) => setUseCell(event.target.value === 'cell')}>
              <FormControlLabel value="sheet" control={<Radio />} label="Открыть лист" />
              <FormControlLabel value="cell" control={<Radio />} label="Перейти к ячейке" disabled={sheetId === ''} />
            </RadioGroup>
            {useCell && <TextField label="Ячейка" placeholder="D27" value={address} onChange={(event) => setAddress(event.target.value)} />}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={submit}>Сохранить</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SmartLinkDialog;
