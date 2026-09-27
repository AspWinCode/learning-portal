import { api } from './api/client';

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
  topic_id: number | null;
  title: string;
  theory_md: string | null;
  homework_md: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface CourseTopic {
  id: number;
  title: string;
  sort_order: number;
  lessons: CourseLesson[];
}

export interface CourseSubmodule {
  id: number;
  title: string;
  sort_order: number;
  topics: CourseTopic[];
}

export interface CourseModule {
  id: number;
  title: string;
  sort_order: number;
  submodules: CourseSubmodule[];
  topics: CourseTopic[];
}

export interface CourseFull {
  id: number;
  title: string;
  description: string | null;
  is_published: boolean;
  sort_order: number;
  lessons: CourseLesson[];
  modules: CourseModule[];
}

export interface ImportPreviewLesson {
  title: string;
  theory_md: string;
  homework_md: string;
}

export interface ImportPreviewTopic {
  title: string;
  lessons: ImportPreviewLesson[];
}

export interface ImportPreviewSubmodule {
  title: string;
  topics: ImportPreviewTopic[];
}

export interface ImportPreviewModule {
  title: string;
  submodules: ImportPreviewSubmodule[];
  topics: ImportPreviewTopic[];
}

export interface ImportPreview {
  modules: ImportPreviewModule[];
  warnings: string[];
  module_count: number;
  topic_count: number;
  lesson_count: number;
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
    api.get(`${BASE}/courses`).then((r) => r.data),

  getCourse: (id: number): Promise<CourseFull> =>
    api.get(`${BASE}/courses/${id}`).then((r) => r.data),

  createCourse: (body: CourseIn): Promise<CourseFull> =>
    api.post(`${BASE}/courses`, body).then((r) => r.data),

  updateCourse: (id: number, body: CourseIn): Promise<CourseFull> =>
    api.put(`${BASE}/courses/${id}`, body).then((r) => r.data),

  deleteCourse: (id: number): Promise<void> =>
    api.delete(`${BASE}/courses/${id}`).then(() => undefined),

  createLesson: (courseId: number, body: LessonIn): Promise<CourseLesson> =>
    api.post(`${BASE}/courses/${courseId}/lessons`, body).then((r) => r.data),

  updateLesson: (courseId: number, lessonId: number, body: LessonIn): Promise<CourseLesson> =>
    api.put(`${BASE}/courses/${courseId}/lessons/${lessonId}`, body).then((r) => r.data),

  deleteLesson: (courseId: number, lessonId: number): Promise<void> =>
    api.delete(`${BASE}/courses/${courseId}/lessons/${lessonId}`).then(() => undefined),

  moveLesson: (courseId: number, lessonId: number, direction: 'up' | 'down'): Promise<CourseLesson[]> =>
    api
      .post(`${BASE}/courses/${courseId}/lessons/${lessonId}/move?direction=${direction}`)
      .then((r) => r.data),

  deleteModule: (courseId: number, moduleId: number): Promise<void> =>
    api.delete(`${BASE}/courses/${courseId}/modules/${moduleId}`).then(() => undefined),

  previewImport: (courseId: number, file: File): Promise<ImportPreview> => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`${BASE}/courses/${courseId}/import/preview`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  commitImport: (courseId: number, file: File): Promise<CourseFull> => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`${BASE}/courses/${courseId}/import/commit`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
};
