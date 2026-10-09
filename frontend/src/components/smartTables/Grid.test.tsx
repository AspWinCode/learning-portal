import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Grid from './Grid';
import type { ColumnOut, RowOut } from '../../types/smartTables';

const columns: ColumnOut[] = [
  { id: 10, sheet_id: 1, name: 'A', position: 0, type: 'text', width: 120, config: {} },
  { id: 11, sheet_id: 1, name: 'B', position: 1, type: 'text', width: 120, config: {} },
  { id: 12, sheet_id: 1, name: 'C', position: 2, type: 'text', width: 120, config: {} },
];

const rows: RowOut[] = [
  { id: 1, sheet_id: 1, position: 0, height: 32, cells: {} },
  { id: 2, sheet_id: 1, position: 1, height: 32, cells: {} },
  { id: 3, sheet_id: 1, position: 2, height: 32, cells: {} },
];

function noop() {}

function renderGrid(overrides: Partial<React.ComponentProps<typeof Grid>> = {}) {
  const onPasteRange = vi.fn();
  const utils = render(
    <Grid
      columns={columns}
      rows={rows}
      onSetCell={noop}
      onSetFormula={noop}
      onInsertRow={noop}
      onDeleteRow={noop}
      onInsertColumn={noop}
      onDeleteColumn={noop}
      onResizeColumn={noop}
      onResizeRow={noop}
      onFormatRange={noop}
      onSetConditionalFormat={noop}
      onSortColumn={noop}
      onPasteRange={onPasteRange}
      onOpenSmartLink={noop}
      onEditSmartLink={noop}
      onClearSmartLink={noop}
      {...overrides}
    />
  );
  return { ...utils, onPasteRange };
}

function cell(rowId: number, columnId: number) {
  return screen.getByTestId(`cell-${rowId}-${columnId}`);
}

function selectRange(topLeft: [number, number], bottomRight?: [number, number]) {
  fireEvent.mouseDown(cell(...topLeft));
  if (bottomRight) {
    fireEvent.mouseDown(cell(...bottomRight), { shiftKey: true });
  }
}

function paste(target: HTMLElement, text: string) {
  fireEvent.paste(target, { clipboardData: { getData: () => text } } as any);
}

describe('Grid clipboard paste', () => {
  it('pastes a single cell at the selected cell', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10]);
    paste(cell(1, 10), 'Hello');
    expect(onPasteRange).toHaveBeenCalledTimes(1);
    expect(onPasteRange).toHaveBeenCalledWith(1, 10, [[{ value: 'Hello' }]]);
  });

  it('pastes a 2x3 TSV block anchored at the selected cell', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10]);
    paste(cell(1, 10), 'Иван\t15\tМосква\nПётр\t20\tИркутск');
    expect(onPasteRange).toHaveBeenCalledWith(1, 10, [
      [{ value: 'Иван' }, { value: '15' }, { value: 'Москва' }],
      [{ value: 'Пётр' }, { value: '20' }, { value: 'Иркутск' }],
    ]);
  });

  it('fills a larger selection when clipboard is a single value', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10], [3, 12]); // 3x3 selection
    paste(cell(1, 10), 'Hello');
    expect(onPasteRange).toHaveBeenCalledWith(1, 10, [
      [{ value: 'Hello' }, { value: 'Hello' }, { value: 'Hello' }],
      [{ value: 'Hello' }, { value: 'Hello' }, { value: 'Hello' }],
      [{ value: 'Hello' }, { value: 'Hello' }, { value: 'Hello' }],
    ]);
  });

  it('anchors a multi-cell clipboard at the top-left of a larger selection without cropping or tiling', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10], [3, 12]); // 3x3 selection, 2x2 clipboard
    paste(cell(1, 10), 'a\tb\nc\td');
    expect(onPasteRange).toHaveBeenCalledWith(1, 10, [
      [{ value: 'a' }, { value: 'b' }],
      [{ value: 'c' }, { value: 'd' }],
    ]);
  });

  it('converts a formula cell to {formula} instead of {value}', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10]);
    paste(cell(1, 10), '=A1+B1');
    expect(onPasteRange).toHaveBeenCalledWith(1, 10, [[{ formula: '=A1+B1' }]]);
  });

  it('rejects a paste beyond the cell limit and makes no call', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10]);
    const hugeRow = Array.from({ length: 5001 }, (_, i) => `v${i}`).join('\t');
    paste(cell(1, 10), hugeRow);
    expect(onPasteRange).not.toHaveBeenCalled();
    expect(screen.getByText('Слишком большой диапазон для вставки')).toBeInTheDocument();
  });

  it('does nothing when read-only', () => {
    const { onPasteRange } = renderGrid({ readOnly: true });
    selectRange([1, 10]);
    paste(cell(1, 10), 'Hello');
    expect(onPasteRange).not.toHaveBeenCalled();
  });
});

describe('Grid Delete/Backspace batching', () => {
  it('clears a multi-cell selection with a single onPasteRange call (not one per cell)', () => {
    const { onPasteRange } = renderGrid();
    selectRange([1, 10], [2, 11]); // 2x2 selection
    fireEvent.keyDown(cell(1, 10), { key: 'Delete' });
    expect(onPasteRange).toHaveBeenCalledTimes(1);
    expect(onPasteRange).toHaveBeenCalledWith(1, 10, [
      [{ value: null }, { value: null }],
      [{ value: null }, { value: null }],
    ]);
  });

  it('does nothing when read-only', () => {
    const { onPasteRange } = renderGrid({ readOnly: true });
    selectRange([1, 10], [2, 11]);
    fireEvent.keyDown(cell(1, 10), { key: 'Delete' });
    expect(onPasteRange).not.toHaveBeenCalled();
  });
});

describe('Grid smart links', () => {
  const smartRows: RowOut[] = [{
    id: 1,
    sheet_id: 1,
    position: 0,
    height: 32,
    cells: {
      '10': {
        value: 'Открыть',
        formula: null,
        formatting: {},
        metadata: {
          type: 'smart_link',
          target: { type: 'smart_table', workbook_id: 7, sheet_id: 24, row_id: 91, column_id: 18 },
        },
      },
    },
  }];

  it('opens a smart link without selecting through the button click', () => {
    const onOpenSmartLink = vi.fn();
    renderGrid({ rows: smartRows, onOpenSmartLink });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(onOpenSmartLink).toHaveBeenCalledWith({
      type: 'smart_table', workbook_id: 7, sheet_id: 24, row_id: 91, column_id: 18,
    });
  });

  it('lets a viewer open but not edit a smart link', () => {
    const onOpenSmartLink = vi.fn();
    const onEditSmartLink = vi.fn();
    renderGrid({ rows: smartRows, readOnly: true, onOpenSmartLink, onEditSmartLink });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    fireEvent.doubleClick(cell(1, 10));
    expect(onOpenSmartLink).toHaveBeenCalledTimes(1);
    expect(onEditSmartLink).not.toHaveBeenCalled();
  });

  it('selects and scrolls to a deep-link target cell', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    renderGrid({ focusTarget: { rowId: 2, columnId: 11 } });

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({
      top: expect.any(Number),
      left: expect.any(Number),
      behavior: 'smooth',
    })));
    expect(cell(2, 11)).toHaveAttribute('aria-selected', 'true');
  });
});
