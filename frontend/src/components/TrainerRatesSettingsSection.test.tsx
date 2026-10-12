import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainerRatesSettingsSection from './TrainerRatesSettingsSection';
import { ownerCalculationsApi } from '../services/api';

vi.mock('../services/api', () => ({
  ownerCalculationsApi: {
    getTrainerRates: vi.fn(),
    updateGroupRate: vi.fn(),
  },
}));

const makeRows = (rate: number | null) => [
  {
    trainer_id: 1,
    full_name: 'Тестовый тренер',
    groups: [
      {
        group_id: 42,
        group_name: 'Тестовая группа',
        is_individual_format: false,
        is_primary: true,
        rate_per_lesson: rate,
        rate_per_hour: null,
      },
    ],
  },
];

const renderSection = () => render(<TrainerRatesSettingsSection />);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('TrainerRatesSettingsSection', () => {
  it('saves the rate on blur and keeps it after a fresh reload', async () => {
    let serverRate: number | null = null;
    vi.mocked(ownerCalculationsApi.getTrainerRates).mockImplementation(async () => makeRows(serverRate) as any);
    vi.mocked(ownerCalculationsApi.updateGroupRate).mockImplementation(async (_groupId, payload) => {
      serverRate = payload.rate_per_lesson ?? null;
      return { ok: true, group_id: 42, rate_per_lesson: serverRate, rate_per_hour: null };
    });

    renderSection();
    await screen.findByText('Тестовый тренер');
    const input = screen.getAllByRole('spinbutton')[0];

    fireEvent.change(input, { target: { value: '1000' } });
    fireEvent.blur(input);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledWith(42, {
      rate_per_lesson: 1000,
      rate_per_hour: null,
    });
    expect(serverRate).toBe(1000);
    expect(screen.getAllByText('Сохранено').length).toBeGreaterThan(0);
  });

  it('persists clearing the field as NULL', async () => {
    let serverRate: number | null = 1000;
    vi.mocked(ownerCalculationsApi.getTrainerRates).mockImplementation(async () => makeRows(serverRate) as any);
    vi.mocked(ownerCalculationsApi.updateGroupRate).mockImplementation(async (_groupId, payload) => {
      serverRate = payload.rate_per_lesson ?? null;
      return { ok: true, group_id: 42, rate_per_lesson: serverRate, rate_per_hour: null };
    });

    renderSection();
    await screen.findByText('Тестовый тренер');
    const input = screen.getAllByRole('spinbutton')[0];

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ownerCalculationsApi.updateGroupRate).toHaveBeenCalledWith(42, {
      rate_per_lesson: null,
      rate_per_hour: null,
    });
    expect(serverRate).toBeNull();
  });

  it('does not change the value on wheel scroll over a focused field', async () => {
    vi.mocked(ownerCalculationsApi.getTrainerRates).mockResolvedValue(makeRows(500) as any);

    renderSection();
    await screen.findByText('Тестовый тренер');
    const input = screen.getAllByRole('spinbutton')[0] as HTMLInputElement;

    input.focus();
    fireEvent.wheel(input, { deltaY: 100 });

    expect(input.value).toBe('500');
    expect(ownerCalculationsApi.updateGroupRate).not.toHaveBeenCalled();
  });
});
