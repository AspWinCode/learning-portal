import { api } from '../../services/api/client';

// ─── LEGO — Ленинец: изолированный API (/api/v1/lego) ───────────────────────

const BASE = '/lego';

export type LegoPaymentStatusCode = 'unpaid' | 'ok' | 'due_soon' | 'overdue' | 'overdue_3' | 'overdue_10';

export interface LegoStudent {
  id: number;
  full_name: string;
  birth_date: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  secondary_phone: string | null;
  comment: string | null;
  start_date: string | null;
  status: 'active' | 'archived';
  group_name: string | null;
}

export interface LegoDashboard {
  active_students: number;
  lessons_today: number;
  attended_today: number;
  payments_expected: number;
  overdue: number;
  overdue_amount: number | null;
  revenue_this_month: number | null;
  money_visible: boolean;
}

export interface LegoGroup {
  id: number;
  name: string;
  branch_id: number | null;
  branch_name: string | null;
  trainer_id: number | null;
  trainer_name: string | null;
  location: string;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  students_count: number;
}

export interface LegoLesson {
  id: number;
  group_id: number;
  group_name: string | null;
  lesson_date: string;
  start_time: string | null;
  end_time: string | null;
  trainer_id: number | null;
  status: 'planned' | 'completed' | 'cancelled';
  comment: string | null;
  students_count: number;
}

export interface LegoLessonDetail extends LegoLesson {
  roster: { student_id: number; full_name: string; attended: boolean | null; comment: string | null }[];
}

export interface LegoDebtRow {
  student_id: number;
  full_name: string;
  group_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  payment_amount: number | null;
  next_payment_date: string | null;
  status: LegoPaymentStatusCode;
  days_until_due: number | null;
  days_overdue: number;
}

export interface LegoDebtSummary {
  total_active: number;
  paid_ok: number;
  due_soon: number;
  overdue: number;
  overdue_3: number;
  overdue_10: number;
  unpaid: number;
  expected_debt_amount: number | null;
  overdue_amount: number | null;
}

export interface LegoStudentCard extends LegoStudent {
  groups: { group_id: number; name: string; joined_at: string; left_at: string | null }[];
  attendance: {
    history: { lesson_id: number; date: string; group_name: string; attended: boolean; comment: string | null }[];
    total: number;
    attended: number;
    missed: number;
  };
  payments: null | {
    plan: {
      payment_amount: number | null;
      payment_period: string;
      payment_active: boolean;
      paid_until: string | null;
      next_payment_date: string | null;
    };
    status: { status: LegoPaymentStatusCode; days_until_due: number | null; days_overdue: number };
    history: {
      id: number;
      amount: number;
      payment_date: string;
      period_start: string | null;
      period_end: string | null;
      comment: string | null;
      finance_transaction_id: number | null;
    }[];
  };
}

export const getDashboard = (): Promise<LegoDashboard> => api.get(`${BASE}/dashboard`).then((r) => r.data);

export const listStudents = (params?: { q?: string; status?: string }): Promise<LegoStudent[]> =>
  api.get(`${BASE}/students`, { params }).then((r) => r.data);

export const getStudent = (id: number): Promise<LegoStudentCard> =>
  api.get(`${BASE}/students/${id}`).then((r) => r.data);

export const createStudent = (payload: Partial<LegoStudent> & { full_name: string }): Promise<LegoStudent> =>
  api.post(`${BASE}/students`, payload).then((r) => r.data);

export const updateStudent = (id: number, payload: Partial<LegoStudent>): Promise<LegoStudent> =>
  api.patch(`${BASE}/students/${id}`, payload).then((r) => r.data);

export const setPaymentPlan = (
  id: number,
  payload: { payment_amount?: number | null; payment_active?: boolean },
): Promise<unknown> => api.put(`${BASE}/students/${id}/payment-plan`, payload).then((r) => r.data);

export const registerPayment = (
  id: number,
  payload: { amount: number; payment_date?: string; comment?: string; idempotency_key?: string },
): Promise<{ id: number; created: boolean; paid_until: string | null }> =>
  api.post(`${BASE}/students/${id}/payments`, payload).then((r) => r.data);

export const listGroups = (): Promise<LegoGroup[]> => api.get(`${BASE}/groups`).then((r) => r.data);

export const createGroup = (payload: { name: string; trainer_id?: number | null; branch_id?: number | null; weekday?: number | null; start_time?: string | null; end_time?: string | null }): Promise<LegoGroup> =>
  api.post(`${BASE}/groups`, payload).then((r) => r.data);

export const addGroupMember = (groupId: number, studentId: number): Promise<unknown> =>
  api.post(`${BASE}/groups/${groupId}/members`, { student_id: studentId }).then((r) => r.data);

export const leaveGroup = (groupId: number, studentId: number): Promise<unknown> =>
  api.post(`${BASE}/groups/${groupId}/members/${studentId}/leave`).then((r) => r.data);

export const listLessons = (params?: { date_from?: string; date_to?: string; group_id?: number }): Promise<LegoLesson[]> =>
  api.get(`${BASE}/lessons`, { params }).then((r) => r.data);

export const createLesson = (payload: { group_id: number; lesson_date: string; start_time?: string | null; end_time?: string | null; comment?: string | null }): Promise<LegoLesson> =>
  api.post(`${BASE}/lessons`, payload).then((r) => r.data);

