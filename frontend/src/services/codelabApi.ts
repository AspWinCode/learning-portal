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
  is_archived: boolean;
}

// 4 фиксированных структурных уровня — каждый следующий только внутри
// предыдущего (app/services/tree_rules.py в Codelab); контент лежит на любом
// из них или в корне курса.
export type CodelabStructuralType = 'module' | 'submodule' | 'topic' | 'subtopic';
export const CODELAB_STRUCTURAL_TYPES: CodelabStructuralType[] = ['module', 'submodule', 'topic', 'subtopic'];
export const CODELAB_STRUCTURAL_LABEL: Record<CodelabStructuralType, string> = {
  module: 'Модуль', submodule: 'Подмодуль', topic: 'Тема', subtopic: 'Подтема',
};
// Прямой дочерний структурный уровень для каждого — null у "module" (верхний уровень).
export const CODELAB_CHILD_STRUCTURAL_TYPE: Record<CodelabStructuralType, CodelabStructuralType | null> = {
  module: 'submodule', submodule: 'topic', topic: 'subtopic', subtopic: null,
};

// Этап Snap!-задания — слева листаются, панель Snap! справа статична (см. CoursePage в Codelab).
export interface CodelabSnapStep {
  title: string;
  content: string;
}

// Вопрос теста (type=quiz) — один тип, несколько правильных ответов (checkbox).
// Живёт прямо на элементе дерева, не в отдельном банке (без переиспользования
// между тестами — решение владельца продукта 2026-09-23).
export interface CodelabQuizOption {
  text: string;
  correct: boolean;
}

export interface CodelabQuizQuestion {
  text: string;
  options: CodelabQuizOption[];
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
  is_archived: boolean;
  steps: CodelabSnapStep[] | null;
  quiz_questions: CodelabQuizQuestion[] | null;
  due_at: string | null; // только для type="project" — срок сдачи
  children: CodelabLearningItem[];
}

// ─── Проект с ручной проверкой (файлы ученика) ─────────────────────────────────

export interface CodelabProjectFileComment {
  id: number;
  author_id: number;
  author_full_name: string;
  body: string;
  created_at: string;
}

export interface CodelabProjectFile {
  id: number;
  original_filename: string;
  content_type: string;
  size: number;
  uploaded_at: string;
  comments: CodelabProjectFileComment[];
}

export interface CodelabProjectAttemptSummary {
  id: number;
  attempt_number: number;
  status: string;
  submitted_at: string | null;
  score: number | null;
}

export interface CodelabProjectSubmission {
  id: number;
  learning_item_id: number;
  attempt_number: number;
  status: 'draft' | 'submitted' | 'needs_revision' | 'accepted';
  submitted_at: string | null;
  reviewed_at: string | null;
  score: number | null;
  review_comment: string | null;
  due_at: string | null;
  is_overdue: boolean;
  files: CodelabProjectFile[];
  history: CodelabProjectAttemptSummary[];
}

export interface CodelabProjectSubmissionReview extends CodelabProjectSubmission {
  student_external_ref: string;
  student_full_name: string;
  item_title: string;
}

// Тесты — видимые ученику (примеры) и скрытые (только для проверки).
export interface CodelabProblemTest {
  input: string;
  expected: string;
  is_hidden: boolean;
}

