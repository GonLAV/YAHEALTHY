import { test as base, expect } from '@playwright/test';

export const PASSWORD = 'correct horse battery staple';

let seq = 0;
export const uniqueEmail = (tag) => `e2e-${tag}-${Date.now()}-${++seq}@example.com`;

export const test = base.extend({
  // The port is chosen in globalSetup, after the config has been read.
  baseURL: async ({}, use) => {
    const url = process.env.E2E_BASE_URL;
    if (!url) throw new Error('E2E_BASE_URL is not set — run through playwright.config.mjs');
    await use(url);
  },

  /** Direct API helpers (through the Vite proxy, same as the browser). */
  api: async ({ request, baseURL }, use) => {
    const call = async (method, route, { token, data } = {}) => {
      const res = await request.fetch(`${baseURL}${route}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(data !== undefined ? { data } : {})
      });
      let body = null;
      try {
        body = await res.json();
      } catch {
        /* not JSON */
      }
      return { status: res.status(), body };
    };

    /** A signed-up user; `onboarded` marks the wizard done so private pages open directly. */
    const signup = async ({ name = 'Tester', onboarded = true, extra = {} } = {}) => {
      const email = uniqueEmail('user');
      const res = await call('POST', '/api/auth/signup', { data: { email, password: PASSWORD, name, ...extra } });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const user = { id: res.body.id, email, token: res.body.token, name };
      if (onboarded) {
        const done = await call('POST', '/api/onboarding', { token: user.token, data: {} });
        expect(done.status).toBe(200);
      }
      return user;
    };

    await use({ call, signup });
  }
});

/** Seed language (and optionally a session) before the app's first script runs. */
export async function prime(page, { lang = 'en', token } = {}) {
  await page.addInitScript(
    ([l, tk]) => {
      try {
        if (!sessionStorage.getItem('e2e-primed')) {
          localStorage.setItem('yahealthy-lang', l);
          if (tk) localStorage.setItem('token', tk);
          sessionStorage.setItem('e2e-primed', '1');
        }
      } catch {
        /* storage unavailable */
      }
    },
    [lang, token || null]
  );
}

export { expect };
