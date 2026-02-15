import axios from 'axios';
import {
  User,
  Student,
  Group,
  Program,
  ProgramSummary,
  Grade,
  Characteristic,
  CharacteristicTemplate,
  CharacteristicField,
  Abonement,
  Lead,
  LeadCommunicationChannel,
  LeadTask,
  Invoice,
  LeadStatus,
  EventItem,
  EventRegistration,
  EventStatus,
  LeadSource,
  LeadTaskTemplate,
  LeadTaskStatusOption,
  SalesDashboardData,
  FollowUpItem,
  LeadInfoTemplate,
  LeadCommunication,
  LeadPushStats,
} from '../types';

// In production we usually serve frontend + backend behind the same domain.
// If REACT_APP_API_URL is not set, fall back to same-origin (so you can change domain without rebuilding).
// For local dev, create frontend/.env with: REACT_APP_API_URL=http://localhost:8000
const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor для добавления токена
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email: string, password: string) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);
    const response = await api.post('/api/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  guestLogin: async () => {
    const response = await api.post('/api/auth/guest');
    return response.data as { access_token: string; token_type: string };
  },
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
  passwordReset: async (email: string) => {
    // backward-compatible alias
    const response = await api.post('/api/auth/password-reset', { email });
    return response.data;
  },
  passwordResetRequest: async (email: string) => {
    const response = await api.post('/api/auth/password-reset/request', { email });
    return response.data as { message: string; debug_code?: string; hint?: string };
  },
  passwordResetConfirm: async (email: string, code: string, new_password: string) => {
    const response = await api.post('/api/auth/password-reset/confirm', { email, code, new_password });
    return response.data as { message: string };
  },
};

