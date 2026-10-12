import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalculationsPage from './CalculationsPage';
import { ownerCalculationsApi } from '../services/api';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../services/api', () => ({
  ownerCalculationsApi: {
    getTrainers: vi.fn(),
    updateGroupRate: vi.fn(),
    addBonus: vi.fn(),
    pay: vi.fn(),
    cancelPay: vi.fn(),
  },
}));

const makeRows = (rate: number | null) => [
  {
    trainer_id: 1,
    full_name: 'Тестовый тренер',
    is_individual_format: false,
    lessons_count: 1,
    hours_count: 0,
    base_payment: rate || 0,
    bonus: 0,
    total_payment: rate || 0,
    already_paid: false,
    groups: [
      {
        group_id: 42,
        group_name: 'Тестовая группа',
        is_individual_format: false,
        rate_per_lesson: rate,
        rate_per_hour: null,
        lessons_count: 1,
        hours_count: 0,
        subtotal: rate || 0,
      },
    ],
  },
];

const renderPage = () => render(<CalculationsPage />);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CalculationsPage group rate autosave', () => {
  it('saves 1000 after debounce and returns 1000 from a fresh calculations request', async () => {
    let serverRate: number | null = null;
    vi.mocked(ownerCalculationsApi.getTrainers).mockImplementation(async () => makeRows(serverRate) as any);
    vi.mocked(ownerCalculationsApi.updateGroupRate).mockImplementation(async (_groupId, payload) => {
      serverRate = payload.rate_per_lesson ?? null;
      return { ok: true };
    });

    renderPage();
    await screen.findAllByText('Тестовый тренер');
    fireEvent.click(screen.getByRole('button', { name: /Ставки по группам/ }));
    const input = screen.getAllByRole('spinbutton')[0];

    fireEvent.change(input, { target: { value: '1000' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledTimes(1);
    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledWith(42, {
      rate_per_lesson: 1000,
      rate_per_hour: null,
    });
    expect(serverRate).toBe(1000);
    expect(screen.getAllByText('Сохранено').length).toBeGreaterThan(0);
  });

  it('flushes immediately on blur and does not send a duplicate after the debounce window', async () => {
    let serverRate: number | null = 1000;
    vi.mocked(ownerCalculationsApi.getTrainers).mockImplementation(async () => makeRows(serverRate) as any);
    vi.mocked(ownerCalculationsApi.updateGroupRate).mockImplementation(async (_groupId, payload) => {
      serverRate = payload.rate_per_lesson ?? null;
      return { ok: true };
    });

    renderPage();
    await screen.findAllByText('Тестовый тренер');
    fireEvent.click(screen.getByRole('button', { name: /Ставки по группам/ }));
    const input = screen.getAllByRole('spinbutton')[0];

    fireEvent.change(input, { target: { value: '1200' } });
    fireEvent.blur(input);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await Promise.resolve();
    });
    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledTimes(1);
    expect(serverRate).toBe(1200);
  });

  it('persists clearing the field as NULL and returns an empty field after reload', async () => {
    let serverRate: number | null = 1000;
    vi.mocked(ownerCalculationsApi.getTrainers).mockImplementation(async () => makeRows(serverRate) as any);
    vi.mocked(ownerCalculationsApi.updateGroupRate).mockImplementation(async (_groupId, payload) => {
      serverRate = payload.rate_per_lesson ?? null;
      return { ok: true };
    });

    renderPage();
    await screen.findAllByText('Тестовый тренер');
    fireEvent.click(screen.getByRole('button', { name: /Ставки по группам/ }));
    const input = screen.getAllByRole('spinbutton')[0];

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledTimes(1);
    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledWith(42, {
      rate_per_lesson: null,
      rate_per_hour: null,
    });
    expect(serverRate).toBeNull();
    expect((screen.getAllByRole('spinbutton')[0] as HTMLInputElement).value).toBe('');
  });
});
