import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  MenuItem, Menu, Select, TextField, ToggleButton, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FilterListIcon from '@mui/icons-material/FilterList';
import RuleIcon from '@mui/icons-material/Rule';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import type {
  CellFormatting, CellSnapshot, CellValue, ColumnOut, ConditionOperator, ConditionalFormatRule, PasteCell, RowOut,
  SmartLinkMetadata, SmartLinkTarget, TextAlign,
} from '../../types/smartTables';
import { isFormulaError } from '../../types/smartTables';
import { MAX_PASTE_CELLS, buildPasteMatrix, parseClipboardText, toPasteCells, toTsv, totalCells } from './clipboard';

// Ядро грида (Phase 1) + форматирование/сортировка/фильтры (Phase 2):
// собственная виртуализация без сторонних зависимостей (см.
// docs/smart-tables-architecture.md, раздел A). Рендерятся только строки,
// попадающие в видимое окно + буфер.

const ROW_HEADER_WIDTH = 44;
const OVERSCAN_PX = 300;
const MIN_COLUMN_WIDTH = 40;
const MAX_COLUMN_WIDTH = 1000;
const MIN_ROW_HEIGHT = 16;
const MAX_ROW_HEIGHT = 500;
const DEFAULT_ROW_HEIGHT = 32;

const PALETTE = ['#ffffff', '#ffebee', '#fff3e0', '#fffde7', '#e8f5e9', '#e3f2fd', '#ede7f6', '#fafafa'];
const TEXT_PALETTE = ['#000000', '#c62828', '#ef6c00', '#2e7d32', '#1565c0', '#6a1b9a'];

export interface ActiveCell {
  rowId: number;
  columnId: number;
}

interface GridProps {
  columns: ColumnOut[];
  rows: RowOut[];
  onSetCell: (rowId: number, columnId: number, value: string) => void;
  onSetFormula: (rowId: number, columnId: number, formula: string) => void;
  onInsertRow: (afterRowId: number | null) => void;
  onDeleteRow: (rowId: number) => void;
  onInsertColumn: (afterColumnId: number | null) => void;
  onDeleteColumn: (columnId: number) => void;
  onRenameColumn: (columnId: number, name: string) => void;
  onResizeColumn: (columnId: number, width: number) => void;
  onResizeRow: (rowId: number, height: number) => void;
  onFormatRange: (rowIds: number[], columnIds: number[], formatting: CellFormatting) => void;
  onSetConditionalFormat: (columnId: number, rules: ConditionalFormatRule[]) => void;
  onSortColumn: (columnId: number, direction: 'asc' | 'desc') => void;
  onPasteRange: (anchorRowId: number, anchorColumnId: number, cells: PasteCell[][]) => void;
  focusTarget?: ActiveCell | null;
  onOpenSmartLink: (target: SmartLinkTarget) => void;
  onEditSmartLink: (rowId: number, columnId: number, snapshot?: CellSnapshot) => void;
  onClearSmartLink: (rowId: number, columnId: number) => void;
  expanded?: boolean;
  readOnly?: boolean;
}

function cellStyleOf(value: CellValue, cellFormatting: CellFormatting | undefined, rules: ConditionalFormatRule[] | undefined): React.CSSProperties {
  const style: React.CSSProperties = {};
  const applyRuleStyle = (r: ConditionalFormatRule) => {
    if (r.bg_color) style.backgroundColor = r.bg_color;
    if (r.text_color) style.color = r.text_color;
    if (r.bold) style.fontWeight = 700;
  };
  if (rules && !isFormulaError(value)) {
    const isEmpty = value === null || value === undefined || value === '';
    for (const rule of rules) {
      const matches = (() => {
        switch (rule.operator) {
          case 'is_empty': return isEmpty;
          case 'is_not_empty': return !isEmpty;
          default: break;
        }
        if (isEmpty) return false;
        switch (rule.operator) {
          case 'less_than': return Number(value) < Number(rule.value);
          case 'greater_than': return Number(value) > Number(rule.value);
          case 'equals': return String(value) === String(rule.value);
          case 'contains': return String(value).toLowerCase().includes(String(rule.value).toLowerCase());
          default: return false;
        }
      })();
      if (matches) applyRuleStyle(rule);
    }
  }
  if (isFormulaError(value)) {
    style.color = '#c62828';
  }
  if (cellFormatting?.bold) style.fontWeight = 700;
  if (cellFormatting?.italic) style.fontStyle = 'italic';
  if (cellFormatting?.align) style.textAlign = cellFormatting.align;
  if (cellFormatting?.bg_color) style.backgroundColor = cellFormatting.bg_color;
  if (cellFormatting?.text_color) style.color = cellFormatting.text_color;
  return style;
}

// При входе в редактирование показываем текст формулы (если есть), а не
// вычисленный результат — иначе правка формульной ячейки стирала бы формулу.
function editSourceOf(snapshot: CellSnapshot | undefined): string {
  if (snapshot?.formula) return snapshot.formula;
  const v = snapshot?.value;
  if (v === null || v === undefined || isFormulaError(v)) return '';
  return String(v);
}

function displayOf(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (isFormulaError(value)) return value.error;
  return String(value);
}

