import type {
  LinkedPersonItem,
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceCounterparty,
  OwnerWorkspaceCounterpartyCustomField,
  OwnerWorkspaceCounterpartyDocument,
  OwnerWorkspaceContact,
  OwnerWorkspaceConversation,
  OwnerWorkspaceDigest,
  OwnerWorkspaceHistoryStats,
  OwnerWorkspaceMessage,
  OwnerWorkspaceMeeting,
  OwnerWorkspaceNotificationsEnvelope,
  OwnerWorkspaceProject,
  OwnerWorkspaceProjectDocument,
  OwnerWorkspaceProjectDocumentFolder,
  OwnerWorkspaceSearchResult,
  OwnerWorkspaceTask,
  OwnerWorkspaceTaskComment,
  OwnerWorkspaceTaskCompleteResult,
  OwnerWorkspaceTaskListPage,
  OwnerWorkspaceTaskStatusCounts,
  OwnerWorkspaceTasksAnalyticsOverview,
  OwnerWorkspaceUserPreferences,
  OwnerWorkspaceWebPushStatus,
} from '../../types';
import { api } from './client';

export const ownerWorkspaceApi = {
  listProjects: async (params?: {
    status_filter?: string;
    parent_project_id?: number;
    counterparty_id?: number;
    search?: string;
    owner_id?: number;
    has_overdue_tasks?: boolean;
  }): Promise<OwnerWorkspaceProject[]> => {
    const response = await api.get('/api/owner-workspace/projects', { params: params || {} });
    return response.data;
  },
  getProject: async (projectId: number): Promise<OwnerWorkspaceProject> => {
    const response = await api.get(`/api/owner-workspace/projects/${projectId}`);
    return response.data;
  },
  createProject: async (payload: {
    name: string;
    description?: string | null;
    status?: string;
    owner_id?: number | null;
    parent_project_id?: number | null;
    counterparty_id?: number | null;
    start_at?: string | null;
    deadline_at?: string | null;
  }): Promise<OwnerWorkspaceProject> => {
    const response = await api.post('/api/owner-workspace/projects', payload);
    return response.data;
  },
  updateProject: async (
    projectId: number,
    payload: {
      name?: string;
      description?: string | null;
      status?: string;
      owner_id?: number | null;
      parent_project_id?: number | null;
      counterparty_id?: number | null;
      start_at?: string | null;
      deadline_at?: string | null;
    }
  ): Promise<OwnerWorkspaceProject> => {
    const response = await api.patch(`/api/owner-workspace/projects/${projectId}`, payload);
    return response.data;
  },
  // Project Documents
  listProjectDocumentFolders: async (projectId: number): Promise<OwnerWorkspaceProjectDocumentFolder[]> => {
    const response = await api.get(`/api/owner-workspace/projects/${projectId}/document-folders`);
    return response.data;
  },
  createProjectDocumentFolder: async (
    projectId: number,
    payload: { name: string; parent_id?: number | null }
  ): Promise<OwnerWorkspaceProjectDocumentFolder> => {
    const response = await api.post(`/api/owner-workspace/projects/${projectId}/document-folders`, payload);
    return response.data;
  },
  updateProjectDocumentFolder: async (
    projectId: number,
    folderId: number,
    payload: { name?: string; parent_id?: number | null }
  ): Promise<OwnerWorkspaceProjectDocumentFolder> => {
    const response = await api.patch(`/api/owner-workspace/projects/${projectId}/document-folders/${folderId}`, payload);
    return response.data;
  },
  deleteProjectDocumentFolder: async (projectId: number, folderId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/projects/${projectId}/document-folders/${folderId}`);
  },
  listProjectDocuments: async (projectId: number): Promise<OwnerWorkspaceProjectDocument[]> => {
    const response = await api.get(`/api/owner-workspace/projects/${projectId}/documents`);
    return response.data;
  },
  uploadProjectDocument: async (projectId: number, file: File, folderId?: number | null): Promise<OwnerWorkspaceProjectDocument> => {
    const form = new FormData();
    if (folderId != null) form.append('folder_id', String(folderId));
    form.append('file', file);
    const response = await api.post(`/api/owner-workspace/projects/${projectId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  downloadProjectDocumentUrl: (projectId: number, documentId: number): string =>
    `/api/owner-workspace/projects/${projectId}/documents/${documentId}/download`,
  viewProjectDocumentUrl: (projectId: number, documentId: number): string =>
    `/api/owner-workspace/projects/${projectId}/documents/${documentId}/download?inline=true`,
  renameProjectDocument: async (
    projectId: number,
    documentId: number,
    filename: string
  ): Promise<OwnerWorkspaceProjectDocument> => {
    const response = await api.patch(
      `/api/owner-workspace/projects/${projectId}/documents/${documentId}`,
      { filename }
    );
    return response.data;
  },
  deleteProjectDocument: async (projectId: number, documentId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/projects/${projectId}/documents/${documentId}`);
  },
  archiveProject: async (projectId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/projects/${projectId}`);
  },
  listCounterparties: async (params?: {
    search?: string;
    project_id?: number;
    archived?: boolean;
  }): Promise<OwnerWorkspaceCounterparty[]> => {
    const response = await api.get('/api/owner-workspace/counterparties', { params: params || {} });
    return response.data;
  },
  getCounterparty: async (contactId: number): Promise<OwnerWorkspaceCounterparty> => {
    const response = await api.get(`/api/owner-workspace/counterparties/${contactId}`);
    return response.data;
  },
  createCounterparty: async (payload: {
    full_name: string;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    position?: string | null;
    tags?: string[];
    comment?: string | null;
    source?: string | null;
    project_ids?: number[];
    custom_fields?: OwnerWorkspaceCounterpartyCustomField[];
    linked_persons?: LinkedPersonItem[];
  }): Promise<OwnerWorkspaceCounterparty> => {
    const response = await api.post('/api/owner-workspace/counterparties', payload);
    return response.data;
  },
  updateCounterparty: async (
    contactId: number,
    payload: {
      full_name?: string;
      phone?: string | null;
      email?: string | null;
      company?: string | null;
      position?: string | null;
      tags?: string[];
      comment?: string | null;
      source?: string | null;
      project_ids?: number[];
      custom_fields?: OwnerWorkspaceCounterpartyCustomField[];
      linked_persons?: LinkedPersonItem[];
      counterparty_role?: string | null;
      inn?: string | null;
      kpp?: string | null;
      ogrn?: string | null;
      legal_address?: string | null;
      actual_address?: string | null;
      website?: string | null;
      industry?: string | null;
      bank_account?: string | null;
      bank_corr_account?: string | null;
      bank_bik?: string | null;
      bank_name?: string | null;
      bank_currency?: string | null;
    }
  ): Promise<OwnerWorkspaceCounterparty> => {
    const response = await api.patch(`/api/owner-workspace/counterparties/${contactId}`, payload);
    return response.data;
  },
  archiveCounterparty: async (contactId: number): Promise<OwnerWorkspaceCounterparty> => {
    const response = await api.post(`/api/owner-workspace/counterparties/${contactId}/archive`);
    return response.data;
  },
  unarchiveCounterparty: async (contactId: number): Promise<OwnerWorkspaceCounterparty> => {
    const response = await api.post(`/api/owner-workspace/counterparties/${contactId}/unarchive`);
    return response.data;
  },
  deleteCounterparty: async (contactId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/counterparties/${contactId}`);
  },
  listCounterpartyDocuments: async (contactId: number): Promise<OwnerWorkspaceCounterpartyDocument[]> => {
    const response = await api.get(`/api/owner-workspace/counterparties/${contactId}/documents`);
    return response.data;
  },
  uploadCounterpartyDocument: async (
    contactId: number,
    category: string,
    file: File
  ): Promise<OwnerWorkspaceCounterpartyDocument> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post(`/api/owner-workspace/counterparties/${contactId}/documents/${category}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  deleteCounterpartyDocument: async (
    contactId: number,
    category: string
  ): Promise<OwnerWorkspaceCounterpartyDocument> => {
    const response = await api.delete(`/api/owner-workspace/counterparties/${contactId}/documents/${category}`);
    return response.data;
  },
  downloadCounterpartyDocument: async (
    contactId: number,
    category: string
  ): Promise<{ blob: Blob; filename: string | null }> => {
    const response = await api.get(`/api/owner-workspace/counterparties/${contactId}/documents/${category}`, {
      responseType: 'blob',
    });
    const disposition = String(response.headers['content-disposition'] || '');
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return { blob: response.data, filename: match ? match[1] : null };
  },
  listCounterpartyContacts: async (counterpartyId: number): Promise<OwnerWorkspaceContact[]> => {
    const response = await api.get(`/api/owner-workspace/counterparties/${counterpartyId}/contacts`);
    return response.data;
  },
  linkContactToCounterparty: async (counterpartyId: number, contactId: number): Promise<void> => {
    await api.post(`/api/owner-workspace/counterparties/${counterpartyId}/contacts`, { contact_id: contactId });
  },
  unlinkContactFromCounterparty: async (counterpartyId: number, contactId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/counterparties/${counterpartyId}/contacts/${contactId}`);
  },
  getContact: async (contactId: number): Promise<OwnerWorkspaceContact> => {
    const response = await api.get(`/api/owner-workspace/contacts/${contactId}`);
    return response.data;
  },
  updateContact: async (
    contactId: number,
    payload: {
      full_name?: string;
      phone?: string;
      email?: string | null;
      company?: string | null;
      position?: string | null;
      tags?: string[];
      comment?: string | null;
      source?: string | null;
    }
  ): Promise<OwnerWorkspaceContact> => {
    const response = await api.patch(`/api/owner-workspace/contacts/${contactId}`, payload);
    return response.data;
  },
  deleteContact: async (contactId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/contacts/${contactId}`);
  },
  getContactTasks: async (contactId: number): Promise<OwnerWorkspaceTask[]> => {
    const response = await api.get(`/api/owner-workspace/contacts/${contactId}/tasks`);
    return response.data;
  },
  getDigest: async (params?: {
    due_within_hours?: number;
    assignee_id?: number;
    project_id?: number;
  }): Promise<OwnerWorkspaceDigest> => {
    const response = await api.get('/api/owner-workspace/digest', { params: params || {} });
    return response.data;
  },
  listMeetings: async (params?: {
    search?: string;
    status_filter?: string;
    project_id?: number;
    contact_id?: number;
    responsible_user_id?: number;
    meeting_type?: string;
    date_from?: string;
    date_to?: string;
    overdue_only?: boolean;
    completed_only?: boolean;
    cancelled_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<OwnerWorkspaceMeeting[]> => {
    const response = await api.get('/api/owner-workspace/meetings', { params: params || {} });
    return response.data;
  },
  createMeeting: async (payload: {
    title: string;
    meeting_date: string;
    meeting_time: string;
    responsible_user_id?: number | null;
    project_id?: number | null;
    contact_ids?: number[];
    participant_user_ids?: number[];
    meeting_type?: string;
    address?: string | null;
    online_url?: string | null;
    recurrence_type?: string;
    reminder_type?: string | null;
    agenda?: string | null;
    meeting_result?: string | null;
    next_steps?: string | null;
  }): Promise<OwnerWorkspaceMeeting> => {
    const response = await api.post('/api/owner-workspace/meetings', payload);
    return response.data;
  },
  updateMeeting: async (
    meetingId: number,
    payload: Partial<{
      title: string;
      meeting_date: string;
      meeting_time: string;
      status: string;
      responsible_user_id: number | null;
      project_id: number | null;
      contact_ids: number[];
      participant_user_ids: number[];
      meeting_type: string;
      address: string | null;
      online_url: string | null;
      recurrence_type: string;
      reminder_type: string | null;
      agenda: string | null;
      meeting_result: string | null;
      next_steps: string | null;
    }>
  ): Promise<OwnerWorkspaceMeeting> => {
    const response = await api.patch(`/api/owner-workspace/meetings/${meetingId}`, payload);
    return response.data;
  },
  deleteMeeting: async (meetingId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/meetings/${meetingId}`);
  },
  closeMeeting: async (meetingId: number, payload: { meeting_result: string; next_steps?: string | null }): Promise<OwnerWorkspaceMeeting> => {
    const response = await api.post(`/api/owner-workspace/meetings/${meetingId}/close`, payload);
    return response.data;
  },
  cancelMeeting: async (meetingId: number): Promise<OwnerWorkspaceMeeting> => {
    const response = await api.post(`/api/owner-workspace/meetings/${meetingId}/cancel`);
    return response.data;
  },
  rescheduleMeeting: async (meetingId: number, payload: { meeting_date: string; meeting_time: string; reason?: string | null }): Promise<OwnerWorkspaceMeeting> => {
    const response = await api.post(`/api/owner-workspace/meetings/${meetingId}/reschedule`, payload);
    return response.data;
  },
  createTaskFromMeeting: async (
    meetingId: number,
    payload: { title: string; description?: string | null; assignee_id?: number | null; deadline_at?: string | null; priority?: string }
  ): Promise<OwnerWorkspaceTask> => {
    const response = await api.post(`/api/owner-workspace/meetings/${meetingId}/tasks`, payload);
    return response.data;
  },
  unifiedSearch: async (q: string, limit?: number): Promise<OwnerWorkspaceSearchResult> => {
    const response = await api.get('/api/owner-workspace/search', {
      params: { q, ...(limit != null ? { limit } : {}) },
    });
    return response.data;
  },
  listContacts: async (params?: {
    search?: string;
    project_id?: number;
    active_tasks_only?: boolean;
    tag?: string;
  }): Promise<OwnerWorkspaceContact[]> => {
    const response = await api.get('/api/owner-workspace/contacts', { params: params || {} });
    return response.data;
  },
  createContact: async (payload: {
    full_name: string;
    phone: string;
    email?: string | null;
    company?: string | null;
    position?: string | null;
    tags?: string[];
    comment?: string | null;
    source?: string | null;
    project_ids?: number[];
  }): Promise<OwnerWorkspaceContact> => {
    const response = await api.post('/api/owner-workspace/contacts', payload);
    return response.data;
  },
  listTasks: async (params?: {
    project_id?: number;
    contact_id?: number;
    status_filter?: string;
    priority?: string;
    assignee_id?: number;
    deadline_from?: string;
    deadline_to?: string;
    overdue_only?: boolean;
    active_only?: boolean;
    search?: string;
    sort_by?: 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority' | 'status' | 'assignee' | 'project' | 'contact';
    sort_dir?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }): Promise<OwnerWorkspaceTaskListPage> => {
    const response = await api.get('/api/owner-workspace/tasks', { params: params || {} });
    return response.data;
  },
  getTaskStatusCounts: async (params?: {
    project_id?: number;
    contact_id?: number;
    priority?: string;
    assignee_id?: number;
    deadline_from?: string;
    deadline_to?: string;
    overdue_only?: boolean;
    active_only?: boolean;
    search?: string;
  }): Promise<OwnerWorkspaceTaskStatusCounts> => {
    const response = await api.get('/api/owner-workspace/tasks/status-counts', { params: params || {} });
    return response.data;
  },
  getTasksAnalyticsOverview: async (): Promise<OwnerWorkspaceTasksAnalyticsOverview> => {
    const response = await api.get('/api/owner-workspace/analytics/tasks-overview');
    return response.data;
  },
  createTask: async (payload: {
    title: string;
    description?: string | null;
    status?: 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
    priority?: 'low' | 'medium' | 'high' | 'critical';
    deadline_at?: string | null;
    start_at?: string | null;
    assignee_id?: number | null;
    project_id?: number | null;
    contact_id?: number | null;
    tags?: string[];
    checklist?: Array<Record<string, unknown>>;
    attachments?: Array<Record<string, unknown>>;
    linked_message_ids?: number[];
    previous_task_id?: number | null;
    watcher_ids?: number[];
    reminder_at?: string | null;
    repeat?: Record<string, unknown> | null;
    effort_hours?: number | null;
    effort_minutes?: number | null;
  }): Promise<OwnerWorkspaceTask> => {
    const response = await api.post('/api/owner-workspace/tasks', payload);
    return response.data;
  },
  completeTask: async (
    taskId: number,
    payload?: {
      action?: 'close' | 'close_and_create_next';
      next_task?: {
        title: string;
        description?: string | null;
        status?: 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
        priority?: 'low' | 'medium' | 'high' | 'critical';
        deadline_at?: string | null;
        assignee_id?: number | null;
        project_id?: number | null;
        contact_id?: number | null;
      };
    }
  ): Promise<OwnerWorkspaceTaskCompleteResult> => {
    const response = await api.post(`/api/owner-workspace/tasks/${taskId}/complete`, payload || { action: 'close' });
    return response.data;
  },
  listNotifications: async (params?: {
    unread_only?: boolean;
    limit?: number;
    due_soon_hours?: number;
  }): Promise<OwnerWorkspaceNotificationsEnvelope> => {
    const response = await api.get('/api/owner-workspace/notifications', { params: params || {} });
    return response.data;
  },
  markNotificationRead: async (notificationId: number): Promise<void> => {
    await api.patch(`/api/owner-workspace/notifications/${notificationId}/read`);
  },
  getMyPreferences: async (): Promise<OwnerWorkspaceUserPreferences> => {
    const response = await api.get('/api/owner-workspace/me/preferences');
    return response.data;
  },
  patchMyPreferences: async (
    payload: Partial<OwnerWorkspaceUserPreferences>
  ): Promise<OwnerWorkspaceUserPreferences> => {
    const response = await api.patch('/api/owner-workspace/me/preferences', payload);
    return response.data;
  },
  getMyWebPushStatus: async (): Promise<OwnerWorkspaceWebPushStatus> => {
    const response = await api.get('/api/owner-workspace/me/web-push');
    return response.data;
  },
  upsertMyWebPushSubscription: async (payload: {
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string | null;
  }): Promise<OwnerWorkspaceWebPushStatus> => {
    const response = await api.post('/api/owner-workspace/me/web-push/subscriptions', payload);
    return response.data;
  },
  removeMyWebPushSubscription: async (endpoint: string): Promise<OwnerWorkspaceWebPushStatus> => {
    const response = await api.post('/api/owner-workspace/me/web-push/subscriptions/remove', { endpoint });
    return response.data;
  },
  listMessages: async (params?: { contact_id?: number }): Promise<OwnerWorkspaceMessage[]> => {
    const response = await api.get('/api/owner-workspace/messages', { params: params || {} });
    return response.data;
  },
  listConversations: async (): Promise<OwnerWorkspaceConversation[]> => {
    const response = await api.get('/api/owner-workspace/messages/conversations');
    return response.data;
  },
  createTaskFromMessage: async (
    messageId: number,
    payload: {
      title: string;
      description?: string | null;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      deadline_at?: string | null;
      assignee_id?: number | null;
      project_id?: number | null;
    }
  ): Promise<OwnerWorkspaceTask> => {
    const response = await api.post(`/api/owner-workspace/messages/${messageId}/create-task`, payload);
    return response.data;
  },
  getTask: async (taskId: number): Promise<OwnerWorkspaceTask> => {
    const response = await api.get(`/api/owner-workspace/tasks/${taskId}`);
    return response.data;
  },
  deleteTask: async (taskId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/tasks/${taskId}`);
  },
  updateTask: async (
    taskId: number,
    payload: {
      title?: string;
      description?: string | null;
      status?: 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
      priority?: 'low' | 'medium' | 'high' | 'critical';
      deadline_at?: string | null;
      start_at?: string | null;
      assignee_id?: number | null;
      project_id?: number | null;
      contact_id?: number | null;
      tags?: string[];
      checklist?: Array<Record<string, unknown>>;
      attachments?: Array<Record<string, unknown>>;
      linked_message_ids?: number[];
    }
  ): Promise<OwnerWorkspaceTask> => {
    const response = await api.patch(`/api/owner-workspace/tasks/${taskId}`, payload);
    return response.data;
  },
  getTaskComments: async (taskId: number): Promise<OwnerWorkspaceTaskComment[]> => {
    const response = await api.get(`/api/owner-workspace/tasks/${taskId}/comments`);
    return response.data;
  },
  addTaskComment: async (taskId: number, text: string): Promise<OwnerWorkspaceTaskComment> => {
    const response = await api.post(`/api/owner-workspace/tasks/${taskId}/comments`, { text });
    return response.data;
  },
  addProjectContact: async (projectId: number, contactId: number): Promise<void> => {
    await api.post(`/api/owner-workspace/projects/${projectId}/contacts`, { contact_id: contactId });
  },
  removeProjectContact: async (projectId: number, contactId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/projects/${projectId}/contacts/${contactId}`);
  },
  getContactMessages: async (contactId: number): Promise<OwnerWorkspaceMessage[]> => {
    const response = await api.get(`/api/owner-workspace/contacts/${contactId}/messages`);
    return response.data;
  },
  createMessage: async (payload: {
    contact_id: number;
    text: string;
    direction?: 'incoming' | 'outgoing';
    external_chat_id?: string | null;
    external_message_id?: string | null;
  }): Promise<OwnerWorkspaceMessage> => {
    const response = await api.post('/api/owner-workspace/messages', payload);
    return response.data;
  },
  listHistory: async (params?: {
    entity_type?: string;
    entity_id?: number;
    action_type?: string;
    author_id?: number;
    created_from?: string;
    created_to?: string;
    limit?: number;
    sort_order?: 'asc' | 'desc';
  }): Promise<OwnerWorkspaceAuditLog[]> => {
    const response = await api.get('/api/owner-workspace/history', { params: params || {} });
    return response.data;
  },
  getHistoryStats: async (params?: {
    entity_type?: string;
    entity_id?: number;
    action_type?: string;
    author_id?: number;
    created_from?: string;
    created_to?: string;
  }): Promise<OwnerWorkspaceHistoryStats> => {
    const response = await api.get('/api/owner-workspace/history/stats', { params: params || {} });
    return response.data;
  },
  addProjectParticipant: async (
    projectId: number,
    userId: number,
    role: 'member' | 'manager' | 'observer' = 'member'
  ): Promise<void> => {
    await api.post(`/api/owner-workspace/projects/${projectId}/participants`, { user_id: userId, role });
  },
  patchProjectParticipantRole: async (
    projectId: number,
    userId: number,
    role: 'member' | 'manager' | 'observer'
  ): Promise<void> => {
    await api.patch(`/api/owner-workspace/projects/${projectId}/participants/${userId}`, { role });
  },
  removeProjectParticipant: async (projectId: number, userId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/projects/${projectId}/participants/${userId}`);
  },
  linkMessageToTask: async (messageId: number, taskId: number): Promise<void> => {
    await api.post(`/api/owner-workspace/messages/${messageId}/link-task`, { task_id: taskId });
  },
  bulkUpdateTasks: async (payload: {
    task_ids: number[];
    status?: 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
    assignee_id?: number | null;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    deadline_at?: string | null;
  }): Promise<{ updated: number }> => {
    const response = await api.post('/api/owner-workspace/tasks/bulk-update', payload);
    return response.data;
  },
  syncMessagesFromMax: async (limit?: number): Promise<{ imported: number; skipped: number }> => {
    const response = await api.post(
      '/api/owner-workspace/messages/sync-from-max',
      {},
      {
        params: limit != null ? { limit } : {},
      }
    );
    return response.data;
  },

  // ── Task Templates ──────────────────────────────────────────────────────────
  listTaskTemplates: async (): Promise<import('../../types').OwnerWorkspaceTaskTemplate[]> => {
    const response = await api.get('/api/owner-workspace/task-templates');
    return response.data;
  },
  createTaskTemplate: async (payload: {
    name: string;
    description?: string | null;
    priority?: string | null;
    tags?: string[];
    checklist?: Array<{ text: string; done?: boolean }>;
    effort_hours?: number | null;
    effort_minutes?: number | null;
  }): Promise<import('../../types').OwnerWorkspaceTaskTemplate> => {
    const response = await api.post('/api/owner-workspace/task-templates', payload);
    return response.data;
  },
  updateTaskTemplate: async (
    id: number,
    payload: {
      name?: string;
      description?: string | null;
      priority?: string | null;
      tags?: string[];
      checklist?: Array<{ text: string; done?: boolean }>;
      effort_hours?: number | null;
      effort_minutes?: number | null;
    }
  ): Promise<import('../../types').OwnerWorkspaceTaskTemplate> => {
    const response = await api.patch(`/api/owner-workspace/task-templates/${id}`, payload);
    return response.data;
  },
  deleteTaskTemplate: async (id: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/task-templates/${id}`);
  },
};
