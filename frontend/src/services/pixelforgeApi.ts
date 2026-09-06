import { api } from './api/client';
import type { AuthoringSummary } from './kodexApi';

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

// ─── Студия методиста (authoring) — camelCase, 1-в-1 с PixelForge /api/admin/** ─

export type PixelForgeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type PixelForgeNodeType = 'MODULE' | 'TOPIC' | 'SUBTOPIC';
export type PixelForgeTool = 'SNAP' | 'GDEVELOP';
export type PixelForgeCardType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'SNAP_SNIPPET';

export const PF_CHILD_TYPE: Record<PixelForgeNodeType, PixelForgeNodeType | null> = {
  MODULE: 'TOPIC',
  TOPIC: 'SUBTOPIC',
  SUBTOPIC: null,
};
export const PF_NODE_LABEL: Record<PixelForgeNodeType, string> = {
  MODULE: 'Модуль',
  TOPIC: 'Тема',
  SUBTOPIC: 'Подтема',
};

export interface PFCourse {
  id: number;
  title: string;
  slug: string | null;
  description: string | null;
  status: PixelForgeStatus;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PFTreeTask {
  nodeTaskId: number;
  assignmentId: number;
  title: string;
  tool: PixelForgeTool;
  status: PixelForgeStatus;
  isRequired: boolean;
  sortOrder: number;
}
export interface PFTreeNode {
  id: number;
  type: PixelForgeNodeType;
  title: string;
  description: string | null;
  sortOrder: number;
  status: PixelForgeStatus;
  tasks: PFTreeTask[];
  children: PFTreeNode[];
}
export interface PFCourseTree extends PFCourse {
  nodes: PFTreeNode[];
}

export interface PFAssignment {
  id: number;
  classId: number | null;
  lectureId: number | null;
  title: string;
  description: string | null;
  tool: PixelForgeTool;
  status: PixelForgeStatus;
  deadline: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PFTest {
  id: number;
  assignmentId: number;
  testType: 'PUBLIC' | 'HIDDEN';
  inputData: string | null;
  expectedOutput: string | null;
  checker: 'EXACT' | 'TRIMMED' | 'REGEX' | 'MANUAL';
  weight: number;
  orderIndex: number;
}
export interface PFHint {
  id: number;
  assignmentId: number;
  level: number;
  unlockAttempts: number;
  coinCost: number;
  content: string;
  orderIndex: number;
}
export interface PFLecture { id: number; title: string }
export interface PFCard { id: number; position: number; cardType: PixelForgeCardType; content: string }
export interface PFClass { id: number; name: string }

const B = '/pixelforge/admin';

export const pixelforgeStudioApi = {
  authoringSummary: (): Promise<AuthoringSummary> => api.get(`${B}/summary`).then((r) => r.data),
  // courses
  listCourses: (): Promise<PFCourse[]> => api.get(`${B}/courses`).then((r) => r.data),
  createCourse: (p: { title: string; slug?: string; description?: string; status?: PixelForgeStatus; sortOrder?: number }): Promise<PFCourse> =>
    api.post(`${B}/courses`, p).then((r) => r.data),
  updateCourse: (id: number, p: Partial<Pick<PFCourse, 'title' | 'slug' | 'description' | 'status' | 'sortOrder'>>): Promise<PFCourse> =>
    api.put(`${B}/courses/${id}`, p).then((r) => r.data),
  deleteCourse: (id: number): Promise<void> => api.delete(`${B}/courses/${id}`).then(() => undefined),
  archiveCourse: (id: number): Promise<void> => api.post(`${B}/courses/${id}/archive`).then(() => undefined),
  unarchiveCourse: (id: number): Promise<void> => api.post(`${B}/courses/${id}/unarchive`).then(() => undefined),
  getTree: (id: number): Promise<PFCourseTree> => api.get(`${B}/courses/${id}/tree`).then((r) => r.data),

  // nodes
  createNode: (courseId: number, p: { type: PixelForgeNodeType; title: string; parentId?: number; description?: string; sortOrder?: number; status?: PixelForgeStatus }): Promise<PFTreeNode> =>
    api.post(`${B}/courses/${courseId}/nodes`, p).then((r) => r.data),
  updateNode: (nodeId: number, p: { title?: string; description?: string; sortOrder?: number; status?: PixelForgeStatus; type?: PixelForgeNodeType }): Promise<PFTreeNode> =>
    api.put(`${B}/nodes/${nodeId}`, p).then((r) => r.data),
  deleteNode: (nodeId: number): Promise<void> => api.delete(`${B}/nodes/${nodeId}`).then(() => undefined),
  moveNode: (nodeId: number, p: { parentId?: number; sortOrder?: number }): Promise<PFTreeNode> =>
    api.post(`${B}/nodes/${nodeId}/move`, p).then((r) => r.data),
  reorderNodes: (p: { orderedIds: number[]; parentId?: number }): Promise<void> =>
    api.post(`${B}/nodes/reorder`, p).then(() => undefined),

  // tasks
  getTask: (id: number): Promise<PFAssignment> => api.get(`${B}/tasks/${id}`).then((r) => r.data),
  createNodeTask: (nodeId: number, p: { createNew: boolean; assignmentId?: number; title?: string; tool?: PixelForgeTool; description?: string; deadline?: string; lectureId?: number; isRequired?: boolean }): Promise<any> =>
    api.post(`${B}/nodes/${nodeId}/tasks`, p).then((r) => r.data),
  updateTask: (id: number, p: { title?: string; description?: string; tool?: PixelForgeTool; deadline?: string | null; lectureId?: number | null; classId?: number | null }): Promise<PFAssignment> =>
    api.put(`${B}/tasks/${id}`, p).then((r) => r.data),
  deleteTask: (id: number): Promise<void> => api.delete(`${B}/tasks/${id}`).then(() => undefined),
  publishTask: (id: number): Promise<void> => api.post(`${B}/tasks/${id}/publish`).then(() => undefined),
  unpublishTask: (id: number): Promise<void> => api.post(`${B}/tasks/${id}/unpublish`).then(() => undefined),
  detachNodeTask: (nodeId: number, nodeTaskId: number): Promise<void> =>
    api.delete(`${B}/nodes/${nodeId}/tasks/${nodeTaskId}`).then(() => undefined),
  reorderNodeTasks: (nodeId: number, orderedIds: number[]): Promise<void> =>
    api.post(`${B}/nodes/${nodeId}/tasks/reorder`, { orderedIds }).then(() => undefined),

  // tests
  listTests: (taskId: number): Promise<PFTest[]> => api.get(`${B}/tasks/${taskId}/tests`).then((r) => r.data),
  createTest: (taskId: number, p: Partial<Omit<PFTest, 'id' | 'assignmentId'>>): Promise<PFTest> =>
    api.post(`${B}/tasks/${taskId}/tests`, p).then((r) => r.data),
  updateTest: (id: number, p: Partial<Omit<PFTest, 'id' | 'assignmentId'>>): Promise<PFTest> =>
    api.put(`${B}/tests/${id}`, p).then((r) => r.data),
  deleteTest: (id: number): Promise<void> => api.delete(`${B}/tests/${id}`).then(() => undefined),

  // hints
  listHints: (taskId: number): Promise<PFHint[]> => api.get(`${B}/tasks/${taskId}/hints`).then((r) => r.data),
  createHint: (taskId: number, p: { content: string; level?: number; unlockAttempts?: number; coinCost?: number; orderIndex?: number }): Promise<PFHint> =>
    api.post(`${B}/tasks/${taskId}/hints`, p).then((r) => r.data),
  updateHint: (id: number, p: Partial<Omit<PFHint, 'id' | 'assignmentId'>>): Promise<PFHint> =>
    api.put(`${B}/hints/${id}`, p).then((r) => r.data),
  deleteHint: (id: number): Promise<void> => api.delete(`${B}/hints/${id}`).then(() => undefined),

  // lectures
  listLectures: (): Promise<PFLecture[]> => api.get(`${B}/lectures`).then((r) => r.data),
  createLecture: (title: string): Promise<PFLecture> => api.post(`${B}/lectures`, { title }).then((r) => r.data),
  updateLecture: (id: number, title: string): Promise<PFLecture> => api.put(`${B}/lectures/${id}`, { title }).then((r) => r.data),
  deleteLecture: (id: number): Promise<void> => api.delete(`${B}/lectures/${id}`).then(() => undefined),
  listCards: (lectureId: number): Promise<PFCard[]> => api.get(`${B}/lectures/${lectureId}/cards`).then((r) => r.data),
  createCard: (lectureId: number, p: { cardType: PixelForgeCardType; content?: string }): Promise<PFCard> =>
    api.post(`${B}/lectures/${lectureId}/cards`, p).then((r) => r.data),
  updateCard: (id: number, p: { cardType?: PixelForgeCardType; content?: string }): Promise<PFCard> =>
    api.put(`${B}/lecture-cards/${id}`, p).then((r) => r.data),
  deleteCard: (id: number): Promise<void> => api.delete(`${B}/lecture-cards/${id}`).then(() => undefined),
  reorderCards: (lectureId: number, orderedIds: number[]): Promise<void> =>
    api.post(`${B}/lectures/${lectureId}/cards/reorder`, { orderedIds }).then(() => undefined),

  // classes (read-only)
  listClasses: (): Promise<PFClass[]> => api.get(`${B}/classes`).then((r) => r.data),
};
