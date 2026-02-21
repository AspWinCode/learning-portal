/**
 * Короткая воронка B2B-школ (12 стадий по спецификации).
 * Маппинг: отображаемый порядок и подписи → значения pipeline_stage в API.
 */
import type { B2BSchoolPipelineStage } from '../types';

export const MAIN_FUNNEL_STAGES: { value: B2BSchoolPipelineStage; label: string }[] = [
  { value: 'new', label: 'Новая' },
  { value: 'find_contacts', label: 'Поиск контактов' },
  { value: 'contact_found', label: 'Контакт установлен' },
  { value: 'agreement', label: 'Переговоры' },
  { value: 'meeting_scheduled', label: 'Встреча назначена' },
  { value: 'meeting_held', label: 'Встреча проведена' },
  { value: 'permission_received', label: 'Разрешение получено' },
  { value: 'event_scheduled', label: 'Подготовка / Запланировано' },
  { value: 'event_done', label: 'Проведено' },
  { value: 'leads_received', label: 'Лиды получены' },
  { value: 'rejected', label: 'Отказ/Заморозка' },
];

/** Стадии, которые считаются "в основной воронке" для канбана (без веток: письмо поддержки, партнёрство). */
export const MAIN_FUNNEL_STAGE_VALUES = new Set(MAIN_FUNNEL_STAGES.map((s) => s.value));

/** Все стадии для селектов и таблиц (включая ветки). */
export const ALL_FUNNEL_STAGES: { value: B2BSchoolPipelineStage; label: string }[] = [
  { value: 'new', label: 'Новая' },
  { value: 'find_contacts', label: 'Поиск контактов' },
  { value: 'first_contact', label: 'Первичный контакт' },
  { value: 'contact_found', label: 'Контакт установлен' },
  { value: 'letter_sent', label: 'Письмо отправлено' },
  { value: 'agreement', label: 'Переговоры' },
  { value: 'meeting_scheduled', label: 'Встреча назначена' },
  { value: 'meeting_held', label: 'Встреча проведена' },
  { value: 'permission_received', label: 'Разрешение получено' },
  { value: 'event_scheduled', label: 'Запланировано мероприятие' },
  { value: 'walkthrough_scheduled', label: 'Назначена дата обхода' },
  { value: 'event_done', label: 'Проведено' },
  { value: 'walkthrough_done', label: 'Обход проведён' },
  { value: 'leads_received', label: 'Лиды получены' },
  { value: 'thank_you', label: 'Благодарности' },
  { value: 'support_letter_requested', label: 'Письмо поддержки запрошено' },
  { value: 'support_letter_received', label: 'Письмо поддержки получено' },
  { value: 'partners', label: 'Партнёры' },
  { value: 'rejected', label: 'Отказ/Заморозка' },
];

export function getStageLabel(stage: string): string {
  const found = ALL_FUNNEL_STAGES.find((s) => s.value === stage);
  return found ? found.label : stage;
}

/** Школа без следующего действия — нужно подсветить и добавить в План. */
export function hasNoNextAction(school: { next_step?: string | null; next_step_date?: string | null }): boolean {
  return !(school.next_step?.trim()) || !school.next_step_date;
}
