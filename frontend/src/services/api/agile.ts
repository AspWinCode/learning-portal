import { api } from './client';
import type {
  AgileRoleAccessItem,
  AgileRoleAccessResponse,
  ItAnalytics,
  ItBacklog,
  ItBoard,
  ItChecklistItem,
  ItEpic,
  ItIssue,
  ItIssueComment,
  ItIssueShort,
  ItProject,
  ItSprint,
} from '../../types';

const BASE = '/agile';

export const agileApi = {
  // Доступ по ролям
  getRoleAccess: (): Promise<AgileRoleAccessResponse> =>
    api.get(`${BASE}/role-access`).then(r => r.data),

  updateRoleAccess: (data: { role: string; enabled: boolean; access_level: string }): Promise<AgileRoleAccessItem> =>
    api.patch(`${BASE}/role-access`, data).then(r => r.data),

  // Проекты
  listProjects: (status?: string): Promise<ItProject[]> =>
    api.get(`${BASE}/projects`, { params: status ? { status_filter: status } : {} }).then(r => r.data),

  getProject: (id: number): Promise<ItProject> =>
    api.get(`${BASE}/projects/${id}`).then(r => r.data),

  createProject: (data: { name: string; key: string; description?: string; visibility?: string }): Promise<ItProject> =>
    api.post(`${BASE}/projects`, data).then(r => r.data),

  updateProject: (id: number, data: Partial<{ name: string; description: string; visibility: string; status: string }>): Promise<ItProject> =>
    api.patch(`${BASE}/projects/${id}`, data).then(r => r.data),

  // Участники
  listMembers: (projectId: number) =>
    api.get(`${BASE}/projects/${projectId}/members`).then(r => r.data),

  addMember: (projectId: number, userId: number, role: string) =>
    api.post(`${BASE}/projects/${projectId}/members`, { user_id: userId, role }).then(r => r.data),

  updateMember: (projectId: number, userId: number, role: string) =>
    api.patch(`${BASE}/projects/${projectId}/members/${userId}`, { role }).then(r => r.data),

  removeMember: (projectId: number, userId: number) =>
    api.delete(`${BASE}/projects/${projectId}/members/${userId}`),

  // Эпики
  listEpics: (projectId: number): Promise<ItEpic[]> =>
    api.get(`${BASE}/projects/${projectId}/epics`).then(r => r.data),

  createEpic: (projectId: number, data: Partial<ItEpic>): Promise<ItEpic> =>
    api.post(`${BASE}/projects/${projectId}/epics`, data).then(r => r.data),

  updateEpic: (projectId: number, epicId: number, data: Partial<ItEpic>): Promise<ItEpic> =>
    api.patch(`${BASE}/projects/${projectId}/epics/${epicId}`, data).then(r => r.data),

  deleteEpic: (projectId: number, epicId: number) =>
    api.delete(`${BASE}/projects/${projectId}/epics/${epicId}`),

  // Спринты
  listSprints: (projectId: number): Promise<ItSprint[]> =>
    api.get(`${BASE}/projects/${projectId}/sprints`).then(r => r.data),

  createSprint: (projectId: number, data: Partial<ItSprint>): Promise<ItSprint> =>
    api.post(`${BASE}/projects/${projectId}/sprints`, data).then(r => r.data),

  updateSprint: (projectId: number, sprintId: number, data: Partial<ItSprint>): Promise<ItSprint> =>
    api.patch(`${BASE}/projects/${projectId}/sprints/${sprintId}`, data).then(r => r.data),

  startSprint: (projectId: number, sprintId: number): Promise<ItSprint> =>
    api.patch(`${BASE}/projects/${projectId}/sprints/${sprintId}/start`).then(r => r.data),

  completeSprint: (projectId: number, sprintId: number, moveToBacklog = true): Promise<ItSprint> =>
    api.patch(`${BASE}/projects/${projectId}/sprints/${sprintId}/complete`, null, {
      params: { move_to_backlog: moveToBacklog },
    }).then(r => r.data),

  // Задачи
  listIssues: (projectId: number, params?: { sprint_id?: number; epic_id?: number; status_filter?: string; assignee_id?: number }): Promise<ItIssueShort[]> =>
    api.get(`${BASE}/projects/${projectId}/issues`, { params }).then(r => r.data),

  getIssue: (projectId: number, issueId: number): Promise<ItIssue> =>
    api.get(`${BASE}/projects/${projectId}/issues/${issueId}`).then(r => r.data),

  createIssue: (projectId: number, data: {
    title: string; type?: string; priority?: string; epic_id?: number; sprint_id?: number;
    assignee_id?: number; story_points?: number; description?: string; due_date?: string; labels?: string[];
  }): Promise<ItIssue> =>
    api.post(`${BASE}/projects/${projectId}/issues`, data).then(r => r.data),

  updateIssue: (projectId: number, issueId: number, data: Partial<ItIssue>): Promise<ItIssue> =>
    api.patch(`${BASE}/projects/${projectId}/issues/${issueId}`, data).then(r => r.data),

  moveIssue: (projectId: number, issueId: number, data: { status: string; position?: number; sprint_id?: number }): Promise<ItIssue> =>
    api.patch(`${BASE}/projects/${projectId}/issues/${issueId}/move`, data).then(r => r.data),

  deleteIssue: (projectId: number, issueId: number) =>
    api.delete(`${BASE}/projects/${projectId}/issues/${issueId}`),

  // Чеклист
  addChecklistItem: (projectId: number, issueId: number, text: string): Promise<ItChecklistItem> =>
    api.post(`${BASE}/projects/${projectId}/issues/${issueId}/checklist`, { text }).then(r => r.data),

  updateChecklistItem: (projectId: number, issueId: number, itemId: number, data: Partial<ItChecklistItem>): Promise<ItChecklistItem> =>
    api.patch(`${BASE}/projects/${projectId}/issues/${issueId}/checklist/${itemId}`, data).then(r => r.data),

  deleteChecklistItem: (projectId: number, issueId: number, itemId: number) =>
    api.delete(`${BASE}/projects/${projectId}/issues/${issueId}/checklist/${itemId}`),

  // Комментарии
  addComment: (projectId: number, issueId: number, text: string): Promise<ItIssueComment> =>
    api.post(`${BASE}/projects/${projectId}/issues/${issueId}/comments`, { text }).then(r => r.data),

  deleteComment: (projectId: number, issueId: number, commentId: number) =>
    api.delete(`${BASE}/projects/${projectId}/issues/${issueId}/comments/${commentId}`),

  // Доска
  getBoard: (projectId: number, sprintId?: number): Promise<ItBoard> =>
    api.get(`${BASE}/projects/${projectId}/board`, { params: sprintId ? { sprint_id: sprintId } : {} }).then(r => r.data),

  // Бэклог
  getBacklog: (projectId: number): Promise<ItBacklog> =>
    api.get(`${BASE}/projects/${projectId}/backlog`).then(r => r.data),

  // Аналитика
  getAnalytics: (projectId: number, sprintId?: number): Promise<ItAnalytics> =>
    api.get(`${BASE}/projects/${projectId}/analytics`, { params: sprintId ? { sprint_id: sprintId } : {} }).then(r => r.data),
};
