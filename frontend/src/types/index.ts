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
  email: string;
  full_name: string;
  role: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest' | 'sales';
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

export type AbsenceFollowUpStage = 'missed' | 'assigned' | 'made_up' | 'missed_makeup';

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
  /** Кол-во открытых задач (заполняется в list_leads) */
  open_tasks_count?: number | null;
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
  archived: boolean;
  anketa_status?: string; // draft | filled | converted | cancelled
  created_at: string;
  updated_at?: string | null;
  abonement?: Abonement | null;
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
  due_date?: string | null;
}

// ─── LeadActivity (таймлайн) ────────────────────────────────────────────────

export interface LeadActivity {
  id: number;
  lead_id: number;
  type: string;
  title: string;
  description?: string | null;
  channel?: string | null;
  created_at: string;
  created_by?: number | null;
  created_by_name?: string | null;
  payload_json?: Record<string, unknown> | null;
  status_effect_from?: string | null;
  status_effect_to?: string | null;
  related_task_id?: number | null;
  related_invoice_id?: number | null;
}

export interface LeadTimelineResponse {
  items: LeadActivity[];
  total: number;
  has_more: boolean;
}

export interface LeadNextAction {
  type?: string | null;
  title?: string | null;
  due_at?: string | null;
  task_id?: number | null;
  is_overdue: boolean;
  is_today: boolean;
}

export interface LeadSidebarSummary {
  open_tasks_count: number;
  nearest_tasks: LeadTask[];
  last_invoice?: Invoice | null;
  unpaid_invoices_count: number;
}

export interface LeadCardResponse {
  lead: Lead;
  next_action?: LeadNextAction | null;
  pinned_comment?: string | null;
  sidebar: LeadSidebarSummary;
  timeline_preview: LeadActivity[];
  owner_name?: string | null;
  last_contact_at?: string | null;
}

export type QuickActionType =
  | 'called'
  | 'no_answer'
  | 'sent_info'
  | 'schedule_contact'
  | 'create_invoice'
  | 'payment_received'
  | 'refused'
  | 'enrolled';

export interface QuickActionRequest {
  action: QuickActionType;
  comment?: string | null;
  channel?: string | null;
  next_contact_at?: string | null;
  lost_reason?: string | null;
  template_id?: number | null;
  abonement_id?: number | null;
  invoice_email?: string | null;
}

export interface QuickActionResponse {
  success: boolean;
  message: string;
  activity?: LeadActivity | null;
  new_status?: string | null;
  next_action?: LeadNextAction | null;
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

export interface B2BSchool {
  id: number;
  name: string;
  director?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
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
}

export interface CampaignEvent {
  id: number;
  campaign_id: number;
  title: string;
  event_date: string;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  city?: string | null;
  status: string;
  notes?: string | null;
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

