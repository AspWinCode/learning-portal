/**
 * MVP: 4 статуса школы вместо 20 стадий воронки.
 * Маппинг существующих pipeline_stage в БД → отображаемый статус.
 * При смене статуса (перетаскивание в другую колонку) в API уходит один pipeline_stage.
 */

export type SchoolMVPStatus = 'lead' | 'active' | 'partner' | 'inactive';

export const MVP_STATUSES: { value: SchoolMVPStatus; label: string }[] = [
  { value: 'lead', label: 'Лид' },
  { value: 'active', label: 'В работе' },
  { value: 'partner', label: 'Партнёр' },
  { value: 'inactive', label: 'Неактивна' },
];

/** Стадии воронки (pipeline_stage), которые считаются статусом "Лид". */
const LEAD_STAGES = new Set([
  'new',
  'find_contacts',
  'first_contact',
  'contact_found',
  'letter_sent',
  'agreement',
]);

/** Стадии "В работе". */
const ACTIVE_STAGES = new Set([
  'meeting_scheduled',
  'meeting_held',
  'permission_received',
  'event_scheduled',
  'walkthrough_scheduled',
  'event_done',
  'walkthrough_done',
  'leads_received',
  'thank_you',
  'support_letter_requested',
  'support_letter_received',
]);

/** По pipeline_stage из API возвращаем MVP-статус. */
export function pipelineStageToMVPStatus(pipelineStage: string | null | undefined): SchoolMVPStatus {
  if (!pipelineStage) return 'lead';
  const s = pipelineStage as string;
  if (s === 'partners') return 'partner';
  if (s === 'rejected') return 'inactive';
  if (ACTIVE_STAGES.has(s)) return 'active';
  if (LEAD_STAGES.has(s)) return 'lead';
  return 'active';
}

/** При переносе карточки в колонку отправляем в API этот pipeline_stage (без потери данных: остальные поля не трогаем). */
export const MVP_STATUS_TO_PIPELINE_STAGE: Record<SchoolMVPStatus, string> = {
  lead: 'new',
  active: 'agreement',
  partner: 'partners',
  inactive: 'rejected',
};
