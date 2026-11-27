import type { Questionnaire, SavedResponse, SharedPayload, Suggestion } from '../types';

const ADMIN_TOKEN_KEY = 'admin_token';

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || import.meta.env.VITE_ADMIN_TOKEN || '';
}
export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

async function request<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (admin) {
    const token = getAdminToken();
    if (token) headers.set('X-Admin-Token', token);
  }
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    let detail = res.statusText;
    try { const data = await res.json(); detail = data.detail || JSON.stringify(data); } catch {}
    throw new Error(detail);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text() as any;
}

export const api = {
  uploadQuestionnaire: async (file: File): Promise<Questionnaire> => {
    const fd = new FormData();
    fd.append('file', file);
    const data = await request<{ questionnaire: Questionnaire }>('/api/questionnaires/upload', { method: 'POST', body: fd }, true);
    return data.questionnaire;
  },
  getAuthProviders: () => request<{ providers: { id: string; label: string }[]; auth_required_for_submit: boolean }>('/api/auth/providers'),
  getMe: () => request<{ user: { id: string; provider: string; email: string; name: string; picture: string } | null }>('/api/auth/me'),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  getQuestionnaire: async (slug: string): Promise<Questionnaire & { sample_prefill?: any }> => {
    const data = await request<{ questionnaire: Questionnaire & { sample_prefill?: any } }>(`/api/questionnaires/${slug}`);
    return data.questionnaire;
  },
  getQuestionnaireSample: async (slug: string, profile?: string): Promise<{ sample_prefill: any; profiles?: any[] }> => {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    const data = await request<{ sample_prefill: any; profiles?: any[] }>(`/api/questionnaires/${slug}/sample${q}`);
    return data;
  },
  listQuestionnaires: async (): Promise<Questionnaire[]> => {
    const data = await request<{ questionnaires: Questionnaire[] }>('/api/questionnaires', {}, true);
    return data.questionnaires;
  },
  suggestAll: async (slug: string, body: any): Promise<{ suggestions: Suggestion[]; provider: string; model: string }> =>
    request(`/api/questionnaires/${slug}/suggest-all`, { method: 'POST', body: JSON.stringify(body) }),
  suggestQuestion: async (slug: string, body: any): Promise<{ suggestions: Suggestion[]; provider: string; model: string }> =>
    request(`/api/questionnaires/${slug}/suggest-question`, { method: 'POST', body: JSON.stringify(body) }),
  getMyResponse: async (slug: string) => request<{ response: any | null }>(`/api/questionnaires/${slug}/my-response`),
  submit: async (slug: string, body: any, authMode?: 'required' | 'optional') =>
    request(`/api/questionnaires/${slug}/submit${authMode ? `?auth=${authMode}` : ''}`, { method: 'POST', body: JSON.stringify(body) }),
  listResponses: async (slug: string): Promise<SavedResponse[]> => {
    const data = await request<{ responses: SavedResponse[] }>(`/api/questionnaires/${slug}/responses`, {}, true);
    return data.responses;
  },
  deleteQuestionnaire: async (slug: string) => request(`/api/questionnaires/${slug}`, { method: 'DELETE' }, true),
  getShared: async (token: string): Promise<SharedPayload> => request(`/api/share/${token}`),
  exportCsvUrl: (slug: string) => `/api/questionnaires/${slug}/responses.csv`,
  exportXlsxUrl: (slug: string) => `/api/questionnaires/${slug}/responses.xlsx`,
  exportWithToken: async (slug: string, format: 'csv' | 'xlsx') => {
    const token = getAdminToken();
    const res = await fetch(`/api/questionnaires/${slug}/responses.${format}`, { headers: token ? { 'X-Admin-Token': token } : {} });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${slug}-responses.${format}`; a.click();
    URL.revokeObjectURL(url);
  },
};
