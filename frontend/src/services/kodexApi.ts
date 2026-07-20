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
