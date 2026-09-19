import { api } from './api/client';

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
