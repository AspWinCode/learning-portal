import { api } from './api/client';

// ─── ИИ-консультант академии (модуль academy_ai) ─────────────────────────────

const BASE = '/academy-ai';

export type KbEntryKind = 'fact' | 'audit_answer' | 'note' | 'link' | 'media' | 'document';
export type DraftStatus = 'draft' | 'approved' | 'rejected' | 'published';
export type ContentKind = 'post' | 'summary' | 'image_prompt' | 'newsletter' | 'script';

export interface AcademyModuleStatus {
  enabled: boolean;
  ai_gateway_configured: boolean;
  kb_entries: number;
  expertise_sources: number;
  pending_drafts: number;
  search_backend: string;
  pending_embeddings: number;
  open_insights: number;
}

export interface KbEntry {
  id: number;
  kind: KbEntryKind;
  section: string | null;
  title: string;
  body_text: string | null;
  ai_description: string | null;
  tags: string[] | null;
  storage_key: string | null;
  source_url: string | null;
  direction: string | null;
  is_active: boolean;
  superseded_by_id: number | null;
  valid_from: string | null;
  created_by_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface KbEntryList {
  items: KbEntry[];
  total: number;
}

export interface KbEntryCreate {
  kind?: KbEntryKind;
  section?: string | null;
  title: string;
  body_text?: string | null;
  tags?: string[] | null;
  source_url?: string | null;
  direction?: string | null;
}

export interface AuditQuestion {
  id: number;
  section: string;
  prompt: string;
  hint: string | null;
  sort_order: number;
}

export interface AuditAnswer {
  id: number;
  session_id: number;
  question_id: number | null;
  section: string | null;
  answer_text: string | null;
  kb_entry_id: number | null;
  created_at: string | null;
}

export interface AuditSession {
  id: number;
  status: string;
  kind: string;
  started_by_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  answers: AuditAnswer[];
}

export interface ExpertiseSource {
  id: number;
  title: string;
  type: string;
  status: 'active' | 'disabled';
  origin_url: string | null;
  storage_key: string | null;
  ai_description: string | null;
  added_by_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  chunk_count: number;
}

export interface ExpertiseIngestResult {
  chars_extracted: number;
  chunks: number;
  ocr_used: boolean;
  source: ExpertiseSource;
}

export interface ExpertiseChunk {
  id: number;
  ord: number;
  text: string;
  token_count: number | null;
}

export interface DialogMessage {
  id: number;
  role: string;
  content: string;
  used_sources: Record<string, unknown> | null;
  created_at: string | null;
}

export interface Dialog {
  id: number;
  title: string | null;
  kind: string;
  user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DialogDetail extends Dialog {
  messages: DialogMessage[];
}

export interface ConsultResponse {
  dialog_id: number;
  answer: string;
  used_sources: Record<string, unknown>;
}

export interface SearchHit {
  scope: string;
  chunk_id: number;
  ref_id: number;
  title: string;
  text: string;
  score: number;
  method: string;
}

export interface SearchResponse {
  query: string;
  backend: string;
  hits: SearchHit[];
}

export interface ContentDraft {
  id: number;
  kind: ContentKind;
  status: DraftStatus;
  title: string | null;
  body: string | null;
  image_prompt: string | null;
  image_storage_key: string | null;
  based_on: Record<string, unknown> | null;
  direction: string | null;
  feedback_note: string | null;
  schedule_rule_id: number | null;
  created_at: string | null;
}

export interface ContentDraftList {
  items: ContentDraft[];
  total: number;
}

export interface ScheduleRule {
  id: number;
  name: string;
  cadence: string;
  topics: string[] | null;
  proportions: Record<string, number> | null;
  tone: Record<string, unknown> | null;
  is_active: boolean;
  next_run_at: string | null;
  created_by_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ScheduleRunResult {
  generated: number;
  drafts: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
}

export interface Insight {
  id: number;
  kind: string;
  dedup_key: string;
  severity: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  status: string;
  created_at: string | null;
  resolved_at: string | null;
}

export interface InsightList {
  items: Insight[];
  total: number;
}

// ─── Статус ────────────────────────────────────────────────────────────────
export const getStatus = (): Promise<AcademyModuleStatus> => api.get(`${BASE}/status`).then((r) => r.data);

// ─── База знаний ───────────────────────────────────────────────────────────
export const listKbEntries = (params?: {
  section?: string;
  kind?: string;
  q?: string;
  include_inactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<KbEntryList> => api.get(`${BASE}/knowledge`, { params }).then((r) => r.data);

export const createKbEntry = (payload: KbEntryCreate): Promise<KbEntry> =>
  api.post(`${BASE}/knowledge`, payload).then((r) => r.data);

export const updateKbEntry = (
  id: number,
  payload: Partial<KbEntryCreate> & { is_active?: boolean },
): Promise<KbEntry> => api.patch(`${BASE}/knowledge/${id}`, payload).then((r) => r.data);

export const archiveKbEntry = (id: number): Promise<void> =>
  api.delete(`${BASE}/knowledge/${id}`).then(() => undefined);

export const uploadKbFile = (file: File, meta?: { title?: string; section?: string; direction?: string }): Promise<KbEntry> => {
  const form = new FormData();
  form.append('file', file);
  if (meta?.title) form.append('title', meta.title);
  if (meta?.section) form.append('section', meta.section);
  if (meta?.direction) form.append('direction', meta.direction);
  return api.post(`${BASE}/knowledge/upload`, form).then((r) => r.data);
};

export const enrichKbEntry = (id: number): Promise<{ applied: Record<string, unknown>; entry: KbEntry }> =>
  api.post(`${BASE}/knowledge/${id}/enrich`).then((r) => r.data);

// ─── Аудит ─────────────────────────────────────────────────────────────────
export const listAuditQuestions = (section?: string): Promise<AuditQuestion[]> =>
  api.get(`${BASE}/audit/questions`, { params: section ? { section } : undefined }).then((r) => r.data);

export const startAuditSession = (kind = 'initial'): Promise<AuditSession> =>
  api.post(`${BASE}/audit/sessions`, null, { params: { kind } }).then((r) => r.data);

export const getAuditSession = (id: number): Promise<AuditSession> =>
  api.get(`${BASE}/audit/sessions/${id}`).then((r) => r.data);

export const submitAuditAnswer = (
  sessionId: number,
  payload: { question_id?: number; section?: string; answer_text: string },
): Promise<AuditAnswer> => api.post(`${BASE}/audit/sessions/${sessionId}/answers`, payload).then((r) => r.data);

export const completeAuditSession = (id: number): Promise<AuditSession> =>
  api.post(`${BASE}/audit/sessions/${id}/complete`).then((r) => r.data);

// ─── Библиотека экспертизы ─────────────────────────────────────────────────
export const listExpertise = (status?: string): Promise<ExpertiseSource[]> =>
  api.get(`${BASE}/expertise`, { params: status ? { status } : undefined }).then((r) => r.data);

export const createTextExpertise = (payload: {
  title: string;
  type?: string;
  origin_url?: string;
  text?: string;
}): Promise<ExpertiseIngestResult> => api.post(`${BASE}/expertise`, payload).then((r) => r.data);

export const uploadExpertise = (file: File, meta?: { title?: string; type?: string }): Promise<ExpertiseIngestResult> => {
  const form = new FormData();
  form.append('file', file);
  if (meta?.title) form.append('title', meta.title);
  if (meta?.type) form.append('type', meta.type);
  return api.post(`${BASE}/expertise/upload`, form).then((r) => r.data);
};

export const reingestExpertise = (id: number): Promise<ExpertiseIngestResult> =>
  api.post(`${BASE}/expertise/${id}/reingest`).then((r) => r.data);

export const setExpertiseStatus = (id: number, value: 'active' | 'disabled'): Promise<ExpertiseSource> =>
  api.post(`${BASE}/expertise/${id}/status`, null, { params: { value } }).then((r) => r.data);

export const getExpertiseChunks = (id: number, limit = 20): Promise<ExpertiseChunk[]> =>
  api.get(`${BASE}/expertise/${id}/chunks`, { params: { limit } }).then((r) => r.data);

export const deleteExpertise = (id: number): Promise<void> =>
  api.delete(`${BASE}/expertise/${id}`).then(() => undefined);

// ─── Консультации ──────────────────────────────────────────────────────────
export const listDialogs = (): Promise<Dialog[]> => api.get(`${BASE}/dialogs`).then((r) => r.data);
export const getDialog = (id: number): Promise<DialogDetail> => api.get(`${BASE}/dialogs/${id}`).then((r) => r.data);
export const consult = (message: string, dialogId?: number): Promise<ConsultResponse> =>
  api.post(`${BASE}/consult`, { message, dialog_id: dialogId ?? null }).then((r) => r.data);

// ─── Поиск ─────────────────────────────────────────────────────────────────
export const search = (q: string, k = 8): Promise<SearchResponse> =>
  api.get(`${BASE}/search`, { params: { q, k } }).then((r) => r.data);
export const reindexEmbeddings = (): Promise<{ indexed: number; backend: string; reason?: string }> =>
  api.post(`${BASE}/search/reindex`).then((r) => r.data);

// ─── Генерация контента ────────────────────────────────────────────────────
export const generateContent = (payload: {
  kind: ContentKind;
  brief: string;
  direction?: string;
  tone?: Record<string, unknown>;
}): Promise<ContentDraft> => api.post(`${BASE}/content/generate`, payload).then((r) => r.data);

export const listDrafts = (params?: { status?: string; kind?: string }): Promise<ContentDraftList> =>
  api.get(`${BASE}/content/drafts`, { params }).then((r) => r.data);

export const updateDraft = (
  id: number,
  payload: { title?: string; body?: string; image_prompt?: string },
): Promise<ContentDraft> => api.patch(`${BASE}/content/drafts/${id}`, payload).then((r) => r.data);

export const setDraftStatus = (id: number, status: DraftStatus, feedback?: string): Promise<ContentDraft> =>
  api.post(`${BASE}/content/drafts/${id}/status`, { status, feedback }).then((r) => r.data);

export const renderDraftImage = (id: number): Promise<{ ok: boolean; detail: string; draft: ContentDraft }> =>
  api.post(`${BASE}/content/drafts/${id}/image`).then((r) => r.data);

export const deleteDraft = (id: number): Promise<void> =>
  api.delete(`${BASE}/content/drafts/${id}`).then(() => undefined);

// ─── Планировщик ───────────────────────────────────────────────────────────
export const listScheduleRules = (): Promise<ScheduleRule[]> => api.get(`${BASE}/schedule/rules`).then((r) => r.data);
export const createScheduleRule = (payload: {
  name: string;
  cadence?: string;
  topics?: string[];
  proportions?: Record<string, number>;
  tone?: Record<string, unknown>;
  is_active?: boolean;
}): Promise<ScheduleRule> => api.post(`${BASE}/schedule/rules`, payload).then((r) => r.data);
export const updateScheduleRule = (id: number, payload: Partial<ScheduleRule>): Promise<ScheduleRule> =>
  api.patch(`${BASE}/schedule/rules/${id}`, payload).then((r) => r.data);
export const deleteScheduleRule = (id: number): Promise<void> =>
  api.delete(`${BASE}/schedule/rules/${id}`).then(() => undefined);
export const runScheduleNow = (): Promise<ScheduleRunResult> =>
  api.post(`${BASE}/schedule/run`).then((r) => r.data);

// ─── Проактивность ─────────────────────────────────────────────────────────
export const listInsights = (status = 'open'): Promise<InsightList> =>
  api.get(`${BASE}/insights`, { params: { status } }).then((r) => r.data);
export const dismissInsight = (id: number): Promise<Insight> =>
  api.post(`${BASE}/insights/${id}/dismiss`).then((r) => r.data);
export const scanInsights = (): Promise<{ created: string[]; resolved: string[]; open_after: number }> =>
  api.post(`${BASE}/insights/scan`).then((r) => r.data);
