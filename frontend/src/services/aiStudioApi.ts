import { api } from './api/client';

// ─── AI Studio — консультационный/аналитический режим ──────────────────────
// Генерация постов для публикации, контент-план, визуалы, автопостинг —
// отдельный модуль smm_projects (см. smmProjectsApi.ts), не привязанный к
// направлениям AI Studio. Здесь — только workspaces/knowledge/consult.

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

export const reindexKnowledge = (code: string): Promise<{ indexed: number; backend: string; reason?: string }> =>
  api.post(`${BASE}/workspaces/${code}/knowledge/reindex`).then((r) => r.data);

// ─── Consult (спросить / проанализировать направление) ──────────────────────

export interface ConsultMessage {
  id: number;
  dialog_id: number;
  role: 'user' | 'assistant';
  content: string;
  used_knowledge: string[] | null;
  created_at: string | null;
}

export interface Dialog {
  id: number;
  workspace_id: number;
  title: string | null;
  user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DialogDetail extends Dialog {
  messages: ConsultMessage[];
}

export const listDialogs = (code: string): Promise<Dialog[]> =>
  api.get(`${BASE}/workspaces/${code}/dialogs`).then((r) => r.data);

export const getDialog = (code: string, dialogId: number): Promise<DialogDetail> =>
  api.get(`${BASE}/workspaces/${code}/dialogs/${dialogId}`).then((r) => r.data);

export const consult = (code: string, message: string, dialogId?: number): Promise<ConsultMessage> =>
  api.post(`${BASE}/workspaces/${code}/consult`, { message, dialog_id: dialogId }).then((r) => r.data);

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface WorkspaceAnalytics {
  ai_calls_total: number;
  ai_calls_error: number;
  ai_tokens_total: number;
  ai_cost_usd_total: number;
  dialogs_total: number;
  knowledge_items_active: number;
}

export const getWorkspaceAnalytics = (code: string): Promise<WorkspaceAnalytics> =>
  api.get(`${BASE}/workspaces/${code}/analytics`).then((r) => r.data);
