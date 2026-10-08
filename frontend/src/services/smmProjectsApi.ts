import { api } from './api/client';

// ─── SMM-проекты (автопостинг) ──────────────────────────────────────────────
// Отдельный модуль от AI Studio: Project — независимая сущность. Поток:
// создать проект → загрузить контекст → настроить каналы → контент-план с
// периодичностью → система генерирует и публикует материалы автоматически.

const BASE = '/smm-projects';

export interface ProjectListItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Project extends ProjectListItem {
  system_prompt: string | null;
  tone_of_voice: string | null;
  audience_description: string | null;
  brand_context: Record<string, string> | null;
  default_language: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  system_prompt?: string;
  tone_of_voice?: string;
  audience_description?: string;
  brand_context?: Record<string, string>;
  default_language?: string;
  is_active?: boolean;
}

export interface BrandContextField {
  key: string;
  label: string;
}

export const listProjects = (): Promise<ProjectListItem[]> => api.get(`${BASE}/projects`).then((r) => r.data);

export const createProject = (payload: { name: string; description?: string }): Promise<Project> =>
  api.post(`${BASE}/projects`, payload).then((r) => r.data);

export const getProject = (code: string): Promise<Project> => api.get(`${BASE}/projects/${code}`).then((r) => r.data);

export const updateProject = (code: string, payload: ProjectUpdate): Promise<Project> =>
  api.patch(`${BASE}/projects/${code}`, payload).then((r) => r.data);

export const getBrandContextFields = (): Promise<BrandContextField[]> =>
  api.get(`${BASE}/brand-context-fields`).then((r) => r.data);

// ─── Knowledge (фактура проекта) ─────────────────────────────────────────────

export interface KnowledgeItem {
  id: number;
  project_id: number;
  title: string;
  content: string;
  source_type: string;
  source_url: string | null;
  is_active: boolean;
  created_by_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface KnowledgeItemList {
  items: KnowledgeItem[];
  total: number;
}

export const listKnowledge = (code: string): Promise<KnowledgeItemList> =>
  api.get(`${BASE}/projects/${code}/knowledge`).then((r) => r.data);

export const createKnowledge = (
  code: string,
  payload: { title: string; content: string; source_type?: string; source_url?: string }
): Promise<KnowledgeItem> => api.post(`${BASE}/projects/${code}/knowledge`, payload).then((r) => r.data);

export const updateKnowledge = (
  code: string,
  id: number,
  payload: Partial<{ title: string; content: string; source_type: string; source_url: string; is_active: boolean }>
): Promise<KnowledgeItem> => api.patch(`${BASE}/projects/${code}/knowledge/${id}`, payload).then((r) => r.data);

export const deleteKnowledge = (code: string, id: number): Promise<void> =>
  api.delete(`${BASE}/projects/${code}/knowledge/${id}`);

export const reindexKnowledge = (code: string): Promise<{ indexed: number; backend: string; reason?: string }> =>
  api.post(`${BASE}/projects/${code}/knowledge/reindex`).then((r) => r.data);

// ─── Channels (куда постить) ─────────────────────────────────────────────────

export interface ChannelStatus {
  channel: string;
  configured: boolean;
}

export const CHANNEL_FIELD_SPECS: Record<string, { key: string; label: string }[]> = {
  vk: [
    { key: 'token', label: 'Access token (сообщество)' },
    { key: 'group_id', label: 'ID сообщества' },
  ],
  telegram: [
    { key: 'token', label: 'Bot token' },
    { key: 'chat_id', label: 'Chat ID (канал/группа)' },
    { key: 'username', label: 'Username канала (необязательно, для ссылки)' },
  ],
  instagram: [
    { key: 'token', label: 'Access token' },
    { key: 'account_id', label: 'Instagram Business Account ID' },
  ],
  max: [
    { key: 'token', label: 'Access token' },
    { key: 'chat_id', label: 'Chat ID' },
  ],
};

export const listChannels = (code: string): Promise<ChannelStatus[]> =>
  api.get(`${BASE}/projects/${code}/channels`).then((r) => r.data);

export const setChannelConfig = (code: string, channel: string, config: Record<string, string>): Promise<ChannelStatus> =>
  api.put(`${BASE}/projects/${code}/channels/${channel}`, { config }).then((r) => r.data);

export const removeChannel = (code: string, channel: string): Promise<void> =>
  api.delete(`${BASE}/projects/${code}/channels/${channel}`);

// ─── Templates ────────────────────────────────────────────────────────────

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'select';
  required?: boolean;
  options?: string[];
}

export interface ContentTemplate {
  id: number;
  project_id: number;
  code: string;
  name: string;
  description: string | null;
  input_schema_json: { fields: TemplateField[] } | null;
  output_format: 'json' | 'text';
  sort_order: number;
  is_active: boolean;
}

