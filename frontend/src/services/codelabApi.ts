import { api } from './api/client';
import type { AuthoringSummary } from './kodexApi';

// ─── Прогресс ученика на Codelab (методист/тренер/родитель) ────────────────────

export interface CodelabCourseProgress {
  course_id: number;
  course_title: string;
  tasks_solved: number;
  tasks_total: number;
  points: number;
}

export interface CodelabSubmission {
  id: number;
  task_title: string;
  verdict: string | null;
  status: string;
  created_at: string;
}

export interface CodelabStudentProgress {
  started: boolean;
  points_total: number;
  rank_name: string | null;
  courses: CodelabCourseProgress[];
  recent_submissions: CodelabSubmission[];
}

export const getStudentCodelabProgress = (studentId: number): Promise<CodelabStudentProgress> =>
  api.get(`/codelab/students/${studentId}/progress`).then((r) => r.data);

// ─── Студия методиста / кабинет преподавателя — прокси в Codelab ──────────────
// Портал ничего не хранит, только прокидывает в /api/lms-admin/** Codelab.
// Поля намеренно `any`-подобные там, где Codelab сам валидирует форму —
// дублировать его схему здесь один в один не даёт защиты, только рассинхрон.

export interface CodelabCourse {
  id: number;
  slug: string | null;
  title: string;
  description: string | null;
  status: string;
}

export interface CodelabLearningItem {
  id: number;
  type: string;
  title: string;
  description: string | null;
  content: string | null;
  parent_id: number | null;
  is_required: boolean;
  weight: number;
  position: number;
  unlock_rules: Record<string, unknown>;
  problem_revision_id: number | null;
  children: CodelabLearningItem[];
}

export interface CodelabSubmissionReview {
  submission_id: number;
  student_external_ref: string;
  student_full_name: string;
  item_title: string;
  code: string;
  status: string;
  verdict: string | null;
  score: number | null;
  manual_score_override: number | null;
  manual_comment: string | null;
  created_at: string;
}

const B = '/codelab/admin';

export const codelabStudioApi = {
  listCourses: (): Promise<CodelabCourse[]> => api.get(`${B}/courses`).then((r) => r.data),
  createCourse: (p: { title: string; slug?: string; description?: string }): Promise<CodelabCourse> =>
    api.post(`${B}/courses`, p).then((r) => r.data),
  createTask: (courseId: number, p: Record<string, unknown>): Promise<{ id: number; title: string }> =>
    api.post(`${B}/courses/${courseId}/tasks`, p).then((r) => r.data),
  createItem: (courseId: number, p: Record<string, unknown>): Promise<CodelabLearningItem> =>
    api.post(`${B}/courses/${courseId}/items`, p).then((r) => r.data),
  updateItem: (itemId: number, p: Record<string, unknown>): Promise<CodelabLearningItem> =>
    api.put(`${B}/items/${itemId}`, p).then((r) => r.data),
  deleteItem: (itemId: number): Promise<void> => api.delete(`${B}/items/${itemId}`).then(() => undefined),
  getTree: (courseId: number): Promise<CodelabLearningItem[]> => api.get(`${B}/courses/${courseId}/tree`).then((r) => r.data),
  publishCourse: (courseId: number): Promise<CodelabCourse> => api.post(`${B}/courses/${courseId}/publish`).then((r) => r.data),
  unpublishCourse: (courseId: number): Promise<CodelabCourse> => api.post(`${B}/courses/${courseId}/unpublish`).then((r) => r.data),

  listSubmissions: (courseId: number): Promise<CodelabSubmissionReview[]> =>
    api.get(`${B}/courses/${courseId}/submissions`).then((r) => r.data),
  gradeSubmission: (submissionId: number, score: number, comment: string) =>
    api.put(`${B}/submissions/${submissionId}/grade`, { score, comment }).then((r) => r.data),

  // Для карточки на MethodistHubPage — статусов "на ревью"/"правки" у Codelab нет, всегда 0.
  authoringSummary: async (): Promise<AuthoringSummary> => {
    const courses = await api.get(`${B}/courses`).then((r) => r.data as CodelabCourse[]);
    const active = courses.filter((c) => c.status === 'published').length;
    const draft = courses.filter((c) => c.status !== 'published' && c.status !== 'archived').length;
    return { direction: 'codelab', total: active + draft, active, in_review: 0, changes_requested: 0, draft };
  },
};
