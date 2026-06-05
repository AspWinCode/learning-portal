/** Формат ведения занятий тренера */
export type TrainerLessonFormat = 'group' | 'individual' | 'both';
/** Коды банков для перевода (профиль тренера) */
export const TRAINER_BANK_KEYS = ['alfa', 'tinkoff', 'sberbank', 'vtb', 'ozon'] as const;
export type TrainerBankKey = (typeof TRAINER_BANK_KEYS)[number];
export const TRAINER_BANK_LABELS: Record<TrainerBankKey, string> = {
  alfa: 'Альфа-Банк',
  tinkoff: 'Тинькофф',
  sberbank: 'Сбербанк',
  vtb: 'ВТБ',
  ozon: 'Озон',
};

export interface User {
  id: number;
  person_id?: number | null;
  email: string;
  full_name: string;
  role: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest' | 'sales';
  custom_role_id?: number | null;
  custom_role_name?: string | null;
  effective_role?: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest' | 'sales' | null;
  role_permissions?: string[];
  is_active: boolean;
  created_at: string;
  trainer_rate?: number | null;
  trainer_rate_per_hour?: number | null;
  trainer_lessons?: number | null;
  // Профиль тренера (виден owner, admin, sales)
  phone?: string | null;
  phone_extra?: string | null;
  trainer_lesson_formats?: TrainerLessonFormat | null;
  trainer_banks?: string[] | null;
  city?: string | null;
  trainer_telegram?: string | null;
  is_self_employed?: boolean | null;
  is_ip?: boolean | null;
  work_schedule?: string | null;
  qualification?: string | null;
  trainer_comment?: string | null;
}

