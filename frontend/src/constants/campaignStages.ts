/**
 * Стадии воронки для участия школы в кампании (SchoolCampaign.stage).
 * Для Game Jam — полный набор; для онлайн-ивента — короче.
 */
export const CAMPAIGN_STAGES_GAME_JAM = [
  { value: 'not_contacted', label: 'Не связались' },
  { value: 'contact_established', label: 'Контакт установлен' },
  { value: 'director_agreed', label: 'Директор согласен' },
  { value: 'contact_person_received', label: 'Получен контакт ответственного' },
  { value: 'agreed_to_class_visits', label: 'Согласованы обходы' },
  { value: 'info_sent_to_parents', label: 'Инфо отправлено родителям' },
  { value: 'declined', label: 'Отказ' },
  { value: 'participated', label: 'Участвовали' },
  { value: 'leads_received', label: 'Лиды получены' },
];

export const CAMPAIGN_STAGES_ONLINE = [
  { value: 'not_contacted', label: 'Не связались' },
  { value: 'invited', label: 'Приглашены' },
  { value: 'info_sent', label: 'Инфо отправлено' },
  { value: 'confirmed', label: 'Подтвердили' },
  { value: 'declined', label: 'Отказ' },
  { value: 'participated', label: 'Участвовали' },
];

export function getStagesForCampaignType(type: string): { value: string; label: string }[] {
  if (type === 'online_event') return CAMPAIGN_STAGES_ONLINE;
  return CAMPAIGN_STAGES_GAME_JAM;
}

export const CAMPAIGN_TYPES = [
  { value: 'game_jam', label: 'Game Jam' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'league', label: 'Лига' },
  { value: 'online_event', label: 'Онлайн-ивент' },
];

export const CAMPAIGN_FORMATS = [
  { value: 'offline', label: 'Офлайн' },
  { value: 'online', label: 'Онлайн' },
];

export const CAMPAIGN_MODES = [
  { value: 'city', label: 'По городу' },
  { value: 'region', label: 'Регион' },
  { value: 'all_russia', label: 'Вся Россия' },
];

export const CAMPAIGN_STATUSES = [
  { value: 'draft', label: 'Черновик' },
  { value: 'active', label: 'В работе' },
  { value: 'done', label: 'Завершена' },
  { value: 'canceled', label: 'Отменена' },
];
