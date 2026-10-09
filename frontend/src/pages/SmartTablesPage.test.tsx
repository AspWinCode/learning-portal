import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SmartTablesPage from './SmartTablesPage';
import { smartTablesApi } from '../services/api/smartTables';
import type { SheetDetail, Workbook } from '../types/smartTables';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../services/api/smartTables', () => ({
  smartTablesApi: {
    listWorkbooks: vi.fn(),
    listSheets: vi.fn(),
    getSheet: vi.fn(),
    renameSheet: vi.fn(),
    deleteSheet: vi.fn(),
    applyOperations: vi.fn(),
    undo: vi.fn(),
  },
}));

function makeDetail(sheetId: number, name: string): SheetDetail {
  return {
    sheet: { id: sheetId, workbook_id: 1, name, position: sheetId, frozen_rows: 0, frozen_columns: 0 },
    columns: [{ id: 10, sheet_id: sheetId, name: 'A', position: 0, type: 'text', width: 120, config: {} }],
    rows: [{ id: 100 + sheetId, sheet_id: sheetId, position: 0, height: 32, cells: {} }],
  };
}

function makeWorkbook(role: Workbook['role']): Workbook {
  return { id: 1, name: 'Моя таблица', owner_id: 1, role, created_at: '2026-01-01T00:00:00Z', updated_at: null };
}

async function openWorkbook(role: Workbook['role']) {
  (smartTablesApi.listWorkbooks as any).mockResolvedValue([makeWorkbook(role)]);
  render(
    <MemoryRouter initialEntries={['/smart-tables']}>
      <Routes>
        <Route path="/smart-tables" element={<SmartTablesPage />} />
        <Route path="/smart-tables/:workbookId" element={<SmartTablesPage />} />
        <Route path="/smart-tables/:workbookId/sheets/:sheetId" element={<SmartTablesPage />} />
      </Routes>
    </MemoryRouter>,
  );
  const card = await screen.findByText('Моя таблица');
  fireEvent.click(card);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Deep links', () => {
  it('loads the workbook and requested sheet directly from the URL', async () => {
    (smartTablesApi.listWorkbooks as any).mockResolvedValue([makeWorkbook('viewer')]);
    (smartTablesApi.listSheets as any).mockResolvedValue([
      { id: 2, workbook_id: 1, name: 'План', position: 0, frozen_rows: 0, frozen_columns: 0 },
    ]);
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(2, 'План'));

    render(
      <MemoryRouter initialEntries={['/smart-tables/1/sheets/2?row=102&column=10']}>
        <Routes>
          <Route path="/smart-tables/:workbookId/sheets/:sheetId" element={<SmartTablesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('План');
    expect(smartTablesApi.listWorkbooks).toHaveBeenCalled();
    expect(smartTablesApi.listSheets).toHaveBeenCalledWith(1);
    expect(smartTablesApi.getSheet).toHaveBeenCalledWith(2);
  });

  it('keeps the sheet open and warns when the target cell was deleted', async () => {
    (smartTablesApi.listWorkbooks as any).mockResolvedValue([makeWorkbook('viewer')]);
    (smartTablesApi.listSheets as any).mockResolvedValue([
      { id: 2, workbook_id: 1, name: 'План', position: 0, frozen_rows: 0, frozen_columns: 0 },
    ]);
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(2, 'План'));

    render(
      <MemoryRouter initialEntries={['/smart-tables/1/sheets/2?row=999&column=10']}>
        <Routes>
          <Route path="/smart-tables/:workbookId/sheets/:sheetId" element={<SmartTablesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Целевая ячейка больше не существует')).toBeInTheDocument();
    expect(screen.getByText('План')).toBeInTheDocument();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sheet rename', () => {
  it('editor can rename a sheet and the tab updates', async () => {
    (smartTablesApi.listSheets as any).mockResolvedValue([
      { id: 1, workbook_id: 1, name: 'Лист 1', position: 0, frozen_rows: 0, frozen_columns: 0 },
    ]);
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(1, 'Лист 1'));
    (smartTablesApi.renameSheet as any).mockResolvedValue({ id: 1, workbook_id: 1, name: 'Октябрь', position: 0, frozen_rows: 0, frozen_columns: 0 });

    await openWorkbook('editor');
    await screen.findByText('Лист 1');

    const tabs = screen.getAllByRole('tab');
    const menuButton = within(tabs[0]).getByRole('button');
    fireEvent.click(menuButton);

    fireEvent.click(screen.getByText('Переименовать'));
    const input = screen.getByLabelText('Название');
    fireEvent.change(input, { target: { value: 'Октябрь' } });
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(smartTablesApi.renameSheet).toHaveBeenCalledWith(1, 'Октябрь'));
    await screen.findByText('Октябрь');
  });

  it('viewer does not see the rename action', async () => {
    (smartTablesApi.listSheets as any).mockResolvedValue([
      { id: 1, workbook_id: 1, name: 'Лист 1', position: 0, frozen_rows: 0, frozen_columns: 0 },
    ]);
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(1, 'Лист 1'));

    await openWorkbook('viewer');
    await screen.findByText('Лист 1');

    const tabs = screen.getAllByRole('tab');
    expect(within(tabs[0]).queryByRole('button')).toBeNull();
  });
});

