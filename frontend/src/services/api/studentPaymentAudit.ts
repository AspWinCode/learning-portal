import { api } from './client';

export interface PaymentDetail {
  transaction_id: number;
  account_id: number;
  date: string | null;
  amount: number;
  finance_transaction_id: number | null;
  payment_format: string | null;
  note: string | null;
}

export interface DuplicatePaymentGroup {
  finance_transaction_id: number;
  student_id: number | null;
  transactions: PaymentDetail[];
}

export interface StudentPaymentAuditEntry {
  student_id: number;
  student_name: string;
  status: string;
  on_grant: boolean;

  learning_format: 'individual' | 'group';
  abonement_id: number | null;
  abonement_name: string | null;
  active_group_names: string[];

  payment_count: number;
  payment_total: number;
  first_payment_date: string | null;
  last_payment_date: string | null;
  payments: PaymentDetail[];

  learning_period_start: string | null;
  period_state: 'ok' | 'missing';
  lessons_passed: number | null;
  lessons_attended: number | null;
  lessons_missed: number | null;
  lessons_remaining: number | null;
  lifetime_lessons_count: number | null;

  lifetime_lessons_passed: number | null;
  current_period_lessons: number | null;

  period_should_rollover: boolean;
  data_warning: string | null;
  warnings: string[];
  possible_duplicate: boolean;
  duplicate_student_ids: number[];
}

export interface StudentPaymentAuditSummary {
  students_total: number;
  with_payments: number;
  without_payments: number;
  grant_students: number;
}

export interface StudentPaymentAuditResponse {
  summary: StudentPaymentAuditSummary;
  students: StudentPaymentAuditEntry[];
  possible_duplicate_payments: DuplicatePaymentGroup[];
  danilova_daria: StudentPaymentAuditEntry[];
}

export const studentPaymentAuditApi = {
  getAudit: (): Promise<StudentPaymentAuditResponse> =>
    api.get('/owner-dashboard/student-payment-audit').then((r) => r.data),
};
