import { methodistStudioClient } from './methodistStudioClient';
import type { KodexCaseSummary, KodexCaseFull, KodexCaseCreate, KodexCaseUpdate } from './kodexApi';

export const methodistKodexApi = {
  list: (): Promise<KodexCaseSummary[]> =>
    methodistStudioClient.get('/kodex/cases/').then((r) => r.data),

  get: (id: number): Promise<KodexCaseFull> =>
    methodistStudioClient.get(`/kodex/cases/${id}`).then((r) => r.data),

  create: (payload: KodexCaseCreate): Promise<KodexCaseFull> =>
    methodistStudioClient.post('/kodex/cases/', payload).then((r) => r.data),

  update: (id: number, payload: KodexCaseUpdate): Promise<KodexCaseFull> =>
    methodistStudioClient.put(`/kodex/cases/${id}`, payload).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    methodistStudioClient.delete(`/kodex/cases/${id}`).then(() => undefined),
};
