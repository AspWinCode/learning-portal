import { api } from './api/client';

// ─── AI Studio (многонаправленная ИИ-платформа) ─────────────────────────────
// Academy AI (academyAiApi.ts) — отдельный, не трогаем. Этот клиент — для
// generic-направлений (КодАрена и далее); направление "academy" здесь
// фигурирует только как запись в селекторе.

const BASE = '/ai-studio';

export interface WorkspaceListItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Workspace extends WorkspaceListItem {
  system_prompt: string | null;
  tone_of_voice: string | null;
  audience_description: string | null;
  brand_context: Record<string, string> | null;
  default_language: string;
}

export interface WorkspaceUpdate {
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

export interface KnowledgeItem {
  id: number;
  workspace_id: number;
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

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'select';
  required?: boolean;
  options?: string[];
}

export interface ContentTemplate {
  id: number;
  workspace_id: number;
  code: string;
  name: string;
  description: string | null;
  input_schema_json: { fields: TemplateField[] } | null;
  output_format: 'json' | 'text';
  sort_order: number;
  is_active: boolean;
}

export interface GeneratedContent {
  id: number;
  workspace_id: number;
  template_id: number | null;
  parent_content_id: number | null;
  created_by_id: number | null;
  title: string | null;
  input_json: Record<string, unknown> | null;
  output_text: string | null;
  provider: string | null;
  model: string | null;
  status: 'draft' | 'approved' | 'archived';
  is_favorite: boolean;
  tags: string[] | null;
  channel: string | null;
  scheduled_date: string | null;
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

export const listWorkspaces = (): Promise<WorkspaceListItem[]> =>
  api.get(`${BASE}/workspaces`).then((r) => r.data);

export const getWorkspace = (code: string): Promise<Workspace> =>
  api.get(`${BASE}/workspaces/${code}`).then((r) => r.data);

export const updateWorkspace = (code: string, payload: WorkspaceUpdate): Promise<Workspace> =>
  api.patch(`${BASE}/workspaces/${code}`, payload).then((r) => r.data);

export const getBrandContextFields = (): Promise<BrandContextField[]> =>
  api.get(`${BASE}/brand-context-fields`).then((r) => r.data);

export const listKnowledge = (code: string): Promise<KnowledgeItemList> =>
  api.get(`${BASE}/workspaces/${code}/knowledge`).then((r) => r.data);

export const createKnowledge = (
  code: string,
  payload: { title: string; content: string; source_type?: string; source_url?: string }
): Promise<KnowledgeItem> => api.post(`${BASE}/workspaces/${code}/knowledge`, payload).then((r) => r.data);

export const updateKnowledge = (
  code: string,
  id: number,
  payload: Partial<{ title: string; content: string; source_type: string; source_url: string; is_active: boolean }>
): Promise<KnowledgeItem> => api.patch(`${BASE}/workspaces/${code}/knowledge/${id}`, payload).then((r) => r.data);

export const deleteKnowledge = (code: string, id: number): Promise<void> =>
  api.delete(`${BASE}/workspaces/${code}/knowledge/${id}`);

export const listTemplates = (code: string): Promise<ContentTemplate[]> =>
  api.get(`${BASE}/workspaces/${code}/templates`).then((r) => r.data);

export const generateContent = (
  code: string,
  templateCode: string,
  inputData: Record<string, unknown>
): Promise<GeneratedContent> =>
  api.post(`${BASE}/workspaces/${code}/generate`, { template_code: templateCode, input_data: inputData }).then((r) => r.data);

export const listContent = (code: string, status?: string): Promise<ContentList> =>
  api.get(`${BASE}/content`, { params: { workspace: code, status } }).then((r) => r.data);

export const getContent = (id: number): Promise<GeneratedContent> =>
  api.get(`${BASE}/content/${id}`).then((r) => r.data);

export const updateContent = (
  id: number,
  payload: Partial<{
    status: 'draft' | 'approved' | 'archived';
    is_favorite: boolean;
    tags: string[];
    channel: string;
    title: string;
    output_text: string;
  }>
): Promise<GeneratedContent> => api.patch(`${BASE}/content/${id}`, payload).then((r) => r.data);

export const transformContent = (
  id: number,
  action: TransformAction,
  channel?: string
): Promise<GeneratedContent> => api.post(`${BASE}/content/${id}/transform`, { action, channel }).then((r) => r.data);