export const usersApi = {
  getAll: async (role?: string): Promise<User[]> => {
    // Backend collection routes are mounted with trailing slash and otherwise respond with 307.
    const response = await api.get('/api/users/', { params: role ? { role } : {} });
    return response.data;
  },
  getById: async (id: number): Promise<User> => {
    const response = await api.get(`/api/users/${id}`);
    return response.data;
  },
  create: async (data: { full_name: string; email: string; password: string; role: string }): Promise<User> => {
    const response = await api.post('/api/users/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<User>): Promise<User> => {
    const response = await api.put(`/api/users/${id}`, data);
    return response.data;
  },
};

export const studentsApi = {
  getAll: async (params?: any): Promise<Student[]> => {
    const response = await api.get('/api/students/', { params });
    return response.data;
  },
  getById: async (id: number): Promise<Student> => {
    const response = await api.get(`/api/students/${id}`);
    return response.data;
  },
  getProgramOptions: async (studentId: number): Promise<ProgramSummary[]> => {
    const response = await api.get(`/api/students/${studentId}/program-options`);
    return response.data;
  },
  create: async (data: Partial<Student>): Promise<Student> => {
    const response = await api.post('/api/students/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Student>): Promise<Student> => {
    const response = await api.put(`/api/students/${id}`, data);
    return response.data;
  },
  archive: async (id: number): Promise<void> => {
    await api.delete(`/api/students/${id}`);
  },
  removeProgram: async (studentId: number, programId: number): Promise<void> => {
    await api.delete(`/api/students/${studentId}/programs/${programId}`);
  },
};

export const groupsApi = {
  getAll: async (): Promise<Group[]> => {
    const response = await api.get('/api/groups/');
    return response.data;
  },
  getById: async (id: number): Promise<Group> => {
    const response = await api.get(`/api/groups/${id}`);
    return response.data;
  },
  create: async (data: { name: string; trainer_id: number }): Promise<Group> => {
    const response = await api.post('/api/groups/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Group>): Promise<Group> => {
    const response = await api.put(`/api/groups/${id}`, data);
    return response.data;
  },
  addStudent: async (groupId: number, studentId: number): Promise<void> => {
    await api.post(`/api/groups/${groupId}/students/${studentId}`);
  },
  removeStudent: async (groupId: number, studentId: number): Promise<void> => {
    await api.delete(`/api/groups/${groupId}/students/${studentId}`);
  },
};

export const programsApi = {
  getAll: async (): Promise<Program[]> => {
    const response = await api.get('/api/programs/');
    return response.data;
  },
  create: async (data: {
    name: string;
    modules: Array<{
      name: string;
      order: number;
      topics: Array<{
        name: string;
        description?: string;
        final_result?: string;
        order: number;
      }>;
    }>;
  }): Promise<Program> => {
    const response = await api.post('/api/programs/', data);
    return response.data;
  },
  getById: async (id: number): Promise<Program> => {
    const response = await api.get(`/api/programs/${id}`);
    return response.data;
  },
  update: async (id: number, data: { name?: string; modules?: any[] }): Promise<Program> => {
    const response = await api.put(`/api/programs/${id}`, data);
    return response.data;
  },
  archiveTopic: async (programId: number, topicId: number): Promise<void> => {
    await api.post(`/api/programs/${programId}/archive-topic/${topicId}`);
  },
  unarchiveTopic: async (programId: number, topicId: number): Promise<void> => {
    await api.post(`/api/programs/${programId}/unarchive-topic/${topicId}`);
  },
  archiveModule: async (programId: number, moduleId: number): Promise<void> => {
    await api.post(`/api/programs/${programId}/archive-module/${moduleId}`);
  },
  unarchiveModule: async (programId: number, moduleId: number): Promise<void> => {
    await api.post(`/api/programs/${programId}/unarchive-module/${moduleId}`);
  },
  assignToGroup: async (programId: number, groupId: number): Promise<void> => {
    await api.post(`/api/programs/${programId}/assign-to-group/${groupId}`);
  },
  assignToStudent: async (programId: number, studentId: number): Promise<void> => {
    await api.post(`/api/programs/${programId}/assign-to-student/${studentId}`);
  },
};

export const gradesApi = {
  getAll: async (params?: any): Promise<Grade[]> => {
    const response = await api.get('/api/grades/', { params });
    return response.data;
  },
  create: async (data: Partial<Grade>): Promise<Grade> => {
    const response = await api.post('/api/grades/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Grade>): Promise<Grade> => {
    const response = await api.put(`/api/grades/${id}`, data);
    return response.data;
  },
  getStudentProgress: async (studentId: number, programId?: number): Promise<any> => {
    const response = await api.get(`/api/grades/student/${studentId}/progress`, {
      params: { program_id: programId },
    });
    return response.data;
  },
};

export const characteristicsApi = {
  getAll: async (params?: any): Promise<Characteristic[]> => {
    const response = await api.get('/api/characteristics/', { params });
    return response.data;
  },
  getTemplates: async (): Promise<CharacteristicTemplate[]> => {
    const response = await api.get('/api/characteristics/templates');
    return response.data;
  },
  createTemplate: async (data: { name: string; fields: CharacteristicField[] }): Promise<CharacteristicTemplate> => {
    const response = await api.post('/api/characteristics/templates', data);
    return response.data;
  },
  getById: async (id: number): Promise<Characteristic> => {
    const response = await api.get(`/api/characteristics/${id}`);
    return response.data;
  },
  create: async (data: Partial<Characteristic>): Promise<Characteristic> => {
    const response = await api.post('/api/characteristics/', data);
    return response.data;
  },
  update: async (id: number, data: { data: Record<string, any> }): Promise<Characteristic> => {
    const response = await api.put(`/api/characteristics/${id}`, data);
    return response.data;
  },
  submit: async (id: number): Promise<void> => {
    await api.post(`/api/characteristics/${id}/submit`);
  },
  approve: async (id: number, comment?: string): Promise<void> => {
    await api.post(`/api/characteristics/${id}/approve`, { comment });
  },
  reject: async (id: number, comment: string): Promise<void> => {
    await api.post(`/api/characteristics/${id}/reject`, { comment });
  },
  getComparison: async (studentId: number): Promise<any> => {
    const response = await api.get(`/api/characteristics/student/${studentId}/comparison`);
    return response.data;
  },
  getPublishedForStudent: async (studentId: number, limit?: number): Promise<Characteristic[]> => {
    const response = await api.get(`/api/characteristics/student/${studentId}/published`, {
      params: limit ? { limit } : {},
    });
    return response.data;
  },
};

export const reportsApi = {
  getStudents: async (params?: { skip?: number; limit?: number }): Promise<any> => {
    const response = await api.get('/api/reports/students', { params });
    return response.data;
  },
  getTrainers: async (): Promise<any> => {
    const response = await api.get('/api/reports/trainers');
    return response.data;
  },
  getActionLogs: async (params?: { skip?: number; limit?: number }): Promise<any> => {
    const response = await api.get('/api/reports/action-logs', { params });
    return response.data;
  },
  getCharacteristicsCompliance: async (month: number, year: number): Promise<any> => {
    const response = await api.get('/api/reports/characteristics-compliance', { params: { month, year } });
    return response.data;
  },
  exportReport: async (params: any): Promise<Blob> => {
    const response = await api.post('/api/reports/export', params, {
      responseType: 'blob',
    });
    return response.data;
  },
  getGradeDynamics: async (studentId: number): Promise<any> => {
    const response = await api.get(`/api/reports/analytics/grade-dynamics/${studentId}`);
    return response.data;
  },
};

export const searchApi = {
  search: async (query: string): Promise<any> => {
    const response = await api.get('/api/search', { params: { q: query } });
    return response.data;
  },
};

export const telegramApi = {
  getLinkCode: async (): Promise<{ code: string; expires_at: string; deep_link_url?: string | null }> => {
    const response = await api.post('/api/telegram/link-code');
    return response.data;
  },
  unlink: async (): Promise<void> => {
    await api.post('/api/telegram/unlink');
  },
};

export const settingsApi = {
  getLogo: async (): Promise<{ data_url: string | null }> => {
    const response = await api.get('/api/settings/logo');
    return response.data;
  },
  setLogo: async (data_url: string): Promise<{ data_url: string | null }> => {
    const response = await api.post('/api/settings/logo', { data_url });
    return response.data;
  },
};

// Sales API
export const salesApi = {
  listLeads: async (params?: {
    status_filter?: LeadStatus;
    q?: string;
    source?: string;
    tag?: string;
    overdue_only?: boolean;
    created_from?: string;
    created_to?: string;
    next_contact_from?: string;
    next_contact_to?: string;
  }): Promise<Lead[]> => {
    const response = await api.get('/api/leads', { params: params || {} });
    return response.data;
  },
  createLead: async (payload: {
    contact_name: string;
    phone: string;
    parent_full_name?: string;
    child_full_name?: string;
    parent_phone?: string;
    child_phone?: string;
    email?: string;
    city?: string;
    school_name?: string;
    school_class?: string;
    outreach_at?: string;
    outreach_minutes?: number;
    source?: string;
    communication_channel?: LeadCommunicationChannel;
    source_id?: number;
    referral_name?: string;
    tags?: string[];
    abonement_id?: number;
    desired_slot?: string;
    comment?: string;
    next_contact_at?: string;
  }): Promise<Lead> => {
    const response = await api.post('/api/leads', payload);
    return response.data;
  },
  updateLead: async (
    id: number,
    payload: {
      contact_name?: string;
      phone?: string;
      parent_full_name?: string;
      child_full_name?: string;
      parent_phone?: string;
      child_phone?: string;
      email?: string;
      city?: string;
      school_name?: string;
      school_class?: string;
      outreach_at?: string;
      outreach_minutes?: number;
      source?: string;
      communication_channel?: LeadCommunicationChannel;
      source_id?: number;
      referral_name?: string;
      tags?: string[];
      abonement_id?: number;
      desired_slot?: string;
      comment?: string;
      next_contact_at?: string;
      status?: LeadStatus;
      lost_reason?: string;
    }
  ): Promise<Lead> => {
    const response = await api.put(`/api/leads/${id}`, payload);
    return response.data;
  },
  listTasks: async (leadId: number): Promise<LeadTask[]> => {
    const response = await api.get(`/api/leads/${leadId}/tasks`);
    return response.data;
  },
  createTask: async (leadId: number, payload: {
    template_id?: number;
    status_option_id?: number;
    note?: string;
    channel?: string;
    due_at?: string
  }): Promise<LeadTask> => {
    const response = await api.post(`/api/leads/${leadId}/tasks`, payload);
    return response.data;
  },
  closeTask: async (leadId: number, taskId: number): Promise<LeadTask> => {
    const response = await api.post(`/api/leads/${leadId}/tasks/${taskId}/close`);
    return response.data;
  },
  updateTask: async (
    leadId: number,
    taskId: number,
    payload: { status?: 'open' | 'done'; note?: string; channel?: string; due_at?: string }
  ): Promise<LeadTask> => {
    const response = await api.put(`/api/leads/${leadId}/tasks/${taskId}`, payload);
    return response.data;
  },
  createInvoice: async (leadId: number, payload: { abonement_id: number; email_to?: string; currency?: string }): Promise<Invoice> => {
    const response = await api.post(`/api/leads/${leadId}/invoices`, payload);
    return response.data;
  },
  listInvoices: async (leadId: number): Promise<Invoice[]> => {
    const response = await api.get(`/api/leads/${leadId}/invoices`);
    return response.data;
  },
  listAllInvoices: async (params?: {
    status_filter?: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
    lead_id?: number;
    created_from?: string;
    created_to?: string;
  }): Promise<Invoice[]> => {
    const response = await api.get('/api/invoices', { params: params || {} });
    return response.data;
  },
  sendInvoiceEmail: async (invoiceId: number): Promise<Invoice> => {
    const response = await api.post(`/api/invoices/${invoiceId}/send-email`);
    return response.data;
  },
  listEvents: async (status?: EventStatus): Promise<EventItem[]> => {
    const response = await api.get('/api/events', { params: status ? { status_filter: status } : {} });
    return response.data;
  },
  createEvent: async (payload: {
    title: string;
    description?: string;
    starts_at: string;
    ends_at?: string;
    location?: string;
    capacity?: number;
  }): Promise<EventItem> => {
    const response = await api.post('/api/events', payload);
    return response.data;
  },
  registerLeadToEvent: async (eventId: number, payload: { lead_id: number; note?: string }): Promise<EventRegistration> => {
    const response = await api.post(`/api/events/${eventId}/registrations`, payload);
    return response.data;
  },
  listEventRegistrations: async (eventId: number): Promise<EventRegistration[]> => {
    const response = await api.get(`/api/events/${eventId}/registrations`);
    return response.data;
  },
  cancelEventRegistration: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/events/${eventId}/registrations/${registrationId}/cancel`);
    return response.data;
  },
  confirmEventRegistration: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/events/${eventId}/registrations/${registrationId}/confirm`);
    return response.data;
  },
  markEventRegistrationCame: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/events/${eventId}/registrations/${registrationId}/mark-came`);
    return response.data;
  },
  markEventRegistrationNoShow: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/events/${eventId}/registrations/${registrationId}/mark-no-show`);
    return response.data;
  },
  importLeadsXlsx: async (file: File): Promise<{ created: number; skipped: number; errors: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/leads/import-xlsx', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  downloadLeadsImportTemplate: async (): Promise<Blob> => {
    const response = await api.get('/api/leads/import-template', {
      responseType: 'blob',
    });
    return response.data;
  },
  listLeadSources: async (active_only = true): Promise<LeadSource[]> => {
    const response = await api.get('/api/lead-sources', { params: { active_only } });
    return response.data;
  },
  createLeadSource: async (name: string): Promise<LeadSource> => {
    const response = await api.post('/api/lead-sources', { name });
    return response.data;
  },
  updateLeadSource: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<LeadSource> => {
    const response = await api.put(`/api/lead-sources/${id}`, payload);
    return response.data;
  },
  listLeadTaskTemplates: async (active_only = true): Promise<LeadTaskTemplate[]> => {
    const response = await api.get('/api/lead-task-templates', { params: { active_only } });
    return response.data;
  },
  createLeadTaskTemplate: async (name: string): Promise<LeadTaskTemplate> => {
    const response = await api.post('/api/lead-task-templates', { name });
    return response.data;
  },
  updateLeadTaskTemplate: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<LeadTaskTemplate> => {
    const response = await api.put(`/api/lead-task-templates/${id}`, payload);
    return response.data;
  },
  listLeadTaskStatuses: async (active_only = true): Promise<LeadTaskStatusOption[]> => {
    const response = await api.get('/api/lead-task-statuses', { params: { active_only } });
    return response.data;
  },
  createLeadTaskStatus: async (payload: { name: string; is_closed?: boolean }): Promise<LeadTaskStatusOption> => {
    const response = await api.post('/api/lead-task-statuses', payload);
    return response.data;
  },
  updateLeadTaskStatus: async (
    id: number,
    payload: { name?: string; is_closed?: boolean; is_active?: boolean }
  ): Promise<LeadTaskStatusOption> => {
    const response = await api.put(`/api/lead-task-statuses/${id}`, payload);
    return response.data;
  },
  listLeadInfoTemplates: async (active_only = true): Promise<LeadInfoTemplate[]> => {
    const response = await api.get('/api/lead-info-templates', { params: { active_only } });
    return response.data;
  },
  createLeadInfoTemplate: async (payload: { name: string; body: string }): Promise<LeadInfoTemplate> => {
    const response = await api.post('/api/lead-info-templates', payload);
    return response.data;
  },
  updateLeadInfoTemplate: async (
    id: number,
    payload: { name?: string; body?: string; is_active?: boolean }
  ): Promise<LeadInfoTemplate> => {
    const response = await api.put(`/api/lead-info-templates/${id}`, payload);
    return response.data;
  },
  listLeadCommunications: async (leadId: number): Promise<LeadCommunication[]> => {
    const response = await api.get(`/api/leads/${leadId}/communications`);
    return response.data;
  },
  sendLeadInfo: async (
    leadId: number,
    payload: { template_id?: number; channel?: string; message: string; follow_up_at: string; pause_reason?: string }
  ): Promise<LeadCommunication> => {
    const response = await api.post(`/api/leads/${leadId}/send-info`, payload);
    return response.data;
  },
  logLeadCommunication: async (
    leadId: number,
    payload: { channel: 'call' | 'messenger' | 'email'; message?: string; follow_up_at?: string }
  ): Promise<LeadCommunication> => {
    const response = await api.post(`/api/leads/${leadId}/communications`, payload);
    return response.data;
  },
  saveLeadContactResult: async (
    leadId: number,
    payload: { outcome: 'connected' | 'no_answer' | 'callback'; note?: string; follow_up_at?: string }
  ): Promise<LeadCommunication> => {
    const response = await api.post(`/api/leads/${leadId}/contact-result`, payload);
    return response.data;
  },
  getSalesDashboard: async (): Promise<SalesDashboardData> => {
    const response = await api.get('/api/sales/dashboard');
    return response.data;
  },
  listFollowUps: async (params?: {
    period?: 'today' | 'tomorrow' | 'week' | 'overdue';
    source?: string;
    event_id?: number;
    reason?: string;
  }): Promise<FollowUpItem[]> => {
    const response = await api.get('/api/follow-ups', { params: params || {} });
    return response.data;
  },
  getLeadsPushStats: async (leadIds: number[]): Promise<LeadPushStats[]> => {
    const response = await api.get('/api/leads/push-stats', {
      params: { lead_ids: leadIds },
      paramsSerializer: { indexes: null },
    });
    return response.data;
  },
};

export const abonementsApi = {
  getAll: async (params?: any): Promise<Abonement[]> => {
    const response = await api.get('/api/abonements/', { params });
    return response.data;
  },
  create: async (data: Partial<Abonement>): Promise<Abonement> => {
    const response = await api.post('/api/abonements/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Abonement>): Promise<Abonement> => {
    const response = await api.put(`/api/abonements/${id}`, data);
    return response.data;
  },
  archive: async (id: number): Promise<void> => {
    await api.post(`/api/abonements/${id}/archive`);
  },
  unarchive: async (id: number): Promise<void> => {
    await api.post(`/api/abonements/${id}/unarchive`);
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api/abonements/${id}`);
  },
};

export default api;