export interface Role {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  base_role: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest' | 'sales';
  permissions: string[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface PermissionCatalogItem {
  key: string;
  module: string;
  label: string;
  description: string;
}

export interface CommunicationTemplate {
  id: number;
  name: string;
  category?: string | null;
  event_key?: string | null;
  channel: 'sms' | 'email' | 'max' | 'telegram' | 'web_push';
  subject?: string | null;
  text: string;
  active: boolean;
  created_at: string;
}

export interface CommunicationQueueItem {
  id: string;
  recipient_type: string;
  recipient_id: number;
  channel: string;
  template_id?: number | null;
  template_name?: string | null;
  status: string;
  attempt_count: number;
  last_attempt_at?: string | null;
  sent_at?: string | null;
  error?: string | null;
  payload?: Record<string, unknown> | null;
  dedupe_key?: string | null;
  created_at: string;
}

export interface TrainerCockpitTodoGradeItem {
  student_id: number;
  student_name: string;
  group_name?: string | null;
  last_lesson_date: string;
  lessons_without_grade_count: number;
}

export interface TrainerCockpitDraftCharacteristicItem {
  characteristic_id: number;
  student_id: number;
  student_name: string;
  month: number;
  year: number;
  created_at: string;
}

export interface TrainerCockpitStudentProgressItem {
  student_id: number;
  student_name: string;
  group_name?: string | null;
  program_name?: string | null;
  progress_percent: number;
  graded_topics: number;
  total_topics: number;
}

export interface TrainerCockpitNotificationItem {
  notification_type: 'characteristic_status' | 'substitution' | string;
  status: string;
  title: string;
  description: string;
  created_at: string;
}

export interface LeadAIInsight {
  score: number;
  stage: 'hot' | 'warm' | 'cooling' | 'cold' | string;
  best_next_action: string;
  reasons: string[];
}

export interface StudentWeakZoneAIInsight {
  topic_name: string;
  module_name?: string | null;
  average_grade: number;
  grade_count: number;
  recommendation: string;
}

export interface StudentDropoutRiskAIInsight {
  score: number;
  level: 'low' | 'medium' | 'high' | string;
  reasons: string[];
  recommended_action: string;
}

export interface StudentLearningAIInsight {
  weak_zone?: StudentWeakZoneAIInsight | null;
  dropout_risk: StudentDropoutRiskAIInsight;
}

export interface TrainerCockpitSummary {
  todo_grade_items: TrainerCockpitTodoGradeItem[];
  draft_characteristics: TrainerCockpitDraftCharacteristicItem[];
  my_students: Array<TrainerCockpitStudentProgressItem & { ai_insight?: StudentLearningAIInsight | null }>;
  characteristic_notifications: TrainerCockpitNotificationItem[];
  substitution_notifications: TrainerCockpitNotificationItem[];
}

export interface OwnerDashboardMetricPoint {
  label: string;
  value: number;
}

export interface OwnerAIInsight {
  kind: string;
  severity: 'info' | 'warning' | 'critical' | string;
  title: string;
  summary: string;
}

export interface OwnerDashboardSummary {
  generated_at: string;
  month_label: string;
  active_students: number;
  active_groups: number;
  active_trainers: number;
  active_sales_managers: number;
  new_leads_today: number;
  new_leads_month: number;
  won_leads_month: number;
  active_pipeline_count: number;
  registered_events_month: number;
  payments_received_month: number;
  payments_transactions_month: number;
  overdue_payments_3_count: number;
  overdue_payments_10_count: number;
  owner_workspace_overdue_tasks: number;
  owner_workspace_waiting_tasks: number;
  owner_workspace_completed_7_days: number;
  owner_workspace_completed_30_days: number;
  owner_workspace_avg_days_to_complete_30?: number | null;
  makeups_pending_total: number;
  makeups_waiting_parent: number;
  makeups_assigned: number;
  leads_last_14_days: OwnerDashboardMetricPoint[];
  payments_last_14_days: OwnerDashboardMetricPoint[];
  ai_insights: OwnerAIInsight[];
}

export interface Student {
  id: number;
  full_name: string;
  parent_id?: number | null;
  from_lead_id?: number | null;
  abonement_id?: number | null;
  status: 'active' | 'archived';
  training_start_date?: string | null;
  created_at: string;
  parent?: User;
  abonement?: Abonement;
  programs?: ProgramSummary[];
  /** true если ученик привязан хотя бы к одной группе */
  in_group?: boolean;
}

export interface StudentTimelineEvent {
  id: number;
  student_id: number;
  type: string;
  title: string;
  description?: string | null;
  created_by?: number | null;
  creator_name?: string | null;
  created_at: string;
  payload_json?: Record<string, unknown> | null;
}

export interface StudentAccountTransaction {
  id: number;
  account_id: number;
  amount: number;
  kind: 'payment' | 'lesson_deduction';
  note?: string | null;
  lesson_attendance_id?: number | null;
  created_at: string;
}

export interface StudentAccount {
  id: number;
  student_id: number;
  name: string;
  balance: number;
  created_at: string;
  updated_at?: string | null;
  transactions?: StudentAccountTransaction[];
}

export type AbonementFormat = 'individual' | 'package' | 'group';

export const ABONEMENT_FORMAT_LABELS: Record<AbonementFormat, string> = {
  individual: 'Индивидуальный',
  package: 'Пакет',
  group: 'Групповой',
};

export interface Abonement {
  id: number;
  name: string;
  price: number;
  discount_type: 'none' | 'amount' | 'percent';
  discount_value: number;
  status: 'active' | 'archived';
  created_at: string;
  abonement_format?: AbonementFormat | null;
}

export interface Group {
  id: number;
  name: string;
  trainer_id: number;
  status: 'active' | 'archived';
  created_at: string;
  direction?: string | null;
  trainer?: User;
  students?: Student[];
  programs?: ProgramSummary[];
  schedules?: GroupSchedule[];
  /** Юнитов за одно занятие (лимит «8 занятий»). По умолчанию 1. */
  units_per_session?: number | null;
  /** Ставка за доп. юнит (сверх лимита), ₽. Если не задано — как базовая. */
  extra_rate_per_unit?: number | null;
  /** Дата начала работы группы; уроки не создаются раньше неё. */
  start_date?: string | null;
  /** Формат: групповой (лимит 8 занятий, юниты) или индивидуальный. */
  lesson_format?: 'group' | 'individual';
  /** Краткое расписание (например, "Вт, Чт · 20:00–21:00"). */
  schedule_short?: string | null;
}

/** Политика доп. юнитов по слоту (дата + время). */
export interface LessonSlotExtraPolicy {
  extra_policy: 'free' | 'paid';
  extra_rate_per_unit?: number | null;
}

export type AbsenceFollowUpStage = 'missed' | 'assigned' | 'link_sent' | 'made_up' | 'missed_makeup';

export interface AbsenceFollowUp {
  id: number;
  lesson_attendance_id: number;
  student_id: number;
  group_id: number;
  lesson_date: string;
  stage: AbsenceFollowUpStage;
  absence_reason?: string | null;
  absence_comment?: string | null;
  makeup_group_id?: number | null;
  makeup_lesson_date?: string | null;
  makeup_custom_lesson_id?: number | null;
  makeup_custom_lesson_title?: string | null;
  created_at: string;
  updated_at?: string | null;
  student_name?: string | null;
  group_name?: string | null;
  program_name?: string | null;
  makeup_group_name?: string | null;
}

export interface MakeupSuggestionItem {
  group_id: number;
  group_name: string;
  program_name?: string | null;
  lesson_date: string;
  day_of_week: number;
  start_time?: string | null;
}

export interface PublicMakeupSlotsResponse {
  absence_id: number;
  student_id: number;
  student_name?: string | null;
  original_group_name?: string | null;
  missed_lesson_date: string;
  available_slots: MakeupSuggestionItem[];
}

export interface GroupSchedule {
  id: number;
  group_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface ProjectStage {
  id: number;
  project_id: number;
  name: string;
  position: number;
}

export interface ProjectCard {
  id: number;
  project_id: number;
  stage_id: number;
  entity_type: 'parent' | 'student';
  entity_id: number;
  position: number;
  created_at: string;
  display_name?: string | null;
}

export interface Project {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  entity_type: 'parent' | 'student';
  created_by_id: number;
  archived: boolean;
  created_at: string;
  updated_at?: string | null;
  created_by?: User | null;
  stages?: ProjectStage[];
  card_count?: number;
}

export type AbsenceReason = 'was' | 'not_was' | 'sick' | 'olympiad' | 'event' | 'other';

export interface TrainerLessonSlot {
  group_id: number;
  group_name: string;
  program_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  lesson_date: string;
  students: Array<{
    id: number;
    full_name: string;
    attended: boolean | null;
    late?: boolean;
    absence_reason?: string | null;
    absence_comment?: string | null;
    freeze_badge?: string | null;
  }>;
  trainer_id?: number | null;
  trainer_name?: string | null;
  lesson_index_in_month?: number | null;
  /** Юнитов за занятие (лимит 8 занятий). Может приходить с бэкенда. */
  units_per_session?: number | null;
  /** Флаг: слот отменён/перенесён (LessonCancellation). */
  is_cancelled?: boolean;
  /** Если перенесён: целевая дата/время. */
  moved_to_date?: string | null;
  moved_to_start_time?: string | null;
  moved_to_end_time?: string | null;
}

export interface Topic {
  id: number;
  name: string;
  description?: string;
  final_result?: string;
  order: number;
  status: string;
  created_at: string;
}

export interface Module {
  id: number;
  name: string;
  order: number;
  status: string;
  topics: Topic[];
  created_at: string;
}

export interface Program {
  id: number;
  name: string;
  version: number;
  parent_program_id?: number | null;
  status: string;
  created_at: string;
  modules: Module[];
}

export interface ProgramSummary {
  id: number;
  name: string;
  version: number;
  status: string;
}

export interface Grade {
  id: number;
  student_id: number;
  topic_id: number;
  trainer_id: number;
  grade: number;
  comment?: string;
  date: string;
  created_at: string;
  student?: Student;
  topic?: Topic;
  trainer?: User;
}

export interface Characteristic {
  id: number;
  student_id: number;
  trainer_id: number;
  month: number;
  year: number;
  data: Record<string, any>;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  admin_comment?: string;
  created_at: string;
  published_at?: string;
  student?: Student;
  trainer?: User;
}

export interface CharacteristicField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | string;
  required?: boolean;
  options?: string[];
}

export interface CharacteristicTemplate {
  id: number;
  name: string;
  fields: CharacteristicField[];
  is_active: boolean;
}

// --- Sales ---

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'no_answer'
  | 'demo'
  | 'invoice_sent'
  | 'won'
  | 'lost'
  | 'thinking'
  | 'refused'
  | 'trial_scheduled'
  | 'event_registered'
  | 'decided_immediately';
export type LeadCommunicationChannel = 'max' | 'email' | 'sms' | 'telegram';

export interface LeadStatusOption {
  id: number;
  name: string;
  base_status: LeadStatus;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: number;
  owner_id: number;
  person_id?: number | null;
  contact_name: string;
  phone: string;
  parent_full_name?: string | null;
  child_full_name?: string | null;
  parent_phone?: string | null;
  child_phone?: string | null;
  email?: string | null;
  city?: string | null;
  school_name?: string | null;
  school_class?: string | null;
  outreach_at?: string | null;
  outreach_minutes?: number | null;
  source?: string | null;
  communication_channel?: LeadCommunicationChannel | null;
  status_option_id?: number | null;
  status_option?: LeadStatusOption | null;
  source_id?: number | null;
  referral_name?: string | null;
  tags?: string[] | null;
  abonement_id?: number | null;
  desired_slot?: string | null;
  comment?: string | null;
  next_contact_at?: string | null;
  no_answer_attempt?: number | null;
  pause_reason?: string | null;
  status: LeadStatus;
  lost_reason?: string | null;
  questionnaire_filled?: boolean;
  created_at: string;
  updated_at?: string | null;
  abonement?: Abonement | null;
  post_visit_stage?: string | null;
  post_visit_review?: string | null;
  post_visit_project_date?: string | null;
  converted_to_student_id?: number | null;
  /** Полные данные из формы анкеты (для лидов из формы — свои поля) */
  questionnaire_data?: Record<string, unknown> | null;
  /** MAX мессенджер: user_id пользователя в платформе MAX */
  max_user_id?: number | null;
  /** Дата последнего контакта (звонок / недозвон / инфо) */
  last_contact_at?: string | null;
  ai_insight?: LeadAIInsight | null;
}

export type LeadTaskStatus = 'open' | 'done';

export interface LeadTask {
  id: number;
  lead_id: number;
  owner_id: number;
  template_id?: number | null;
  status_option_id?: number | null;
  note?: string | null;
  channel?: string | null;
  due_at?: string | null;
  status: LeadTaskStatus;
  created_at: string;
  updated_at?: string | null;
}

export interface LeadSource {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface SalesCity {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface SalesSchool {
  id: number;
  name: string;
  city?: string | null;
  director?: string | null;
  email?: string | null;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SalesClass {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

/** Шаблон счёта (Настройки Sales): название + формат групповой/индивидуальный */
export type AccountTemplateFormat = 'group' | 'individual';

export interface AccountTemplate {
  id: number;
  name: string;
  format: AccountTemplateFormat;
  created_at: string;
}

export interface BankTransaction {
  id: number;
  operation_id: string;
  amount: number;
  payer_phone?: string | null;
  payer_name?: string | null;
  payment_date?: string | null;
  status: string;
  expense_category?: string | null;
  student_id?: number | null;
  created_at: string;
}

// Unified Finance Ledger row for bank operations
export interface FinanceLedgerBankRow {
  id: number;
  occurred_at?: string | null;
  amount: number;
  direction: string;
  status: string;

  account_id?: number | null;
  account_code?: string | null;
  account_name?: string | null;

  to_account_id?: number | null;
  to_account_code?: string | null;
  to_account_name?: string | null;

  transfer_group_id?: string | null;

  counterparty_name?: string | null;
  counterparty_phone?: string | null;

  bank_source?: string | null;
  bank_operation_id?: string | null;

  target_id?: number | null;
  target_code?: string | null;
  target_name?: string | null;

  article_id?: number | null;
  article_name?: string | null;

  student_id?: number | null;
}

/** Строка транзакции журнала для дашборда личных финансов (по target). */
export interface FinanceLedgerTransactionRow {
  id: number;
  occurred_at?: string | null;
  amount: number;
  direction: string;
  target_code?: string | null;
  target_name?: string | null;
  article_id?: number | null;
  article_name?: string | null;
  counterparty_name?: string | null;
  description_raw?: string | null;
}

export interface FinanceAccountBalance {
  account_id: number;
  account_code: string;
  account_name: string;
  income_total: number;
  expense_total: number;
  balance: number;
}

export interface FinancePnlRow {
  period: string;
  income: number;
  expense: number;
  profit: number;
}

export interface FinanceAnalyticsKpiBlock {
  income_total: number;
  expense_total: number;
  profit_total: number;
  prev_income_total: number;
  prev_expense_total: number;
  prev_profit_total: number;
  income_delta: number;
  expense_delta: number;
  profit_delta: number;
  overdue_payments_3_count: number;
  overdue_payments_10_count: number;
  unclassified_transactions_count: number;
  unclassified_transactions_amount: number;
}

export interface FinanceAnalyticsTargetBreakdownRow {
  target_id?: number | null;
  target_code: string;
  target_name: string;
  income: number;
  expense: number;
  profit: number;
}

export interface FinanceAnalyticsExpenseBreakdownRow {
  article_id?: number | null;
  article_name: string;
  cost_kind?: string | null;
  amount: number;
}

export interface FinanceAnalyticsSummary {
  date_from: string;
  date_to: string;
  kpi: FinanceAnalyticsKpiBlock;
  pnl: FinancePnlRow[];
  target_breakdown: FinanceAnalyticsTargetBreakdownRow[];
  expense_breakdown: FinanceAnalyticsExpenseBreakdownRow[];
  account_balances: FinanceAccountBalance[];
}

export interface SalesInstruction {
  id: number;
  title: string;
  body: string;
  created_by_id: number;
  created_at: string;
  updated_at?: string | null;
}

export interface StudentCard {
  id: number;
  person_id?: number | null;
  student_id?: number | null;
  student_full_name: string;
  parent_cabinet_open?: boolean;
  birth_date?: string | null;
  student_phone?: string | null;
  telegram?: string | null;
  gender?: string | null;
  on_grant: boolean;
  format_type?: string | null;
  city?: string | null;
  school?: string | null;
  grade?: string | null;
  parent_full_name?: string | null;
  parent_phone?: string | null;
  parent_phone_2?: string | null;
  parent_telegram?: string | null;
  parent_email?: string | null;
  student_email?: string | null;
  preferred_messenger?: string | null; // max | telegram | sms
  comment?: string | null;
  source?: string | null; // откуда пришел
   /** Ссылка на оплату, которую могут задать owner/admin */
  payment_link?: string | null;
  abonement_id?: number | null;
  discount_type: 'none' | 'amount' | 'percent';
  discount_value: number;
  learning_period_start?: string | null;
  next_payment_date?: string | null;
  archived: boolean;
  anketa_status?: string; // draft | filled | converted | cancelled
  created_at: string;
  updated_at?: string | null;
  abonement?: Abonement | null;
}

export interface ParentDashboardNearestLesson {
  group_id: number;
  group_name: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  trainer_id?: number | null;
  trainer_name?: string | null;
}

export interface ParentDashboardStudentSummary {
  student_id: number;
  student_name: string;
  current_balance: number;
  next_payment_date?: string | null;
  payment_link?: string | null;
  nearest_lesson?: ParentDashboardNearestLesson | null;
  ai_insight?: StudentLearningAIInsight | null;
}

export interface ParentDashboardSummary {
  students: ParentDashboardStudentSummary[];
}

export interface ParentQuestionCreate {
  student_id: number;
  topic?: string;
  message: string;
}

export interface ParentQuestion {
  id: number;
  parent_user_id: number;
  student_id: number;
  target_trainer_id?: number | null;
  topic?: string | null;
  message: string;
  status: string;
  created_at: string;
}

export interface ParentWeeklyDigestSettings {
  enabled: boolean;
  weekday: number;
  send_time: string;
}

export interface AnketaConvertRequest {
  use_existing_parent_id?: number | null;
  use_existing_student_id?: number | null;
}

export interface AnketaConvertResponse {
  card: StudentCard;
  student_id: number;
}

export interface AnketaConvertConflict {
  code: 'existing_parent' | 'existing_student';
  message: string;
  existing_parent_id?: number | null;
  existing_students?: { id: number; full_name: string }[];
  existing_student_id?: number | null;
}

export interface LeadTaskTemplate {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface LeadTaskStatusOption {
  id: number;
  name: string;
  is_closed: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SalesQueueTaskItem {
  task_id: number;
  lead_id: number;
  lead_name: string;
  lead_phone: string;
  due_at?: string | null;
  note?: string | null;
}

export interface SalesQueueRegistrationItem {
  registration_id: number;
  event_id: number;
  event_title: string;
  lead_id: number;
  lead_name: string;
  starts_at: string;
  note?: string | null;
}

export interface SalesSchoolConversionItem {
  school_name: string;
  leads_count: number;
  won_count: number;
  conversion_percent: number;
  classes_count: number;
  outreach_minutes_total: number;
}

export interface SalesDashboardData {
  kpi_new_leads: number;
  kpi_dozvon_percent: number;
  kpi_info_sent: number;
  kpi_need_push_urgent: number;
  kpi_need_push_today: number;
  kpi_need_push_overdue: number;
  kpi_registered_event: number;
  kpi_came_count: number;
  kpi_no_show_count: number;
  overdue_followups: SalesQueueTaskItem[];
  call_today: SalesQueueTaskItem[];
  messenger_replies: SalesQueueTaskItem[];
  confirm_participation: SalesQueueRegistrationItem[];
  outreach_schools_month: number;
  outreach_classes_month: number;
  outreach_minutes_month: number;
  top_schools_conversion_month: SalesSchoolConversionItem[];
}

export interface FollowUpItem {
  task_id: number;
  lead_id: number;
  lead_name: string;
  lead_phone: string;
  lead_source?: string | null;
  due_at?: string | null;
  status: LeadTaskStatus;
  channel?: string | null;
  note?: string | null;
}

export interface LeadInfoTemplate {
  id: number;
  name: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

export interface LeadCommunication {
  id: number;
  lead_id: number;
  sent_by: number;
  template_id?: number | null;
  channel: string;
  message: string;
  pause_reason?: string | null;
  follow_up_at: string;
  created_at: string;
}

export interface LeadPushStats {
  lead_id: number;
  total_steps: number;
  done_steps: number;
  progress_percent: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: number;
  lead_id: number;
  abonement_id: number;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  email_to?: string | null;
  link?: string | null;
  created_at: string;
  sent_at?: string | null;
  paid_at?: string | null;
}

export type EventStatus = 'active' | 'archived';
export interface EventItem {
  id: number;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  capacity?: number | null;
  status: EventStatus;
  created_by: number;
  created_at: string;
  updated_at?: string | null;
}

export type EventRegistrationStatus = 'registered' | 'cancelled';
export interface EventRegistration {
  id: number;
  event_id: number;
  lead_id: number;
  owner_id: number;
  status: EventRegistrationStatus;
  note?: string | null;
  created_at: string;
  updated_at?: string | null;
  lead?: Lead;
}

// B2B Schools pipeline (conveyor)
export type B2BSchoolPipelineStage =
  | 'new'
  | 'find_contacts'
  | 'first_contact'
  | 'contact_found'
  | 'letter_sent'
  | 'meeting_scheduled'
  | 'agreement'
  | 'meeting_held'
  | 'permission_received'
  | 'event_scheduled'
  | 'walkthrough_scheduled'
  | 'event_done'
  | 'walkthrough_done'
  | 'leads_received'
  | 'thank_you'
  | 'support_letter_requested'
  | 'support_letter_received'
  | 'partners'
  | 'rejected';

export type B2BSchoolFriendshipDegree = 'unknown' | 'indirect' | 'friends' | 'enemies';

export interface B2BSchoolContact {
  id: number;
  b2b_school_id: number;
  full_name: string;
  position?: string | null;
  phone: string;
  phone_extra?: string | null;
  created_at: string;
}

export interface B2BDocument {
  id: number;
  b2b_school_id: number;
  type: string;
  file_name: string;
  file_size_kb?: number | null;
  mime_type?: string | null;
  uploaded_by_id: number;
  uploaded_by_name?: string | null;
  created_at: string;
}

export interface B2BSchoolCustomField {
  name: string;
  type: 'text' | 'number' | 'date' | 'checkbox';
  value: string | number | boolean | null;
}

export interface B2BSchool {
  id: number;
  name: string;
  director?: string | null;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  district?: string | null;
  student_count?: number | null;
  friendship_degree?: string | null;
  pipeline_stage: string;
  next_step?: string | null;
  next_step_date?: string | null;
  manager_id?: number | null;
  manager_full_name?: string | null;
  phone_school?: string | null;
  source?: string | null;
  priority?: string | null;
  preference?: string | null;  // online, offline, any
  support_letter_status?: string | null;
  partnership?: Record<string, boolean> | null;
  comment?: string | null;
  custom_fields?: B2BSchoolCustomField[] | null;
  event_dates?: string[] | null;
  meeting_scheduled_at?: string | null;
  meeting_outcomes?: string | null;
  walkthrough_scheduled_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  leads_count?: number | null;
  conversion_percent?: number | null;
  contacts?: B2BSchoolContact[] | null;
}

export interface B2BProject {
  id: number;
  name: string;
  location?: string | null;
  main_city?: string | null;
  cities?: string[] | null;
  archived?: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface Campaign {
  id: number;
  name: string;
  type: string;
  format: string;
  city?: string | null;
  region?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  responsible_id?: number | null;
  responsible_full_name?: string | null;
  status: string;
  mode: string;
  is_game_jam: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CampaignStage {
  id: number;
  campaign_id: number;
  key: string;
  label: string;
  position: number;
  is_terminal: boolean;
}

export interface CampaignEventStage {
  id: number;
  campaign_event_id: number;
  key: string;
  label: string;
  position: number;
  is_terminal: boolean;
}

export interface CampaignDictionaryItem {
  id: number;
  category: string;
  value: string;
  label: string;
  is_active: boolean;
  position: number;
}

export interface CampaignSettings {
  types: CampaignDictionaryItem[];
  formats: CampaignDictionaryItem[];
  scales: CampaignDictionaryItem[];
  cities: string[];
  regions: string[];
}

export interface SchoolCampaign {
  id: number;
  b2b_school_id: number;
  campaign_id: number;
  stage: string;
  support_letter_status?: string | null;
  thank_you_sent: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  school_name?: string | null;
  school_city?: string | null;
  school_district?: string | null;
}

export interface CampaignEvent {
  id: number;
  campaign_id: number;
  title: string;
  event_date: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  trainer_id?: number | null;
  trainer_full_name?: string | null;
  location?: string | null;
  city?: string | null;
  status: string;
  notes?: string | null;
  host_b2b_school_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SchoolCampaignEvent {
  id: number;
  campaign_event_id: number;
  school_campaign_id: number;
  invite_status: string;
  participation_status: string;
  participant_count?: number | null;
  host_status: string;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CampaignSchoolEventCounts {
  events_invited_count: number;
  events_participated_count: number;
  events_hosted_count: number;
}

export interface SchoolsEventsMatrix {
  schools: Array<{ id: number; b2b_school_id: number; school_name: string | null; school_city: string | null; stage: string }>;
  events: CampaignEvent[];
  school_campaign_events: SchoolCampaignEvent[];
}

// Owner funnels (support letters, thank you letters)
export interface OwnerFunnelStageOption {
  value: string;
  label: string;
}

export interface OwnerFunnelTypeInfo {
  id: string;
  label: string;
  stages: OwnerFunnelStageOption[];
}

/** ╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡ тАФ ╤Б╨░╨╝╨░ ╨▓╨╛╤А╨╛╨╜╨║╨░ (╨┤╨╛╤Б╨║╨░ ╤Б ╤Н╤В╨░╨┐╨░╨╝╨╕). ╨Ъ╨░╤А╤В╨╛╤З╨║╨╕ ╨▓ ╨║╨╛╨╗╨╛╨╜╨║╨░╤Е тАФ ╤Н╨╗╨╡╨╝╨╡╨╜╤В╤Л ╤Б event_id. */
export interface OwnerFunnelEvent {
  id: number;
  event_name: string;
  event_dates?: string | null;
  created_at: string;
}

export interface OwnerFunnelItem {
  id: number;
  funnel_type: string;
  event_id?: number | null;
  stage: string;
  title?: string | null;
  comment?: string | null;
  card_data?: OwnerFunnelCardData | null;
  created_at: string;
  updated_at?: string | null;
}

/** ╨Ф╨░╨╜╨╜╤Л╨╡ ╨║╨░╤А╤В╨╛╤З╨║╨╕ ╨▓╨╛╤А╨╛╨╜╨║╨╕ ┬л╨Ь╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╤П┬╗ */
export interface OwnerFunnelCardData {
  event_name?: string;
  event_dates?: string;
  contact_fio?: string;
  contact_phone?: string;
  contact_comment?: string;
  letter_sent_at?: string;
  reply_comment?: string;
  reply_at?: string;
  meeting_date?: string;
  trip_date?: string;
  leads_count?: number;
  stage_dates?: Record<string, string>;
}

// Task manager (admin/owner/sales)
export interface TaskTemplateSubtaskResponse {
  id: number;
  template_id: number;
  text: string;
  order: number;
}
export type RepeatFrequency = 'daily' | 'weekly' | 'monthly';
export type RepeatEndType = 'never' | 'after_count' | 'until_date';

export interface TaskTemplateResponse {
  id: number;
  name: string;
  created_by_id: number;
  created_at: string;
  subtasks: TaskTemplateSubtaskResponse[];
  student_ids: number[];
  repeat_enabled?: boolean;
  repeat_frequency?: RepeatFrequency | null;
  repeat_days?: number[] | null;
  repeat_end_type?: RepeatEndType | null;
  repeat_end_after_count?: number | null;
  repeat_end_until?: string | null;
}
export interface TaskSubtaskResponse {
  id: number;
  task_id: number;
  text: string;
  completed: boolean;
  order: number;
}
/** Категория задачи: школы, родители, лиды */
export type TaskCategory = 'schools' | 'parents' | 'leads';

/** Приоритет задачи для «Плана на сегодня» */
export type TaskPriority = 'low' | 'normal' | 'high';

export interface TaskResponse {
  id: number;
  title: string;
  description?: string | null;
  template_id?: number | null;
  created_by_id: number;
  assigned_to_id?: number | null;
  category?: TaskCategory | string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  scheduled_for?: string | null;
  due_at?: string | null;
  priority?: TaskPriority | string;
  pinned_today?: boolean;
  tags?: string[] | null;
  task_kind?: string | null;
  reminder_stage?: number | null;
  counters?: {
    parent_replies: number;
    parent_escalations: number;
    parent_to_management: number;
  } | null;
  subtasks: TaskSubtaskResponse[];
  student_ids: number[];
  progress: number;
  repeat_enabled?: boolean;
  repeat_frequency?: RepeatFrequency | null;
  repeat_days?: number[] | null;
  repeat_end_type?: RepeatEndType | null;
  repeat_end_after_count?: number | null;
  repeat_end_until?: string | null;
  /** Для task_kind=payment_overdue */
  payment_state?: 'unpaid' | 'paid' | 'unknown' | null;
  payment_days_overdue?: number | null;
  payment_next_date?: string | null;
  payment_parent_name?: string | null;
  payment_balance?: number | null;
}

// Owner workspace task manager
export type OwnerWorkspaceProjectStatus =
  | 'new' | 'in_progress' | 'on_review' | 'completed' | 'archived'
  | 'active' // legacy
  | string;

export interface OwnerWorkspaceProject {
  id: number;
  name: string;
  description?: string | null;
  status: OwnerWorkspaceProjectStatus;
  owner_id?: number | null;
  owner_name?: string | null;
  parent_project_id?: number | null;
  parent_project_name?: string | null;
  counterparty_id?: number | null;
  counterparty_name?: string | null;
  deadline_at?: string | null;
  participants: number[];
  /** user id (строка в JSON) → member | manager */
  participant_roles?: Record<string, 'member' | 'manager' | string>;
  active_tasks_count: number;
  total_tasks_count?: number;
  completed_tasks_count?: number;
  overdue_tasks_count?: number;
  contacts_count: number;
  subprojects_count: number;
  documents_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
}

export interface OwnerWorkspaceProjectDocument {
  id: number;
  project_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_id?: number | null;
  uploaded_by_name?: string | null;
  created_at?: string | null;
}

export type OwnerWorkspaceContactType = 'company' | 'ip' | 'individual';

export interface OwnerWorkspaceContact {
  id: number;
  type: OwnerWorkspaceContactType;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  position?: string | null;
  tags?: string[] | null;
  comment?: string | null;
  source?: string | null;
  linked_project_ids: number[];
  active_tasks_count: number;
  projects_count?: number;
  /** ISO datetime: max(сообщение, задача, updated_at карточки) */
  last_interaction_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_archived?: boolean;
}

export interface OwnerWorkspaceTaskTemplate {
  id: number;
  name: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical' | null;
  tags?: string[];
  checklist?: Array<{ text: string; done?: boolean }>;
  effort_hours?: number | null;
  effort_minutes?: number | null;
  owner_id?: number | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface OwnerWorkspaceTask {
  id: number;
  title: string;
  description?: string | null;
  status: 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled' | string;
  priority: 'low' | 'medium' | 'high' | 'critical' | string;
  deadline_at?: string | null;
  start_at?: string | null;
  completed_at?: string | null;
  assignee_id?: number | null;
  creator_id?: number | null;
  project_id?: number | null;
  contact_id?: number | null;
  linked_message_ids: number[];
  tags?: string[] | null;
  checklist?: Array<Record<string, unknown>> | null;
  attachments?: Array<Record<string, unknown>> | null;
  previous_task_id?: number | null;
  effort_hours?: number | null;
  effort_minutes?: number | null;
  repeat_enabled?: boolean;
  repeat_frequency?: string | null;
  repeat_interval?: number | null;
  repeat_days?: number[] | null;
  repeat_end_type?: string | null;
  repeat_end_after_count?: number | null;
  repeat_end_until?: string | null;
  repeat_count?: number;
  watcher_ids?: number[];
  created_at?: string | null;
  updated_at?: string | null;
}

/** Ответ GET /api/owner-workspace/tasks (пагинация). */
export interface OwnerWorkspaceTaskListPage {
  items: OwnerWorkspaceTask[];
  total: number;
  limit: number;
  offset: number;
}

/** Ответ GET /api/owner-workspace/tasks/status-counts */
export interface OwnerWorkspaceTaskStatusCounts {
  total: number;
  by_status: Record<string, number>;
}

/** GET /api/owner-workspace/analytics/tasks-overview */
export interface OwnerWorkspaceTasksAnalyticsOverview {
  completed_last_7_days: number;
  completed_last_30_days: number;
  avg_days_to_complete_last_30?: number | null;
}

export interface OwnerWorkspaceMessage {
  id: number;
  contact_id: number;
  external_chat_id?: string | null;
  external_message_id?: string | null;
  direction: 'incoming' | 'outgoing' | string;
  text: string;
  attachments?: Array<Record<string, unknown>> | null;
  sent_at?: string | null;
  received_at?: string | null;
  linked_task_ids: number[];
  created_at?: string | null;
}

export interface OwnerWorkspaceConversation {
  contact_id: number;
  contact_name: string;
  last_message_at?: string | null;
  last_message_text?: string | null;
  unread_count: number;
}

export interface OwnerWorkspaceTaskComment {
  id: number;
  task_id: number;
  author_id?: number | null;
  text: string;
  created_at?: string | null;
}

export interface OwnerWorkspaceAuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action_type: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  author_id?: number | null;
  created_at?: string | null;
}

export interface OwnerWorkspaceHistoryStatsCountItem {
  key: string;
  count: number;
}

export interface OwnerWorkspaceHistoryStatsAuthorItem {
  author_id: number;
  count: number;
}

export interface OwnerWorkspaceHistoryStatsDayItem {
  day: string;
  count: number;
}

export interface OwnerWorkspaceHistoryStats {
  total_rows: number;
  unique_authors: number;
  unique_actions: number;
  first_created_at?: string | null;
  last_created_at?: string | null;
  entity_type_counts: OwnerWorkspaceHistoryStatsCountItem[];
  action_counts: OwnerWorkspaceHistoryStatsCountItem[];
  author_counts: OwnerWorkspaceHistoryStatsAuthorItem[];
  day_counts: OwnerWorkspaceHistoryStatsDayItem[];
}

export interface OwnerWorkspaceSearchResult {
  projects: Array<{ id: number; name: string; status: string }>;
  contacts: Array<{ id: number; full_name: string; phone: string }>;
  tasks: Array<{
    id: number;
    title: string;
    status: string;
    deadline_at?: string | null;
    project_id?: number | null;
    contact_id?: number | null;
  }>;
  messages: Array<{
    id: number;
    contact_id: number;
    contact_name?: string | null;
    direction: string;
    text_preview: string;
    created_at?: string | null;
  }>;
}

export interface OwnerWorkspaceDigest {
  overdue_count: number;
  overdue_tasks: OwnerWorkspaceTask[];
  due_soon_tasks: OwnerWorkspaceTask[];
}

export interface OwnerWorkspaceNotification {
  id: number;
  user_id: number;
  kind: string;
  title: string;
  body?: string | null;
  task_id?: number | null;
  contact_id?: number | null;
  read_at?: string | null;
  created_at?: string | null;
}

export interface OwnerWorkspaceNotificationsEnvelope {
  items: OwnerWorkspaceNotification[];
  unread_count: number;
}

/** Персональные настройки UI задачника (GET/PATCH /owner-workspace/me/preferences) */
export interface OwnerWorkspaceUserPreferences {
  default_task_view: 'list' | 'kanban' | 'calendar';
  task_list_rows_per_page: number;
  digest_due_within_hours: number;
  digest_scope: 'all' | 'mine';
  notify_email_enabled: boolean;
  notify_web_push_enabled: boolean;
  notify_task_overdue: boolean;
  notify_task_due_soon: boolean;
  notify_task_assigned: boolean;
  notify_task_comment: boolean;
  notify_task_updated: boolean;
  notify_contact_incoming_message: boolean;
  notify_task_mention: boolean;
}

export interface OwnerWorkspaceWebPushStatus {
  configured: boolean;
  public_key?: string | null;
  subscription_count: number;
}

export interface OwnerWorkspaceTaskConfigItem {
  key: string;
  label: string;
  enabled: boolean;
}

export interface OwnerWorkspaceTaskConfig {
  statuses: OwnerWorkspaceTaskConfigItem[];
  priorities: OwnerWorkspaceTaskConfigItem[];
}

export interface OwnerWorkspaceProjectConfig {
  statuses: OwnerWorkspaceTaskConfigItem[];
}

export interface OwnerWorkspacePermissionPolicy {
  manager_can_manage_team: boolean;
  manager_can_change_roles: boolean;
  manager_can_assign_manager: boolean;
  manager_can_assign_observer: boolean;
  manager_can_remove_manager: boolean;
  manager_can_edit_project_meta: boolean;
  manager_can_archive_project: boolean;
  limited_can_create_projects: boolean;
  limited_can_create_contacts: boolean;
  limited_can_create_tasks: boolean;
  limited_can_edit_contacts: boolean;
  limited_can_edit_tasks: boolean;
  limited_can_manage_project_contacts: boolean;
  limited_can_complete_tasks: boolean;
  limited_can_bulk_update_tasks: boolean;
  limited_can_link_messages: boolean;
  limited_can_send_messages: boolean;
  limited_can_comment_tasks: boolean;
}

export interface OwnerWorkspaceNotificationConfig {
  items: OwnerWorkspaceTaskConfigItem[];
}

export interface OwnerWorkspaceNotificationDeliveryChannelStats {
  pending: number;
  failed: number;
  terminal_failed: number;
  sent_last_24h: number;
  disabled: number;
}

export interface OwnerWorkspaceNotificationDeliveryFailureItem {
  id: number;
  user_id: number;
  user_name: string;
  kind: string;
  title: string;
  created_at: string | null;
  email_delivery_status: string;
  email_attempts: number;
  email_last_error: string | null;
  web_push_delivery_status: string;
  web_push_attempts: number;
  web_push_last_error: string | null;
}

export interface OwnerWorkspaceNotificationDeliveryStats {
  email_configured: boolean;
  missing_email_env: string[];
  web_push_configured: boolean;
  missing_web_push_env: string[];
  web_push_subscriptions_total: number;
  email: OwnerWorkspaceNotificationDeliveryChannelStats;
  web_push: OwnerWorkspaceNotificationDeliveryChannelStats;
  recent_failures: OwnerWorkspaceNotificationDeliveryFailureItem[];
}

export interface OwnerWorkspaceNotificationDeliveryRetryResult {
  retried_email: number;
  retried_web_push: number;
}

export interface OwnerWorkspaceTagDictionary {
  items: string[];
}

export interface OwnerWorkspaceSettingsBundle {
  task_config: OwnerWorkspaceTaskConfig;
  project_config: OwnerWorkspaceProjectConfig;
  permission_policy: OwnerWorkspacePermissionPolicy;
  notification_config: OwnerWorkspaceNotificationConfig;
  task_tags: OwnerWorkspaceTagDictionary;
  contact_tags: OwnerWorkspaceTagDictionary;
  contact_sources: OwnerWorkspaceTagDictionary;
  counterparty_roles?: OwnerWorkspaceTagDictionary;
  counterparty_industries?: OwnerWorkspaceTagDictionary;
}

export interface OwnerWorkspaceSettingsBundleSummary {
  task_statuses: number;
  task_priorities: number;
  project_statuses: number;
  notification_types: number;
  task_tags: number;
  contact_tags: number;
  contact_sources: number;
  counterparty_roles?: number;
  counterparty_industries?: number;
}

export interface OwnerWorkspaceSettingsBundleMeta {
  version: number;
  source: string;
  exported_at: string;
  exported_by_id: number | null;
  exported_by_name: string | null;
  summary: OwnerWorkspaceSettingsBundleSummary;
}

export interface OwnerWorkspaceSettingsBundleEnvelope {
  meta: OwnerWorkspaceSettingsBundleMeta;
  data: OwnerWorkspaceSettingsBundle;
}

export interface OwnerWorkspaceSettingsSnapshot {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  created_by_id: number | null;
  created_by_name: string | null;
  bundle: OwnerWorkspaceSettingsBundleEnvelope;
}

export interface OwnerWorkspaceTaskCompleteResult {
  completed_task: OwnerWorkspaceTask;
  next_task: OwnerWorkspaceTask | null;
}

export interface PersonalFinanceAccount {
  id: number;
  owner_id: number;
  name: string;
  currency: string;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface OwnerWorkspaceCounterpartyCustomField {
  id?: string | null;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'link' | 'file' | 'comment';
  value?: unknown;
}

export interface OwnerWorkspaceCounterpartyDocument {
  category: string;
  label: string;
  uploaded: boolean;
  status: 'missing' | 'uploaded';
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  uploaded_at?: string | null;
  download_url?: string | null;
}

export interface LinkedPersonItem {
  id: number;
  full_name: string;
  phone?: string | null;
  email?: string | null;
}

export interface OwnerWorkspaceCounterparty extends OwnerWorkspaceContact {
  custom_fields: OwnerWorkspaceCounterpartyCustomField[];
  linked_persons: LinkedPersonItem[];
  documents: OwnerWorkspaceCounterpartyDocument[];
  is_archived: boolean;
  archived_at?: string | null;
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

export interface DiskItem {
  id: number;
  name: string;
  item_type: 'folder' | 'file';
  parent_id?: number | null;
  content_type?: string | null;
  size_bytes: number;
  owner_id?: number | null;
  owner_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DiskItemsResponse {
  items: DiskItem[];
  breadcrumbs: DiskItem[];
}

export interface PersonalFinanceCategory {
  id: number;
  owner_id: number;
  name: string;
  direction: 'income' | 'expense';
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface PersonalFinanceRule {
  id: number;
  owner_id: number;
  pattern: string;
  category_id?: number | null;
  display_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
  category?: PersonalFinanceCategory | null;
}

export interface PersonalFinanceTransaction {
  id: number;
  owner_id: number;
  account_id: number;
  category_id?: number | null;
  amount: number;
  direction: 'income' | 'expense';
  article?: string | null;
  description?: string | null;
  occurred_at: string;
  created_at: string;
  updated_at?: string | null;
  account?: PersonalFinanceAccount | null;
  category?: PersonalFinanceCategory | null;
}

export interface PersonalFinanceSummaryAccountItem {
  account_id: number;
  account_name: string;
  currency: string;
  balance: number;
  income_total: number;
  expense_total: number;
}

export interface PersonalFinanceSummary {
  accounts: PersonalFinanceSummaryAccountItem[];
  total_balance: number;
  total_income: number;
  total_expense: number;
  transactions_count: number;
}

export interface PhoneSearchUserItem {
  id: number;
  person_id?: number | null;
  full_name: string;
  email: string;
  role: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest' | 'sales';
  phone?: string | null;
}

export interface PhoneSearchLeadItem {
  id: number;
  person_id?: number | null;
  contact_name: string;
  phone: string;
  parent_full_name?: string | null;
  child_full_name?: string | null;
  student_card_id?: number | null;
  converted_to_student_id?: number | null;
}

export interface PhoneSearchStudentCardItem {
  id: number;
  person_id?: number | null;
  student_full_name: string;
  parent_full_name?: string | null;
  parent_phone?: string | null;
  student_phone?: string | null;
  student_id?: number | null;
}

export interface PhoneSearchResponse {
  normalized_phone: string;
  users: PhoneSearchUserItem[];
  leads: PhoneSearchLeadItem[];
  student_cards: PhoneSearchStudentCardItem[];
}

export interface PersonLinkedRecord {
  entity_type: 'user' | 'lead' | 'student_card';
  entity_id: number;
  label: string;
}

export interface PersonSearchItem {
  id: number;
  full_name: string;
  email?: string | null;
  phone_normalized?: string | null;
  role_hint?: string | null;
  linked_records: PersonLinkedRecord[];
}

export interface PersonSearchResponse {
  query: string;
  items: PersonSearchItem[];
}

export interface PersonMergeRequest {
  source_person_id: number;
  target_person_id: number;
}

export interface PersonAttachRecordRequest {
  person_id: number;
  entity_type: 'user' | 'lead' | 'student_card';
  entity_id: number;
}

// ─── Finance Hub ───────────────────────────────────────────────────────────

export interface HubAccount {
  id: number;
  owner_id: number;
  name: string;
  account_type: 'bank' | 'cash' | 'crypto' | 'other';
  currency: string;
  balance: number;
  project_id: number | null;
  is_active: boolean;
  created_at?: string | null;
}

export interface HubTransaction {
  id: number;
  account_id: number;
  direction: 'income' | 'expense';
  category: string | null;
  amount: number;
  currency: string;
  transaction_date: string | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  hub_status: 'completed' | 'pending' | 'planned';
  created_at?: string | null;
}

export interface HubDebt {
  id: number;
  owner_id: number;
  debt_type: 'owe' | 'owed';
  counterparty: string;
  amount: number;
  paid_amount: number;
  debt_remaining: number;
  currency: string;
  due_date: string | null;
  description: string | null;
  project_id: number | null;
  status: 'active' | 'partially_paid' | 'closed';
  is_overdue: boolean;
  days_until_due: number | null;
  created_at?: string | null;
}

export interface HubAllocation {
  id: number;
  owner_id: number;
  amount: number;
  currency: string;
  from_account_id: number | null;
  from_account_name: string | null;
  to_type: 'project' | 'personal';
  to_project_id: number | null;
  to_project_name: string | null;
  to_account_id: number | null;
  to_account_name: string | null;
  date: string;
  comment: string | null;
  created_at?: string | null;
}

export interface HubSummary {
  date_from: string;
  date_to: string;
  total_balance: number;
  period_income: number;
  period_expense: number;
  net_flow: number;
  forecast_balance: number;
}

export interface HubChartPoint {
  period: string;
  income: number;
  expense: number;
}

export interface HubChart {
  group_by: string;
  points: HubChartPoint[];
}

export interface HubForecast {
  current_balance: number;
  planned_income: number;
  planned_expense: number;
  forecast_balance: number;
  planned_transactions: HubTransaction[];
}

export interface HubTransactionByCategoryRow {
  category: string;
  total: number;
  count: number;
}

export interface HubTransactionByProjectRow {
  project_id: number | null;
  project_name: string;
  income: number;
  expense: number;
  net: number;
}