export interface CodelabTask {
  id: number;
  title: string;
  statement: string;
  input_format: string | null;
  output_format: string | null;
  tests: CodelabProblemTest[];
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

export interface CodelabSystemStatus {
  generated_at: string;
  queue: {
    queued_count: number;
    running_count: number;
    oldest_queued_age_seconds: number | null;
    worker_likely_stalled: boolean;
  };
  errors: { system_errors_last_24h: number };
  storage: { uploads_size_bytes: number; disk_free_bytes: number; disk_total_bytes: number };
}

export interface CodelabCourseOverview {
  course_id: number;
  enrolled_count: number;
  completed_count: number;
  completion_percent: number;
  avg_score: number;
  median_score: number;
  total_attempts: number;
  overdue_count: number;
}

export interface CodelabTaskDifficulty {
  item_id: number;
  title: string;
  attempts_total: number;
  students_attempted: number;
  students_solved: number;
  students_not_attempted: number;
  failure_rate_percent: number;
  avg_attempts_to_solve: number | null;
  most_common_failure_verdict: string | null;
}

export interface CodelabCourseAnalytics {
  generated_at: string;
  overview: CodelabCourseOverview;
  tasks: CodelabTaskDifficulty[];
}

export interface CodelabUser {
  id: number;
  external_ref: string;
  full_name: string;
  role: string;
  is_blocked: boolean;
  last_login_at: string | null;
}

export interface CodelabLoginEvent {
  created_at: string;
}

const B = '/codelab/admin';

export const codelabStudioApi = {
  listCourses: (): Promise<CodelabCourse[]> => api.get(`${B}/courses`).then((r) => r.data),
  createCourse: (p: { title: string; slug?: string; description?: string }): Promise<CodelabCourse> =>
    api.post(`${B}/courses`, p).then((r) => r.data),
  updateCourse: (courseId: number, p: { title?: string; slug?: string; description?: string }): Promise<CodelabCourse> =>
    api.put(`${B}/courses/${courseId}`, p).then((r) => r.data),
  archiveCourse: (courseId: number, archived: boolean): Promise<CodelabCourse> =>
    api.put(`${B}/courses/${courseId}/archive`, { archived }).then((r) => r.data),
  deleteCourse: (courseId: number): Promise<void> => api.delete(`${B}/courses/${courseId}`).then(() => undefined),
  createTask: (courseId: number, p: Record<string, unknown>): Promise<CodelabTask> =>
    api.post(`${B}/courses/${courseId}/tasks`, p).then((r) => r.data),
  getTask: (taskId: number): Promise<CodelabTask> => api.get(`${B}/tasks/${taskId}`).then((r) => r.data),
  updateTask: (taskId: number, p: Record<string, unknown>): Promise<CodelabTask> =>
    api.put(`${B}/tasks/${taskId}`, p).then((r) => r.data),
  createItem: (courseId: number, p: Record<string, unknown>): Promise<CodelabLearningItem> =>
    api.post(`${B}/courses/${courseId}/items`, p).then((r) => r.data),
  updateItem: (itemId: number, p: Record<string, unknown>): Promise<CodelabLearningItem> =>
    api.put(`${B}/items/${itemId}`, p).then((r) => r.data),
  deleteItem: (itemId: number): Promise<void> => api.delete(`${B}/items/${itemId}`).then(() => undefined),
  archiveItem: (itemId: number, archived: boolean): Promise<CodelabLearningItem> =>
    api.put(`${B}/items/${itemId}/archive`, { archived }).then((r) => r.data),
  getTree: (courseId: number): Promise<CodelabLearningItem[]> => api.get(`${B}/courses/${courseId}/tree`).then((r) => r.data),
  publishCourse: (courseId: number): Promise<CodelabCourse> => api.post(`${B}/courses/${courseId}/publish`).then((r) => r.data),
  unpublishCourse: (courseId: number): Promise<CodelabCourse> => api.post(`${B}/courses/${courseId}/unpublish`).then((r) => r.data),

  listSubmissions: (courseId: number): Promise<CodelabSubmissionReview[]> =>
    api.get(`${B}/courses/${courseId}/submissions`).then((r) => r.data),
  gradeSubmission: (courseId: number, submissionId: number, score: number, comment: string) =>
    api.put(`${B}/courses/${courseId}/submissions/${submissionId}/grade`, { score, comment }).then((r) => r.data),
  rerunSubmissions: (courseId: number, submissionIds: number[]): Promise<{ requeued: number }> =>
    api.post(`${B}/courses/${courseId}/submissions/rerun`, { submission_ids: submissionIds }).then((r) => r.data),
  getAnalytics: (courseId: number): Promise<CodelabCourseAnalytics> =>
    api.get(`${B}/courses/${courseId}/analytics`).then((r) => r.data),
  getSystemStatus: (): Promise<CodelabSystemStatus> => api.get(`${B}/status`).then((r) => r.data),

  listProjectSubmissions: (courseId: number, itemId: number): Promise<CodelabProjectSubmissionReview[]> =>
    api.get(`${B}/courses/${courseId}/projects/${itemId}/submissions`).then((r) => r.data),
  getProjectSubmission: (courseId: number, itemId: number, submissionId: number): Promise<CodelabProjectSubmission> =>
    api.get(`${B}/courses/${courseId}/projects/${itemId}/submissions/${submissionId}`).then((r) => r.data),
  commentProjectFile: (courseId: number, itemId: number, submissionId: number, fileId: number, body: string): Promise<CodelabProjectFileComment> =>
    api.post(`${B}/courses/${courseId}/projects/${itemId}/submissions/${submissionId}/files/${fileId}/comments`, { body }).then((r) => r.data),
  reviewProjectSubmission: (
    courseId: number, itemId: number, submissionId: number,
    decision: 'accepted' | 'needs_revision', score: number | null, comment: string,
  ): Promise<CodelabProjectSubmission> =>
    api.put(`${B}/courses/${courseId}/projects/${itemId}/submissions/${submissionId}/review`, { decision, score, comment }).then((r) => r.data),
  remindProjectSubmission: (courseId: number, itemId: number, submissionId: number): Promise<void> =>
    api.post(`${B}/courses/${courseId}/projects/${itemId}/submissions/${submissionId}/remind`).then(() => undefined),
  // Bearer-токен идёт заголовком (см. api/client.ts), не cookie — обычная
  // <a href="..."> ссылка на этот эндпоинт получила бы 401, поэтому качаем
  // через axios (responseType: 'blob') и триггерим сохранение сами.
  downloadProjectFile: async (courseId: number, itemId: number, submissionId: number, fileId: number): Promise<void> => {
    const response = await api.get(
      `${B}/courses/${courseId}/projects/${itemId}/submissions/${submissionId}/files/${fileId}/download`,
      { responseType: 'blob' },
    );
    const disposition = String(response.headers['content-disposition'] || '');
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/);
    const filename = match ? decodeURIComponent(match[1] || match[2] || 'file') : 'file';
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  listUsers: (q?: string): Promise<CodelabUser[]> =>
    api.get(`${B}/users`, { params: q ? { q } : undefined }).then((r) => r.data),
  setUserBlocked: (userId: number, blocked: boolean): Promise<CodelabUser> =>
    api.put(`${B}/users/${userId}/block`, { blocked }).then((r) => r.data),
  terminateUserSessions: (userId: number): Promise<CodelabUser> =>
    api.post(`${B}/users/${userId}/terminate-sessions`).then((r) => r.data),
  getUserLoginHistory: (userId: number): Promise<CodelabLoginEvent[]> =>
    api.get(`${B}/users/${userId}/login-history`).then((r) => r.data),

  uploadFile: (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`${B}/uploads`, form).then((r) => r.data);
  },

  // Для карточки на MethodistHubPage — статусов "на ревью"/"правки" у Codelab нет, всегда 0.
  authoringSummary: async (): Promise<AuthoringSummary> => {
    const courses = await api.get(`${B}/courses`).then((r) => r.data as CodelabCourse[]);
    const active = courses.filter((c) => c.status === 'published').length;
    const draft = courses.filter((c) => c.status !== 'published' && c.status !== 'archived').length;
    return { direction: 'codelab', total: active + draft, active, in_review: 0, changes_requested: 0, draft };
  },
};
