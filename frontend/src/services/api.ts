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
  SalesCity,
  SalesSchool,
  LeadTaskTemplate,
  LeadStatusOption,
  LeadTaskStatusOption,
  SalesDashboardData,
  FollowUpItem,
  LeadInfoTemplate,
  LeadCommunication,
  LeadPushStats,
  B2BSchool,
  B2BSchoolPipelineStage,
  B2BSchoolContact,
  B2BProject,
  OwnerFunnelTypeInfo,
  OwnerFunnelEvent,
  OwnerFunnelItem,
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

// Interceptor ╨┤╨╗╤П ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╤П ╤В╨╛╨║╨╡╨╜╨░
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor ╨┤╨╗╤П ╨╛╨▒╤А╨░╨▒╨╛╤В╨║╨╕ ╨╛╤И╨╕╨▒╨╛╨║
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
    // OAuth2 / FastAPI OAuth2PasswordRequestForm ╨╛╨╢╨╕╨┤╨░╨╡╤В ╤А╨╛╨▓╨╜╨╛ application/x-www-form-urlencoded
    const body = new URLSearchParams();
    body.append('username', email);
    body.append('password', password);
    const response = await api.post('/api/auth/login', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
  getSchedules: async (groupId: number): Promise<import('../types').GroupSchedule[]> => {
    const response = await api.get(`/api/groups/${groupId}/schedules`);
    return response.data;
  },
  addSchedule: async (groupId: number, data: { day_of_week: number; start_time: string; end_time: string }): Promise<import('../types').GroupSchedule> => {
    const response = await api.post(`/api/groups/${groupId}/schedules`, data);
    return response.data;
  },
  removeSchedule: async (groupId: number, scheduleId: number): Promise<void> => {
    await api.delete(`/api/groups/${groupId}/schedules/${scheduleId}`);
  },
};

