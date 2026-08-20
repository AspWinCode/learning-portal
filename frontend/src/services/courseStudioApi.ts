import { methodistStudioClient } from './methodistStudioClient';

export interface CourseSummary {
  id: number;
  title: string;
  description: string | null;
  is_published: boolean;
  sort_order: number;
  lesson_count: number;
}

export interface CourseLesson {
  id: number;
  course_id: number;
  title: string;
  theory_md: string | null;
  homework_md: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface CourseFull {
  id: number;
  title: string;
  description: string | null;
  is_published: boolean;
  sort_order: number;
  lessons: CourseLesson[];
}

export interface CourseIn {
  title: string;
  description?: string;
  is_published?: boolean;
}

export interface LessonIn {
  title: string;
  theory_md?: string;
  homework_md?: string;
  is_published?: boolean;
}

const BASE = '/course-studio';

export const courseStudioApi = {
  listCourses: (): Promise<CourseSummary[]> =>
    methodistStudioClient.get(`${BASE}/courses`).then((r) => r.data),

  getCourse: (id: number): Promise<CourseFull> =>
    methodistStudioClient.get(`${BASE}/courses/${id}`).then((r) => r.data),

  createCourse: (body: CourseIn): Promise<CourseFull> =>
    methodistStudioClient.post(`${BASE}/courses`, body).then((r) => r.data),

  updateCourse: (id: number, body: CourseIn): Promise<CourseFull> =>
    methodistStudioClient.put(`${BASE}/courses/${id}`, body).then((r) => r.data),

  deleteCourse: (id: number): Promise<void> =>
    methodistStudioClient.delete(`${BASE}/courses/${id}`).then(() => undefined),

  createLesson: (courseId: number, body: LessonIn): Promise<CourseLesson> =>
    methodistStudioClient.post(`${BASE}/courses/${courseId}/lessons`, body).then((r) => r.data),

  updateLesson: (courseId: number, lessonId: number, body: LessonIn): Promise<CourseLesson> =>
    methodistStudioClient.put(`${BASE}/courses/${courseId}/lessons/${lessonId}`, body).then((r) => r.data),

  deleteLesson: (courseId: number, lessonId: number): Promise<void> =>
    methodistStudioClient.delete(`${BASE}/courses/${courseId}/lessons/${lessonId}`).then(() => undefined),

  moveLesson: (courseId: number, lessonId: number, direction: 'up' | 'down'): Promise<CourseLesson[]> =>
    methodistStudioClient
      .post(`${BASE}/courses/${courseId}/lessons/${lessonId}/move?direction=${direction}`)
      .then((r) => r.data),
};
