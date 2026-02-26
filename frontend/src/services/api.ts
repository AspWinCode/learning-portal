import axios from 'axios';
import {
  User,
  Student,
  StudentAccount,
  StudentAccountTransaction,
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
  AccountTemplate,
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
  SalesInstruction,
  StudentCard,
  AbsenceFollowUp,
  BankTransaction,
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
  timeout: 45000, // 45s — для тяжёлых запросов и холодного старта бэкенда
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
      timeout: 60000, // 60s — бэкенд после деплоя или при холодном старте может отвечать долго
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
  setPasswordByInvite: async (token: string, new_password: string) => {
    const response = await api.post('/api/auth/set-password-by-invite', { token, new_password });
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
  create: async (data: {
    full_name: string;
    email: string;
    password: string;
    role: string;
    phone?: string | null;
    phone_extra?: string | null;
    trainer_lesson_formats?: string | null;
    trainer_banks?: string[] | null;
    city?: string | null;
    trainer_telegram?: string | null;
    is_self_employed?: boolean | null;
    is_ip?: boolean | null;
    work_schedule?: string | null;
    qualification?: string | null;
    trainer_comment?: string | null;
  }): Promise<User> => {
    const response = await api.post('/api/users/', data);
    return response.data;
  },
  inviteParent: async (data: { email: string; full_name: string }): Promise<{ user_id: number; email: string; full_name: string; invite_link: string }> => {
    const response = await api.post('/api/users/invite-parent', data);
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
  createWithParent: async (data: {
    student: { full_name: string; abonement_id?: number | null };
    parent: { id?: number | null; full_name: string; email?: string | null };
  }): Promise<{ student: Student; parent: { id: number; full_name: string; email: string } }> => {
    const response = await api.post('/api/students/with-parent', data);
    return response.data;
  },
  searchParents: async (q: string): Promise<{ id: number; full_name: string; email: string }[]> => {
    const response = await api.get('/api/students/parents/search', { params: { q, limit: 20 } });
    return response.data;
  },
  inviteParent: async (studentId: number): Promise<{ invite_link: string }> => {
    const response = await api.post(`/api/students/${studentId}/invite-parent`);
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
  getAccounts: async (studentId: number): Promise<StudentAccount[]> => {
    const response = await api.get(`/api/students/${studentId}/accounts`);
    return response.data;
  },
  createAccount: async (studentId: number, data: { name: string }): Promise<StudentAccount> => {
    const response = await api.post(`/api/students/${studentId}/accounts`, data);
    return response.data;
  },
  deleteAccount: async (studentId: number, accountId: number): Promise<void> => {
    await api.delete(`/api/students/${studentId}/accounts/${accountId}`);
  },
  getAttendances: async (studentId: number, limit?: number): Promise<Array<{ lesson_date: string; group_name: string; attended: boolean }>> => {
    const response = await api.get(`/api/students/${studentId}/attendances`, { params: limit ? { limit } : {} });
    return response.data;
  },
};

export const studentAccountsApi = {
  get: async (accountId: number): Promise<StudentAccount> => {
    const response = await api.get(`/api/student-accounts/${accountId}`);
    return response.data;
  },
  update: async (accountId: number, data: { name?: string }): Promise<StudentAccount> => {
    const response = await api.patch(`/api/student-accounts/${accountId}`, data);
    return response.data;
  },
  addPayment: async (accountId: number, data: { amount: number; note?: string }): Promise<StudentAccount> => {
    const response = await api.post(`/api/student-accounts/${accountId}/payment`, data);
    return response.data;
  },
  deduct: async (accountId: number, data: { amount: number; note?: string; lesson_attendance_id?: number }): Promise<StudentAccount> => {
    const response = await api.post(`/api/student-accounts/${accountId}/deduct`, data);
    return response.data;
  },
  getTransactions: async (accountId: number): Promise<StudentAccountTransaction[]> => {
    const response = await api.get(`/api/student-accounts/${accountId}/transactions`);
    return response.data;
  },
  remove: async (accountId: number): Promise<void> => {
    await api.delete(`/api/student-accounts/${accountId}`);
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
  create: async (data: {
    name: string;
    trainer_id: number;
    direction?: string | null;
    schedules?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
    units_per_session?: number;
    extra_rate_per_unit?: number | null;
    start_date?: string | null;
    lesson_format?: 'group' | 'individual';
  }): Promise<Group> => {
    const response = await api.post('/api/groups/', data);
    return response.data;
  },
  update: async (
    id: number,
    data: Partial<Pick<Group, 'name' | 'trainer_id' | 'status' | 'direction' | 'units_per_session' | 'extra_rate_per_unit' | 'start_date' | 'lesson_format'>> & {
      schedules?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
    }
  ): Promise<Group> => {
    const response = await api.put(`/api/groups/${id}`, data);
    return response.data;
  },
  getLessonSlotExtraPolicy: async (
    groupId: number,
    params: { lesson_date: string; start_time: string; end_time: string }
  ): Promise<import('../types').LessonSlotExtraPolicy> => {
    const response = await api.get(`/api/groups/${groupId}/lesson-slot-extra-policy`, { params });
    return response.data;
  },
  putLessonSlotExtraPolicy: async (
    groupId: number,
    data: { lesson_date: string; start_time: string; end_time: string; extra_policy: 'free' | 'paid'; extra_rate_per_unit?: number | null }
  ): Promise<import('../types').LessonSlotExtraPolicy> => {
    const response = await api.put(`/api/groups/${groupId}/lesson-slot-extra-policy`, data);
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

export const projectsApi = {
  list: async (params?: { archived?: boolean }): Promise<import('../types').Project[]> => {
    const response = await api.get('/api/projects/', { params });
    return response.data;
  },
  getById: async (id: number): Promise<import('../types').Project> => {
    const response = await api.get(`/api/projects/${id}`);
    return response.data;
  },
  create: async (data: {
    name: string;
    start_date?: string | null;
    end_date?: string | null;
    description?: string | null;
    entity_type: 'parent' | 'student';
  }): Promise<import('../types').Project> => {
    const response = await api.post('/api/projects/', data);
    return response.data;
  },
  update: async (
    id: number,
    data: Partial<Pick<import('../types').Project, 'name' | 'start_date' | 'end_date' | 'description' | 'archived'>>
  ): Promise<import('../types').Project> => {
    const response = await api.put(`/api/projects/${id}`, data);
    return response.data;
  },
  getBoard: async (id: number): Promise<{
    project: import('../types').Project;
    stages: Array<import('../types').ProjectStage & { cards: import('../types').ProjectCard[] }>;
  }> => {
    const response = await api.get(`/api/projects/${id}/board`);
    return response.data;
  },
  createStage: async (projectId: number, data: { name: string; position?: number }): Promise<import('../types').ProjectStage> => {
    const response = await api.post(`/api/projects/${projectId}/stages`, data);
    return response.data;
  },
  updateStage: async (
    projectId: number,
    stageId: number,
    data: { name?: string; position?: number }
  ): Promise<import('../types').ProjectStage> => {
    const response = await api.patch(`/api/projects/${projectId}/stages/${stageId}`, data);
    return response.data;
  },
  deleteStage: async (projectId: number, stageId: number): Promise<void> => {
    await api.delete(`/api/projects/${projectId}/stages/${stageId}`);
  },
  moveCard: async (
    projectId: number,
    cardId: number,
    data: { stage_id: number; position?: number }
  ): Promise<import('../types').ProjectCard> => {
    const response = await api.patch(`/api/projects/${projectId}/cards/${cardId}/move`, data);
    return response.data;
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
    start_time?: string;
    end_time?: string;
    attendances: Array<{
      student_id: number;
      attended: boolean;
      late?: boolean;
      absence_reason?: string | null;
      absence_comment?: string | null;
    }>;
  }): Promise<void> => {
    await api.post('/api/trainer-lessons/attendance', data);
  },
  moveLesson: async (data: {
    group_id: number;
    from_date: string;
    to_date: string;
    from_start_time?: string;
    from_end_time?: string;
    to_start_time?: string;
    to_end_time?: string;
  }): Promise<{ ok: boolean; moved_count: number }> => {
    const response = await api.post('/api/trainer-lessons/move', data);
    return response.data;
  },
  cancelLesson: async (data: {
    group_id: number;
    lesson_date: string;
    start_time: string;
    end_time: string;
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/api/trainer-lessons/cancel', data);
    return response.data;
  },
  addStudentToLesson: async (data: {
    group_id: number;
    lesson_date: string;
    student_id: number;
    start_time?: string;
    end_time?: string;
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/api/trainer-lessons/add-student-to-lesson', data);
    return response.data;
  },
  removeStudentFromLesson: async (data: {
    group_id: number;
    lesson_date: string;
    student_id: number;
    start_time?: string;
    end_time?: string;
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/api/trainer-lessons/remove-student-from-lesson', data);
    return response.data;
  },
  createLessonSlot: async (data: {
    group_id: number;
    lesson_date: string;
    start_time: string;
    end_time: string;
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/api/trainer-lessons/create-slot', data);
    return response.data;
  },
  setLessonTrainer: async (data: {
    group_id: number;
    lesson_date: string;
    start_time: string;
    end_time: string;
    trainer_id: number;
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/api/trainer-lessons/set-trainer', data);
    return response.data;
  },
  getCustomLessons: async (params?: { date_from?: string; date_to?: string }): Promise<
    Array<{
      id: number;
      title: string;
      lesson_date: string;
      start_time: string;
      end_time?: string | null;
      trainer_id: number;
      trainer_name?: string | null;
      lesson_type: string;
      comment?: string | null;
      students: Array<{
        id: number;
        student_id: number;
        student_name?: string | null;
        planned_absence_id?: number | null;
        attended: boolean;
        absence_reason?: string | null;
        absence_comment?: string | null;
      }>;
    }>
  > => {
    const response = await api.get('/api/trainer-lessons/custom-lessons', { params: params || {} });
    return response.data;
  },
  saveCustomLessonAttendance: async (data: {
    lesson_id: number;
    items: Array<{
      lesson_student_id: number;
      attended: boolean;
      absence_reason?: string | null;
      absence_comment?: string | null;
    }>;
  }): Promise<{ ok: boolean }> => {
    const response = await api.post('/api/trainer-lessons/custom-lessons/attendance', data);
    return response.data;
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

export const salesInstructionsApi = {
  list: async (): Promise<SalesInstruction[]> => {
    const response = await api.get('/api/sales/sales-instructions');
    return response.data;
  },
  create: async (data: { title: string; body: string }): Promise<SalesInstruction> => {
    const response = await api.post('/api/sales/sales-instructions', data);
    return response.data;
  },
  update: async (id: number, data: Partial<{ title: string; body: string }>): Promise<SalesInstruction> => {
    const response = await api.put(`/api/sales/sales-instructions/${id}`, data);
    return response.data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api/sales/sales-instructions/${id}`);
  },
};

export const salesInstructionImagesApi = {
  upload: async (file: File): Promise<{ id: number; url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/api/sales/instruction-images', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export const studentCardsApi = {
  list: async (params?: { archived?: boolean; anketa_status?: string[]; student_id?: number }): Promise<StudentCard[]> => {
    const response = await api.get('/api/sales/student-cards', { params: params ?? {} });
    return response.data;
  },
  get: async (id: number): Promise<StudentCard> => {
    const response = await api.get(`/api/sales/student-cards/${id}`);
    return response.data;
  },
  create: async (data: Omit<StudentCard, 'id' | 'archived' | 'created_at' | 'updated_at' | 'abonement'>): Promise<StudentCard> => {
    const response = await api.post('/api/sales/student-cards', data);
    return response.data;
  },
  update: async (id: number, data: Partial<Omit<StudentCard, 'id' | 'archived' | 'created_at' | 'updated_at' | 'abonement'>>): Promise<StudentCard> => {
    const response = await api.put(`/api/sales/student-cards/${id}`, data);
    return response.data;
  },
  archive: async (id: number): Promise<void> => {
    await api.post(`/api/sales/student-cards/${id}/archive`);
  },
  unarchive: async (id: number): Promise<void> => {
    await api.post(`/api/sales/student-cards/${id}/unarchive`);
  },
  downloadImportTemplate: async (): Promise<Blob> => {
    const response = await api.get('/api/sales/student-cards/import-template', {
      responseType: 'blob',
    });
    return response.data;
  },
  importXlsx: async (file: File): Promise<{ created: number; skipped: number; errors: string[] }> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/api/sales/student-cards/import-xlsx', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  openParentCabinet: async (cardId: number): Promise<{ already_open: boolean; student_id: number; parent_id: number; invite_link?: string }> => {
    const response = await api.post(`/api/sales/student-cards/${cardId}/open-parent-cabinet`);
    return response.data;
  },
  convert: async (
    cardId: number,
    body?: { use_existing_parent_id?: number; use_existing_student_id?: number }
  ): Promise<{ card: StudentCard; student_id: number }> => {
    const response = await api.post(`/api/sales/student-cards/${cardId}/convert`, body ?? {});
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

// Урок на сегодня для раздела «Позвать детей на занятие»
export type LessonTaskStudent = {
  student_id: number;
  full_name: string;
  attended: boolean | null;
  late?: boolean;
  call_result?: string | null; // contacted | no_answer | cancelled | technical | messenger
  parent_full_name: string | null;
  parent_phone: string | null;
  parent_phone_2: string | null;
  parent_telegram: string | null;
};
export type LessonTaskItem = {
  group_id: number;
  group_name: string;
  direction: string | null;
  schedule_id: number;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status: 'waiting' | 'soon' | 'in_progress' | 'call_round' | 'completed';
  trainer_id: number | null;
  trainer_name: string;
  students: LessonTaskStudent[];
  total: number;
  present_count: number;
  absent_count: number;
  unknown_count: number;
  call_contacted_count?: number;
};

// Sales API
export const salesApi = {
  listLessonTasksToday: async (): Promise<{ items: LessonTaskItem[] }> => {
    const response = await api.get('/api/sales/lesson-tasks/today');
    return response.data;
  },
  setLessonCallResult: async (payload: {
    group_id: number;
    lesson_date: string;
    student_id: number;
    call_result: string;
  }): Promise<void> => {
    await api.post('/api/sales/lesson-tasks/call-result', payload);
  },
  listLessonTasksTomorrow: async (): Promise<{ items: LessonTaskItem[] }> => {
    const response = await api.get('/api/sales/lesson-tasks/tomorrow');
    return response.data;
  },
  listLessonTasksWeek: async (): Promise<{ items: LessonTaskItem[] }> => {
    const response = await api.get('/api/sales/lesson-tasks/week');
    return response.data;
  },
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
    const response = await api.get('/api/sales/leads', { params: params || {} });
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
    const response = await api.post('/api/sales/leads', payload);
    return response.data;
  },
  postVisitOutcome: async (
    leadId: number,
    payload: { outcome: 'agreed' | 'thinking' | 'declined'; follow_up_at?: string; lost_reason?: string }
  ): Promise<Lead> => {
    const response = await api.post(`/api/sales/leads/${leadId}/post-visit-outcome`, payload);
    return response.data;
  },
  listPostVisitLeads: async (): Promise<Lead[]> => {
    const response = await api.get('/api/sales/post-visit/leads');
    return response.data;
  },
  updatePostVisitStage: async (
    leadId: number,
    payload: {
      stage:
        | 'new'
        | 'project_offer'
        | 'course_offer'
        | 'project_agreed'
        | 'course_agreed'
        | 'declined';
      review?: string;
      project_date?: string;
      decline_reason?: string;
    }
  ): Promise<Lead> => {
    const response = await api.post(`/api/sales/leads/${leadId}/post-visit-stage`, payload);
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
    const response = await api.put(`/api/sales/leads/${id}`, payload);
    return response.data;
  },
  getLead: async (leadId: number): Promise<Lead> => {
    const response = await api.get(`/api/sales/leads/${leadId}`);
    return response.data;
  },
  listTasks: async (leadId: number): Promise<LeadTask[]> => {
    const response = await api.get(`/api/sales/leads/${leadId}/tasks`);
    return response.data;
  },
  createTask: async (leadId: number, payload: {
    template_id?: number;
    status_option_id?: number;
    note?: string;
    channel?: string;
    due_at?: string
  }): Promise<LeadTask> => {
    const response = await api.post(`/api/sales/leads/${leadId}/tasks`, payload);
    return response.data;
  },
  closeTask: async (leadId: number, taskId: number): Promise<LeadTask> => {
    const response = await api.post(`/api/sales/leads/${leadId}/tasks/${taskId}/close`);
    return response.data;
  },
  updateTask: async (
    leadId: number,
    taskId: number,
    payload: { status?: 'open' | 'done'; note?: string; channel?: string; due_at?: string }
  ): Promise<LeadTask> => {
    const response = await api.put(`/api/sales/leads/${leadId}/tasks/${taskId}`, payload);
    return response.data;
  },
  createInvoice: async (leadId: number, payload: { abonement_id: number; email_to?: string; currency?: string }): Promise<Invoice> => {
    const response = await api.post(`/api/sales/leads/${leadId}/invoices`, payload);
    return response.data;
  },
  listInvoices: async (leadId: number): Promise<Invoice[]> => {
    const response = await api.get(`/api/sales/leads/${leadId}/invoices`);
    return response.data;
  },
  listAllInvoices: async (params?: {
    status_filter?: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
    lead_id?: number;
    created_from?: string;
    created_to?: string;
  }): Promise<Invoice[]> => {
    const response = await api.get('/api/sales/invoices', { params: params || {} });
    return response.data;
  },
  sendInvoiceEmail: async (invoiceId: number): Promise<Invoice> => {
    const response = await api.post(`/api/sales/invoices/${invoiceId}/send-email`);
    return response.data;
  },
  listEvents: async (status?: EventStatus): Promise<EventItem[]> => {
    const response = await api.get('/api/sales/events', { params: status ? { status_filter: status } : {} });
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
    const response = await api.post('/api/sales/events', payload);
    return response.data;
  },
  registerLeadToEvent: async (eventId: number, payload: { lead_id: number; note?: string }): Promise<EventRegistration> => {
    const response = await api.post(`/api/sales/events/${eventId}/registrations`, payload);
    return response.data;
  },
  listEventRegistrations: async (eventId: number): Promise<EventRegistration[]> => {
    const response = await api.get(`/api/sales/events/${eventId}/registrations`);
    return response.data;
  },
  cancelEventRegistration: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/sales/events/${eventId}/registrations/${registrationId}/cancel`);
    return response.data;
  },
  confirmEventRegistration: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/sales/events/${eventId}/registrations/${registrationId}/confirm`);
    return response.data;
  },
  markEventRegistrationCame: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/sales/events/${eventId}/registrations/${registrationId}/mark-came`);
    return response.data;
  },
  markEventRegistrationNoShow: async (eventId: number, registrationId: number): Promise<EventRegistration> => {
    const response = await api.post(`/api/sales/events/${eventId}/registrations/${registrationId}/mark-no-show`);
    return response.data;
  },
  importLeadsXlsx: async (file: File): Promise<{ created: number; skipped: number; errors: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/sales/leads/import-xlsx', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  downloadLeadsImportTemplate: async (): Promise<Blob> => {
    const response = await api.get('/api/sales/leads/import-template', {
      responseType: 'blob',
    });
    return response.data;
  },
  listLeadSources: async (active_only = true): Promise<LeadSource[]> => {
    const response = await api.get('/api/sales/lead-sources', { params: { active_only } });
    return response.data;
  },
  createLeadSource: async (name: string): Promise<LeadSource> => {
    const response = await api.post('/api/sales/lead-sources', { name });
    return response.data;
  },
  updateLeadSource: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<LeadSource> => {
    const response = await api.put(`/api/sales/lead-sources/${id}`, payload);
    return response.data;
  },
  listSalesCities: async (active_only = true): Promise<SalesCity[]> => {
    const response = await api.get('/api/sales/cities', { params: { active_only } });
    return response.data;
  },
  createSalesCity: async (name: string): Promise<SalesCity> => {
    const response = await api.post('/api/sales/cities', { name });
    return response.data;
  },
  updateSalesCity: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<SalesCity> => {
    const response = await api.put(`/api/sales/cities/${id}`, payload);
    return response.data;
  },
  listSalesSchools: async (active_only = true): Promise<SalesSchool[]> => {
    const response = await api.get('/api/sales/schools', { params: { active_only } });
    return response.data;
  },
  createSalesSchool: async (name: string): Promise<SalesSchool> => {
    const response = await api.post('/api/sales/schools', { name });
    return response.data;
  },
  updateSalesSchool: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<SalesSchool> => {
    const response = await api.put(`/api/sales/schools/${id}`, payload);
    return response.data;
  },
  listAccountTemplates: async (): Promise<AccountTemplate[]> => {
    const response = await api.get('/api/sales/account-templates');
    return response.data;
  },
  createAccountTemplate: async (data: { name: string; format: 'group' | 'individual' }): Promise<AccountTemplate> => {
    const response = await api.post('/api/sales/account-templates', data);
    return response.data;
  },
  deleteAccountTemplate: async (id: number): Promise<void> => {
    await api.delete(`/api/sales/account-templates/${id}`);
  },
  listBankTransactions: async (params?: { status?: string[] }): Promise<BankTransaction[]> => {
    const response = await api.get('/api/sales/bank-transactions', { params });
    return response.data;
  },
  applyBankTransaction: async (transactionId: number, payload: { student_id: number }): Promise<BankTransaction> => {
    const response = await api.post(`/api/sales/bank-transactions/${transactionId}/apply`, payload);
    return response.data;
  },
  updateBankTransactionExpenseCategory: async (
    transactionId: number,
    payload: { expense_category?: string | null }
  ): Promise<BankTransaction> => {
    const response = await api.patch(
      `/api/sales/bank-transactions/${transactionId}/expense-category`,
      payload
    );
    return response.data;
  },
  getTochkaStatus: async (): Promise<{ configured: boolean; auto_import_configured?: boolean }> => {
    const response = await api.get('/api/sales/tochka/status');
    return response.data;
  },
  tochkaImportAndApply: async (params: { date_from: string; date_to: string; account_id?: string }): Promise<{
    applied: Array<{ payer_name: string; amount: number; date: string; student_id: number; student_name?: string }>;
    no_match: Array<{ payer_name: string; amount: number; date: string }>;
    ambiguous: Array<{ payer_name: string; amount: number; date: string; candidates?: Array<{ student_id: number; student_name?: string; parent_full_name?: string }> }>;
  }> => {
    const response = await api.post('/api/sales/tochka/import-and-apply', params);
    return response.data;
  },
  importBankTransactionsXlsx: async (file: File): Promise<{ imported: number; skipped: number; errors?: string[] }> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/api/sales/bank-transactions/import-xlsx', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  listLeadTaskTemplates: async (active_only = true): Promise<LeadTaskTemplate[]> => {
    const response = await api.get('/api/sales/lead-task-templates', { params: { active_only } });
    return response.data;
  },
  createLeadTaskTemplate: async (name: string): Promise<LeadTaskTemplate> => {
    const response = await api.post('/api/sales/lead-task-templates', { name });
    return response.data;
  },
  updateLeadTaskTemplate: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<LeadTaskTemplate> => {
    const response = await api.put(`/api/sales/lead-task-templates/${id}`, payload);
    return response.data;
  },
  listLeadTaskStatuses: async (active_only = true): Promise<LeadTaskStatusOption[]> => {
    const response = await api.get('/api/sales/lead-task-statuses', { params: { active_only } });
    return response.data;
  },
  createLeadTaskStatus: async (payload: { name: string; is_closed?: boolean }): Promise<LeadTaskStatusOption> => {
    const response = await api.post('/api/sales/lead-task-statuses', payload);
    return response.data;
  },
  updateLeadTaskStatus: async (
    id: number,
    payload: { name?: string; is_closed?: boolean; is_active?: boolean }
  ): Promise<LeadTaskStatusOption> => {
    const response = await api.put(`/api/sales/lead-task-statuses/${id}`, payload);
    return response.data;
  },
  listLeadStatuses: async (active_only = true): Promise<LeadStatusOption[]> => {
    const response = await api.get('/api/sales/lead-statuses', { params: { active_only } });
    return response.data;
  },
  createLeadStatus: async (payload: { name: string; base_status: LeadStatus }): Promise<LeadStatusOption> => {
    const response = await api.post('/api/sales/lead-statuses', payload);
    return response.data;
  },
  updateLeadStatus: async (
    id: number,
    payload: { name?: string; base_status?: LeadStatus; is_active?: boolean }
  ): Promise<LeadStatusOption> => {
    const response = await api.put(`/api/sales/lead-statuses/${id}`, payload);
    return response.data;
  },
  listLeadInfoTemplates: async (active_only = true): Promise<LeadInfoTemplate[]> => {
    const response = await api.get('/api/sales/lead-info-templates', { params: { active_only } });
    return response.data;
  },
  createLeadInfoTemplate: async (payload: { name: string; body: string }): Promise<LeadInfoTemplate> => {
    const response = await api.post('/api/sales/lead-info-templates', payload);
    return response.data;
  },
  updateLeadInfoTemplate: async (
    id: number,
    payload: { name?: string; body?: string; is_active?: boolean }
  ): Promise<LeadInfoTemplate> => {
    const response = await api.put(`/api/sales/lead-info-templates/${id}`, payload);
    return response.data;
  },
  listLeadCommunications: async (leadId: number): Promise<LeadCommunication[]> => {
    const response = await api.get(`/api/sales/leads/${leadId}/communications`);
    return response.data;
  },
  sendLeadInfo: async (
    leadId: number,
    payload: { template_id?: number; channel?: string; message: string; follow_up_at: string; pause_reason?: string }
  ): Promise<LeadCommunication> => {
    const response = await api.post(`/api/sales/leads/${leadId}/send-info`, payload);
    return response.data;
  },
  logLeadCommunication: async (
    leadId: number,
    payload: { channel: 'call' | 'messenger' | 'email'; message?: string; follow_up_at?: string }
  ): Promise<LeadCommunication> => {
    const response = await api.post(`/api/sales/leads/${leadId}/communications`, payload);
    return response.data;
  },
  saveLeadContactResult: async (
    leadId: number,
    payload: { outcome: 'connected' | 'no_answer' | 'callback'; note?: string; follow_up_at?: string }
  ): Promise<LeadCommunication> => {
    const response = await api.post(`/api/sales/leads/${leadId}/contact-result`, payload);
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
    const response = await api.get('/api/sales/follow-ups', { params: params || {} });
    return response.data;
  },
  getLeadsPushStats: async (leadIds: number[]): Promise<LeadPushStats[]> => {
    const response = await api.get('/api/sales/leads/push-stats', {
      params: { lead_ids: leadIds },
      paramsSerializer: { indexes: null },
    });
    return response.data;
  },
  getStudentsForCards: async (): Promise<{ id: number; full_name: string }[]> => {
    const response = await api.get('/api/sales/students-for-cards');
    return response.data;
  },
  getAbsences: async (params?: { stage?: string; student_id?: number }): Promise<AbsenceFollowUp[]> => {
    const response = await api.get('/api/sales/absences', { params: params || {} });
    return response.data;
  },
  updateAbsenceStage: async (absenceId: number, stage: string): Promise<AbsenceFollowUp> => {
    const response = await api.patch(`/api/sales/absences/${absenceId}`, { stage });
    return response.data;
  },
  suggestMakeups: async (
    absenceId: number,
    daysAhead?: number
  ): Promise<import('../types').MakeupSuggestionItem[]> => {
    const response = await api.get(`/api/sales/absences/${absenceId}/suggest-makeups`, {
      params: daysAhead ? { days_ahead: daysAhead } : {},
    });
    return response.data;
  },
  assignMakeup: async (
    absenceId: number,
    data: { makeup_group_id: number; makeup_lesson_date: string }
  ): Promise<AbsenceFollowUp> => {
    const response = await api.post(`/api/sales/absences/${absenceId}/assign-makeup`, data);
    return response.data;
  },
  getStudentFreezes: async (studentId: number): Promise<{ id: number; student_id: number; freeze_start: string; freeze_end: string; created_at: string }[]> => {
    const response = await api.get(`/api/sales/students/${studentId}/freezes`);
    return response.data;
  },
  createStudentFreeze: async (
    studentId: number,
    data: { freeze_start: string; freeze_end: string }
  ): Promise<{ id: number; student_id: number; freeze_start: string; freeze_end: string; created_at: string }> => {
    const response = await api.post(`/api/sales/students/${studentId}/freezes`, data);
    return response.data;
  },
  deleteStudentFreeze: async (studentId: number, freezeId: number): Promise<void> => {
    await api.delete(`/api/sales/students/${studentId}/freezes/${freezeId}`);
  },
  getCloseByFactPreview: async (
    studentId: number
  ): Promise<{ lessons_attended_in_period: number; amount: number; period_start?: string; period_end?: string }> => {
    const response = await api.get(`/api/sales/students/${studentId}/close-by-fact-preview`);
    return response.data;
  },
  closeByFact: async (studentId: number): Promise<{ ok: boolean; student_id: number; amount: number; lessons_attended: number }> => {
    const response = await api.post(`/api/sales/students/${studentId}/close-by-fact`, { confirm: true });
    return response.data;
  },
  getPaymentStatus: async (params?: { status?: string }): Promise<
    Array<{ student_id: number; student_name: string; card_id?: number; next_payment_date?: string; learning_period_start?: string; status: string }>
  > => {
    const response = await api.get('/api/sales/payment-status', { params: params || {} });
    return response.data;
  },
  getProgramMakeupCompatibility: async (): Promise<
    Array<{ id: number; source_program_id: number; target_program_id: number; source_program_name?: string; target_program_name?: string }>
  > => {
    const response = await api.get('/api/sales/program-makeup-compatibility');
    return response.data;
  },
  createProgramMakeupCompatibility: async (data: {
    source_program_id: number;
    target_program_id: number;
  }): Promise<{ id: number; source_program_id: number; target_program_id: number; source_program_name?: string; target_program_name?: string }> => {
    const response = await api.post('/api/sales/program-makeup-compatibility', data);
    return response.data;
  },
  deleteProgramMakeupCompatibility: async (compatId: number): Promise<void> => {
    await api.delete(`/api/sales/program-makeup-compatibility/${compatId}`);
  },
  /** Справка по форме КНД 1151158 (2 страницы). Все поля передаются в body. */
  generateTaxDeductionCertificate: async (data: Record<string, unknown>): Promise<Blob> => {
    const response = await api.post('/api/sales/tax-deduction-certificate', data, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  listCustomLessons: async (params?: {
    date_from?: string;
    date_to?: string;
    trainer_id?: number;
    student_id?: number;
    lesson_type?: string;
  }): Promise<
    Array<{
      id: number;
      title: string;
      lesson_date: string;
      start_time: string;
      end_time?: string | null;
      trainer_id: number;
      trainer_name?: string | null;
      lesson_type: string;
      comment?: string | null;
      students: Array<{
        id: number;
        student_id: number;
        student_name?: string | null;
        planned_absence_id?: number | null;
        attended: boolean;
        absence_reason?: string | null;
        absence_comment?: string | null;
      }>;
    }>
  > => {
    const response = await api.get('/api/sales/custom-lessons', { params: params || {} });
    return response.data;
  },
  createCustomLesson: async (data: {
    title: string;
    lesson_date: string;
    start_time: string;
    end_time?: string | null;
    trainer_id: number;
    lesson_type: string;
    comment?: string | null;
    students: Array<{ student_id: number; planned_absence_id?: number | null }>;
  }): Promise<any> => {
    const response = await api.post('/api/sales/custom-lessons', data);
    return response.data;
  },
  updateCustomLesson: async (
    id: number,
    data: Partial<{
      title: string;
      lesson_date: string;
      start_time: string;
      end_time?: string | null;
      trainer_id: number;
      lesson_type: string;
      comment?: string | null;
      students: Array<{ student_id: number; planned_absence_id?: number | null }>;
    }>
  ): Promise<any> => {
    const response = await api.put(`/api/sales/custom-lessons/${id}`, data);
    return response.data;
  },
  deleteCustomLesson: async (id: number): Promise<void> => {
    await api.delete(`/api/sales/custom-lessons/${id}`);
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
  listManagers: async (): Promise<{ id: number; full_name: string }[]> => {
    const response = await api.get('/api/b2b-schools/managers');
    return response.data;
  },
  planForToday: async (city?: string | null): Promise<{
    overdue: B2BSchool[];
    no_next_step: B2BSchool[];
    find_contacts_stale: B2BSchool[];
    find_contacts_no_contacts_48h: B2BSchool[];
    today: B2BSchool[];
    tomorrow: B2BSchool[];
    week: B2BSchool[];
    no_contacts: B2BSchool[];
    no_touches_7d: B2BSchool[];
    event_done_no_leads: B2BSchool[];
    event_done_no_leads_24_48h: B2BSchool[];
    negotiations_14d: B2BSchool[];
  }> => {
    const params = city ? { city } : {};
    const response = await api.get('/api/b2b-schools/plan-for-today', { params });
    return response.data;
  },
  planCitySummary: async (): Promise<{
    city: string;
    schools_in_work: number;
    overdue: number;
    events_this_week: number;
    leads_7d: number;
    partners: number;
  }[]> => {
    const response = await api.get('/api/b2b-schools/plan-city-summary');
    return response.data;
  },
  listSchools: async (opts?: {
    pipeline_stage?: string;
    project_id?: number;
    city?: string;
    manager_id?: number;
    overdue?: boolean;
    search?: string;
  }): Promise<B2BSchool[]> => {
    const params: Record<string, unknown> = {};
    if (opts?.pipeline_stage) params.pipeline_stage = opts.pipeline_stage;
    if (opts?.project_id != null) params.project_id = opts.project_id;
    if (opts?.city) params.city = opts.city;
    if (opts?.manager_id != null) params.manager_id = opts.manager_id;
    if (opts?.overdue === true) params.overdue = true;
    if (opts?.search?.trim()) params.search = opts.search.trim();
    const response = await api.get('/api/b2b-schools', { params });
    return response.data;
  },
  getSchool: async (id: number): Promise<B2BSchool> => {
    const response = await api.get(`/api/b2b-schools/${id}`);
    return response.data;
  },
  listSchoolLeads: async (schoolId: number): Promise<{ id: number; contact_name: string; phone: string; status: string; source: string | null; source_event: string | null; created_at: string }[]> => {
    const response = await api.get(`/api/b2b-schools/${schoolId}/leads`);
    return response.data;
  },
  transferSchoolLeads: async (schoolId: number): Promise<{ updated: number }> => {
    const response = await api.post(`/api/b2b-schools/${schoolId}/leads/transfer`);
    return response.data;
  },
  listSchoolInteractions: async (schoolId: number): Promise<{ id: number; b2b_school_id: number; type: string; happened_at: string; summary: string | null; created_by_id: number | null; created_by_name: string | null; created_at: string }[]> => {
    const response = await api.get(`/api/b2b-schools/${schoolId}/interactions`);
    return response.data;
  },
  createSchoolInteraction: async (schoolId: number, payload: { type: string; happened_at: string; summary?: string; next_step?: string; next_step_date?: string }): Promise<{ id: number; b2b_school_id: number; type: string; happened_at: string; summary: string | null; created_by_id: number | null; created_by_name: string | null; created_at: string }> => {
    const response = await api.post(`/api/b2b-schools/${schoolId}/interactions`, payload);
    return response.data;
  },
  listSchoolEvents: async (schoolId: number): Promise<{ id: number; b2b_school_id: number; format: string; online_type: string | null; event_dates: string[] | null; created_at: string }[]> => {
    const response = await api.get(`/api/b2b-schools/${schoolId}/events`);
    return response.data;
  },
  createSchoolEvent: async (schoolId: number, payload: { format: string; online_type?: string; dates?: string[] }): Promise<{ id: number; b2b_school_id: number; format: string; online_type: string | null; event_dates: string[] | null; created_at: string }> => {
    const response = await api.post(`/api/b2b-schools/${schoolId}/events`, payload);
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
    next_step?: string | null;
    next_step_date?: string | null;
    manager_id?: number | null;
    source?: string | null;
    priority?: string | null;
    preference?: string | null;
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
      next_step: string | null;
      next_step_date: string | null;
      manager_id: number | null;
      source: string | null;
      priority: string | null;
      preference: string | null;
      support_letter_status: string | null;
      partnership: Record<string, boolean> | null;
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
  importSchools: async (params: {
    file: File;
    city?: string | null;
    manager_id?: number | null;
    launch_in_work?: boolean;
  }): Promise<{ created: number; skipped: number; errors: string[] }> => {
    const form = new FormData();
    form.append('file', params.file);
    if (params.city != null && params.city !== '') form.append('city', params.city);
    if (params.manager_id != null) form.append('manager_id', String(params.manager_id));
    if (params.launch_in_work) form.append('launch_in_work', 'true');
    const response = await api.post('/api/b2b-schools/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
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

export interface TrainerCalculationRow {
  trainer_id: number;
  full_name: string;
  is_individual_format: boolean;
  rate_per_lesson: number | null;
  rate_per_hour: number | null;
  lessons_count: number;
  hours_count: number;
  base_payment: number;
  bonus: number;
  total_payment: number;
  already_paid: boolean;
}

export const ownerCalculationsApi = {
  getTrainers: async (month: string): Promise<TrainerCalculationRow[]> => {
    const response = await api.get('/api/owner/calculations/trainers', { params: { month } });
    return response.data;
  },
  updateTrainerRate: async (
    trainerId: number,
    payload: { rate_per_lesson?: number | null; rate_per_hour?: number | null }
  ): Promise<{ ok: boolean }> => {
    const response = await api.put(`/api/owner/calculations/trainers/${trainerId}/rate`, payload);
    return response.data;
  },
  addBonus: async (trainerId: number, period: string, bonus: number): Promise<{ ok: boolean }> => {
    const response = await api.post(`/api/owner/calculations/trainers/${trainerId}/bonus`, { period, bonus });
    return response.data;
  },
  pay: async (trainerId: number, period: string): Promise<{ ok: boolean }> => {
    const response = await api.post(`/api/owner/calculations/trainers/${trainerId}/pay`, { period });
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
    description?: string;
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
    description?: string;
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
  completeTask: async (taskId: number): Promise<import('../types').TaskResponse> => {
    const response = await api.post(`/api/tasks/${taskId}/complete`);
    return response.data;
  },
};

export default api;

