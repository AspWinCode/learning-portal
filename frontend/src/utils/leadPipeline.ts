import { isValid, parseISO } from 'date-fns';
import { Lead, LeadArrivalChannel, LeadScheduledEventType, LeadThinkingReason, LeadStatus } from '../types';

/** Статусы, которые относятся к «финальным»/архивным колонкам воронки. */
export const FINAL_STATUSES: LeadStatus[] = ['won', 'refused', 'lost'];

export const ARRIVAL_CHANNEL_LABELS: Record<LeadArrivalChannel, string> = {
  site: 'Сайт',
  questionnaire: 'Анкета',
  manual: 'Вручную',
  game_jam: 'Game Jam',
  excel: 'Excel',
  other: 'Другое',
};

export const arrivalChannelLabel = (value?: string | null): string | null => {
  if (!value) return null;
  return ARRIVAL_CHANNEL_LABELS[value as LeadArrivalChannel] || value;
};

export const SCHEDULED_EVENT_TYPE_LABELS: Record<LeadScheduledEventType, string> = {
  trial: 'Пробное занятие',
  game_jam: 'Game Jam',
  other_event: 'Мероприятие',
  consultation: 'Консультация',
};

export const scheduledEventTypeLabel = (value?: string | null): string | null => {
  if (!value) return null;
  return SCHEDULED_EVENT_TYPE_LABELS[value as LeadScheduledEventType] || value;
};

export const THINKING_REASON_LABELS: Record<LeadThinkingReason, string> = {
  child: 'Ребёнок думает',
  parent: 'Родитель думает',
  price: 'Цена',
  schedule: 'Расписание',
  comparing: 'Сравнивают школы',
  other: 'Другое',
};

export const thinkingReasonLabel = (value?: string | null): string | null => {
  if (!value) return null;
  return THINKING_REASON_LABELS[value as LeadThinkingReason] || value;
};

/** true, если у лида просрочен следующий контакт (next_contact_at в прошлом). */
export const isLeadOverdue = (lead: Pick<Lead, 'next_contact_at'>): boolean => {
  if (!lead.next_contact_at) return false;
  const d = parseISO(lead.next_contact_at);
  if (!isValid(d)) return false;
  return d.getTime() < Date.now();
};

/** true, если следующий контакт назначен на сегодняшний день. */
export const isLeadDueToday = (lead: Pick<Lead, 'next_contact_at'>): boolean => {
  if (!lead.next_contact_at) return false;
  const d = parseISO(lead.next_contact_at);
  if (!isValid(d)) return false;
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

export const ARRIVAL_CHANNEL_FILTER_OPTIONS: { value: LeadArrivalChannel | ''; label: string }[] = [
  { value: '', label: 'Все каналы' },
  { value: 'site', label: 'Сайт' },
  { value: 'questionnaire', label: 'Анкеты' },
  { value: 'game_jam', label: 'Game Jam' },
  { value: 'manual', label: 'Вручную' },
  { value: 'excel', label: 'Excel' },
];
