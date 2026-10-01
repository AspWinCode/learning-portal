import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Menu, MenuItem, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import type { ColumnOut, RowOut } from '../../types/smartTables';

// Ядро грида (Phase 1): собственная виртуализация без сторонних зависимостей
// (см. docs/smart-tables-architecture.md, раздел A — glide-data-grid как
// кандидат на замену, если понадобится более богатый движок). Рендерятся
// только строки, попадающие в видимое окно + буфер, остальные — placeholder
// высотой suma(height), чтобы scroll-контейнер держал правильный размер.

const ROW_HEADER_WIDTH = 44;
const OVERSCAN_PX = 300;

export interface ActiveCell {
  rowId: number;
  columnId: number;
}

interface GridProps {
  columns: ColumnOut[];
  rows: RowOut[];
  onSetCell: (rowId: number, columnId: number, value: string) => void;
  onInsertRow: (afterRowId: number | null) => void;
  onDeleteRow: (rowId: number) => void;
  onInsertColumn: (afterColumnId: number | null) => void;
  onDeleteColumn: (columnId: number) => void;
}

const Grid: React.FC<GridProps> = ({
  columns, rows, onSetCell, onInsertRow, onDeleteRow, onInsertColumn, onDeleteColumn,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const [active, setActive] = useState<ActiveCell | null>(null);
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [colMenu, setColMenu] = useState<{ anchor: HTMLElement; columnId: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; rowId: number } | null>(null);

  const sortedRows = rows; // уже отсортированы сервером по position
  const sortedColumns = columns;

  const rowOffsets = useMemo(() => {
    let acc = 0;
    return sortedRows.map((r) => {
      const top = acc;
      acc += r.height;
      return top;
    });
  }, [sortedRows]);
  const totalHeight = rowOffsets.length
    ? rowOffsets[rowOffsets.length - 1] + sortedRows[sortedRows.length - 1].height
    : 0;

  const { startIdx, endIdx } = useMemo(() => {
    const top = Math.max(0, scrollTop - OVERSCAN_PX);
    const bottom = scrollTop + viewportHeight + OVERSCAN_PX;
    let start = 0;
    while (start < rowOffsets.length && rowOffsets[start] + sortedRows[start].height < top) start++;
    let end = start;
    while (end < rowOffsets.length && rowOffsets[end] < bottom) end++;
    return { startIdx: start, endIdx: end };
  }, [scrollTop, viewportHeight, rowOffsets, sortedRows]);

  const visibleRows = sortedRows.slice(startIdx, endIdx);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  React.useEffect(() => {
    if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
  }, []);

  const commitEdit = useCallback(() => {
    if (active && editingValue !== null) {
      onSetCell(active.rowId, active.columnId, editingValue);
    }
    setEditingValue(null);
  }, [active, editingValue, onSetCell]);

  const moveActive = useCallback((dRow: number, dCol: number) => {
    setActive((prev) => {
      if (!prev) return prev;
      const rowIdx = sortedRows.findIndex((r) => r.id === prev.rowId);
      const colIdx = sortedColumns.findIndex((c) => c.id === prev.columnId);
      const nextRow = sortedRows[Math.min(Math.max(rowIdx + dRow, 0), sortedRows.length - 1)];
      const nextCol = sortedColumns[Math.min(Math.max(colIdx + dCol, 0), sortedColumns.length - 1)];
      if (!nextRow || !nextCol) return prev;
      return { rowId: nextRow.id, columnId: nextCol.id };
    });
  }, [sortedRows, sortedColumns]);

  const onCellKeyDown = useCallback((e: React.KeyboardEvent, row: RowOut, column: ColumnOut) => {
    if (editingValue !== null) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
        moveActive(1, 0);
      } else if (e.key === 'Escape') {
        setEditingValue(null);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveActive(-1, 0); break;
      case 'ArrowDown': e.preventDefault(); moveActive(1, 0); break;
      case 'ArrowLeft': e.preventDefault(); moveActive(0, -1); break;
      case 'ArrowRight': case 'Tab': e.preventDefault(); moveActive(0, 1); break;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        setEditingValue(String(row.cells[String(column.id)] ?? ''));
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        onSetCell(row.id, column.id, '');
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          setEditingValue(e.key);
        }
    }
  }, [editingValue, commitEdit, moveActive, onSetCell]);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {/* header row */}
      <Box sx={{ display: 'flex', bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ width: ROW_HEADER_WIDTH, flexShrink: 0 }} />
        {sortedColumns.map((col) => (
          <Box
            key={col.id}
            sx={{
              width: col.width, flexShrink: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', px: 1, py: 0.5, fontWeight: 600, fontSize: 13,
              borderRight: '1px solid', borderColor: 'divider',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
            <IconButton size="small" onClick={(e) => setColMenu({ anchor: e.currentTarget, columnId: col.id })}>
              <span style={{ fontSize: 10 }}>▾</span>
            </IconButton>
          </Box>
        ))}
        <IconButton size="small" onClick={() => onInsertColumn(sortedColumns[sortedColumns.length - 1]?.id ?? null)}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* body */}
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{ height: 520, overflow: 'auto', position: 'relative' }}
      >
        <Box sx={{ height: totalHeight, position: 'relative' }}>
          {visibleRows.map((row, i) => {
            const idx = startIdx + i;
            const top = rowOffsets[idx];
            return (
              <Box
                key={row.id}
                sx={{
                  position: 'absolute', top, left: 0, right: 0, height: row.height,
                  display: 'flex', borderBottom: '1px solid', borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    width: ROW_HEADER_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, color: 'text.secondary', bgcolor: 'grey.50',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => setRowMenu({ anchor: e.currentTarget, rowId: row.id })}
                >
                  {idx + 1}
                </Box>
                {sortedColumns.map((col) => {
                  const isActive = active?.rowId === row.id && active?.columnId === col.id;
                  const isEditing = isActive && editingValue !== null;
                  const value = row.cells[String(col.id)];
                  return (
                    <Box
                      key={col.id}
                      tabIndex={0}
                      onClick={() => setActive({ rowId: row.id, columnId: col.id })}
                      onDoubleClick={() => { setActive({ rowId: row.id, columnId: col.id }); setEditingValue(String(value ?? '')); }}
                      onKeyDown={(e) => onCellKeyDown(e, row, col)}
                      sx={{
                        width: col.width, flexShrink: 0, px: 1, display: 'flex', alignItems: 'center',
                        fontSize: 13, borderRight: '1px solid', borderColor: 'divider',
                        outline: isActive ? '2px solid' : 'none', outlineColor: 'primary.main',
                        outlineOffset: -2, bgcolor: isActive ? 'action.selected' : 'background.paper',
                        overflow: 'hidden',
                      }}
                    >
                      {isEditing ? (
                        <TextField
                          autoFocus
                          variant="standard"
                          fullWidth
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => { commitEdit(); }}
                          InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                        />
                      ) : (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {value === null || value === undefined ? '' : String(value)}
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

      <Box sx={{ p: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <IconButton size="small" onClick={() => onInsertRow(sortedRows[sortedRows.length - 1]?.id ?? null)}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      <Menu open={!!colMenu} anchorEl={colMenu?.anchor} onClose={() => setColMenu(null)}>
        <MenuItem
          onClick={() => { if (colMenu) onInsertColumn(colMenu.columnId); setColMenu(null); }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Вставить колонку справа
        </MenuItem>
        <MenuItem
          onClick={() => { if (colMenu) onDeleteColumn(colMenu.columnId); setColMenu(null); }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Удалить колонку
        </MenuItem>
      </Menu>

      <Menu open={!!rowMenu} anchorEl={rowMenu?.anchor} onClose={() => setRowMenu(null)}>
        <MenuItem
          onClick={() => { if (rowMenu) onInsertRow(rowMenu.rowId); setRowMenu(null); }}
        >
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> Вставить строку ниже
        </MenuItem>
        <MenuItem
          onClick={() => { if (rowMenu) onDeleteRow(rowMenu.rowId); setRowMenu(null); }}
        >
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Удалить строку
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Grid;