export const listTemplates = (code: string): Promise<ContentTemplate[]> =>
  api.get(`${BASE}/projects/${code}/templates`).then((r) => r.data);

// ─── Generate / Content ──────────────────────────────────────────────────

export interface GeneratedContent {
  id: number;
  project_id: number;
  template_id: number | null;
  plan_item_id: number | null;
  parent_content_id: number | null;
  created_by_id: number | null;
  title: string | null;
  input_json: Record<string, unknown> | null;
  output_text: string | null;
  output_json: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  status: 'draft' | 'approved' | 'archived';
  is_favorite: boolean;
  tags: string[] | null;
  channel: string | null;
  group_key: string | null;
  selected_asset_id: number | null;
  auto_generated: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ContentList {
  items: GeneratedContent[];
  total: number;
}

export type TransformAction =
  | 'shorter'
  | 'livelier'
  | 'more_emotional'
  | 'more_official'
  | 'for_parents'
  | 'for_teens'
  | 'for_vk'
  | 'for_telegram'
  | 'add_cta'
  | 'remove_ad_tone'
  | 'three_variants';

export const TRANSFORM_ACTION_LABELS: Record<TransformAction, string> = {
  shorter: 'Сделать короче',
  livelier: 'Сделать живее',
  more_emotional: 'Больше эмоций',
  more_official: 'Более официально',
  for_parents: 'Для родителей',
  for_teens: 'Для подростков',
  for_vk: 'Для VK',
  for_telegram: 'Для Telegram',
  add_cta: 'Добавить CTA',
  remove_ad_tone: 'Убрать рекламность',
  three_variants: 'Сделать 3 варианта',
};

export const VARIANT_CHANNELS = ['vk', 'telegram', 'instagram', 'max'];

export const generateContent = (
  code: string,
  templateCode: string,
  inputData: Record<string, unknown>
): Promise<GeneratedContent> =>
  api.post(`${BASE}/projects/${code}/generate`, { template_code: templateCode, input_data: inputData }).then((r) => r.data);

export const listContent = (code: string, status?: string): Promise<ContentList> =>
  api.get(`${BASE}/content`, { params: { project: code, status } }).then((r) => r.data);

export const getContent = (id: number): Promise<GeneratedContent> => api.get(`${BASE}/content/${id}`).then((r) => r.data);

export const updateContent = (
  id: number,
  payload: Partial<{
    status: 'draft' | 'approved' | 'archived';
    is_favorite: boolean;
    tags: string[];
    channel: string;
    title: string;
    output_text: string;
    selected_asset_id: number;
  }>
): Promise<GeneratedContent> => api.patch(`${BASE}/content/${id}`, payload).then((r) => r.data);

export const approveContent = (id: number): Promise<GeneratedContent> =>
  api.post(`${BASE}/content/${id}/approve`).then((r) => r.data);

export const transformContent = (id: number, action: TransformAction, channel?: string): Promise<GeneratedContent> =>
  api.post(`${BASE}/content/${id}/transform`, { action, channel }).then((r) => r.data);

export const createContentVariant = (id: number, channel: string): Promise<GeneratedContent> =>
  api.post(`${BASE}/content/${id}/variant`, { channel }).then((r) => r.data);

export const listRelatedContent = (id: number): Promise<GeneratedContent[]> =>
  api.get(`${BASE}/content/${id}/related`).then((r) => r.data);

// ─── Event pack ─────────────────────────────────────────────────────────

export interface EventPackResult {
  group_key: string;
  items: GeneratedContent[];
}

export const createEventPack = (code: string, eventData: Record<string, unknown>): Promise<EventPackResult> =>
  api.post(`${BASE}/projects/${code}/event-pack`, { event_data: eventData }).then((r) => r.data);

// ─── Content plan + периодичность ────────────────────────────────────────

export type ContentPlanItemStatus = 'pending' | 'generating' | 'ready' | 'publishing' | 'published' | 'error' | 'skipped' | 'cancelled';

export interface ContentPlanItem {
  id: number;
  plan_id: number;
  scheduled_at: string | null;
  channel: string | null;
  content_type: string | null;
  title: string;
  brief: string | null;
  generated_content_id: number | null;
  status: ContentPlanItemStatus;
  last_error: string | null;
}

export interface Periodicity {
  unit: 'day' | 'week';
  times: number;
  channels: string[];
  auto_publish: boolean;
  lookahead_days: number;
  goals?: string;
  brief?: string;
}

export interface ContentPlan {
  id: number;
  project_id: number;
  name: string;
  date_from: string | null;
  date_to: string | null;
  periodicity: Periodicity | null;
  is_active: boolean;
  last_generated_at: string | null;
  created_by_id: number | null;
  created_at: string | null;
  items: ContentPlanItem[];
}

export const listContentPlans = (code: string): Promise<ContentPlan[]> =>
  api.get(`${BASE}/projects/${code}/content-plans`).then((r) => r.data);

export const createContentPlan = (
  code: string,
  payload: { name: string; date_from?: string; date_to?: string; periodicity?: Periodicity }
): Promise<ContentPlan> => api.post(`${BASE}/projects/${code}/content-plans`, payload).then((r) => r.data);

export const getContentPlan = (code: string, planId: number): Promise<ContentPlan> =>
  api.get(`${BASE}/projects/${code}/content-plans/${planId}`).then((r) => r.data);

export const updateContentPlan = (
  code: string,
  planId: number,
  payload: Partial<{ name: string; date_from: string; date_to: string; periodicity: Periodicity; is_active: boolean }>
): Promise<ContentPlan> => api.patch(`${BASE}/projects/${code}/content-plans/${planId}`, payload).then((r) => r.data);

export const runContentPlanNow = (code: string, planId: number): Promise<{ items_created: number }> =>
  api.post(`${BASE}/projects/${code}/content-plans/${planId}/run-now`).then((r) => r.data);

export const generateContentPlanItems = (
  code: string,
  planId: number,
  payload: { count: number; channels: string[]; goals?: string; important_events?: string }
): Promise<ContentPlanItem[]> =>
  api.post(`${BASE}/projects/${code}/content-plans/${planId}/generate-items`, payload).then((r) => r.data);

export const updateContentPlanItem = (
  itemId: number,
  payload: Partial<{
    title: string;
    scheduled_at: string;
    channel: string;
    content_type: string;
    brief: string;
    status: ContentPlanItemStatus;
    generated_content_id: number;
  }>
): Promise<ContentPlanItem> => api.patch(`${BASE}/content-plan-items/${itemId}`, payload).then((r) => r.data);

export const deleteContentPlanItem = (itemId: number): Promise<void> => api.delete(`${BASE}/content-plan-items/${itemId}`);

// ─── Assets / image generation ────────────────────────────────────────────

export interface GeneratedAsset {
  id: number;
  content_id: number;
  asset_type: string;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  url: string | null;
  storage_key: string | null;
  is_selected: boolean;
  created_at: string | null;
}

export const renderContentImage = (contentId: number, prompt?: string): Promise<GeneratedAsset> =>
  api.post(`${BASE}/content/${contentId}/render-image`, { prompt }).then((r) => r.data);

export const selectContentAsset = (contentId: number, assetId: number): Promise<GeneratedAsset> =>
  api.post(`${BASE}/content/${contentId}/select-asset`, { asset_id: assetId }).then((r) => r.data);

export const listContentAssets = (contentId: number): Promise<GeneratedAsset[]> =>
  api.get(`${BASE}/content/${contentId}/assets`).then((r) => r.data);

// ─── Publishing ───────────────────────────────────────────────────────────

export interface PublishLog {
  id: number;
  content_id: number;
  project_id: number;
  channel: string;
  status: 'success' | 'error';
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  created_at: string | null;
}

export const publishContent = (contentId: number, channel: string): Promise<PublishLog> =>
  api.post(`${BASE}/content/${contentId}/publish`, { channel }).then((r) => r.data);

export interface Publication {
  id: number;
  content_id: number;
  project_id: number;
  channel: string;
  asset_id: number | null;
  text_snapshot: string;
  status: string;
  scheduled_at: string | null;
  approved_by_id: number | null;
  approved_at: string | null;
  started_at: string | null;
  published_at: string | null;
  external_id: string | null;
  external_url: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const publishBundle = (
  contentId: number,
  publications: Array<{ channel: string; content_id: number; asset_id?: number | null }>,
  publish_at?: string | null
): Promise<Publication[]> =>
  api.post(`${BASE}/content/${contentId}/publish-bundle`, { publications, publish_at }).then((r) => r.data);

export const listPublications = (contentId: number): Promise<Publication[]> =>
  api.get(`${BASE}/content/${contentId}/publications`).then((r) => r.data);

export const retryPublication = (publicationId: number): Promise<Publication> =>
  api.post(`${BASE}/publications/${publicationId}/retry`).then((r) => r.data);

export const cancelPublication = (publicationId: number): Promise<Publication> =>
  api.post(`${BASE}/publications/${publicationId}/cancel`).then((r) => r.data);

export const listContentPublishLogs = (contentId: number): Promise<PublishLog[]> =>
  api.get(`${BASE}/content/${contentId}/publish-logs`).then((r) => r.data);
