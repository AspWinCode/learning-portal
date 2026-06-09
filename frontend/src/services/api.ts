import { api as apiClient } from './api/client';
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
  SalesClass,
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
  B2BDocument,
  B2BSchoolCustomField,
  B2BProject,
  OwnerFunnelTypeInfo,
  OwnerFunnelEvent,
  OwnerFunnelItem,
  SalesInstruction,
  StudentCard,
  AbsenceFollowUp,
  FinanceLedgerBankRow,
  FinanceLedgerTransactionRow,
  FinanceAccountBalance,
  FinancePnlRow,
  FinanceAnalyticsSummary,
  OwnerWorkspaceProject,
  OwnerWorkspaceContact,
  OwnerWorkspaceTask,
  OwnerWorkspaceTaskListPage,
  OwnerWorkspaceTaskStatusCounts,
  OwnerWorkspaceTasksAnalyticsOverview,
  OwnerWorkspaceMessage,
  OwnerWorkspaceConversation,
  OwnerWorkspaceTaskComment,
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceHistoryStats,
  OwnerWorkspaceDigest,
  OwnerWorkspaceNotificationsEnvelope,
  OwnerWorkspaceTaskConfig,
  OwnerWorkspaceProjectConfig,
  OwnerWorkspaceNotificationConfig,
  OwnerWorkspaceSettingsBundle,
  OwnerWorkspaceSettingsBundleEnvelope,
  OwnerWorkspaceSettingsSnapshot,
  OwnerWorkspaceNotificationDeliveryStats,
  OwnerWorkspaceNotificationDeliveryRetryResult,
  OwnerWorkspaceTagDictionary,
  OwnerWorkspacePermissionPolicy,
  OwnerWorkspaceUserPreferences,
  OwnerWorkspaceWebPushStatus,
  OwnerWorkspaceSearchResult,
  OwnerWorkspaceTaskCompleteResult,
  Role,
  PermissionCatalogItem,
  CommunicationTemplate,
  CommunicationQueueItem,
  TrainerCockpitSummary,
  OwnerDashboardSummary,
  ParentDashboardSummary,
  ParentQuestion,
  ParentQuestionCreate,
  ParentWeeklyDigestSettings,
  StudentTimelineEvent,
  PublicMakeupSlotsResponse,
  PhoneSearchResponse,
  PersonSearchResponse,
  DiskItem,
  DiskItemsResponse,
  PasswordEntry,
  PasswordEntryPayload,
  PersonalFinanceAccount,
  PersonalFinanceCategory,
  PersonalFinanceRule,
  PersonalFinanceSummary,
  PersonalFinanceTransaction,
  PersonAttachRecordRequest,
  PersonMergeRequest,
  PwaMySettings,
  PwaRoleSettings,
  StudentQuestionnaireTemplate,
} from '../types';
export { ownerWorkspaceApi } from './api/ownerWorkspace';

const api = apiClient;

/*


  timeout: 45000, // 45s — для тяжёлых запросов и холодного старта бэкенда

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

*/
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
    custom_role_id?: number | null;
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