export const getLesson = (id: number): Promise<LegoLessonDetail> => api.get(`${BASE}/lessons/${id}`).then((r) => r.data);

export const saveAttendance = (
  id: number,
  records: { student_id: number; attended: boolean; comment?: string | null }[],
): Promise<{ saved: number; message: string }> =>
  api.post(`${BASE}/lessons/${id}/attendance`, { records }).then((r) => r.data);

export const cancelLesson = (id: number, comment?: string): Promise<unknown> =>
  api.post(`${BASE}/lessons/${id}/cancel`, { comment }).then((r) => r.data);

export const listPayments = (): Promise<
  { id: number; student_id: number; student_name: string; amount: number; payment_date: string; paid_until: string | null; finance_transaction_id: number | null }[]
> => api.get(`${BASE}/payments`).then((r) => r.data);

export const getDebts = (filter: string): Promise<{ summary: LegoDebtSummary; rows: LegoDebtRow[]; money_visible: boolean }> =>
  api.get(`${BASE}/debts`, { params: { filter } }).then((r) => r.data);

export const getPaymentSummary = (): Promise<{ summary: LegoDebtSummary; revenue_this_month: number; month_start: string }> =>
  api.get(`${BASE}/payment-summary`).then((r) => r.data);

export const PAYMENT_STATUS_LABEL: Record<LegoPaymentStatusCode, string> = {
  unpaid: 'Не платил',
  ok: 'Оплачено',
  due_soon: 'Скоро оплата',
  overdue: 'Просрочено',
  overdue_3: 'Просрочено 3+ дн.',
  overdue_10: 'Просрочено 10+ дн.',
};

export const PAYMENT_STATUS_COLOR: Record<LegoPaymentStatusCode, 'default' | 'success' | 'warning' | 'error'> = {
  unpaid: 'default',
  ok: 'success',
  due_soon: 'warning',
  overdue: 'warning',
  overdue_3: 'error',
  overdue_10: 'error',
};

export const formatMoney = (value: number | null | undefined): string =>
  value == null ? '—' : `${Math.round(value).toLocaleString('ru-RU')} ₽`;

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
};

export interface LegoGroupDetail extends LegoGroup {
  members: { student_id: number; full_name: string; joined_at: string }[];
}

export const getGroup = (id: number): Promise<LegoGroupDetail> => api.get(`${BASE}/groups/${id}`).then((r) => r.data);

export const updateGroup = (id: number, payload: { name?: string; trainer_id?: number | null; weekday?: number | null; start_time?: string | null; end_time?: string | null }): Promise<LegoGroup> =>
  api.patch(`${BASE}/groups/${id}`, payload).then((r) => r.data);

export const listTrainers = (): Promise<{ id: number; full_name: string }[]> => api.get(`${BASE}/trainers`).then((r) => r.data);

// ─── Филиалы и мастер-классы ────────────────────────────────────────────────

export interface LegoBranch {
  id: number;
  code: string;
  name: string;
  finance_target_id: number;
  is_active: boolean;
}

export interface LegoEventItem {
  id: number;
  branch_id: number;
  branch_name: string | null;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  price: number | null;
  capacity: number | null;
  status: 'planned' | 'completed' | 'cancelled';
  comment: string | null;
  registered: number;
}

export interface LegoEventDetail extends LegoEventItem {
  participants: {
    student_id: number;
    full_name: string;
    parent_phone: string | null;
    attended: boolean;
    paid: boolean;
    payment_id: number | null;
  }[];
}

export const listBranches = (): Promise<LegoBranch[]> => api.get(`${BASE}/branches`).then((r) => r.data);

export const createBranch = (payload: { code: string; name: string }): Promise<LegoBranch> =>
  api.post(`${BASE}/branches`, payload).then((r) => r.data);

export const listEvents = (params?: { date_from?: string; date_to?: string }): Promise<LegoEventItem[]> =>
  api.get(`${BASE}/events`, { params }).then((r) => r.data);

export const createEvent = (payload: {
  branch_id: number;
  title: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  price?: number | null;
  capacity?: number | null;
  comment?: string | null;
}): Promise<LegoEventItem> => api.post(`${BASE}/events`, payload).then((r) => r.data);

export const getEvent = (id: number): Promise<LegoEventDetail> => api.get(`${BASE}/events/${id}`).then((r) => r.data);

export const registerParticipant = (
  eventId: number,
  payload: { student_id?: number; full_name?: string; parent_phone?: string },
): Promise<unknown> => api.post(`${BASE}/events/${eventId}/registrations`, payload).then((r) => r.data);

export const markEventAttendance = (eventId: number, studentId: number, attended: boolean): Promise<unknown> =>
  api.post(`${BASE}/events/${eventId}/registrations/${studentId}/attendance`, null, { params: { attended } }).then((r) => r.data);

export const payForEvent = (
  eventId: number,
  studentId: number,
  payload: { amount?: number; payment_date?: string; idempotency_key?: string },
): Promise<{ payment_id: number; amount: number; created: boolean }> =>
  api.post(`${BASE}/events/${eventId}/registrations/${studentId}/payment`, payload).then((r) => r.data);
