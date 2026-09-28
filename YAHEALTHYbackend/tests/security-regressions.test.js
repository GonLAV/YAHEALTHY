/**
 * Security regressions from the cross-feature review of referrals, share
 * cards, onboarding/targets and staff analytics.
 *
 *   node tests/security-regressions.test.js
 *
 * Each block pins one finding so it cannot quietly come back:
 *   - signup ignores fields it does not own (is_staff, arbitrary attribution
 *     keys) and never fails over a malformed referral code / attribution blob
 *   - a non-staff caller on a staff route gets the exact body of the global
 *     unknown-route 404, so staff routes cannot be told apart from nothing
 *   - PUT /api/targets only stores numbers
 *   - a deleted account's share link stops resolving (memory store has no
 *     ON DELETE CASCADE to do it)
 *   - another user cannot revoke or replace the image of someone's link
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'security-regressions-secret';
process.env.VERCEL = '1';

const db = require('../utils/database');

let BASE;
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: json, text };
}

const password = 'correct horse battery';
let seq = 0;
async function signup(extra = {}) {
  seq++;
  const email = `sec-test-${Date.now()}-${seq}@example.com`;
  const res = await call('POST', '/api/auth/signup', { body: { email, password, ...extra } });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${res.text}`);
  return { id: res.body.id, token: res.body.token, email };
}

// requestId differs per request; everything else must match.
const withoutRequestId = (body) => {
  if (!body || typeof body !== 'object') return body;
  const { requestId, ...rest } = body;
  return rest;
};

async function run() {
  // ── signup: no mass assignment, growth fields never fail it ──────────────
  const mallory = await signup({
    name: 'Mallory',
    is_staff: true,
    isStaff: true,
    onboarding_completed_at: '2020-01-01T00:00:00Z',
    referred_by: '00000000-0000-0000-0000-000000000000',
    referralCode: { $ne: null },
    attribution: { utm_source: 'ads', is_staff: true, preferences: { x: 1 } }
  });
  const stored = await db.getUser(mallory.id);
  check('signup ignores is_staff in the body', stored.is_staff !== true);
  check('signup ignores onboarding_completed_at in the body', !stored.onboarding_completed_at);
  check('signup ignores referred_by in the body', !stored.referred_by);
  check(
    'attribution keeps only the known utm/landing keys',
    stored.attribution && stored.attribution.utm_source === 'ads' &&
      !('is_staff' in stored.attribution) && !('preferences' in stored.attribution),
    JSON.stringify(stored.attribution)
  );
  const me = await call('GET', '/api/auth/me', { token: mallory.token });
  check('/api/auth/me says isStaff false for her', me.body && me.body.isStaff === false);

  const junk = await call('POST', '/api/auth/signup', {
    body: {
      email: `sec-junk-${Date.now()}@example.com`,
      password,
      referralCode: 'x'.repeat(5000),
      attribution: 'not-an-object'
    }
  });
  check('an oversized referral code and junk attribution do not fail signup', junk.status === 201, `got ${junk.status}`);

  // ── staff routes look exactly like unknown routes ────────────────────────
  const unknown = await call('GET', '/api/definitely-not-a-route', { token: mallory.token });
  for (const route of ['/api/analytics/funnel', '/api/marketing/leads', '/api/marketing/leads?format=csv']) {
    const staffOnly = await call('GET', route, { token: mallory.token });
    const expected = { ...withoutRequestId(unknown.body), path: route };
    check(
      `${route}: non-staff gets the global unknown-route 404 body`,
      staffOnly.status === 404 &&
        JSON.stringify(withoutRequestId(staffOnly.body)) === JSON.stringify(expected),
      `${staffOnly.status} ${staffOnly.text}`
    );
  }

  // ── PUT /api/targets stores numbers only ─────────────────────────────────
  const bad = [
    { calories: 'abc' },
    { calories: { $gt: 0 } },
    { calories: 99999 },
    { calories: 2000, protein_grams: { x: 1 } },
    { calories: 2000, fat_grams: -5 },
    { calories: 2000, carbs_grams: 'lots' }
  ];
  for (const body of bad) {
    const res = await call('PUT', '/api/targets', { token: mallory.token, body });
    check(`PUT /api/targets rejects ${JSON.stringify(body)}`, res.status === 400, `got ${res.status}`);
  }
  const prefsAfterBad = await db.getUserPreferences(mallory.id);
  check('rejected targets were not stored', !prefsAfterBad || !prefsAfterBad.macroTargets, JSON.stringify(prefsAfterBad));

  const ok = await call('PUT', '/api/targets', { token: mallory.token, body: { calories: '1900', protein_grams: 120 } });
  check('numeric targets (and numeric strings) are accepted', ok.status === 200, ok.text);
  const got = await call('GET', '/api/targets', { token: mallory.token });
  check(
    'stored targets read back as numbers',
    got.body && got.body.targets.calories === 1900 && got.body.targets.protein_grams === 120,
    got.text
  );

  // ── share links: owner-only writes, and deletion takes them down ─────────
  const owner = await signup({ name: 'Noa' });
  const other = await signup({ name: 'Eve' });
  const link = await call('POST', '/api/share/weekly-card/link', { token: owner.token, body: { lang: 'he' } });
  check('owner creates a share link', link.status === 201, link.text);
  const token = link.body.token;

  const revokeByOther = await call('DELETE', `/api/share/c/${token}`, { token: other.token });
  check('another user cannot revoke the link', revokeByOther.status === 404);
  check('the link is still live after that attempt', (await call('GET', `/s/${token}`)).status === 200);

  const page = await call('GET', `/s/${token}`);
  check(
    'the public page carries no email or user id',
    !page.text.includes(owner.email) && !page.text.includes(owner.id)
  );

  const del = await call('DELETE', '/api/users/me', { token: owner.token, body: { password } });
  check('owner deletes the account', del.status === 200, del.text);
  check('the deleted owner\'s share page is gone', (await call('GET', `/s/${token}`)).status === 404);
  check('the deleted owner\'s share JSON is gone', (await call('GET', `/api/share/c/${token}`)).status === 404);
  check('the deleted owner\'s card image is gone', (await call('GET', `/s/${token}/card.svg`)).status === 404);
}

(async () => {
  let code = 1;
  let server;
  try {
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;

    console.log('\nsecurity regressions\n');
    await run();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
