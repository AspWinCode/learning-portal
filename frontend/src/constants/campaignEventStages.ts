/** Подписи для CampaignEvent.status */
export const CAMPAIGN_EVENT_STATUSES = [
  { value: 'planned', label: 'Запланирован' },
  { value: 'done', label: 'Проведён' },
  { value: 'canceled', label: 'Отменён' },
];

/** Подписи для invite_status (SchoolCampaignEvent) */
export const INVITE_STATUSES = [
  { value: 'not_invited', label: 'Не приглашали' },
  { value: 'invited', label: 'Приглашены' },
  { value: 'awaiting_reply', label: 'Ждём ответ' },
  { value: 'accepted', label: 'Приняли' },
  { value: 'declined', label: 'Отказ' },
];

/** Подписи для participation_status */
export const PARTICIPATION_STATUSES = [
  { value: 'not_planned', label: 'Не запланировано' },
  { value: 'planned', label: 'Запланировано' },
  { value: 'confirmed', label: 'Подтвердили' },
  { value: 'participated', label: 'Участвовали' },
  { value: 'no_show', label: 'Не явились' },
  { value: 'declined', label: 'Отказ' },
];

/** Подписи для host_status */
export const HOST_STATUSES = [
  { value: 'not_host', label: 'Не площадка' },
  { value: 'host_proposed', label: 'Предложена площадка' },
  { value: 'host_confirmed', label: 'Площадка подтверждена' },
  { value: 'hosted', label: 'Проведено на площадке' },
  { value: 'host_declined', label: 'Площадка отказала' },
];

export function getInviteLabel(value: string): string {
  return INVITE_STATUSES.find((s) => s.value === value)?.label ?? value;
}
export function getParticipationLabel(value: string): string {
  return PARTICIPATION_STATUSES.find((s) => s.value === value)?.label ?? value;
}
export function getHostLabel(value: string): string {
  return HOST_STATUSES.find((s) => s.value === value)?.label ?? value;
}
export function getEventStatusLabel(value: string): string {
  return CAMPAIGN_EVENT_STATUSES.find((s) => s.value === value)?.label ?? value;
}