export const rolesApi = {
  getAll: async (): Promise<Role[]> => {
    const response = await api.get('/api/roles/');
    return response.data;
  },
  getById: async (id: number): Promise<Role> => {
    const response = await api.get(`/api/roles/${id}`);
    return response.data;
  },
  getPermissionsCatalog: async (): Promise<PermissionCatalogItem[]> => {
    const response = await api.get('/api/roles/permissions-catalog');
    return response.data.items;
  },
  create: async (data: {
    key: string;
    name: string;
    description?: string | null;
    base_role: Role['base_role'];
    permissions: string[];
  }): Promise<Role> => {
    const response = await api.post('/api/roles/', data);
    return response.data;
  },
  update: async (
    id: number,
    data: Partial<{
      name: string;
      description: string | null;
      base_role: Role['base_role'];
      permissions: string[];
      is_active: boolean;
    }>
  ): Promise<Role> => {
    const response = await api.put(`/api/roles/${id}`, data);
    return response.data;
  },
  archive: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/api/roles/${id}`);
    return response.data;
  },
};

export const communicationsApi = {
  getTemplates: async (params?: {
    channel?: string;
    event_key?: string;
  }): Promise<CommunicationTemplate[]> => {
    const response = await api.get('/api/communications/templates', { params });
    return response.data;
  },
  createTemplate: async (data: {
    name: string;
    category?: string | null;
    event_key?: string | null;
    channel: CommunicationTemplate['channel'];
    subject?: string | null;
    text: string;
    active: boolean;
  }): Promise<CommunicationTemplate> => {
    const response = await api.post('/api/communications/templates', data);
    return response.data;
  },
  updateTemplate: async (
    templateId: number,
    data: Partial<{
      name: string;
      category: string | null;
      event_key: string | null;
      channel: CommunicationTemplate['channel'];
      subject: string | null;
      text: string;
      active: boolean;
    }>
  ): Promise<CommunicationTemplate> => {
    const response = await api.put(`/api/communications/templates/${templateId}`, data);
    return response.data;
  },
  getQueue: async (params?: {
    channel?: string;
    recipient_type?: string;
    recipient_id?: number;
    status?: string;
    limit?: number;
  }): Promise<CommunicationQueueItem[]> => {
    const response = await api.get('/api/communications/queue', { params });
    return response.data;
  },
};

export const trainerCockpitApi = {
  getSummary: async (summaryDate?: string): Promise<TrainerCockpitSummary> => {
    const response = await api.get('/api/trainer-cockpit/summary', {
      params: summaryDate ? { summary_date: summaryDate } : {},
    });
    return response.data;
  },
};

export const parentDashboardApi = {
  getSummary: async (): Promise<ParentDashboardSummary> => {
    const response = await api.get('/api/parent-dashboard/summary');
    return response.data;
  },
  createQuestion: async (data: ParentQuestionCreate): Promise<ParentQuestion> => {
    const response = await api.post('/api/parent-dashboard/questions', data);
    return response.data;
  },
  getWebPushStatus: async (): Promise<OwnerWorkspaceWebPushStatus> => {
    const response = await api.get('/api/parent-dashboard/me/web-push');
    return response.data;
  },
  upsertWebPushSubscription: async (payload: {
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string | null;
  }): Promise<OwnerWorkspaceWebPushStatus> => {
    const response = await api.post('/api/parent-dashboard/me/web-push/subscriptions', payload);
    return response.data;
  },
  removeWebPushSubscription: async (endpoint: string): Promise<OwnerWorkspaceWebPushStatus> => {
    const response = await api.post('/api/parent-dashboard/me/web-push/subscriptions/remove', { endpoint });
    return response.data;
  },
};

export const ownerDashboardApi = {
  getSummary: async (): Promise<OwnerDashboardSummary> => {
    const response = await api.get('/api/owner-dashboard/summary');
    return response.data;
  },
};

export const adminToolsApi = {
  resetTrainerPassword: async (userId: number): Promise<{ temporary_password: string }> => {
    const response = await api.post(`/api/admin-tools/reset-trainer-password/${userId}`);
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
  getTimeline: async (
    studentId: number,
    params?: { offset?: number; limit?: number; event_type?: string; date_from?: string; date_to?: string }
  ): Promise<StudentTimelineEvent[]> => {
    const response = await api.get(`/api/students/${studentId}/timeline`, { params });
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
  deleteTransaction: async (accountId: number, transactionId: number): Promise<StudentAccount> => {
    const response = await api.delete(`/api/student-accounts/${accountId}/transactions/${transactionId}`);
    return response.data;
  },
  remove: async (accountId: number): Promise<void> => {
    await api.delete(`/api/student-accounts/${accountId}`);
  },
};

// Unified Finance Ledger API
export const financeApi = {
  listLedgerTransactions: async (params?: {
    target_codes?: string[];
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<FinanceLedgerTransactionRow[]> => {
    const response = await api.get('/api/finance/ledger/transactions', {
      params: {
        target_codes: params?.target_codes,
        date_from: params?.date_from,
        date_to: params?.date_to,
        limit: params?.limit,
      },
    });
    return response.data;
  },
  listLedgerBank: async (params?: {
    status_filter?: string[];
    unclassified_only?: boolean;
    limit?: number;
  }): Promise<FinanceLedgerBankRow[]> => {
    const response = await api.get('/api/finance/ledger/bank', {
      params: {
        status_filter: params?.status_filter,
        unclassified_only: params?.unclassified_only,
        limit: params?.limit,
      },
    });
    return response.data;
  },
  updateTransaction: async (
    transactionId: number,
    payload: {
      direction?: string;
      status?: string;
      account_id?: number | null;
      to_account_id?: number | null;
      target_id?: number | null;
      article_id?: number | null;
      transfer_group_id?: string | null;
    }
  ): Promise<FinanceLedgerBankRow> => {
    const response = await api.patch(`/api/finance/transactions/${transactionId}`, payload);
    return response.data;
  },
  deleteTransaction: async (transactionId: number): Promise<void> => {
    await api.delete(`/api/finance/transactions/${transactionId}`);
  },
  listAccounts: async (): Promise<
    Array<{ id: number; code: string; name: string; owner_scope: string; is_active: boolean }>
  > => {
    const response = await api.get('/api/finance/accounts', { params: { only_active: true } });
    return response.data;
  },
  createImportAccount: async (payload: { code: string; name: string; owner_scope?: string }): Promise<
    { id: number; code: string; name: string; owner_scope: string; is_active: boolean }
  > => {
    const response = await api.post('/api/finance/accounts', payload);
    return response.data;
  },
  deleteImportAccount: async (id: number): Promise<void> => {
    await api.delete(`/api/finance/accounts/${id}`);
  },
  listTargets: async (): Promise<Array<{ id: number; code: string; name: string; is_active: boolean }>> => {
    const response = await api.get('/api/finance/targets', { params: { only_active: true } });
    return response.data;
  },
  createTarget: async (payload: { code: string; name: string }): Promise<{ id: number; code: string; name: string; is_active: boolean }> => {
    const response = await api.post('/api/finance/targets', payload);
    return response.data;
  },
  deleteTarget: async (id: number): Promise<void> => {
    await api.delete(`/api/finance/targets/${id}`);
  },
  listArticles: async (params?: { scope?: string; direction?: string }): Promise<
    Array<{ id: number; name: string; direction: string; cost_kind: string; scope: string; is_active: boolean }>
  > => {
    const response = await api.get('/api/finance/articles', {
      params: { only_active: true, scope: params?.scope, direction: params?.direction },
    });
    return response.data;
  },
  createArticle: async (payload: {
    name: string;
    direction: 'income' | 'expense';
    scope?: string;
    cost_kind?: string;
  }): Promise<{ id: number; name: string; direction: string; cost_kind: string; scope: string; is_active: boolean }> => {
    const response = await api.post('/api/finance/articles', payload);
    return response.data;
  },
  updateArticle: async (
    articleId: number,
    payload: {
      name?: string;
      direction?: 'income' | 'expense';
      scope?: string;
      cost_kind?: string;
      is_active?: boolean;
    }
  ): Promise<{ id: number; name: string; direction: string; cost_kind: string; scope: string; is_active: boolean }> => {
    const response = await api.patch(`/api/finance/articles/${articleId}`, payload);
    return response.data;
  },
  deleteArticle: async (articleId: number): Promise<void> => {
    await api.delete(`/api/finance/articles/${articleId}`);
  },
  createPersonalOperation: async (payload: {
    date: string;
    amount: number;
    description: string;
    target_code: 'academy' | 'personal' | 'gogol_mogol' | 'leninets';
  }): Promise<FinanceLedgerTransactionRow> => {
    const response = await api.post('/api/finance/personal-operation', payload);
    return response.data;
  },
  createManualTransaction: async (payload: {
    account_id: number;
    amount: number;
    direction: 'income' | 'expense';
    occurred_at: string;
    article_id?: number | null;
    target_id?: number | null;
    description?: string | null;
  }): Promise<FinanceLedgerBankRow> => {
    const response = await api.post('/api/finance/manual-transaction', payload);
    return response.data;
  },
  getBalances: async (params?: { as_of?: string }): Promise<FinanceAccountBalance[]> => {
    const response = await api.get('/api/finance/balances', {
      params: { as_of: params?.as_of },
    });
    return response.data;
  },
  getPnl: async (params?: {
    target_code?: string;
    date_from?: string;
    date_to?: string;
    group_by?: 'month' | 'date';
  }): Promise<FinancePnlRow[]> => {
    const response = await api.get('/api/finance/pnl', {
      params: {
        target_code: params?.target_code,
        date_from: params?.date_from,
        date_to: params?.date_to,
        group_by: params?.group_by,
      },
    });
    return response.data;
  },
  getAnalyticsSummary: async (params?: {
    date_from?: string;
    date_to?: string;
    group_by?: 'month' | 'date';
  }): Promise<FinanceAnalyticsSummary> => {
    const response = await api.get('/api/finance/analytics/summary', {
      params: {
        date_from: params?.date_from,
        date_to: params?.date_to,
        group_by: params?.group_by,
      },
    });
    return response.data;
  },
  listJournalTransactions: async (params?: {
    account_ids?: number[];
    target_ids?: number[];
    article_ids?: number[];
    direction?: string;
    status?: string[];
    unclassified_only?: boolean;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<FinanceLedgerBankRow[]> => {
    const response = await api.get('/api/finance/transactions', {
      params: {
        account_ids: params?.account_ids,
        target_ids: params?.target_ids,
        article_ids: params?.article_ids,
        direction: params?.direction,
        status: params?.status,
        unclassified_only: params?.unclassified_only,
        date_from: params?.date_from,
        date_to: params?.date_to,
        limit: params?.limit,
      },
    });
    return response.data;
  },
  importJournalFile: async (
    account_code: string,
    file: File
  ): Promise<{ imported: number; skipped: number }> => {
    const form = new FormData();
    form.append('account_code', account_code);
    form.append('file', file);
    const response = await api.post('/api/finance/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  applyTransactionToStudent: async (
    transactionId: number,
    payload: { student_id: number }
  ): Promise<FinanceLedgerBankRow> => {
    const response = await api.post(`/api/finance/transactions/${transactionId}/apply-student`, payload);
    return response.data;
  },
  migratePersonalFinance: async (payload: {
    articles: Array<{ id: string; name: string; type: 'income' | 'expense' }>;
    operations: Array<{
      date: string;
      amount: number;
      description: string;
      target: 'academy' | 'personal' | 'gogol_mogol' | 'leninets';
      articleId: string | null;
      createdAt: string;
    }>;
    recognitionRules: Array<{ pattern: string; displayName: string }>;
  }): Promise<{ articles_created: number; operations_created: number; recognition_rules_created: number }> => {
    const response = await api.post('/api/finance/migrate-personal-finance', payload);
    return response.data;
  },
};

export const personalFinanceApi = {
  listAccounts: async (): Promise<PersonalFinanceAccount[]> => {
    const response = await api.get('/api/personal-finance/accounts');
    return response.data;
  },
  createAccount: async (payload: {
    name: string;
    currency?: string;
  }): Promise<PersonalFinanceAccount> => {
    const response = await api.post('/api/personal-finance/accounts', payload);
    return response.data;
  },
  updateAccount: async (
    accountId: number,
    payload: Partial<{ name: string; currency: string; is_active: boolean }>
  ): Promise<PersonalFinanceAccount> => {
    const response = await api.patch(`/api/personal-finance/accounts/${accountId}`, payload);
    return response.data;
  },
  listCategories: async (params?: {
    direction?: 'income' | 'expense';
  }): Promise<PersonalFinanceCategory[]> => {
    const response = await api.get('/api/personal-finance/categories', { params });
    return response.data;
  },
  createCategory: async (payload: {
    name: string;
    direction: 'income' | 'expense';
  }): Promise<PersonalFinanceCategory> => {
    const response = await api.post('/api/personal-finance/categories', payload);
    return response.data;
  },
  updateCategory: async (
    categoryId: number,
    payload: Partial<{ name: string; direction: 'income' | 'expense'; is_active: boolean }>
  ): Promise<PersonalFinanceCategory> => {
    const response = await api.patch(`/api/personal-finance/categories/${categoryId}`, payload);
    return response.data;
  },
  listRules: async (): Promise<PersonalFinanceRule[]> => {
    const response = await api.get('/api/personal-finance/rules');
    return response.data;
  },
  createRule: async (payload: {
    pattern: string;
    category_id?: number | null;
    display_name?: string | null;
  }): Promise<PersonalFinanceRule> => {
    const response = await api.post('/api/personal-finance/rules', payload);
    return response.data;
  },
  updateRule: async (
    ruleId: number,
    payload: Partial<{ pattern: string; category_id: number | null; display_name: string | null; is_active: boolean }>
  ): Promise<PersonalFinanceRule> => {
    const response = await api.patch(`/api/personal-finance/rules/${ruleId}`, payload);
    return response.data;
  },
  deleteRule: async (ruleId: number): Promise<void> => {
    await api.delete(`/api/personal-finance/rules/${ruleId}`);
  },
  listTransactions: async (params?: {
    account_ids?: number[];
    category_ids?: number[];
    direction?: 'income' | 'expense';
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<PersonalFinanceTransaction[]> => {
    const response = await api.get('/api/personal-finance/transactions', { params });
    return response.data;
  },
  createTransaction: async (payload: {
    account_id: number;
    amount: number;
    direction: 'income' | 'expense';
    article?: string | null;
    description?: string | null;
    occurred_at: string;
    category_id?: number | null;
  }): Promise<PersonalFinanceTransaction> => {
    const response = await api.post('/api/personal-finance/transactions', payload);
    return response.data;
  },
  updateTransaction: async (
    transactionId: number,
    payload: Partial<{
      account_id: number;
      amount: number;
      direction: 'income' | 'expense';
      article: string | null;
      description: string | null;
      occurred_at: string;
      category_id: number | null;
    }>
  ): Promise<PersonalFinanceTransaction> => {
    const response = await api.patch(`/api/personal-finance/transactions/${transactionId}`, payload);
    return response.data;
  },
  deleteTransaction: async (transactionId: number): Promise<void> => {
    await api.delete(`/api/personal-finance/transactions/${transactionId}`);
  },
  getSummary: async (): Promise<PersonalFinanceSummary> => {
    const response = await api.get('/api/personal-finance/summary');
    return response.data;
  },
  importLegacy: async (payload: {
    accounts: Array<{ name: string; currency?: string }>;
    categories: Array<{ name: string; direction: 'income' | 'expense' }>;
    transactions: Array<{
      account_id: number;
      amount: number;
      direction: 'income' | 'expense';
      article?: string | null;
      description?: string | null;
      occurred_at: string;
      category_id?: number | null;
    }>;
    rules: Array<{ pattern: string; category_id?: number | null; display_name?: string | null }>;
  }): Promise<{
    accounts_created: number;
    categories_created: number;
    transactions_created: number;
    rules_created: number;
  }> => {
    const response = await api.post('/api/personal-finance/import', payload);
    return response.data;
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
  getTrainers: async (params?: { include_archived?: boolean }): Promise<any> => {
    const response = await api.get('/api/reports/trainers', { params });
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
  searchByPhone: async (query: string): Promise<PhoneSearchResponse> => {
    const response = await api.get('/api/search/phone', { params: { q: query } });
    return response.data;
  },
  searchPersons: async (query: string): Promise<PersonSearchResponse> => {
    const response = await api.get('/api/search/persons', { params: { q: query } });
    return response.data;
  },
  getPersonById: async (personId: number): Promise<import('../types').PersonSearchItem> => {
    const response = await api.get(`/api/search/persons/${personId}`);
    return response.data;
  },
  mergePersons: async (payload: PersonMergeRequest): Promise<import('../types').PersonSearchItem> => {
    const response = await api.post('/api/search/persons/merge', payload);
    return response.data;
  },
  attachRecordToPerson: async (payload: PersonAttachRecordRequest): Promise<import('../types').PersonSearchItem> => {
    const response = await api.post('/api/search/persons/attach-record', payload);
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
  getB2BDistricts: async (): Promise<{ items: string[] }> => {
    const response = await api.get('/api/settings/b2b-districts');
    return response.data;
  },
  setB2BDistricts: async (items: string[]): Promise<{ items: string[] }> => {
    const response = await api.post('/api/settings/b2b-districts', { items });
    return response.data;
  },
  getRefusedReasons: async (): Promise<{ items: string[] }> => {
    const response = await api.get('/api/settings/refused-reasons');
    return response.data;
  },
  setRefusedReasons: async (items: string[]): Promise<{ items: string[] }> => {
    const response = await api.post('/api/settings/refused-reasons', { items });
    return response.data;
  },
  getStudentQuestionnaires: async (): Promise<StudentQuestionnaireTemplate[]> => {
    const response = await api.get('/api/settings/student-questionnaires');
    return response.data.items;
  },
  setStudentQuestionnaires: async (items: StudentQuestionnaireTemplate[]): Promise<StudentQuestionnaireTemplate[]> => {
    const response = await api.post('/api/settings/student-questionnaires', { items });
    return response.data.items;
  },
  getParentWeeklyDigest: async (): Promise<ParentWeeklyDigestSettings> => {
    const response = await api.get('/api/settings/parent-weekly-digest');
    return response.data;
  },
  setParentWeeklyDigest: async (payload: ParentWeeklyDigestSettings): Promise<ParentWeeklyDigestSettings> => {
    const response = await api.post('/api/settings/parent-weekly-digest', payload);
    return response.data;
  },
  getPwaRoleSettings: async (): Promise<PwaRoleSettings> => {
    const response = await api.get('/api/settings/pwa/modules');
    return response.data;
  },
  setPwaRoleSettings: async (payload: Pick<PwaRoleSettings, 'role_modules'>): Promise<PwaRoleSettings> => {
    const response = await api.post('/api/settings/pwa/modules', payload);
    return response.data;
  },
  getMyPwaSettings: async (): Promise<PwaMySettings> => {
    const response = await api.get('/api/settings/pwa/my');
    return response.data;
  },
  setMyPwaSettings: async (enabled_modules: string[]): Promise<PwaMySettings> => {
    const response = await api.post('/api/settings/pwa/my', { enabled_modules });
    return response.data;
  },
  getOwnerWorkspaceTaskConfig: async (): Promise<OwnerWorkspaceTaskConfig> => {
    const response = await api.get('/api/settings/owner-workspace-task-config');
    return response.data;
  },
  setOwnerWorkspaceTaskConfig: async (payload: OwnerWorkspaceTaskConfig): Promise<OwnerWorkspaceTaskConfig> => {
    const response = await api.post('/api/settings/owner-workspace-task-config', payload);
    return response.data;
  },
  getOwnerWorkspaceProjectConfig: async (): Promise<OwnerWorkspaceProjectConfig> => {
    const response = await api.get('/api/settings/owner-workspace-project-config');
    return response.data;
  },
  setOwnerWorkspaceProjectConfig: async (
    payload: OwnerWorkspaceProjectConfig
  ): Promise<OwnerWorkspaceProjectConfig> => {
    const response = await api.post('/api/settings/owner-workspace-project-config', payload);
    return response.data;
  },
  getOwnerWorkspacePermissionPolicy: async (): Promise<OwnerWorkspacePermissionPolicy> => {
    const response = await api.get('/api/settings/owner-workspace-permission-policy');
    return response.data;
  },
  setOwnerWorkspacePermissionPolicy: async (
    payload: OwnerWorkspacePermissionPolicy
  ): Promise<OwnerWorkspacePermissionPolicy> => {
    const response = await api.post('/api/settings/owner-workspace-permission-policy', payload);
    return response.data;
  },
  getOwnerWorkspaceNotificationConfig: async (): Promise<OwnerWorkspaceNotificationConfig> => {
    const response = await api.get('/api/settings/owner-workspace-notification-config');
    return response.data;
  },
  getOwnerWorkspaceNotificationDeliveryStats: async (): Promise<OwnerWorkspaceNotificationDeliveryStats> => {
    const response = await api.get('/api/settings/owner-workspace-notification-delivery-stats');
    return response.data;
  },
  retryOwnerWorkspaceNotificationDelivery: async (payload: {
    notification_ids: number[];
    include_email?: boolean;
    include_web_push?: boolean;
  }): Promise<OwnerWorkspaceNotificationDeliveryRetryResult> => {
    const response = await api.post('/api/settings/owner-workspace-notification-delivery-retry', payload);
    return response.data;
  },
  setOwnerWorkspaceNotificationConfig: async (
    payload: OwnerWorkspaceNotificationConfig
  ): Promise<OwnerWorkspaceNotificationConfig> => {
    const response = await api.post('/api/settings/owner-workspace-notification-config', payload);
    return response.data;
  },
  getOwnerWorkspaceTaskTags: async (): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.get('/api/settings/owner-workspace-task-tags');
    return response.data;
  },
  setOwnerWorkspaceTaskTags: async (payload: OwnerWorkspaceTagDictionary): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.post('/api/settings/owner-workspace-task-tags', payload);
    return response.data;
  },
  getOwnerWorkspaceContactTags: async (): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.get('/api/settings/owner-workspace-contact-tags');
    return response.data;
  },
  setOwnerWorkspaceContactTags: async (
    payload: OwnerWorkspaceTagDictionary
  ): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.post('/api/settings/owner-workspace-contact-tags', payload);
    return response.data;
  },
  getOwnerWorkspaceContactSources: async (): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.get('/api/settings/owner-workspace-contact-sources');
    return response.data;
  },
  setOwnerWorkspaceContactSources: async (
    payload: OwnerWorkspaceTagDictionary
  ): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.post('/api/settings/owner-workspace-contact-sources', payload);
    return response.data;
  },
  getOwnerWorkspaceCounterpartyRoles: async (): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.get('/api/settings/owner-workspace-counterparty-roles');
    return response.data;
  },
  setOwnerWorkspaceCounterpartyRoles: async (
    payload: OwnerWorkspaceTagDictionary
  ): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.post('/api/settings/owner-workspace-counterparty-roles', payload);
    return response.data;
  },
  getOwnerWorkspaceCounterpartyIndustries: async (): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.get('/api/settings/owner-workspace-counterparty-industries');
    return response.data;
  },
  setOwnerWorkspaceCounterpartyIndustries: async (
    payload: OwnerWorkspaceTagDictionary
  ): Promise<OwnerWorkspaceTagDictionary> => {
    const response = await api.post('/api/settings/owner-workspace-counterparty-industries', payload);
    return response.data;
  },
  getOwnerWorkspaceSettingsBundle: async (): Promise<OwnerWorkspaceSettingsBundleEnvelope> => {
    const response = await api.get('/api/settings/owner-workspace-settings-bundle');
    return response.data;
  },
  setOwnerWorkspaceSettingsBundle: async (
    payload: OwnerWorkspaceSettingsBundle | OwnerWorkspaceSettingsBundleEnvelope
  ): Promise<OwnerWorkspaceSettingsBundleEnvelope> => {
    const response = await api.post('/api/settings/owner-workspace-settings-bundle', payload);
    return response.data;
  },
  getOwnerWorkspaceSettingsSnapshots: async (): Promise<OwnerWorkspaceSettingsSnapshot[]> => {
    const response = await api.get('/api/settings/owner-workspace-settings-snapshots');
    return response.data.items;
  },
  createOwnerWorkspaceSettingsSnapshot: async (payload: {
    name: string;
    note?: string | null;
  }): Promise<OwnerWorkspaceSettingsSnapshot> => {
    const response = await api.post('/api/settings/owner-workspace-settings-snapshots', payload);
    return response.data;
  },
  updateOwnerWorkspaceSettingsSnapshot: async (
    snapshotId: string,
    payload: {
      name: string;
      note?: string | null;
    }
  ): Promise<OwnerWorkspaceSettingsSnapshot> => {
    const response = await api.patch(`/api/settings/owner-workspace-settings-snapshots/${snapshotId}`, payload);
    return response.data;
  },
  duplicateOwnerWorkspaceSettingsSnapshot: async (
    snapshotId: string,
    payload?: {
      name?: string | null;
      note?: string | null;
    }
  ): Promise<OwnerWorkspaceSettingsSnapshot> => {
    const response = await api.post(`/api/settings/owner-workspace-settings-snapshots/${snapshotId}/duplicate`, payload || {});
    return response.data;
  },
  applyOwnerWorkspaceSettingsSnapshot: async (snapshotId: string): Promise<OwnerWorkspaceSettingsBundleEnvelope> => {
    const response = await api.post(`/api/settings/owner-workspace-settings-snapshots/${snapshotId}/apply`);
    return response.data;
  },
  deleteOwnerWorkspaceSettingsSnapshot: async (snapshotId: string): Promise<OwnerWorkspaceSettingsSnapshot[]> => {
    const response = await api.delete(`/api/settings/owner-workspace-settings-snapshots/${snapshotId}`);
    return response.data.items;
  },
};

export const publicStudentQuestionnairesApi = {
  get: async (questionnaireId: string): Promise<StudentQuestionnaireTemplate> => {
    const response = await api.get(`/api/settings/public/student-questionnaires/${questionnaireId}`);
    return response.data;
  },
  submit: async (questionnaireId: string, answers: Record<string, unknown>): Promise<{ ok: boolean; card_id: number }> => {
    const response = await api.post(`/api/settings/public/student-questionnaires/${questionnaireId}/submit`, { answers });
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
  deleteLead: async (id: number): Promise<void> => {
    await api.delete(`/api/sales/leads/${id}`);
  },
  getLead: async (leadId: number): Promise<Lead> => {
    const response = await api.get(`/api/sales/leads/${leadId}`);
    return response.data;
  },
  getLeadCard: async (leadId: number): Promise<any> => {
    const response = await api.get(`/api/sales/leads/${leadId}/card`);
    return response.data;
  },
  getLeadTimeline: async (leadId: number, offset = 0, limit = 20): Promise<any[]> => {
    const response = await api.get(`/api/sales/leads/${leadId}/timeline`, { params: { offset, limit } });
    return response.data;
  },
  createLeadActivity: async (leadId: number, payload: {
    type: string;
    title: string;
    description?: string;
    channel?: string;
    payload_json?: Record<string, unknown>;
    status_effect_from?: string;
    status_effect_to?: string;
    related_task_id?: number;
    related_invoice_id?: number;
  }): Promise<any> => {
    const response = await api.post(`/api/sales/leads/${leadId}/activities`, payload);
    return response.data;
  },
  convertLeadToStudent: async (leadId: number): Promise<{ student_id: number; lead: Lead }> => {
    const response = await api.post(`/api/sales/leads/${leadId}/convert-to-student`);
    return response.data;
  },
  listTasks: async (leadId: number): Promise<LeadTask[]> => {
    const response = await api.get(`/api/sales/leads/${leadId}/tasks`);
    return response.data;
  },
  getLeadsSendInfoStatus: async (leadIds: number[]): Promise<Record<string, 'open' | 'done' | 'none'>> => {
    if (!leadIds.length) return {};
    const response = await api.get('/api/sales/leads/send-info-status', {
      params: { lead_ids: leadIds.join(',') },
    });
    return response.data ?? {};
  },
  getLeadsBadges: async (leadIds: number[]): Promise<Record<number, { has_invoice: boolean; has_task_today: boolean; is_overdue: boolean }>> => {
    if (!leadIds.length) return {};
    const response = await api.get('/api/sales/leads/badges', {
      params: { lead_ids: leadIds.join(',') },
    });
    return response.data ?? {};
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
  markInvoicePaid: async (leadId: number, invoiceId: number): Promise<Invoice> => {
    const response = await api.post(`/api/sales/leads/${leadId}/invoices/${invoiceId}/mark-paid`);
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
  listNoShowLeadIds: async (): Promise<number[]> => {
    const response = await api.get('/api/sales/leads/no-show-ids');
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
  createSalesSchool: async (payload: string | {
    name: string;
    city?: string | null;
    director?: string | null;
    email?: string | null;
    address?: string | null;
    phone?: string | null;
  }): Promise<SalesSchool> => {
    const body = typeof payload === 'string' ? { name: payload } : payload;
    const response = await api.post('/api/sales/schools', body);
    return response.data;
  },
  updateSalesSchool: async (id: number, payload: {
    name?: string;
    city?: string | null;
    director?: string | null;
    email?: string | null;
    address?: string | null;
    phone?: string | null;
    is_active?: boolean;
  }): Promise<SalesSchool> => {
    const response = await api.put(`/api/sales/schools/${id}`, payload);
    return response.data;
  },
  importSalesSchools: async (file: File): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/api/sales/schools/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  exportSalesSchools: async (): Promise<Blob> => {
    const response = await api.get('/api/sales/schools/export', { responseType: 'blob' });
    return response.data;
  },
  listSalesClasses: async (active_only = true): Promise<SalesClass[]> => {
    const response = await api.get('/api/sales/classes', { params: { active_only } });
    return response.data;
  },
  createSalesClass: async (name: string): Promise<SalesClass> => {
    const response = await api.post('/api/sales/classes', { name });
    return response.data;
  },
  updateSalesClass: async (id: number, payload: { name?: string; is_active?: boolean }): Promise<SalesClass> => {
    const response = await api.put(`/api/sales/classes/${id}`, payload);
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
  getPublicMakeupSelection: async (token: string): Promise<PublicMakeupSlotsResponse> => {
    const response = await api.get('/api/sales/public/makeup-selection', { params: { token } });
    return response.data;
  },
  confirmPublicMakeupSelection: async (
    data: { token: string; makeup_group_id: number; makeup_lesson_date: string }
  ): Promise<AbsenceFollowUp> => {
    const response = await api.post('/api/sales/public/makeup-selection/confirm', data);
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
  getPaymentStatusSummary: async (): Promise<{ overdue_3_count: number; overdue_10_count: number }> => {
    const response = await api.get('/api/sales/payment-status-summary');
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
  submitSpecialistQuestionnaire: async (payload: {
    parent_full_name: string;
    parent_phone: string;
    child_full_name: string;
    city: string;
    birth_date?: string;
    child_phone?: string;
    child_telegram?: string;
    gender?: string;
    school_name?: string;
    school_class?: string;
    parent_phone_2?: string;
    parent_telegram?: string;
    parent_email?: string;
    student_email?: string;
    preferred_messenger?: string;
    comment?: string;
    source?: string;
  }): Promise<{ lead_id: number }> => {
    const response = await api.post('/api/sales/public/leads/specialist-questionnaire', payload);
    return response.data;
  },
  submitTildaLead: async (payload: {
    parent_full_name: string;
    parent_phone: string;
    child_full_name: string;
    kind: 'start' | 'base' | 'pro';
  }): Promise<{ lead_id: number }> => {
    const response = await api.post('/api/sales/public/leads/tilda-lead', payload);
    return response.data;
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
    email?: string | null;
    city?: string;
    address?: string;
    district?: string;
    student_count?: number;
    friendship_degree?: string;
    pipeline_stage?: B2BSchoolPipelineStage;
    next_step?: string | null;
    next_step_date?: string | null;
    manager_id?: number | null;
    phone_school?: string | null;
    source?: string | null;
    priority?: string | null;
    preference?: string | null;
    comment?: string | null;
    custom_fields?: B2BSchoolCustomField[] | null;
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
      email: string | null;
      city: string;
      address: string;
      district: string;
      student_count: number;
      friendship_degree: string;
      pipeline_stage: B2BSchoolPipelineStage;
      next_step: string | null;
      next_step_date: string | null;
      manager_id: number | null;
      phone_school: string | null;
      source: string | null;
      priority: string | null;
      preference: string | null;
      support_letter_status: string | null;
      partnership: Record<string, boolean> | null;
      comment: string | null;
      custom_fields: B2BSchoolCustomField[] | null;
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
  listDocuments: async (schoolId: number): Promise<B2BDocument[]> => {
    const response = await api.get(`/api/b2b-schools/${schoolId}/documents`);
    return response.data;
  },
  uploadDocument: async (schoolId: number, type: string, file: File): Promise<B2BDocument> => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    const response = await api.post(`/api/b2b-schools/${schoolId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  downloadDocument: async (schoolId: number, documentId: number): Promise<Blob> => {
    const response = await api.get(`/api/b2b-schools/${schoolId}/documents/${documentId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },
  deleteDocument: async (schoolId: number, documentId: number): Promise<void> => {
    await api.delete(`/api/b2b-schools/${schoolId}/documents/${documentId}`);
  },
  listProjects: async (params?: { archived?: boolean }): Promise<B2BProject[]> => {
    const response = await api.get('/api/b2b-projects', { params });
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
  updateProject: async (
    id: number,
    payload: Partial<{ name: string; location: string; main_city: string; cities: string[]; archived: boolean }>
  ): Promise<B2BProject> => {
    const response = await api.put(`/api/b2b-projects/${id}`, payload);
    return response.data;
  },
};

export const campaignsApi = {
  getSettings: async (): Promise<import('../types').CampaignSettings> => {
    const response = await api.get('/api/campaigns/settings');
    return response.data;
  },
  createSettingItem: async (
    category: 'types' | 'formats' | 'scales',
    label: string
  ): Promise<import('../types').CampaignDictionaryItem> => {
    const response = await api.post(`/api/campaigns/settings/${category}`, { label });
    return response.data;
  },
  updateSettingItem: async (
    category: 'types' | 'formats' | 'scales',
    id: number,
    payload: Partial<{ label: string; is_active: boolean; position: number }>
  ): Promise<import('../types').CampaignDictionaryItem> => {
    const response = await api.put(`/api/campaigns/settings/${category}/${id}`, payload);
    return response.data;
  },
  deleteSettingItem: async (category: 'types' | 'formats' | 'scales', id: number): Promise<void> => {
    await api.delete(`/api/campaigns/settings/${category}/${id}`);
  },
  list: async (params?: { status?: string; city?: string; type?: string }): Promise<import('../types').Campaign[]> => {
    const response = await api.get('/api/campaigns', { params: params || {} });
    return response.data;
  },
  get: async (id: number): Promise<import('../types').Campaign> => {
    const response = await api.get(`/api/campaigns/${id}`);
    return response.data;
  },
  create: async (payload: {
    name: string;
    type: string;
    format: string;
    city?: string | null;
    region?: string | null;
    date_from?: string | null;
    date_to?: string | null;
    responsible_id?: number | null;
    status?: string;
    mode?: string;
    is_game_jam?: boolean;
  }): Promise<import('../types').Campaign> => {
    const response = await api.post('/api/campaigns', payload);
    return response.data;
  },
  update: async (
    id: number,
    payload: Partial<{
      name: string;
      type: string;
      format: string;
      city: string;
      region: string;
      date_from: string;
      date_to: string;
      responsible_id: number | null;
      status: string;
      mode: string;
    }>
  ): Promise<import('../types').Campaign> => {
    const response = await api.put(`/api/campaigns/${id}`, payload);
    return response.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/campaigns/${id}`);
  },
  listStages: async (campaignId: number): Promise<import('../types').CampaignStage[]> => {
    const response = await api.get(`/api/campaigns/${campaignId}/stages`);
    return response.data;
  },
  createStage: async (campaignId: number, label: string): Promise<import('../types').CampaignStage> => {
    const response = await api.post(`/api/campaigns/${campaignId}/stages`, { label });
    return response.data;
  },
  updateStage: async (
    campaignId: number,
    stageId: number,
    payload: Partial<{ label: string; position: number; is_terminal: boolean }>
  ): Promise<import('../types').CampaignStage> => {
    const response = await api.patch(`/api/campaigns/${campaignId}/stages/${stageId}`, payload);
    return response.data;
  },
  deleteStage: async (campaignId: number, stageId: number): Promise<void> => {
    await api.delete(`/api/campaigns/${campaignId}/stages/${stageId}`);
  },
  reorderStages: async (campaignId: number, orderedIds: number[]): Promise<import('../types').CampaignStage[]> => {
    const response = await api.post(`/api/campaigns/${campaignId}/stages/reorder`, { ordered_ids: orderedIds });
    return response.data;
  },
  // Jam stage endpoints (внутренние этапы джема)
  listJamStages: async (campaignId: number, eventId: number): Promise<import('../types').CampaignEventStage[]> => {
    const response = await api.get(`/api/campaigns/${campaignId}/events/${eventId}/stages`);
    return response.data;
  },
  createJamStage: async (campaignId: number, eventId: number, label: string): Promise<import('../types').CampaignEventStage> => {
    const response = await api.post(`/api/campaigns/${campaignId}/events/${eventId}/stages`, { label });
    return response.data;
  },
  updateJamStage: async (
    campaignId: number, eventId: number, stageId: number,
    payload: Partial<{ label: string; position: number; is_terminal: boolean }>
  ): Promise<import('../types').CampaignEventStage> => {
    const response = await api.patch(`/api/campaigns/${campaignId}/events/${eventId}/stages/${stageId}`, payload);
    return response.data;
  },
  deleteJamStage: async (campaignId: number, eventId: number, stageId: number): Promise<void> => {
    await api.delete(`/api/campaigns/${campaignId}/events/${eventId}/stages/${stageId}`);
  },
  updateSchoolJamStage: async (
    campaignId: number, eventId: number, scId: number, jamStage: string
  ): Promise<import('../types').SchoolCampaignEvent> => {
    const response = await api.patch(`/api/campaigns/${campaignId}/events/${eventId}/schools/${scId}`, { jam_stage: jamStage });
    return response.data;
  },
  listSchoolCampaigns: async (campaignId: number): Promise<import('../types').SchoolCampaign[]> => {
    const response = await api.get(`/api/campaigns/${campaignId}/school-campaigns`);
    return response.data;
  },
  addSchools: async (
    campaignId: number,
    body: { school_ids: number[]; create_contact_task?: boolean }
  ): Promise<import('../types').SchoolCampaign[]> => {
    const response = await api.post(`/api/campaigns/${campaignId}/school-campaigns/add-schools`, body);
    return response.data;
  },
  listSchoolsAvailable: async (
    campaignId: number,
    params?: { city?: string; cities?: string[]; district?: string; districts?: string[]; search?: string }
  ): Promise<{ id: number; name: string; city: string | null; district?: string | null }[]> => {
    const query = {
      ...(params?.city ? { city: params.city } : {}),
      ...(params?.cities?.length ? { cities: params.cities.join(',') } : {}),
      ...(params?.district ? { district: params.district } : {}),
      ...(params?.districts?.length ? { districts: params.districts.join(',') } : {}),
      ...(params?.search ? { search: params.search } : {}),
    };
    const response = await api.get(`/api/campaigns/${campaignId}/schools-available`, { params: query });
    return response.data;
  },
  updateSchoolCampaign: async (
    campaignId: number,
    scId: number,
    payload: { stage?: string; support_letter_status?: string; thank_you_sent?: boolean }
  ): Promise<import('../types').SchoolCampaign> => {
    const response = await api.patch(`/api/campaigns/${campaignId}/school-campaigns/${scId}`, payload);
    return response.data;
  },
  removeSchoolFromCampaign: async (campaignId: number, scId: number): Promise<void> => {
    await api.delete(`/api/campaigns/${campaignId}/school-campaigns/${scId}`);
  },
  // Campaign events (джемы внутри кампании)
  listCampaignEvents: async (campaignId: number): Promise<import('../types').CampaignEvent[]> => {
    const response = await api.get(`/api/campaigns/${campaignId}/events`);
    return response.data;
  },
  createCampaignEvent: async (
    campaignId: number,
    payload: {
      title: string;
      event_date: string;
      description?: string | null;
      starts_at?: string | null;
      ends_at?: string | null;
      trainer_id?: number | null;
      location?: string | null;
      city?: string | null;
      status?: string;
      notes?: string | null;
    }
  ): Promise<import('../types').CampaignEvent> => {
    const response = await api.post(`/api/campaigns/${campaignId}/events`, payload);
    return response.data;
  },
  updateCampaignEvent: async (
    campaignId: number,
    eventId: number,
    payload: Partial<{
      title: string;
      event_date: string;
      description: string | null;
      starts_at: string | null;
      ends_at: string | null;
      trainer_id: number | null;
      location: string | null;
      city: string | null;
      status: string;
      notes: string | null;
    }>
  ): Promise<import('../types').CampaignEvent> => {
    const response = await api.put(`/api/campaigns/${campaignId}/events/${eventId}`, payload);
    return response.data;
  },
  deleteCampaignEvent: async (campaignId: number, eventId: number): Promise<void> => {
    await api.delete(`/api/campaigns/${campaignId}/events/${eventId}`);
  },
  getSchoolsEventsMatrix: async (
    campaignId: number
  ): Promise<import('../types').SchoolsEventsMatrix> => {
    const response = await api.get(`/api/campaigns/${campaignId}/schools-events-matrix`);
    return response.data;
  },
  getCampaignSchoolEventCounts: async (
    campaignId: number
  ): Promise<Record<string, import('../types').CampaignSchoolEventCounts>> => {
    const response = await api.get(`/api/campaigns/${campaignId}/school-event-counts`);
    return response.data;
  },
  listEventSchools: async (
    campaignId: number,
    eventId: number
  ): Promise<
    Array<{
      school_campaign_id: number;
      school_name: string | null;
      school_city: string | null;
      stage: string;
      invite_status: string;
      participation_status: string;
      participant_count: number | null;
      host_status: string;
      notes: string | null;
      school_campaign_event_id: number | null;
    }>
  > => {
    const response = await api.get(`/api/campaigns/${campaignId}/events/${eventId}/schools`);
    return response.data;
  },
  upsertSchoolCampaignEvent: async (
    campaignId: number,
    eventId: number,
    schoolCampaignId: number,
    payload: {
      invite_status?: string;
      participation_status?: string;
      host_status?: string;
      participant_count?: number | null;
      notes?: string | null;
    },
    params?: { create_invite_task?: boolean; create_host_task?: boolean; create_participated_task?: boolean }
  ): Promise<import('../types').SchoolCampaignEvent> => {
    const response = await api.put(
      `/api/campaigns/${campaignId}/events/${eventId}/schools/${schoolCampaignId}`,
      payload,
      { params }
    );
    return response.data;
  },
  bulkUpdateEventSchools: async (
    campaignId: number,
    eventId: number,
    payload: {
      school_campaign_ids: number[];
      invite_status?: string;
      participation_status?: string;
      host_status?: string;
      create_invite_tasks?: boolean;
      create_host_tasks?: boolean;
      create_participated_tasks?: boolean;
    }
  ): Promise<import('../types').SchoolCampaignEvent[]> => {
    const response = await api.post(
      `/api/campaigns/${campaignId}/events/${eventId}/schools/bulk-update`,
      payload
    );
    return response.data;
  },
  getSchoolCampaignEventsHistory: async (
    campaignId: number,
    schoolCampaignId: number
  ): Promise<
    Array<{
      campaign_event_id: number;
      event_title: string | null;
      event_date: string | null;
      invite_status: string;
      participation_status: string;
      participant_count: number | null;
      host_status: string;
      notes: string | null;
    }>
  > => {
    const response = await api.get(
      `/api/campaigns/${campaignId}/school-campaigns/${schoolCampaignId}/events-history`
    );
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

export const legacyOwnerWorkspaceApi = {
  listProjects: async (params?: {
    status_filter?: string;
    parent_project_id?: number;
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
  updateProject: async (
    projectId: number,
    payload: {
      name?: string;
      description?: string | null;
      status?: 'active' | 'completed' | 'archived';
      owner_id?: number | null;
      parent_project_id?: number | null;
    }
  ): Promise<OwnerWorkspaceProject> => {
    const response = await api.patch(`/api/owner-workspace/projects/${projectId}`, payload);
    return response.data;
  },
  archiveProject: async (projectId: number): Promise<void> => {
    await api.delete(`/api/owner-workspace/projects/${projectId}`);
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
  unifiedSearch: async (q: string, limit?: number): Promise<OwnerWorkspaceSearchResult> => {
    const response = await api.get('/api/owner-workspace/search', {
      params: { q, ...(limit != null ? { limit } : {}) },
    });
    return response.data;
  },
  createProject: async (payload: {
    name: string;
    description?: string | null;
    status?: 'active' | 'completed' | 'archived';
    owner_id?: number | null;
    parent_project_id?: number | null;
  }): Promise<OwnerWorkspaceProject> => {
    const response = await api.post('/api/owner-workspace/projects', payload);
    return response.data;
  },
  listContacts: async (params?: {
    search?: string;
    project_id?: number;
    active_tasks_only?: boolean;
    /** Точное совпадение тега в массиве tags контакта */
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
    overdue_only?: boolean;
    active_only?: boolean;
    search?: string;
    sort_by?: 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority';
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
  }): Promise<{ updated: number }> => {
    const response = await api.post('/api/owner-workspace/tasks/bulk-update', payload);
    return response.data;
  },
  syncMessagesFromMax: async (limit?: number): Promise<{ imported: number; skipped: number }> => {
    const response = await api.post('/api/owner-workspace/messages/sync-from-max', {}, {
      params: limit != null ? { limit } : {},
    });
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
  listTasks: async (statusFilter?: string, category?: 'schools' | 'parents' | 'leads'): Promise<import('../types').TaskResponse[]> => {
    const params: Record<string, string> = {};
    if (statusFilter != null) params.status_filter = statusFilter;
    if (category != null) params.category = category;
    const response = await api.get('/api/tasks', { params: Object.keys(params).length ? params : {} });
    return response.data;
  },
  /** Day Desk: сгруппированные задачи для рабочего стола менеджера. */
  getDayDesk: async (): Promise<{
    stats: { overdue: number; today: number; completed_today: number; overload: number };
    urgent: import('../types').TaskResponse[];
    parents: import('../types').TaskResponse[];
    makeups: import('../types').TaskResponse[];
    payments: import('../types').TaskResponse[];
    operations: import('../types').TaskResponse[];
    leads: import('../types').TaskResponse[];
  }> => {
    const response = await api.get('/api/tasks/day-desk-summary');
    return response.data;
  },
  getParentResponsesStats: async (
    fromDate: string,
    toDate: string,
  ): Promise<Array<{ date: string; user_id: number; user_name: string; replies: number; escalations: number }>> => {
    const response = await api.get('/api/tasks/parent-responses/stats', {
      params: { from_date: fromDate, to_date: toDate },
    });
    return response.data;
  },
  /** Статистика за день: количество завершённых задач (для счётчика «выполнено M»). */
  getDayStats: async (day?: string): Promise<{ date: string; completed_count: number }> => {
    const params = day != null ? { day } : {};
    const response = await api.get('/api/tasks/stats', { params });
    return response.data;
  },
  /** Задачи для «Плана на сегодня»: mode = today | overdue | active */
  listTodayTasks: async (
    mode: 'today' | 'overdue' | 'active' = 'today',
    category?: 'schools' | 'parents' | 'leads',
    assigneeId?: number
  ): Promise<import('../types').TaskResponse[]> => {
    const params: Record<string, string | number> = { mode };
    if (category != null) params.category = category;
    if (assigneeId != null) params.assignee_id = assigneeId;
    const response = await api.get('/api/tasks/today', { params });
    return response.data;
  },
  postponeTask: async (taskId: number): Promise<import('../types').TaskResponse> => {
    const response = await api.patch(`/api/tasks/${taskId}/postpone`);
    return response.data;
  },
  pinTaskToday: async (taskId: number, pinned: boolean = true): Promise<import('../types').TaskResponse> => {
    const response = await api.patch(`/api/tasks/${taskId}/pin-today`, undefined, { params: { pinned } });
    return response.data;
  },
  incrementTaskCounter: async (
    taskId: number,
    key: 'parent_replies' | 'parent_escalations' | 'parent_to_management',
    delta = 1,
  ): Promise<import('../types').TaskResponse> => {
    const response = await api.post(`/api/tasks/${taskId}/counters/increment`, { key, delta });
    return response.data;
  },
  createTask: async (payload: {
    title?: string;
    description?: string;
    template_id?: number;
    assigned_to_id?: number;
    category?: 'schools' | 'parents' | 'leads';
    subtasks?: { text: string; order?: number }[];
    student_ids?: number[];
    scheduled_for?: string;
    due_at?: string;
    priority?: 'low' | 'normal' | 'high';
    pinned_today?: boolean;
    tags?: string[];
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
    category?: 'schools' | 'parents' | 'leads';
    student_ids?: number[];
    scheduled_for?: string | null;
    due_at?: string | null;
    priority?: 'low' | 'normal' | 'high';
    pinned_today?: boolean;
    tags?: string[];
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

// SMS (Gateway) — отправка только через backend
export interface SmsMessageResponse {
  id: string;
  phone: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  status: string;
  gateway_id: string | null;
  created_at: string;
  sent_at: string | null;
  created_by: number;
}

export interface SmsTemplateResponse {
  id: number;
  name: string;
  category: string | null;
  text: string;
  active: boolean;
  created_at: string;
}

export const smsApi = {
  send: async (payload: {
    phone: string;
    message: string;
    entity_type?: 'lead' | 'event' | 'task';
    entity_id?: number;
    scheduled_at?: string | null;
  }): Promise<SmsMessageResponse> => {
    const response = await api.post('/api/sms/send', payload);
    return response.data;
  },
  sendBulk: async (payload: { phones: string[]; message: string }): Promise<SmsMessageResponse[]> => {
    const response = await api.post('/api/sms/send-bulk', payload);
    return response.data;
  },
  getHistory: async (params?: {
    entity_type?: string;
    entity_id?: number;
    phone?: string;
  }): Promise<SmsMessageResponse[]> => {
    const response = await api.get('/api/sms/history', { params: params || {} });
    return response.data;
  },
  listTemplates: async (params?: {
    category?: string;
    active_only?: boolean;
  }): Promise<SmsTemplateResponse[]> => {
    const response = await api.get('/api/sms/templates', { params: params || {} });
    return response.data;
  },
};

export interface MaxSendResponse {
  success: boolean;
  message_id?: string | null;
  error?: string | null;
}

export const maxApi = {
  isConfigured: async (): Promise<{ configured: boolean; personal?: boolean; personal_provider?: 'greenapi' | 'api_messenger' | null }> => {
    const response = await api.get('/api/max/configured');
    return response.data;
  },
  getPersonalQr: async (): Promise<{ img: string }> => {
    const response = await api.get('/api/max/personal/qr');
    return response.data;
  },
  checkUser: async (params: { max_user_id?: number; phone?: string }): Promise<{ exists: boolean }> => {
    const response = await api.get('/api/max/check-user', { params });
    return response.data;
  },
  send: async (payload: {
    lead_id?: number;
    max_user_id?: number;
    phone?: string;
    message: string;
    scheduled_at?: string | null;
  }): Promise<MaxSendResponse> => {
    const response = await api.post('/api/max/send', payload);
    return response.data;
  },
};

// ─── Finance Hub API ──────────────────────────────────────────────────────
import type {
  HubAccount, HubTransaction, HubDebt, HubAllocation,
  HubSummary, HubChart, HubForecast,
  HubTransactionByCategoryRow, HubTransactionByProjectRow,
} from '../types';

export const financeHubApi = {
  // --- Summary & Chart ---
  getSummary: async (params?: { date_from?: string; date_to?: string }): Promise<HubSummary> => {
    const r = await api.get('/finance/hub/summary', { params });
    return r.data;
  },
  getChart: async (params?: { date_from?: string; date_to?: string; group_by?: string }): Promise<HubChart> => {
    const r = await api.get('/finance/hub/chart', { params });
    return r.data;
  },
  getForecast: async (): Promise<HubForecast> => {
    const r = await api.get('/finance/hub/forecast');
    return r.data;
  },
  getPlanned: async (): Promise<HubTransaction[]> => {
    const r = await api.get('/finance/hub/planned');
    return r.data;
  },

  // --- Accounts ---
  listAccounts: async (params?: { only_active?: boolean; project_id?: number }): Promise<HubAccount[]> => {
    const r = await api.get('/finance/hub/accounts', { params });
    return r.data;
  },
  createAccount: async (payload: Partial<HubAccount>): Promise<HubAccount> => {
    const r = await api.post('/finance/hub/accounts', payload);
    return r.data;
  },
  updateAccount: async (id: number, payload: Partial<HubAccount>): Promise<HubAccount> => {
    const r = await api.patch(`/finance/hub/accounts/${id}`, payload);
    return r.data;
  },
  deleteAccount: async (id: number): Promise<void> => {
    await api.delete(`/finance/hub/accounts/${id}`);
  },

  // --- Transactions ---
  listTransactions: async (params?: {
    account_id?: number; project_id?: number; direction?: string;
    category?: string; hub_status?: string; date_from?: string; date_to?: string;
  }): Promise<HubTransaction[]> => {
    const r = await api.get('/finance/hub/transactions', { params });
    return r.data;
  },
  createTransaction: async (payload: {
    account_id: number; direction: string; category: string;
    amount: number; transaction_date: string; hub_status?: string; description?: string;
  }): Promise<HubTransaction> => {
    const r = await api.post('/finance/hub/transactions', payload);
    return r.data;
  },
  updateTransaction: async (id: number, payload: Partial<HubTransaction>): Promise<HubTransaction> => {
    const r = await api.patch(`/finance/hub/transactions/${id}`, payload);
    return r.data;
  },
  deleteTransaction: async (id: number): Promise<void> => {
    await api.delete(`/finance/hub/transactions/${id}`);
  },
  getByCategory: async (params?: { date_from?: string; date_to?: string; direction?: string }): Promise<HubTransactionByCategoryRow[]> => {
    const r = await api.get('/finance/hub/transactions/by-category', { params });
    return r.data;
  },
  getByProject: async (params?: { date_from?: string; date_to?: string }): Promise<HubTransactionByProjectRow[]> => {
    const r = await api.get('/finance/hub/transactions/by-project', { params });
    return r.data;
  },

  // --- Debts ---
  listDebts: async (params?: { debt_type?: string; debt_status?: string }): Promise<HubDebt[]> => {
    const r = await api.get('/finance/hub/debts', { params });
    return r.data;
  },
  createDebt: async (payload: {
    debt_type: string; counterparty: string; amount: number;
    currency?: string; due_date?: string; description?: string; project_id?: number;
  }): Promise<HubDebt> => {
    const r = await api.post('/finance/hub/debts', payload);
    return r.data;
  },
  updateDebt: async (id: number, payload: Partial<HubDebt>): Promise<HubDebt> => {
    const r = await api.patch(`/finance/hub/debts/${id}`, payload);
    return r.data;
  },
  payDebt: async (id: number, amount: number): Promise<HubDebt> => {
    const r = await api.post(`/finance/hub/debts/${id}/payment`, { amount });
    return r.data;
  },
  deleteDebt: async (id: number): Promise<void> => {
    await api.delete(`/finance/hub/debts/${id}`);
  },

  // --- Allocations ---
  listAllocations: async (params?: { date_from?: string; date_to?: string }): Promise<HubAllocation[]> => {
    const r = await api.get('/finance/hub/allocations', { params });
    return r.data;
  },
  createAllocation: async (payload: {
    amount: number; currency?: string; from_account_id?: number;
    to_type: string; to_project_id?: number; to_account_id?: number;
    date: string; comment?: string;
  }): Promise<HubAllocation> => {
    const r = await api.post('/finance/hub/allocations', payload);
    return r.data;
  },
  deleteAllocation: async (id: number): Promise<void> => {
    await api.delete(`/finance/hub/allocations/${id}`);
  },
};

export const diskApi = {
  listItems: async (params?: { parent_id?: number | null; search?: string }): Promise<DiskItemsResponse> => {
    const response = await api.get('/disk/items', {
      params: {
        ...(params?.parent_id != null ? { parent_id: params.parent_id } : {}),
        ...(params?.search ? { search: params.search } : {}),
      },
    });
    return response.data;
  },
  createFolder: async (payload: { name: string; parent_id?: number | null }): Promise<DiskItem> => {
    const response = await api.post('/disk/folders', payload);
    return response.data;
  },
  uploadFile: async (file: File, parentId?: number | null): Promise<DiskItem> => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post('/disk/files', form, {
      params: parentId != null ? { parent_id: parentId } : {},
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return response.data;
  },
  updateItem: async (itemId: number, payload: { name?: string; parent_id?: number | null }): Promise<DiskItem> => {
    const response = await api.patch(`/disk/items/${itemId}`, payload);
    return response.data;
  },
  downloadFile: async (itemId: number): Promise<{ blob: Blob; filename: string }> => {
    const response = await api.get(`/disk/files/${itemId}/download`, { responseType: 'blob', timeout: 120000 });
    const disposition = String(response.headers['content-disposition'] || '');
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/);
    const filename = match ? decodeURIComponent(match[1] || match[2] || 'file') : 'file';
    return { blob: response.data, filename };
  },
  deleteItem: async (itemId: number): Promise<void> => {
    await api.delete(`/disk/items/${itemId}`);
  },
};

export const passwordsApi = {
  list: async (q?: string): Promise<PasswordEntry[]> => {
    const response = await api.get('/passwords', { params: q ? { q } : {} });
    return response.data;
  },
  create: async (payload: PasswordEntryPayload & { password: string }): Promise<PasswordEntry> => {
    const response = await api.post('/passwords', payload);
    return response.data;
  },
  update: async (entryId: number, payload: PasswordEntryPayload): Promise<PasswordEntry> => {
    const response = await api.patch(`/passwords/${entryId}`, payload);
    return response.data;
  },
  reveal: async (entryId: number): Promise<{ id: number; password: string }> => {
    const response = await api.get(`/passwords/${entryId}/secret`);
    return response.data;
  },
  delete: async (entryId: number): Promise<void> => {
    await api.delete(`/passwords/${entryId}`);
  },
};

export default api;

