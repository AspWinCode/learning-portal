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
  trainer?: User;
  students?: Student[];
  programs?: ProgramSummary[];
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

export type LeadStatus = 'new' | 'contacted' | 'demo' | 'invoice_sent' | 'won' | 'lost';
export type LeadCommunicationChannel = 'max' | 'email' | 'sms' | 'telegram';

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
  source_id?: number | null;
  referral_name?: string | null;
  tags?: string[] | null;
  abonement_id?: number | null;
  desired_slot?: string | null;
  comment?: string | null;
  next_contact_at?: string | null;
  pause_reason?: string | null;
  status: LeadStatus;
  lost_reason?: string | null;
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

