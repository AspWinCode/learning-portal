import { api } from './api/client';

// ─── Types (mirror ТехноЛаб / pro-reshaut Admin API) ─────────────────────────

export type TechnoLabCourseStatus = 'draft' | 'published' | 'archived';
export type TechnoLabNodeType = 'module' | 'submodule' | 'topic' | 'subtopic';
export type TechnoLabTaskType = 'python_io' | 'python_oop' | 'python_numpy' | 'sql_query' | 'cpp_io' | 'js_io';
export type TechnoLabRunnerType = 'stdin_runner' | 'pytest_runner' | 'sql_runner' | 'cpp_runner' | 'js_runner';
export type TechnoLabTestType = 'public' | 'hidden';

export interface TechnoLabCourse {
  id: number;
  title: string;
  slug: string | null;
  description: string | null;
  short_description: string | null;
  cover_image_url: string | null;
  status: TechnoLabCourseStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface TechnoLabNodeTask {
  id: number;
  node_id: number;
  task_id: number;
  task_title: string;
  sort_order: number;
  is_required: boolean;
}

export interface TechnoLabNode {
  id: number;
  course_id: number;
  parent_id: number | null;
  type: TechnoLabNodeType;
  title: string;
  description: string | null;
  sort_order: number;
  status: string;
  has_children: boolean;
  task_count: number;
  can_attach_tasks: boolean;
  can_create_children: boolean;
  children: TechnoLabNode[];
  tasks?: TechnoLabNodeTask[];
}

export interface TechnoLabTaskTest {
  id: number;
  task_id: number;
  test_type: TechnoLabTestType;
  input_data: string | null;
  expected_output: string | null;
  verification_sql: string | null;
  test_files: any[] | null;
  weight: number;
  order_index: number;
}

export interface TechnoLabTaskLecture {
  id: number;
  task_id: number;
  content: string;
  unlock_attempts: number;
}

export interface TechnoLabTask {
  id: number;
  submodule_id: number | null;
  title: string;
  description: string | null;
  task_type: TechnoLabTaskType;
  runner_type: TechnoLabRunnerType;
  status: string;
  version: number;
  reward_coins: number;
  sql_schema: string | null;
  sql_seed: string | null;
  created_at: string;
  updated_at: string;
  tests?: TechnoLabTaskTest[];
  lectures?: TechnoLabTaskLecture[];
}

const BASE = '/technolab';

export const technolabApi = {
  // Courses
  listCourses: (): Promise<TechnoLabCourse[]> => api.get(`${BASE}/courses`).then((r) => r.data),
  createCourse: (payload: Partial<TechnoLabCourse>): Promise<TechnoLabCourse> =>
    api.post(`${BASE}/courses`, payload).then((r) => r.data),
  getCourse: (id: number): Promise<TechnoLabCourse> => api.get(`${BASE}/courses/${id}`).then((r) => r.data),
  updateCourse: (id: number, payload: Partial<TechnoLabCourse>): Promise<TechnoLabCourse> =>
    api.patch(`${BASE}/courses/${id}`, payload).then((r) => r.data),
  deleteCourse: (id: number): Promise<void> => api.delete(`${BASE}/courses/${id}`).then(() => undefined),
  getCourseTree: (id: number): Promise<TechnoLabNode[]> => api.get(`${BASE}/courses/${id}/tree`).then((r) => r.data),

  // Nodes
  createNode: (courseId: number, payload: Partial<TechnoLabNode> & { type: TechnoLabNodeType; title: string }): Promise<TechnoLabNode> =>
    api.post(`${BASE}/courses/${courseId}/nodes`, payload).then((r) => r.data),
  updateNode: (nodeId: number, payload: Partial<TechnoLabNode>): Promise<TechnoLabNode> =>
    api.patch(`${BASE}/nodes/${nodeId}`, payload).then((r) => r.data),
  deleteNode: (nodeId: number): Promise<void> => api.delete(`${BASE}/nodes/${nodeId}`).then(() => undefined),

  // Node ↔ task attachment (создание задачи методистом)
  createNodeTask: (
    nodeId: number,
    payload: { create_new_task: boolean; task_title?: string; task_id?: number }
  ): Promise<TechnoLabNodeTask> => api.post(`${BASE}/nodes/${nodeId}/tasks`, payload).then((r) => r.data),
  deleteNodeTask: (nodeId: number, nodeTaskId: number): Promise<void> =>
    api.delete(`${BASE}/nodes/${nodeId}/tasks/${nodeTaskId}`).then(() => undefined),

  // Tasks
  getTask: (taskId: number): Promise<TechnoLabTask> => api.get(`${BASE}/tasks/${taskId}`).then((r) => r.data),
  updateTask: (taskId: number, payload: Partial<TechnoLabTask>): Promise<TechnoLabTask> =>
    api.patch(`${BASE}/tasks/${taskId}`, payload).then((r) => r.data),
  deleteTask: (taskId: number): Promise<void> => api.delete(`${BASE}/tasks/${taskId}`).then(() => undefined),

  // Tests
  createTest: (taskId: number, payload: Partial<TechnoLabTaskTest>): Promise<TechnoLabTaskTest> =>
    api.post(`${BASE}/tasks/${taskId}/tests`, payload).then((r) => r.data),
  updateTest: (testId: number, payload: Partial<TechnoLabTaskTest>): Promise<TechnoLabTaskTest> =>
    api.patch(`${BASE}/tests/${testId}`, payload).then((r) => r.data),
  deleteTest: (testId: number): Promise<void> => api.delete(`${BASE}/tests/${testId}`).then(() => undefined),

  // Lectures
  createLecture: (taskId: number, payload: Partial<TechnoLabTaskLecture>): Promise<TechnoLabTaskLecture> =>
    api.post(`${BASE}/tasks/${taskId}/lectures`, payload).then((r) => r.data),
  updateLecture: (lectureId: number, payload: Partial<TechnoLabTaskLecture>): Promise<TechnoLabTaskLecture> =>
    api.patch(`${BASE}/lectures/${lectureId}`, payload).then((r) => r.data),
  deleteLecture: (lectureId: number): Promise<void> => api.delete(`${BASE}/lectures/${lectureId}`).then(() => undefined),
};
