import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrainerSubmissionsPage from './TrainerSubmissionsPage';

const { listTrainerSubmissions } = vi.hoisted(() => ({ listTrainerSubmissions: vi.fn() }));

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('./CodelabStudioPage', () => ({
  PROJECT_STATUS_LABEL: { submitted: 'На проверке', accepted: 'Принято', needs_revision: 'На доработке' },
  ProjectReviewDialog: () => <div>project-review-dialog</div>,
}));
vi.mock('../services/codelabApi', () => ({ codelabStudioApi: { listTrainerSubmissions } }));

afterEach(() => { vi.clearAllMocks(); });

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TrainerSubmissionsPage /></QueryClientProvider>);
};

describe('TrainerSubmissionsPage unified feed', () => {
  it('shows solved tasks and opens their code/verdict details', async () => {
    listTrainerSubmissions.mockResolvedValue([
      { submission_type: 'task', submission_id: 10, student_full_name: 'Анна', student_external_ref: 'lp-student-42', group_name: 'Группа A', course_id: 1, course_title: 'Python', item_id: 2, item_title: 'Цикл', code: 'print(1)', verdict: 'Accepted', status: 'checked', score: 100, manual_score_override: null, manual_comment: null, created_at: '2026-10-12T10:00:00Z', attempt_number: 1 },
      { submission_type: 'project', submission_id: 20, student_full_name: 'Анна', student_external_ref: 'lp-student-42', group_name: 'Группа A', course_id: 1, course_title: 'Python', item_id: 3, item_title: 'Проект', status: 'submitted', attempt_number: 1, submitted_at: '2026-10-12T11:00:00Z' },
    ]);

    renderPage();
    await screen.findByRole('tab', { name: 'Решённые задачи' });
    fireEvent.click(screen.getByRole('tab', { name: 'Решённые задачи' }));
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText('Проект')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    await waitFor(() => expect(screen.getByText('print(1)')).toBeInTheDocument());
    expect(screen.getByText(/Вердикт: Accepted/)).toBeInTheDocument();
  });
});