export const trainerLessonsApi = {
  getForDate: async (lessonDate: string): Promise<import('../types').TrainerLessonSlot[]> => {
    const response = await api.get('/api/trainer-lessons/', { params: { lesson_date: lessonDate } });
    return response.data;
  },
  saveAttendance: async (data: {
    group_id: number;
    lesson_date: string;
    attendances: Array<{ student_id: number; attended: boolean }>;
  }): Promise<void> => {
    await api.post('/api/trainer-lessons/attendance', data);
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
    questionnaire_filled?: boolean;
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
  postVisitOutcome: async (
    leadId: number,
    payload: { outcome: 'agreed' | 'thinking' | 'declined'; follow_up_at?: string; lost_reason?: string }
  ): Promise<Lead> => {
    const response = await api.post(`/api/leads/${leadId}/post-visit-outcome`, payload);
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
      no_answer_attempt?: number;
      status?: LeadStatus;
      status_option_id?: number;
      lost_reason?: string;
      questionnaire_filled?: boolean;
    }
  ): Promise<Lead> => {
    const response = await api.put(`/api/leads/${id}`, payload);
    return response.data;
  },
  getLead: async (leadId: number): Promise<Lead> => {
    const response = await api.get(`/api/leads/${leadId}`);
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
  listSalesCities: async (active_only = true): Promise<SalesCity[]> => {
    const response = await api.get('/api/cities', { params: { active_only } });
    return response.data;
  },
  createSalesCity: async (name: string): Promise<SalesCity> => {
    const response = await api.post('/api/cities', { name });
    return response.data;
  },
  updateSalesCity: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<SalesCity> => {
    const response = await api.put(`/api/cities/${id}`, payload);
    return response.data;
  },
  listSalesSchools: async (active_only = true): Promise<SalesSchool[]> => {
    const response = await api.get('/api/schools', { params: { active_only } });
    return response.data;
  },
  createSalesSchool: async (name: string): Promise<SalesSchool> => {
    const response = await api.post('/api/schools', { name });
    return response.data;
  },
  updateSalesSchool: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<SalesSchool> => {
    const response = await api.put(`/api/schools/${id}`, payload);
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
  listLeadStatuses: async (active_only = true): Promise<LeadStatusOption[]> => {
    const response = await api.get('/api/lead-statuses', { params: { active_only } });
    return response.data;
  },
  createLeadStatus: async (payload: { name: string; base_status: LeadStatus }): Promise<LeadStatusOption> => {
    const response = await api.post('/api/lead-statuses', payload);
    return response.data;
  },
  updateLeadStatus: async (
    id: number,
    payload: { name?: string; base_status?: LeadStatus; is_active?: boolean }
  ): Promise<LeadStatusOption> => {
    const response = await api.put(`/api/lead-statuses/${id}`, payload);
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

export const b2bApi = {
  listCities: async (): Promise<string[]> => {
    const response = await api.get('/api/b2b-schools/cities');
    return response.data;
  },
  listSchools: async (opts?: { pipeline_stage?: string; project_id?: number; city?: string }): Promise<B2BSchool[]> => {
    const params: any = {};
    if (opts?.pipeline_stage) params.pipeline_stage = opts.pipeline_stage;
    if (opts?.project_id) params.project_id = opts.project_id;
    if (opts?.city) params.city = opts.city;
    const response = await api.get('/api/b2b-schools', { params });
    return response.data;
  },
  getSchool: async (id: number): Promise<B2BSchool> => {
    const response = await api.get(`/api/b2b-schools/${id}`);
    return response.data;
  },
  createSchool: async (payload: {
    name: string;
    director?: string;
    city?: string;
    address?: string;
    student_count?: number;
    friendship_degree?: string;
    pipeline_stage?: B2BSchoolPipelineStage;
    event_dates?: string[];
    meeting_scheduled_at?: string | null;
    meeting_outcomes?: string | null;
    walkthrough_scheduled_at?: string | null;
  }): Promise<B2BSchool> => {
    const response = await api.post('/api/b2b-schools', payload);
    return response.data;
  },
  updateSchool: async (
    id: number,
    payload: Partial<{
      name: string;
      director: string;
      city: string;
      address: string;
      student_count: number;
      friendship_degree: string;
      pipeline_stage: B2BSchoolPipelineStage;
      event_dates: string[];
      meeting_scheduled_at: string | null;
      meeting_outcomes: string | null;
      walkthrough_scheduled_at: string | null;
    }>
  ): Promise<B2BSchool> => {
    const response = await api.put(`/api/b2b-schools/${id}`, payload);
    return response.data;
  },
  deleteSchool: async (id: number): Promise<void> => {
    await api.delete(`/api/b2b-schools/${id}`);
  },
  listContacts: async (schoolId: number): Promise<B2BSchoolContact[]> => {
    const response = await api.get(`/api/b2b-schools/${schoolId}/contacts`);
    return response.data;
  },
  createContact: async (
    schoolId: number,
    payload: { full_name: string; position?: string; phone: string; phone_extra?: string }
  ): Promise<B2BSchoolContact> => {
    const response = await api.post(`/api/b2b-schools/${schoolId}/contacts`, payload);
    return response.data;
  },
  updateContact: async (
    schoolId: number,
    contactId: number,
    payload: Partial<{ full_name: string; position: string; phone: string; phone_extra: string }>
  ): Promise<B2BSchoolContact> => {
    const response = await api.put(`/api/b2b-schools/${schoolId}/contacts/${contactId}`, payload);
    return response.data;
  },
  deleteContact: async (schoolId: number, contactId: number): Promise<void> => {
    await api.delete(`/api/b2b-schools/${schoolId}/contacts/${contactId}`);
  },
  listProjects: async (): Promise<B2BProject[]> => {
    const response = await api.get('/api/b2b-projects');
    return response.data;
  },
  createProject: async (payload: {
    name: string;
    location?: string;
    main_city?: string;
    cities?: string[];
  }): Promise<B2BProject> => {
    const response = await api.post('/api/b2b-projects', payload);
    return response.data;
  },
};

export const ownerFunnelsApi = {
  listTypes: async (): Promise<OwnerFunnelTypeInfo[]> => {
    const response = await api.get('/api/owner-funnels/types');
    return response.data;
  },
  listEvents: async (): Promise<OwnerFunnelEvent[]> => {
    const response = await api.get('/api/owner-funnels/events');
    return response.data;
  },
  createEvent: async (payload: { event_name: string; event_dates?: string | null }): Promise<OwnerFunnelEvent> => {
    const response = await api.post('/api/owner-funnels/events', payload);
    return response.data;
  },
  listItems: async (funnelType: string, options?: { eventId?: number; stage?: string }): Promise<OwnerFunnelItem[]> => {
    const params: { funnel_type: string; event_id?: number; stage?: string } = { funnel_type: funnelType };
    if (options?.eventId != null) params.event_id = options.eventId;
    if (options?.stage) params.stage = options.stage;
    const response = await api.get('/api/owner-funnels/items', { params });
    return response.data;
  },
  createItem: async (payload: {
    funnel_type: string;
    stage?: string;
    title?: string | null;
    comment?: string | null;
    event_id?: number | null;
    card_data?: Record<string, unknown> | null;
  }): Promise<OwnerFunnelItem> => {
    const response = await api.post('/api/owner-funnels/items', payload);
    return response.data;
  },
  getItem: async (id: number): Promise<OwnerFunnelItem> => {
    const response = await api.get(`/api/owner-funnels/items/${id}`);
    return response.data;
  },
  updateItem: async (
    id: number,
    payload: {
      stage?: string;
      title?: string | null;
      comment?: string | null;
      card_data?: Record<string, unknown> | null;
      contact_fio?: string | null;
      contact_phone?: string | null;
      contact_comment?: string | null;
      reply_comment?: string | null;
      meeting_date?: string | null;
      trip_date?: string | null;
      leads_count?: number | null;
    }
  ): Promise<OwnerFunnelItem> => {
    const response = await api.patch(`/api/owner-funnels/items/${id}`, payload);
    return response.data;
  },
  deleteItem: async (id: number): Promise<void> => {
    await api.delete(`/api/owner-funnels/items/${id}`);
  },
  addSchoolsByCity: async (eventId: number, city: string): Promise<{ added: number; total_in_city: number }> => {
    const response = await api.post(`/api/owner-funnels/events/${eventId}/add-schools-by-city`, { city });
    return response.data;
  },
};

export const tasksApi = {
  listTemplates: async (): Promise<import('../types').TaskTemplateResponse[]> => {
    const response = await api.get('/api/task-templates');
    return response.data;
  },
  createTemplate: async (payload: {
    name: string;
    subtasks?: { text: string; order?: number }[];
    student_ids?: number[];
    repeat_enabled?: boolean;
    repeat_frequency?: 'daily' | 'weekly' | 'monthly';
    repeat_days?: number[];
    repeat_end_type?: 'never' | 'after_count' | 'until_date';
    repeat_end_after_count?: number;
    repeat_end_until?: string;
  }): Promise<import('../types').TaskTemplateResponse> => {
    const response = await api.post('/api/task-templates', payload);
    return response.data;
  },
  updateTemplate: async (id: number, payload: {
    name?: string;
    subtasks?: { text: string; order?: number }[];
    student_ids?: number[];
    repeat_enabled?: boolean;
    repeat_frequency?: 'daily' | 'weekly' | 'monthly';
    repeat_days?: number[];
    repeat_end_type?: 'never' | 'after_count' | 'until_date';
    repeat_end_after_count?: number;
    repeat_end_until?: string;
  }): Promise<import('../types').TaskTemplateResponse> => {
    const response = await api.put(`/api/task-templates/${id}`, payload);
    return response.data;
  },
  deleteTemplate: async (id: number): Promise<void> => {
    await api.delete(`/api/task-templates/${id}`);
  },
  listTasks: async (statusFilter?: string): Promise<import('../types').TaskResponse[]> => {
    const response = await api.get('/api/tasks', { params: statusFilter != null ? { status_filter: statusFilter } : {} });
    return response.data;
  },
  createTask: async (payload: {
    title?: string;
    template_id?: number;
    assigned_to_id?: number;
    subtasks?: { text: string; order?: number }[];
    student_ids?: number[];
    repeat_enabled?: boolean;
    repeat_frequency?: 'daily' | 'weekly' | 'monthly';
    repeat_days?: number[];
    repeat_end_type?: 'never' | 'after_count' | 'until_date';
    repeat_end_after_count?: number;
    repeat_end_until?: string;
  }): Promise<import('../types').TaskResponse> => {
    const response = await api.post('/api/tasks', payload);
    return response.data;
  },
  updateTask: async (id: number, payload: {
    title?: string;
    status?: string;
    assigned_to_id?: number | null;
    student_ids?: number[];
    repeat_enabled?: boolean;
    repeat_frequency?: 'daily' | 'weekly' | 'monthly';
    repeat_days?: number[];
    repeat_end_type?: 'never' | 'after_count' | 'until_date';
    repeat_end_after_count?: number;
    repeat_end_until?: string;
  }): Promise<import('../types').TaskResponse> => {
    const response = await api.put(`/api/tasks/${id}`, payload);
    return response.data;
  },
  deleteTask: async (id: number): Promise<void> => {
    await api.delete(`/api/tasks/${id}`);
  },
  updateSubtask: async (taskId: number, subtaskId: number, payload: { completed?: boolean }): Promise<import('../types').TaskSubtaskResponse> => {
    const response = await api.patch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, payload);
    return response.data;
  },
};

export default api;

