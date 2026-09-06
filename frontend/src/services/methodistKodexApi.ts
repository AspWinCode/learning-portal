import { methodistStudioClient } from './methodistStudioClient';
import type { AuthoringSummary, KodexExternalFull, KodexExternalSummary } from './kodexApi';

export const methodistKodexApi = {
  list: (): Promise<KodexExternalSummary[]> =>
    methodistStudioClient.get('/kodex/cases/external').then((r) => r.data),

  summary: (): Promise<AuthoringSummary> =>
    methodistStudioClient.get('/kodex/cases/external/summary').then((r) => r.data),

  get: (slug: string): Promise<KodexExternalFull> =>
    methodistStudioClient.get(`/kodex/cases/external/${slug}`).then((r) => r.data),

  update: (slug: string, payload: Partial<KodexExternalFull>): Promise<KodexExternalFull> =>
    methodistStudioClient.put(`/kodex/cases/external/${slug}`, payload).then((r) => r.data),

  create: (payload: Partial<KodexExternalFull>): Promise<KodexExternalFull> =>
    methodistStudioClient.put(`/kodex/cases/external/${payload.slug}`, payload).then((r) => r.data),

  delete: (slug: string): Promise<void> =>
    methodistStudioClient.delete(`/kodex/cases/external/${slug}`).then(() => undefined),

  aiDraft: (idea: string): Promise<any> =>
    methodistStudioClient.post('/kodex/cases/ai-draft', { idea }).then((r) => r.data),
};
