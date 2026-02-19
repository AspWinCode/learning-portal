export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'admin' | 'owner' | 'trainer' | 'parent' | 'guest' | 'sales';
  is_active: boolean;
  created_at: string;
  trainer_rate?: number | null;
  trainer_lessons?: number | null;
}

export interface Student {
  id: number;
  full_name: string;
  parent_id?: number | null;
  abonement_id?: number | null;
  status: 'active' | 'archived';
  created_at: string;
  parent?: User;
  abonement?: Abonement;
  programs?: ProgramSummary[];
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

export interface Abonement {
  id: number;
  name: string;
  price: number;
  discount_type: 'none' | 'amount' | 'percent';
  discount_value: number;
  status: 'active' | 'archived';
  created_at: string;
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
}

export type AbsenceFollowUpStage = 'missed' | 'assigned' | 'made_up' | 'missed_makeup';

export interface AbsenceFollowUp {
  id: number;
  lesson_attendance_id: number;
  student_id: number;
  group_id: number;
  lesson_date: string;
  stage: AbsenceFollowUpStage;
  created_at: string;
  updated_at?: string | null;
  student_name?: string | null;
  group_name?: string | null;
}

export interface GroupSchedule {
  id: number;
  group_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface TrainerLessonSlot {
  group_id: number;
  group_name: string;
  program_name?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  lesson_date: string;
  students: Array<{ id: number; full_name: string; attended: boolean | null }>;
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
  abonement_id?: number | null;
  discount_type: 'none' | 'amount' | 'percent';
  discount_value: number;
  archived: boolean;
  created_at: string;
  updated_at?: string | null;
  abonement?: Abonement | null;
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

// B2B Schools pipeline
export type B2BSchoolPipelineStage =
  | 'new'
  | 'contact_found'
  | 'letter_sent'
  | 'meeting_scheduled'
  | 'meeting_held'
  | 'permission_received'
  | 'walkthrough_scheduled'
  | 'walkthrough_done'
  | 'leads_received';

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
  student_count?: number | null;
  friendship_degree?: string | null;
  pipeline_stage: string;
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
  created_at: string;
  updated_at?: string | null;
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
export interface TaskResponse {
  id: number;
  title: string;
  template_id?: number | null;
  created_by_id: number;
  assigned_to_id?: number | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  subtasks: TaskSubtaskResponse[];
  student_ids: number[];
  progress: number;
  repeat_enabled?: boolean;
  repeat_frequency?: RepeatFrequency | null;
  repeat_days?: number[] | null;
  repeat_end_type?: RepeatEndType | null;
  repeat_end_after_count?: number | null;
  repeat_end_until?: string | null;
}

