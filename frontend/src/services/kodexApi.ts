import { api } from './api/client';

export interface KodexCaseSummary {
  id: number;
  slug: string;
  num: string | null;
  title: string;
  curator: string | null;
  playable: boolean;
  rank: number;
  difficulty: number;
  reward_credits: number;
  reward_rep: number;
  anno: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export interface KodexCaseFull extends KodexCaseSummary {
  goal: string | null;
  suspects: string | null;
  task: string | null;
  briefing: any[];
  materials: any[];
  evidence: any[];
  hints: Record<string, any>;
  versions: any[];
  finale: any[];
  theory: any[];
  created_by_id: number | null;
}

export type KodexCaseCreate = Omit<KodexCaseFull, 'id' | 'created_at' | 'updated_at' | 'created_by_id' | 'status'>;
export type KodexCaseUpdate = Partial<KodexCaseCreate & { status: string }>;

// ─── External Kodex (kodex.tirskix.space) types ─────────────────────────────

export interface KodexExternalSummary {
  slug: string;
  num: string | null;
  title: string;
  curator: string | null;
  rank: number;
  difficulty: number;
  playable: boolean;
  anno: string | null;
  status: string | null;
  is_override: boolean;
  is_seed: boolean;
}

export interface KodexExternalFull extends KodexExternalSummary {
  goal: string | null;
  suspects: string | null;
  task: string | null;
  reward_credits: number;
  reward_rep: number;
  fn_name: string | null;
  starter: string | null;
  briefing: any[];
  materials: any[];
  evidence: any[];
  hints: Record<string, any>;
  versions: any[];
  finale: any[];
}

export const kodexExternalApi = {
  list: (): Promise<KodexExternalSummary[]> =>
    api.get('/kodex/cases/external').then((r) => r.data),

  get: (slug: string): Promise<KodexExternalFull> =>
    api.get(`/kodex/cases/external/${slug}`).then((r) => r.data),

  update: (slug: string, payload: Partial<KodexExternalFull>): Promise<KodexExternalFull> =>
    api.put(`/kodex/cases/external/${slug}`, payload).then((r) => r.data),

  create: (payload: Partial<KodexExternalFull>): Promise<KodexExternalFull> =>
    api.put(`/kodex/cases/external/${payload.slug}`, payload).then((r) => r.data),

  delete: (slug: string): Promise<void> =>
    api.delete(`/kodex/cases/external/${slug}`).then(() => undefined),

  aiDraft: (idea: string): Promise<Partial<KodexExternalFull>> =>
    api.post('/kodex/cases/ai-draft', { idea }).then((r) => r.data),
};

export const kodexApi = {
  list: (): Promise<KodexCaseSummary[]> =>
    api.get('/kodex/cases/').then((r) => r.data),

  get: (id: number): Promise<KodexCaseFull> =>
    api.get(`/kodex/cases/${id}`).then((r) => r.data),

  create: (payload: KodexCaseCreate): Promise<KodexCaseFull> =>
    api.post('/kodex/cases/', payload).then((r) => r.data),

  update: (id: number, payload: KodexCaseUpdate): Promise<KodexCaseFull> =>
    api.put(`/kodex/cases/${id}`, payload).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/kodex/cases/${id}`).then(() => undefined),
};

// ─── Детальный прогресс ученика (решения по делам) ──────────────────────────

export interface KodexCaseDetail {
  id: string;
  title: string;
  num: string | null;
  status: string | null;
  stage: string | null;
  code: string | null;
  attempts: number | null;
  tries: number;
  fail_streak: number;
  hints_used: any[];
  studied: any[];
  solved_at: string | null;
  claimed: boolean;
}

export interface KodexStudentDetail {
  agent: { reputation: number; credits: number; badges: any[]; streak: number } | null;
  cases: KodexCaseDetail[];
}

export const getStudentKodexDetail = (studentId: number): Promise<KodexStudentDetail> =>
  api.get(`/kodex/cases/students/${studentId}/detail`).then((r) => r.data);

// ─── Теория по модулям ────────────────────────────────────────────────────

export interface KodexModuleTheory {
  module: number;
  title: string;
  content_md: string;
  updated_at: string | null;
  synced?: boolean | null;
}

export const kodexModuleTheoryApi = {
  list: (): Promise<KodexModuleTheory[]> =>
    api.get('/kodex/cases/module-theory').then((r) => r.data),

  save: (module: number, payload: { title: string; content_md: string }): Promise<KodexModuleTheory> =>
    api.put(`/kodex/cases/module-theory/${module}`, payload).then((r) => r.data),
};
