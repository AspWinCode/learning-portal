import { api } from './api/client';

// ─── Прогресс ученика на PixelForge (методист/тренер/родитель) ────────────────

export interface PixelForgeCourseProgress {
  course_id: number;
  course_title: string;
  progress_percent: number;
  completed_lessons: number;
  total_lessons: number;
}

export interface PixelForgeSubmission {
  id: number;
  project_title: string;
  verdict: string | null;
  status: string;
  created_at: string;
}

export interface PixelForgeStudentProgress {
  started: boolean;
  xp_total: number;
  level_name: string | null;
  courses: PixelForgeCourseProgress[];
  recent_submissions: PixelForgeSubmission[];
}

export const getStudentPixelForgeProgress = (studentId: number): Promise<PixelForgeStudentProgress> =>
  api.get(`/pixelforge/students/${studentId}/progress`).then((r) => r.data);
