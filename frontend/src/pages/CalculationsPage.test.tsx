import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalculationsPage from './CalculationsPage';
import { ownerCalculationsApi } from '../services/api';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../services/api', () => ({
  ownerCalculationsApi: {
    getTrainers: vi.fn(),
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
});

describe('CalculationsPage group rates', () => {
  it('shows the rate as read-only text, with no editable input', async () => {
    vi.mocked(ownerCalculationsApi.getTrainers).mockResolvedValue(makeRows(1000) as any);

    renderPage();
    await screen.findAllByText('Тестовый тренер');
    fireEvent.click(screen.getByRole('button', { name: /Ставки по группам/ }));

    expect(await screen.findAllByText(/1\s*000/)).not.toHaveLength(0);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('shows a dash when the group has no rate set yet', async () => {
    vi.mocked(ownerCalculationsApi.getTrainers).mockResolvedValue(makeRows(null) as any);

    renderPage();
    await screen.findAllByText('Тестовый тренер');
    fireEvent.click(screen.getByRole('button', { name: /Ставки по группам/ }));

    expect(await screen.findAllByText('—')).not.toHaveLength(0);
  });
});
