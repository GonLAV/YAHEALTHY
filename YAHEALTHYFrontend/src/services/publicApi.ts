/**
 * The two anonymous calls the public landing page makes, over plain fetch.
 *
 * The full client in ./api.ts is built on axios, which is most of a public
 * page's JavaScript and none of its content. The landing page is the one
 * public page that talks to the API, so it uses this instead; everything
 * signed-in keeps ./api.ts. The shapes match what the page used before:
 * `{ data }` on success, and an error carrying `response.status` (as axios
 * errors do) on a non-2xx answer.
 */
import type { LeadInput, MarketingPlan } from './api';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export interface HttpError extends Error {
  response?: { status: number; data: unknown };
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ data: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error: HttpError = new Error(`Request failed with status code ${res.status}`);
    error.response = { status: res.status, data };
    throw error;
  }
  return { data: data as T };
}

export const publicMarketingApi = {
  getPlans: () => request<{ plans: MarketingPlan[] }>('GET', '/api/marketing/plans'),
  submitLead: (lead: LeadInput) => request<{ ok: boolean }>('POST', '/api/marketing/leads', lead),
};