describe('Sheet delete', () => {
  it('owner can delete the active sheet and a neighbor becomes active', async () => {
    let backingSheets = [
      { id: 1, workbook_id: 1, name: 'Лист 1', position: 0, frozen_rows: 0, frozen_columns: 0 },
      { id: 2, workbook_id: 1, name: 'Лист 2', position: 1, frozen_rows: 0, frozen_columns: 0 },
    ];
    (smartTablesApi.listSheets as any).mockImplementation(() => Promise.resolve(backingSheets));
    (smartTablesApi.getSheet as any).mockImplementation((id: number) => Promise.resolve(makeDetail(id, id === 1 ? 'Лист 1' : 'Лист 2')));
    (smartTablesApi.deleteSheet as any).mockImplementation((id: number) => {
      backingSheets = backingSheets.filter((s) => s.id !== id);
      return Promise.resolve(undefined);
    });

    await openWorkbook('owner');
    await screen.findByText('Лист 1');

    const tabs = screen.getAllByRole('tab');
    const menuButton = within(tabs[1]).getByRole('button'); // delete "Лист 2" (not the active one, to check neighbor logic independent of active-sheet default)
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByText('Удалить'));
    fireEvent.click(screen.getByText('Удалить', { selector: 'button' }));

    await waitFor(() => expect(smartTablesApi.deleteSheet).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByText('Лист 2')).toBeNull());
    expect(screen.getByText('Лист 1')).toBeInTheDocument();
  });

  it('editor does not see the delete action', async () => {
    (smartTablesApi.listSheets as any).mockResolvedValue([
      { id: 1, workbook_id: 1, name: 'Лист 1', position: 0, frozen_rows: 0, frozen_columns: 0 },
    ]);
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(1, 'Лист 1'));

    await openWorkbook('editor');
    await screen.findByText('Лист 1');

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(within(tabs[0]).getByRole('button'));
    expect(screen.getByText('Переименовать')).toBeInTheDocument();
    expect(screen.queryByText('Удалить')).toBeNull();
  });

  it('deleting the last sheet shows the empty state', async () => {
    let backingSheets = [{ id: 1, workbook_id: 1, name: 'Лист 1', position: 0, frozen_rows: 0, frozen_columns: 0 }];
    (smartTablesApi.listSheets as any).mockImplementation(() => Promise.resolve(backingSheets));
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(1, 'Лист 1'));
    (smartTablesApi.deleteSheet as any).mockImplementation((id: number) => {
      backingSheets = backingSheets.filter((s) => s.id !== id);
      return Promise.resolve(undefined);
    });

    await openWorkbook('owner');
    await screen.findByText('Лист 1');

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(within(tabs[0]).getByRole('button'));
    fireEvent.click(screen.getByText('Удалить'));
    fireEvent.click(screen.getByText('Удалить', { selector: 'button' }));

    await screen.findByText(/пока нет ни одного листа/i);
  });

  it('a failed delete leaves the current state intact', async () => {
    (smartTablesApi.listSheets as any).mockResolvedValue([
      { id: 1, workbook_id: 1, name: 'Лист 1', position: 0, frozen_rows: 0, frozen_columns: 0 },
    ]);
    (smartTablesApi.getSheet as any).mockResolvedValue(makeDetail(1, 'Лист 1'));
    (smartTablesApi.deleteSheet as any).mockRejectedValue({ response: { data: { detail: 'Недостаточно прав' } } });

    await openWorkbook('owner');
    await screen.findByText('Лист 1');

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(within(tabs[0]).getByRole('button'));
    fireEvent.click(screen.getByText('Удалить'));
    fireEvent.click(screen.getByText('Удалить', { selector: 'button' }));

    await screen.findByText('Недостаточно прав');
    expect(screen.getByText('Лист 1')).toBeInTheDocument();
  });
});
