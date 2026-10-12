import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SalesAbsencesPage from './SalesAbsencesPage';
import { salesApi } from '../services/api';
import type { AbsenceFollowUp } from '../types';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../services/api', () => ({
  salesApi: {
    getAbsences: vi.fn(),
    updateAbsenceStage: vi.fn(),
    suggestMakeups: vi.fn(),
    assignMakeup: vi.fn(),
  },
}));

function makeAbsence(overrides: Partial<AbsenceFollowUp> = {}): AbsenceFollowUp {
  return {
    id: 1,
    lesson_attendance_id: 10,
    student_id: 100,
    group_id: 200,
    lesson_date: '2026-10-08',
    stage: 'missed',
    absence_reason: 'sick',
    absence_comment: 'Исправь условие цикла и обработай случай пустого списка.',
    created_at: '2026-10-08T10:00:00Z',
    student_name: 'Иванов Иван',
    group_name: 'Python Start',
    program_name: 'Python Start',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SalesAbsencesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SalesAbsencesPage — collapsed/expanded cards', () => {
  it('renders the card collapsed by default, showing only the student name', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    await screen.findByText('Иванов Иван');
    expect(screen.queryByText('Python Start')).not.toBeInTheDocument();
    expect(screen.queryByText(/Пропуск:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Исправь условие цикла/)).not.toBeInTheDocument();
  });

  it('exposes a collapsed toggle with an accessible expand label', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands the card on click, revealing the full details', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' });
    fireEvent.click(toggle);

    expect(await screen.findByText('Python Start')).toBeInTheDocument();
    expect(screen.getByText(/Пропуск:/)).toBeInTheDocument();
    expect(screen.getByText(/Исправь условие цикла/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Свернуть карточку Иванов Иван' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses the card again on a second click', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' });
    fireEvent.click(toggle);
    await screen.findByText('Python Start');

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть карточку Иванов Иван' }));
    // MUI Collapse unmountOnExit снимает содержимое только по завершении
    // transition — ждём этого вместо немедленной проверки.
    await waitFor(() => expect(screen.queryByText('Python Start')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Развернуть карточку Иванов Иван' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles expand/collapse via the Enter key', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' });
    toggle.focus();
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(await screen.findByText('Python Start')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Свернуть карточку Иванов Иван' }), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByText('Python Start')).not.toBeInTheDocument());
  });

  it('toggles expand/collapse via the Space key', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    const toggle = await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' });
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(await screen.findByText('Python Start')).toBeInTheDocument();
  });

  it('expanded actions (Подобрать) still work', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    (salesApi.suggestMakeups as any).mockResolvedValue([]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Подобрать' }));

    expect(await screen.findByText('Назначить отработку')).toBeInTheDocument();
    expect(salesApi.suggestMakeups).toHaveBeenCalledWith(1, 21);
  });

  it('expanded stage select still updates the stage', async () => {
    const absence = makeAbsence();
    (salesApi.getAbsences as any).mockResolvedValue([absence]);
    (salesApi.updateAbsenceStage as any).mockResolvedValue({ ...absence, stage: 'no_makeup_needed' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Не нужна' }));

    expect(salesApi.updateAbsenceStage).toHaveBeenCalledWith(1, 'no_makeup_needed');
  });

  it('multiple cards can be expanded independently at the same time', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([
      makeAbsence({ id: 1, student_name: 'Иванов Иван' }),
      makeAbsence({ id: 2, student_name: 'Петров Пётр', student_id: 101 }),
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Развернуть карточку Петров Пётр' }));

    expect(screen.getAllByText('Python Start')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Свернуть карточку Иванов Иван' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Свернуть карточку Петров Пётр' })).toBeInTheDocument();
  });

  it('switching the stage filter does not error even with a card expanded', async () => {
    (salesApi.getAbsences as any).mockResolvedValue([makeAbsence()]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Развернуть карточку Иванов Иван' }));
    await screen.findByText('Python Start');

    (salesApi.getAbsences as any).mockResolvedValue([]);
    // Верхний фильтр "Показать этап" — первый combobox на странице (до
    // per-карточного select "Этап" внутри развёрнутой карточки).
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.mouseDown(select);
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText('Нужна отработка'));

    // Карточка исчезла из текущего фильтра — expandedIds может продолжать
    // содержать её id, это не должно приводить к ошибке рендера.
    expect(await screen.findByText('Нет пропусков')).toBeInTheDocument();
  });
});