function smartLinkOf(snapshot: CellSnapshot | undefined): SmartLinkMetadata | null {
  const metadata = snapshot?.metadata;
  if (!metadata || metadata.type !== 'smart_link' || !('target' in metadata)) return null;
  return metadata as SmartLinkMetadata;
}

function smartLinkAddress(target: SmartLinkTarget): string {
  if (target.type === 'external_url') return target.url;
  const base = `/smart-tables/${target.workbook_id}`;
  if (!target.sheet_id) return base;
  const sheet = `${base}/sheets/${target.sheet_id}`;
  if (target.row_id == null || target.column_id == null) return sheet;
  return `${sheet}?row=${target.row_id}&column=${target.column_id}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function measureTextWidth(text: string, font = '13px Arial'): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const Grid: React.FC<GridProps> = ({
  columns, rows, onSetCell, onSetFormula, onInsertRow, onDeleteRow, onInsertColumn, onDeleteColumn, onRenameColumn,
  onResizeColumn, onResizeRow, onFormatRange, onSetConditionalFormat, onSortColumn, onPasteRange,
  focusTarget = null, onOpenSmartLink, onEditSmartLink, onClearSmartLink, expanded = false, readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextBlurCommitRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const [anchor, setAnchor] = useState<ActiveCell | null>(null);
  const [focus, setFocus] = useState<ActiveCell | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [resizing, setResizing] = useState<
    | { kind: 'column'; id: number; start: number; initial: number; current: number }
    | { kind: 'row'; id: number; start: number; initial: number; current: number }
    | null
  >(null);
  const [columnPreview, setColumnPreview] = useState<Record<number, number>>({});
  const [rowPreview, setRowPreview] = useState<Record<number, number>>({});
  const [colMenu, setColMenu] = useState<{ anchor: HTMLElement; columnId: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; rowId: number } | null>(null);
  const [cellMenu, setCellMenu] = useState<{ anchor: HTMLElement; rowId: number; columnId: number } | null>(null);
  const [highlightCell, setHighlightCell] = useState<ActiveCell | null>(null);
  const [renameColumn, setRenameColumn] = useState<{ id: number; name: string } | null>(null);
  const [renameColumnError, setRenameColumnError] = useState('');
  const [condFormatColumnId, setCondFormatColumnId] = useState<number | null>(null);
  const [condRules, setCondRules] = useState<ConditionalFormatRule[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [colorMenu, setColorMenu] = useState<{ anchor: HTMLElement; mode: 'bg' | 'text' } | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const active = focus;

  const sortedColumns = columns;
  const columnWidthOf = useCallback((column: ColumnOut) => columnPreview[column.id] ?? column.width, [columnPreview]);
  const rowHeightOf = useCallback((row: RowOut) => rowPreview[row.id] ?? row.height, [rowPreview]);
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim() !== '');
    if (activeFilters.length === 0) return rows;
    return rows.filter((row) =>
      activeFilters.every(([colId, needle]) => {
        const v = row.cells[colId]?.value;
        return String(v ?? '').toLowerCase().includes(needle.toLowerCase());
      }));
  }, [rows, filters]);

  const rowOffsets = useMemo(() => {
    let acc = 0;
    return filteredRows.map((r) => {
      const top = acc;
      acc += rowHeightOf(r);
      return top;
    });
  }, [filteredRows, rowHeightOf]);
  const totalHeight = rowOffsets.length
    ? rowOffsets[rowOffsets.length - 1] + rowHeightOf(filteredRows[filteredRows.length - 1])
    : 0;

  const { startIdx, endIdx } = useMemo(() => {
    const top = Math.max(0, scrollTop - OVERSCAN_PX);
    const bottom = scrollTop + viewportHeight + OVERSCAN_PX;
    let start = 0;
    while (start < rowOffsets.length && rowOffsets[start] + rowHeightOf(filteredRows[start]) < top) start++;
    let end = start;
    while (end < rowOffsets.length && rowOffsets[end] < bottom) end++;
    return { startIdx: start, endIdx: end };
  }, [scrollTop, viewportHeight, rowOffsets, filteredRows, rowHeightOf]);

  const visibleRows = filteredRows.slice(startIdx, endIdx);

  useEffect(() => {
    if (!focusTarget) return;
    if (Object.values(filters).some((value) => value.trim() !== '')) {
      setFilters({});
      return;
    }
    const rowIndex = filteredRows.findIndex((row) => row.id === focusTarget.rowId);
    const columnIndex = sortedColumns.findIndex((column) => column.id === focusTarget.columnId);
    if (rowIndex < 0 || columnIndex < 0) return;
    const cell = { rowId: focusTarget.rowId, columnId: focusTarget.columnId };
    setAnchor(cell);
    setFocus(cell);
    setHighlightCell(cell);
    const left = sortedColumns.slice(0, columnIndex).reduce((sum, column) => sum + columnWidthOf(column), 0);
    const container = containerRef.current;
    if (container) {
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: rowOffsets[rowIndex], left, behavior: 'smooth' });
      } else {
        container.scrollTop = rowOffsets[rowIndex];
        container.scrollLeft = left;
      }
    }
    const timer = window.setTimeout(() => setHighlightCell(null), 1800);
    return () => window.clearTimeout(timer);
  }, [focusTarget?.rowId, focusTarget?.columnId, filteredRows, sortedColumns, rowOffsets, filters, columnWidthOf]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
  }, []);

  useEffect(() => {
    setColumnPreview({});
  }, [columns]);

  useEffect(() => {
    setRowPreview({});
  }, [rows]);

  useEffect(() => {
    const stop = () => setIsDragging(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  useEffect(() => {
    if (!resizing) return undefined;
    const move = (e: MouseEvent) => {
      if (resizing.kind === 'column') {
        const next = clamp(resizing.initial + e.clientX - resizing.start, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
        setColumnPreview((prev) => ({ ...prev, [resizing.id]: next }));
        setResizing((prev) => prev && prev.kind === 'column' ? { ...prev, current: next } : prev);
      } else {
        const next = clamp(resizing.initial + e.clientY - resizing.start, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
        setRowPreview((prev) => ({ ...prev, [resizing.id]: next }));
        setResizing((prev) => prev && prev.kind === 'row' ? { ...prev, current: next } : prev);
      }
    };
    const up = () => {
      setResizing((prev) => {
        if (!prev) return null;
        if (prev.kind === 'column' && prev.current !== prev.initial) onResizeColumn(prev.id, prev.current);
        if (prev.kind === 'row' && prev.current !== prev.initial) onResizeRow(prev.id, prev.current);
        return null;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [resizing, onResizeColumn, onResizeRow]);

  const commitEdit = useCallback((skipNextBlur = false) => {
    if (readOnly) { setEditingValue(null); return; }
    if (focus && editingValue !== null) {
      if (editingValue.startsWith('=')) {
        onSetFormula(focus.rowId, focus.columnId, editingValue);
      } else {
        onSetCell(focus.rowId, focus.columnId, editingValue);
      }
    }
    if (skipNextBlur) skipNextBlurCommitRef.current = true;
    setEditingValue(null);
  }, [focus, editingValue, onSetCell, onSetFormula, readOnly]);

  const editCell = useCallback((row: RowOut, column: ColumnOut, seed?: string) => {
    setAnchor({ rowId: row.id, columnId: column.id });
    setFocus({ rowId: row.id, columnId: column.id });
    setEditingValue(seed ?? editSourceOf(row.cells[String(column.id)]));
  }, []);

  const moveActive = useCallback((dRow: number, dCol: number, extend: boolean) => {
    setFocus((prev) => {
      if (!prev) return prev;
      const rowIdx = filteredRows.findIndex((r) => r.id === prev.rowId);
      const colIdx = sortedColumns.findIndex((c) => c.id === prev.columnId);
      const nextRow = filteredRows[Math.min(Math.max(rowIdx + dRow, 0), filteredRows.length - 1)];
      const nextCol = sortedColumns[Math.min(Math.max(colIdx + dCol, 0), sortedColumns.length - 1)];
      if (!nextRow || !nextCol) return prev;
      const next = { rowId: nextRow.id, columnId: nextCol.id };
      if (!extend) setAnchor(next);
      return next;
    });
  }, [filteredRows, sortedColumns]);

  const selectionBounds = useMemo(() => {
    if (!anchor || !focus) return null;
    const rowIds = filteredRows.map((r) => r.id);
    const colIds = sortedColumns.map((c) => c.id);
    const r1 = rowIds.indexOf(anchor.rowId), r2 = rowIds.indexOf(focus.rowId);
    const c1 = colIds.indexOf(anchor.columnId), c2 = colIds.indexOf(focus.columnId);
    if (r1 === -1 || r2 === -1 || c1 === -1 || c2 === -1) return null;
    return {
      rowFrom: Math.min(r1, r2), rowTo: Math.max(r1, r2),
      colFrom: Math.min(c1, c2), colTo: Math.max(c1, c2),
    };
  }, [anchor, focus, filteredRows, sortedColumns]);

  const isSelected = useCallback((rowIdx: number, colIdx: number) => {
    if (!selectionBounds) return false;
    return rowIdx >= selectionBounds.rowFrom && rowIdx <= selectionBounds.rowTo
      && colIdx >= selectionBounds.colFrom && colIdx <= selectionBounds.colTo;
  }, [selectionBounds]);

  const selectedIds = useCallback(() => {
    if (!selectionBounds) return { rowIds: [] as number[], columnIds: [] as number[] };
    const rowIds = filteredRows.slice(selectionBounds.rowFrom, selectionBounds.rowTo + 1).map((r) => r.id);
    const columnIds = sortedColumns.slice(selectionBounds.colFrom, selectionBounds.colTo + 1).map((c) => c.id);
    return { rowIds, columnIds };
  }, [selectionBounds, filteredRows, sortedColumns]);

  const selectColumn = useCallback((columnId: number, extend: boolean) => {
    if (!filteredRows.length) return;
    const cell = { rowId: filteredRows[0].id, columnId };
    const last = { rowId: filteredRows[filteredRows.length - 1].id, columnId };
    if (!extend || !anchor) setAnchor(cell);
    setFocus(last);
  }, [anchor, filteredRows]);

  const selectRow = useCallback((rowId: number, extend: boolean) => {
    if (!sortedColumns.length) return;
    const cell = { rowId, columnId: sortedColumns[0].id };
    const last = { rowId, columnId: sortedColumns[sortedColumns.length - 1].id };
    if (!extend || !anchor) setAnchor(cell);
    setFocus(last);
  }, [anchor, sortedColumns]);

  const previousColumnId = useCallback((columnId: number): number | null => {
    const idx = sortedColumns.findIndex((c) => c.id === columnId);
    return idx > 0 ? sortedColumns[idx - 1].id : null;
  }, [sortedColumns]);

  const previousRowId = useCallback((rowId: number): number | null => {
    const idx = filteredRows.findIndex((r) => r.id === rowId);
    return idx > 0 ? filteredRows[idx - 1].id : null;
  }, [filteredRows]);

  const autoFitColumn = useCallback((column: ColumnOut) => {
    const headerWidth = measureTextWidth(column.name, '600 13px Arial');
    const maxCellWidth = filteredRows.slice(0, 1000).reduce((max, row) => {
      const text = displayOf(row.cells[String(column.id)]?.value);
      return Math.max(max, measureTextWidth(text, '13px Arial'));
    }, headerWidth);
    const width = clamp(maxCellWidth + 52, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
    setColumnPreview((prev) => ({ ...prev, [column.id]: width }));
    if (width !== column.width) onResizeColumn(column.id, width);
  }, [filteredRows, onResizeColumn]);

  const autoFitRow = useCallback((row: RowOut) => {
    const height = clamp(DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    setRowPreview((prev) => ({ ...prev, [row.id]: height }));
    if (height !== row.height) onResizeRow(row.id, height);
  }, [onResizeRow]);

  const applyFormat = useCallback((formatting: CellFormatting) => {
    if (readOnly) return;
    const { rowIds, columnIds } = selectedIds();
    if (rowIds.length && columnIds.length) onFormatRange(rowIds, columnIds, formatting);
  }, [selectedIds, onFormatRange, readOnly]);

  const pasteMatrixAt = useCallback((anchorRowId: number, anchorColumnId: number, cells: PasteCell[][]) => {
    const total = totalCells(cells);
    if (total > MAX_PASTE_CELLS) {
      setPasteError('Слишком большой диапазон для вставки');
      return;
    }
    setPasteError(null);
    onPasteRange(anchorRowId, anchorColumnId, cells);
  }, [onPasteRange]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (readOnly || editingValue !== null || !selectionBounds) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const parsed = parseClipboardText(text);
    const selRows = selectionBounds.rowTo - selectionBounds.rowFrom + 1;
    const selCols = selectionBounds.colTo - selectionBounds.colFrom + 1;
    const matrix = buildPasteMatrix(parsed, { rows: selRows, cols: selCols });
    const anchorRow = filteredRows[selectionBounds.rowFrom];
    const anchorColumn = sortedColumns[selectionBounds.colFrom];
    if (!anchorRow || !anchorColumn) return;
    pasteMatrixAt(anchorRow.id, anchorColumn.id, toPasteCells(matrix));
  }, [readOnly, editingValue, selectionBounds, filteredRows, sortedColumns, pasteMatrixAt]);

  const handleCopy = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (editingValue !== null || !selectionBounds) return;
    e.preventDefault();
    const rowSlice = filteredRows.slice(selectionBounds.rowFrom, selectionBounds.rowTo + 1);
    const colSlice = sortedColumns.slice(selectionBounds.colFrom, selectionBounds.colTo + 1);
    const matrix = rowSlice.map((row) => colSlice.map((col) => {
      const snapshot = row.cells[String(col.id)];
      return snapshot?.formula ?? displayOf(snapshot?.value ?? null);
    }));
    e.clipboardData.setData('text/plain', toTsv(matrix));
  }, [editingValue, selectionBounds, filteredRows, sortedColumns]);

  const activeCellFormatting: CellFormatting | undefined = useMemo(() => {
    if (!active) return undefined;
    const row = filteredRows.find((r) => r.id === active.rowId);
    return row?.cells[String(active.columnId)]?.formatting;
  }, [active, filteredRows]);

  const onCellMouseDown = useCallback((row: RowOut, column: ColumnOut, shiftKey: boolean) => {
    const cell = { rowId: row.id, columnId: column.id };
    if (editingValue !== null) commitEdit(true);
    if (shiftKey && anchor) {
      setFocus(cell);
    } else {
      setAnchor(cell);
      setFocus(cell);
      setIsDragging(true);
    }
  }, [anchor, editingValue, commitEdit]);

  const onCellMouseEnter = useCallback((row: RowOut, column: ColumnOut) => {
    if (isDragging) setFocus({ rowId: row.id, columnId: column.id });
  }, [isDragging]);

  const onCellKeyDown = useCallback((e: React.KeyboardEvent, row: RowOut, column: ColumnOut) => {
    if (editingValue !== null) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit(true);
        moveActive(1, 0, false);
      } else if (e.key === 'Escape') {
        skipNextBlurCommitRef.current = true;
        setEditingValue(null);
      }
      return;
    }
    const extend = e.shiftKey;
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveActive(-1, 0, extend); break;
      case 'ArrowDown': e.preventDefault(); moveActive(1, 0, extend); break;
      case 'ArrowLeft': e.preventDefault(); moveActive(0, -1, extend); break;
      case 'ArrowRight': e.preventDefault(); moveActive(0, 1, extend); break;
      case 'Tab': e.preventDefault(); moveActive(0, 1, false); break;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (readOnly) break;
        if (column.type === 'smart_link' || smartLinkOf(row.cells[String(column.id)])) {
          onEditSmartLink(row.id, column.id, row.cells[String(column.id)]);
        } else {
          setEditingValue(editSourceOf(row.cells[String(column.id)]));
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (readOnly) break;
        if (selectionBounds) {
          const selRows = selectionBounds.rowTo - selectionBounds.rowFrom + 1;
          const selCols = selectionBounds.colTo - selectionBounds.colFrom + 1;
          const anchorRow = filteredRows[selectionBounds.rowFrom];
          const anchorColumn = sortedColumns[selectionBounds.colFrom];
          if (anchorRow && anchorColumn) {
            const cells: PasteCell[][] = Array.from({ length: selRows }, () =>
              Array.from({ length: selCols }, (): PasteCell => ({ value: null })));
            pasteMatrixAt(anchorRow.id, anchorColumn.id, cells);
          }
        }
        break;
      case 'b': if (e.ctrlKey || e.metaKey) { e.preventDefault(); applyFormat({ bold: !activeCellFormatting?.bold }); } break;
      case 'i': if (e.ctrlKey || e.metaKey) { e.preventDefault(); applyFormat({ italic: !activeCellFormatting?.italic }); } break;
      default:
        if (readOnly) break;
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          editCell(row, column, e.key);
        }
    }
  }, [editingValue, commitEdit, moveActive, selectionBounds, selectedIds, applyFormat, activeCellFormatting,
    readOnly, filteredRows, sortedColumns, pasteMatrixAt, editCell, onEditSmartLink]);

  const openConditionalFormat = (columnId: number) => {
    const col = sortedColumns.find((c) => c.id === columnId);
    setCondRules(col?.config?.conditional_formats ? [...col.config.conditional_formats] : []);
    setCondFormatColumnId(columnId);
  };

  const saveConditionalFormat = () => {
    if (condFormatColumnId !== null) onSetConditionalFormat(condFormatColumnId, condRules);
    setCondFormatColumnId(null);
  };

  const openRenameColumn = (columnId: number) => {
    const column = columns.find((item) => item.id === columnId);
    if (!column) return;
    setRenameColumn({ id: column.id, name: column.name });
    setRenameColumnError('');
    setColMenu(null);
  };

  const saveColumnName = () => {
    if (!renameColumn) return;
    const name = renameColumn.name.trim();
    if (!name) { setRenameColumnError('Введите название колонки'); return; }
    if (name.length > 255) { setRenameColumnError('Название слишком длинное'); return; }
    onRenameColumn(renameColumn.id, name);
    setRenameColumn(null);
  };

  const hasSelection = !!selectionBounds;

  return (
    <Box
      sx={{
        border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
        ...(expanded ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}),
      }}
      onPaste={handlePaste}
      onCopy={handleCopy}
    >
      {pasteError && (
        <Alert severity="error" onClose={() => setPasteError(null)} sx={{ borderRadius: 0 }}>
          {pasteError}
        </Alert>
      )}
      {/* toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 0.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
        <Tooltip title="Жирный (Ctrl+B)">
          <span>
            <ToggleButton size="small" value="bold" selected={!!activeCellFormatting?.bold} disabled={!hasSelection || readOnly}
              onClick={() => applyFormat({ bold: !activeCellFormatting?.bold })}>
              <FormatBoldIcon fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Tooltip title="Курсив (Ctrl+I)">
          <span>
            <ToggleButton size="small" value="italic" selected={!!activeCellFormatting?.italic} disabled={!hasSelection || readOnly}
              onClick={() => applyFormat({ italic: !activeCellFormatting?.italic })}>
              <FormatItalicIcon fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
          <Tooltip key={align} title={`Выравнивание: ${align}`}>
            <span>
              <ToggleButton size="small" value={align} selected={activeCellFormatting?.align === align} disabled={!hasSelection || readOnly}
                onClick={() => applyFormat({ align })}>
                {align === 'left' ? <FormatAlignLeftIcon fontSize="small" /> : align === 'center' ? <FormatAlignCenterIcon fontSize="small" /> : <FormatAlignRightIcon fontSize="small" />}
              </ToggleButton>
            </span>
          </Tooltip>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Цвет фона">
          <span>
            <IconButton size="small" disabled={!hasSelection || readOnly} onClick={(e) => setColorMenu({ anchor: e.currentTarget, mode: 'bg' })}>
              <FormatColorFillIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Цвет текста">
          <span>
            <IconButton size="small" disabled={!hasSelection || readOnly} onClick={(e) => setColorMenu({ anchor: e.currentTarget, mode: 'text' })}>
              <FormatColorTextIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Очистить форматирование">
          <span>
            <IconButton size="small" disabled={!hasSelection || readOnly}
              onClick={() => applyFormat({ bold: null, italic: null, align: null, bg_color: null, text_color: null })}>
              <FormatClearIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Добавить или изменить умную ссылку">
          <span>
            <IconButton
              size="small"
              disabled={!active || readOnly}
              onClick={() => {
                if (!active) return;
                const row = rows.find((item) => item.id === active.rowId);
                onEditSmartLink(active.rowId, active.columnId, row?.cells[String(active.columnId)]);
              }}
            >
              <LinkIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Фильтры по колонкам">
          <IconButton size="small" color={filtersOpen ? 'primary' : 'default'} onClick={() => setFiltersOpen((v) => !v)}>
            <FilterListIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* header row */}
      <Box sx={{ display: 'flex', bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ width: ROW_HEADER_WIDTH, flexShrink: 0 }} />
        {sortedColumns.map((col) => (
          <Box
            key={col.id}
            onClick={(e) => selectColumn(col.id, e.shiftKey)}
            onDoubleClick={() => { if (!readOnly) openRenameColumn(col.id); }}
            onContextMenu={(e) => {
              e.preventDefault();
              selectColumn(col.id, e.shiftKey);
              if (!readOnly) setColMenu({ anchor: e.currentTarget, columnId: col.id });
            }}
            sx={{
              width: columnWidthOf(col), flexShrink: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', px: 1, py: 0.5, fontWeight: 600, fontSize: 13,
              borderRight: '1px solid', borderColor: 'divider', position: 'relative', cursor: 'default',
              bgcolor: selectionBounds && sortedColumns.indexOf(col) >= selectionBounds.colFrom && sortedColumns.indexOf(col) <= selectionBounds.colTo
                ? 'rgba(25, 118, 210, 0.12)'
                : undefined,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
            {!readOnly && (
              <>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setColMenu({ anchor: e.currentTarget, columnId: col.id }); }}>
                  <span style={{ fontSize: 10 }}>▾</span>
                </IconButton>
                <Box
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setResizing({ kind: 'column', id: col.id, start: e.clientX, initial: columnWidthOf(col), current: columnWidthOf(col) });
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    autoFitColumn(col);
                  }}
                  sx={{
                    position: 'absolute', top: 0, right: -4, width: 8, height: '100%',
                    cursor: 'col-resize', zIndex: 2,
                    '&:hover': { bgcolor: 'primary.main', opacity: 0.35 },
                  }}
                />
              </>
            )}
          </Box>
        ))}
        {!readOnly && (
          <IconButton size="small" onClick={() => onInsertColumn(sortedColumns[sortedColumns.length - 1]?.id ?? null)}>
            <AddIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* filter row */}
      {filtersOpen && (
        <Box sx={{ display: 'flex', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ width: ROW_HEADER_WIDTH, flexShrink: 0 }} />
          {sortedColumns.map((col) => (
            <Box key={col.id} sx={{ width: columnWidthOf(col), flexShrink: 0, px: 0.5, py: 0.5, borderRight: '1px solid', borderColor: 'divider' }}>
              <TextField
                size="small" variant="standard" placeholder="Фильтр…" fullWidth
                value={filters[col.id] ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, [col.id]: e.target.value }))}
                InputProps={{ disableUnderline: true, sx: { fontSize: 12 } }}
              />
            </Box>
          ))}
        </Box>
      )}

      {/* body */}
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          height: expanded ? 'auto' : 520,
          flex: expanded ? 1 : undefined,
          minHeight: expanded ? 240 : undefined,
          overflow: 'auto', position: 'relative',
        }}
      >
        <Box sx={{ height: totalHeight, position: 'relative' }}>
          {visibleRows.map((row, i) => {
            const idx = startIdx + i;
            const top = rowOffsets[idx];
            return (
              <Box
                key={row.id}
                sx={{
                  position: 'absolute', top, left: 0, right: 0, height: rowHeightOf(row),
                  display: 'flex', borderBottom: '1px solid', borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    width: ROW_HEADER_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, color: 'text.secondary', bgcolor: 'grey.50',
                    cursor: 'default', position: 'relative',
                    ...(selectionBounds && idx >= selectionBounds.rowFrom && idx <= selectionBounds.rowTo
                      ? { bgcolor: 'rgba(25, 118, 210, 0.12)', color: 'primary.main', fontWeight: 600 }
                      : {}),
                  }}
                  onClick={(e) => selectRow(row.id, e.shiftKey)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    selectRow(row.id, e.shiftKey);
                    if (!readOnly) setRowMenu({ anchor: e.currentTarget, rowId: row.id });
                  }}
                >
                  {idx + 1}
                  {!readOnly && (
                    <Box
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setResizing({ kind: 'row', id: row.id, start: e.clientY, initial: rowHeightOf(row), current: rowHeightOf(row) });
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        autoFitRow(row);
                      }}
                      sx={{
                        position: 'absolute', left: 0, bottom: -4, width: '100%', height: 8,
                        cursor: 'row-resize', zIndex: 2,
                        '&:hover': { bgcolor: 'primary.main', opacity: 0.35 },
                      }}
                    />
                  )}
                </Box>
                {sortedColumns.map((col, colIdx) => {
                  const isActive = active?.rowId === row.id && active?.columnId === col.id;
                  const isEditing = isActive && editingValue !== null;
                  const snapshot = row.cells[String(col.id)];
                  const smartLink = smartLinkOf(snapshot);
                  const value = snapshot?.value;
                  const selected = isSelected(idx, colIdx);
                  const rules = col.config?.conditional_formats;
                  const { backgroundColor, ...restStyle } = cellStyleOf(value, snapshot?.formatting, rules);
                  const finalBg = selected ? 'rgba(25, 118, 210, 0.16)' : (backgroundColor || undefined);
                  return (
                    <Box
                      key={col.id}
                      data-testid={`cell-${row.id}-${col.id}`}
                      aria-selected={isActive}
                      tabIndex={0}
                      onMouseDown={(e) => onCellMouseDown(row, col, e.shiftKey)}
                      onMouseEnter={() => onCellMouseEnter(row, col)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setAnchor({ rowId: row.id, columnId: col.id });
                        setFocus({ rowId: row.id, columnId: col.id });
                        setCellMenu({ anchor: e.currentTarget, rowId: row.id, columnId: col.id });
                      }}
                      onDoubleClick={() => {
                        if (readOnly) return;
                        if (smartLink || col.type === 'smart_link') onEditSmartLink(row.id, col.id, snapshot);
                        else editCell(row, col);
                      }}
                      onKeyDown={(e) => onCellKeyDown(e, row, col)}
                      sx={{
                        width: columnWidthOf(col), flexShrink: 0, px: 1, display: 'flex', alignItems: 'center',
                        fontSize: 13, borderRight: '1px solid', borderColor: 'divider',
                        outline: isActive ? '2px solid' : 'none',
                        outlineColor: highlightCell?.rowId === row.id && highlightCell?.columnId === col.id ? 'warning.main' : 'primary.main',
                        boxShadow: highlightCell?.rowId === row.id && highlightCell?.columnId === col.id
                          ? 'inset 0 0 0 3px rgba(237, 108, 2, 0.45)'
                          : undefined,
                        outlineOffset: -2, backgroundColor: finalBg ?? 'background.paper',
                        overflow: 'hidden', userSelect: isEditing ? 'text' : 'none', ...restStyle,
                      }}
                    >
                      {isEditing ? (
                        <TextField
                          autoFocus
                          variant="standard"
                          fullWidth
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              commitEdit(true);
                              moveActive(1, 0, false);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              skipNextBlurCommitRef.current = true;
                              setEditingValue(null);
                            } else {
                              e.stopPropagation();
                            }
                          }}
                          onBlur={() => {
                            if (skipNextBlurCommitRef.current) {
                              skipNextBlurCommitRef.current = false;
                              return;
                            }
                            commitEdit();
                          }}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 13, userSelect: 'text', cursor: 'text' } }}
                        />
                      ) : smartLink ? (
                        <Button
                          size="small"
                          variant="text"
                          endIcon={smartLink.target.type === 'external_url' ? <OpenInNewIcon fontSize="inherit" /> : undefined}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onOpenSmartLink(smartLink.target); }}
                          sx={{ minWidth: 0, px: 0.75, maxWidth: '100%', textTransform: 'none' }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayOf(value) || 'Открыть'}
                          </span>
                        </Button>
                      ) : (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: restStyle.textAlign }}>
                          {displayOf(value)}
                        </span>
                      )}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>

      {!readOnly && (
        <Box sx={{ p: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <IconButton size="small" onClick={() => onInsertRow(filteredRows[filteredRows.length - 1]?.id ?? null)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      <Menu open={!!colMenu} anchorEl={colMenu?.anchor} onClose={() => setColMenu(null)}>
        <MenuItem onClick={() => { if (colMenu) openRenameColumn(colMenu.columnId); }}>
          <DriveFileRenameOutlineIcon fontSize="small" sx={{ mr: 1 }} /> Переименовать колонку
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (colMenu) onInsertColumn(previousColumnId(colMenu.columnId)); setColMenu(null); }}>
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Вставить колонку слева
        </MenuItem>
        <MenuItem onClick={() => { if (colMenu) onInsertColumn(colMenu.columnId); setColMenu(null); }}>
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Вставить колонку справа
        </MenuItem>
        <MenuItem onClick={() => { if (colMenu) onDeleteColumn(colMenu.columnId); setColMenu(null); }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Удалить колонку
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (colMenu) onSortColumn(colMenu.columnId, 'asc'); setColMenu(null); }}>
          <ArrowUpwardIcon fontSize="small" sx={{ mr: 1 }} /> Сортировать по возрастанию
        </MenuItem>
        <MenuItem onClick={() => { if (colMenu) onSortColumn(colMenu.columnId, 'desc'); setColMenu(null); }}>
          <ArrowDownwardIcon fontSize="small" sx={{ mr: 1 }} /> Сортировать по убыванию
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (colMenu) openConditionalFormat(colMenu.columnId); setColMenu(null); }}>
          <RuleIcon fontSize="small" sx={{ mr: 1 }} /> Условное форматирование…
        </MenuItem>
      </Menu>

      <Menu open={!!rowMenu} anchorEl={rowMenu?.anchor} onClose={() => setRowMenu(null)}>
        <MenuItem onClick={() => { if (rowMenu) onInsertRow(previousRowId(rowMenu.rowId)); setRowMenu(null); }}>
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Вставить строку выше
        </MenuItem>
        <MenuItem onClick={() => { if (rowMenu) onInsertRow(rowMenu.rowId); setRowMenu(null); }}>
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Вставить строку ниже
        </MenuItem>
        <MenuItem onClick={() => { if (rowMenu) onDeleteRow(rowMenu.rowId); setRowMenu(null); }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Удалить строку
        </MenuItem>
      </Menu>

      <Menu open={!!cellMenu} anchorEl={cellMenu?.anchor} onClose={() => setCellMenu(null)}>
        {(() => {
          if (!cellMenu) return null;
          const row = rows.find((item) => item.id === cellMenu.rowId);
          const column = columns.find((item) => item.id === cellMenu.columnId);
          const snapshot = row?.cells[String(cellMenu.columnId)];
          const link = smartLinkOf(snapshot);
          return [
            link && (
              <MenuItem key="open" onClick={() => { onOpenSmartLink(link.target); setCellMenu(null); }}>
                <OpenInNewIcon fontSize="small" sx={{ mr: 1 }} /> Открыть ссылку
              </MenuItem>
            ),
            !readOnly && (
              <MenuItem key="edit" onClick={() => { onEditSmartLink(cellMenu.rowId, cellMenu.columnId, snapshot); setCellMenu(null); }}>
                <LinkIcon fontSize="small" sx={{ mr: 1 }} /> {link || column?.type === 'smart_link' ? 'Редактировать ссылку' : 'Добавить ссылку'}
              </MenuItem>
            ),
            link && !readOnly && (
              <MenuItem key="clear" onClick={() => { onClearSmartLink(cellMenu.rowId, cellMenu.columnId); setCellMenu(null); }}>
                <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Удалить ссылку
              </MenuItem>
            ),
            link && (
              <MenuItem key="copy" onClick={() => { navigator.clipboard?.writeText(smartLinkAddress(link.target)); setCellMenu(null); }}>
                Копировать адрес
              </MenuItem>
            ),
          ];
        })()}
      </Menu>

      <Menu open={!!colorMenu} anchorEl={colorMenu?.anchor} onClose={() => setColorMenu(null)}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, p: 1 }}>
          {(colorMenu?.mode === 'bg' ? PALETTE : TEXT_PALETTE).map((color) => (
            <Box
              key={color}
              onClick={() => {
                if (colorMenu?.mode === 'bg') applyFormat({ bg_color: color });
                else applyFormat({ text_color: color });
                setColorMenu(null);
              }}
              sx={{
                width: 24, height: 24, bgcolor: color, border: '1px solid', borderColor: 'divider',
                borderRadius: 0.5, cursor: 'pointer',
              }}
            />
          ))}
        </Box>
      </Menu>

      <Dialog open={!!renameColumn} onClose={() => setRenameColumn(null)} fullWidth maxWidth="xs">
        <DialogTitle>Переименовать колонку</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="Название" value={renameColumn?.name ?? ''}
            onChange={(event) => {
              setRenameColumn((current) => current ? { ...current, name: event.target.value } : current);
              setRenameColumnError('');
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') saveColumnName(); }}
            error={!!renameColumnError}
            helperText={renameColumnError}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameColumn(null)}>Отмена</Button>
          <Button variant="contained" onClick={saveColumnName}>Сохранить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={condFormatColumnId !== null} onClose={() => setCondFormatColumnId(null)} fullWidth maxWidth="sm">
        <DialogTitle>Условное форматирование</DialogTitle>
        <DialogContent>
          {condRules.map((rule, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <Select
                size="small" value={rule.operator}
                onChange={(e) => setCondRules((rs) => rs.map((r, j) => j === i ? { ...r, operator: e.target.value as ConditionOperator } : r))}
              >
                <MenuItem value="less_than">меньше чем</MenuItem>
                <MenuItem value="greater_than">больше чем</MenuItem>
                <MenuItem value="equals">равно</MenuItem>
                <MenuItem value="contains">содержит</MenuItem>
                <MenuItem value="is_empty">пусто</MenuItem>
                <MenuItem value="is_not_empty">не пусто</MenuItem>
              </Select>
              <TextField
                size="small" value={rule.value}
                onChange={(e) => setCondRules((rs) => rs.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
              />
              <Tooltip title="Цвет фона при совпадении">
                <input
                  type="color" value={rule.bg_color || '#ffeeee'}
                  onChange={(e) => setCondRules((rs) => rs.map((r, j) => j === i ? { ...r, bg_color: e.target.value } : r))}
                />
              </Tooltip>
              <IconButton size="small" onClick={() => setCondRules((rs) => rs.filter((_, j) => j !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <IconButton size="small" onClick={() => setCondRules((rs) => [...rs, { operator: 'less_than', value: 0, bg_color: '#ffeeee' }])}>
            <AddIcon fontSize="small" />
          </IconButton>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCondFormatColumnId(null)}>Отмена</Button>
          <Button variant="contained" onClick={saveConditionalFormat}>Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Grid;
