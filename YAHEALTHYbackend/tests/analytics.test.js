/**
 * Staff marketing analytics: who may see it, whether the numbers add up, and
 * that nobody's address leaks out of it.
 *
 *   node tests/analytics.test.js
 *
 * Part 1 exercises the pure functions in utils/analytics.js with a fixed
 * clock. Part 2 runs the real app (tests/helpers/analytics-server.js, seeded
 * with a known history) and checks the endpoints end to end.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const a = require('../utils/analytics');

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

// ── part 1: pure functions ──────────────────────────────────────────────────

function unit() {
  console.log('\nanalytics — pure functions\n');
  const now = new Date('2026-03-31T12:00:00Z');

  // range
  const def = a.parseRange({}, now);
  check('default range is the last 30 days ending today', def.ok && def.from === '2026-03-02' && def.to === '2026-03-31' && def.days === 30, JSON.stringify(def));
  check('the range end is exclusive in ISO form', def.toIso === '2026-04-01T00:00:00.000Z');
  check('a malformed date is refused', a.parseRange({ from: '2026-02-30' }, now).ok === false);
  check('from after to is refused', a.parseRange({ from: '2026-03-10', to: '2026-03-01' }, now).ok === false);
  check('more than a year is refused', a.parseRange({ from: '2024-01-01', to: '2026-03-01' }, now).ok === false);

  // masking
  check('an email is masked', a.maskEmail('dana.cohen@gmail.com') === 'd***@g***.com', a.maskEmail('dana.cohen@gmail.com'));
  check('garbage masks to nothing', a.maskEmail('') === '***' && a.maskEmail('no-at-sign') === '***');
  check('a typed first name is used', a.firstNameOf({ name: 'Dana Cohen', email: 'x@y.com' }) === 'Dana');
  check(
    'the default name (email local part) is not shown',
    a.firstNameOf({ name: 'dana.cohen', email: 'dana.cohen@gmail.com' }) === null
  );
  check('a name that is a phone number is not shown', a.firstNameOf({ name: '0521234567', email: 'x@y.com' }) === null);

  // funnel on a hand-built cohort
  const signups = [
    { id: 'a', created_at: '2026-03-01T09:00:00Z' }, // logs d0, d2, d5 → activated + engaged
    { id: 'b', created_at: '2026-03-01T09:00:00Z' }, // log d7 → too late to activate
    { id: 'c', created_at: '2026-03-01T09:00:00Z' }, // log d6 → activated (last day of the window)
    { id: 'd', created_at: '2026-03-29T09:00:00Z' } // nothing yet, window open
  ];
  const activity = [
    { user_id: 'a', day: '2026-03-01' },
    { user_id: 'a', day: '2026-03-01' }, // same day twice counts once
    { user_id: 'a', day: '2026-03-03' },
    { user_id: 'a', day: '2026-03-06' },
    { user_id: 'b', day: '2026-03-08' },
    { user_id: 'c', day: '2026-03-07' },
    { user_id: 'c', day: '2026-03-15' } // day 14: outside the engagement window
  ];
  const subscriptions = [
    { user_id: 'a', status: 'active', ends_at: null },
    { user_id: 'b', status: 'active', ends_at: '2026-03-20T00:00:00Z' }, // ended
    { user_id: 'c', status: 'expired', ends_at: null }
  ];
  const f = a.computeFunnel({ leads: [{}, {}, {}, {}, {}, {}, {}, {}], signups, activity, subscriptions, now });
  const count = (key) => f.stages.find((s) => s.key === key).count;
  check('funnel: leads counted', count('leads') === 8);
  check('funnel: signups counted', count('signups') === 4);
  check('funnel: activation is ≥1 log within 7 days of signup', count('activated') === 2, `got ${count('activated')}`);
  check('funnel: engaged is ≥3 distinct active days in the first 14', count('engaged') === 1, `got ${count('engaged')}`);
  check('funnel: only a live subscription is paying', count('paying') === 1, `got ${count('paying')}`);
  check('funnel: signup rate is signups/leads', f.stages[1].rateFromPrevious === 0.5);
  check('funnel: activation rate is from signups', f.stages[2].rateFromSignups === 0.5);
  check('funnel: engaged step rate is from activated', f.stages[3].rateFromPrevious === 0.5);
  check('funnel: a signup with an open window is pending, not failed', f.pending.activation === 1 && f.pending.engagement === 1, JSON.stringify(f.pending));
  check('funnel: no division by zero', a.computeFunnel({ now }).stages.every((s) => s.rateFromPrevious === null || Number.isFinite(s.rateFromPrevious)));

  // attribution grouping
  const acq = a.computeAcquisition({
    signups: [
      { id: 'u1', created_at: '2026-03-01T09:00:00Z', attribution: { utm_source: 'Instagram', utm_medium: 'social', utm_campaign: 'launch' } },
      { id: 'u2', created_at: '2026-03-01T09:00:00Z', attribution: { utm_source: ' instagram', utm_medium: 'Social', utm_campaign: 'launch' } },
      { id: 'u3', created_at: '2026-03-01T09:00:00Z', attribution: { utm_source: 'google', utm_campaign: 'brand' } },
      { id: 'u4', created_at: '2026-03-01T09:00:00Z', attribution: { utm_source: 'tiktok' }, referred_by: 'r1' },
      { id: 'u5', created_at: '2026-03-01T09:00:00Z' },
      { id: 'u6', created_at: '2026-03-01T09:00:00Z', attribution: { landing_path: '/' } }
    ],
    activity: [{ user_id: 'u1', day: '2026-03-02' }],
    subscriptions: [{ user_id: 'u2', status: 'active' }],
    referrals: [],
    now
  });
  const row = (channel, source) => acq.rows.find((r) => r.channel === channel && r.utm_source === source);
  const insta = row('campaign', 'instagram');
  check('UTM tags are grouped case- and space-insensitively', insta && insta.signups === 2, JSON.stringify(acq.rows));
  check('a group carries its activation and paying counts', insta && insta.activated === 1 && insta.paying === 1 && insta.activationRate === 0.5);
  check('a referral wins over its UTM tags', row('referral', null)?.signups === 1 && !row('campaign', 'tiktok'));
  check('no UTM tags is organic/direct', acq.byChannel.find((c) => c.channel === 'organic').signups === 2);
  check('channel totals add up to all signups', acq.byChannel.reduce((s, c) => s + c.signups, 0) === 6 && acq.total.signups === 6);

  // retention
  const ret = a.computeRetention({
    signups: [
      { id: 'a', created_at: '2026-03-02T09:00:00Z' },
      { id: 'b', created_at: '2026-03-04T09:00:00Z' },
      { id: 'c', created_at: '2026-03-28T09:00:00Z' }
    ],
    activity: [
      { user_id: 'a', day: '2026-03-02' },
      { user_id: 'a', day: '2026-03-10' },
      { user_id: 'b', day: '2026-03-12' }
    ],
    now,
    weeks: 4
  });
  check('cohorts are keyed by the Monday of the signup week', ret.cohorts.map((c) => c.cohortStart).join() === '2026-03-02,2026-03-23', JSON.stringify(ret.cohorts.map((c) => c.cohortStart)));
  const first = ret.cohorts[0];
  check('week 0 active rate', first.cells[0].rate === 0.5, JSON.stringify(first.cells[0]));
  check('week 1 active rate', first.cells[1].rate === 1, JSON.stringify(first.cells[1]));
  check('an unfinished week has no rate rather than a low one', ret.cohorts[1].cells[0].rate === null && ret.cohorts[1].cells[0].eligible === 0);

  // referrals
  const refs = a.computeReferrals({
    referrals: [
      { id: 'x1', referrer_id: 'r1', referee_id: 'e1', created_at: '2026-03-01T09:00:00Z' },
      { id: 'x2', referrer_id: 'r1', referee_id: 'e2', created_at: '2026-03-01T09:00:00Z' },
      { id: 'x3', referrer_id: 'r2', referee_id: 'e3', created_at: '2026-03-01T09:00:00Z' }
    ],
    referrers: [
      { id: 'r1', name: 'Noa Levi', email: 'noa.levi@gmail.com', phone: '972521234567' },
      { id: 'r2', name: 'moshe', email: 'moshe@walla.co.il' }
    ],
    subscriptions: [{ user_id: 'e1', status: 'active' }],
    rewards: [
      { user_id: 'r1', referral_id: 'x1', amount: 30, status: 'earned' },
      { user_id: 'r1', referral_id: 'x2', amount: 30, status: 'revoked' },
      { user_id: 'e1', referral_id: 'x1', amount: 7, status: 'earned' }
    ],
    now
  });
  const top = refs.leaderboard[0];
  check('referrers are ranked by conversions', top.firstName === 'Noa' && top.invites === 2 && top.conversions === 1, JSON.stringify(top));
  check('revoked rewards and referee-side rewards do not count', top.rewardsEarned === 30, `got ${top.rewardsEarned}`);
  check('a referrer without a typed name shows no name', refs.leaderboard[1].firstName === null);
  const refsJson = JSON.stringify(refs);
  check(
    'the leaderboard carries no full email, phone or user id',
    !refsJson.includes('noa.levi@') && !refsJson.includes('walla.co.il') && !refsJson.includes('972521234567') && !refsJson.includes('"r1"'),
    refsJson
  );

  // leads
  const ls = a.computeLeadsSummary({
    leads: [
      { email: 'x@y.com', utm_source: 'Instagram', created_at: '2026-03-02T10:00:00Z' },
      { email: 'z@y.com', source: 'landing-hero', created_at: '2026-03-02T11:00:00Z' },
      { email: 'q@y.com', created_at: '2026-03-04T11:00:00Z' }
    ],
    signedUpEmails: ['X@y.com'],
    range: { from: '2026-03-01', to: '2026-03-05' }
  });
  check('leads per day includes empty days', ls.perDay.length === 5 && ls.perDay[1].count === 2 && ls.perDay[0].count === 0, JSON.stringify(ls.perDay));
  check('leads per source prefers utm_source, then source, then (direct)', ls.perSource.map((s) => s.source).sort().join() === '(direct),instagram,landing-hero');
  check('lead → signup rate', ls.signups === 1 && ls.leadToSignupRate === 0.3333, JSON.stringify(ls));
  check('the leads summary contains no address', !JSON.stringify(ls).includes('@'));
}

// ── part 2: the endpoints ───────────────────────────────────────────────────

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
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
  return { status: res.status, body: json, text, headers: res.headers };
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE + '/api/health')).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const ENDPOINTS = ['funnel', 'acquisition', 'referrals', 'retention', 'leads/summary'];
const dayAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function endpoints() {
  console.log('\nanalytics — endpoints\n');

  const stranger = await call('POST', '/api/auth/signup', {
    body: { email: `stranger-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const strangerToken = stranger.body?.token;
  const staff = await call('POST', '/api/auth/signup', {
    body: { email: `staff-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const staffToken = staff.body?.token;

  for (const name of ENDPOINTS) {
    const anon = await call('GET', `/api/analytics/${name}`);
    check(`${name}: anonymous is refused`, anon.status === 401, `got ${anon.status}`);
    const asStranger = await call('GET', `/api/analytics/${name}`, { token: strangerToken });
    check(`${name}: a signed-in non-staff user gets the unknown-route 404`, asStranger.status === 404, `got ${asStranger.status}`);
    check(`${name}: and no numbers`, !asStranger.body || !('range' in asStranger.body));
  }

  const meBefore = await call('GET', '/api/auth/me', { token: staffToken });
  check('/auth/me says a normal account is not staff', meBefore.body?.isStaff === false, JSON.stringify(meBefore.body));
  const granted = await call('POST', '/api/test-only/grant-staff', { token: staffToken, body: {} });
  check('the test harness can mark an account as staff', granted.status === 200);
  const meAfter = await call('GET', '/api/auth/me', { token: staffToken });
  check('/auth/me says a staff account is staff', meAfter.body?.isStaff === true);

  const q = `?from=${dayAgo(29)}&to=${dayAgo(1)}`;
  const get = (name, query = q) => call('GET', `/api/analytics/${name}${query}`, { token: staffToken });

  const bad = await get('funnel', '?from=yesterday');
  check('a malformed range is a 400', bad.status === 400, `got ${bad.status}`);

  const funnel = await get('funnel');
  check('staff can read the funnel', funnel.status === 200, `got ${funnel.status} ${funnel.text.slice(0, 200)}`);
  check('the funnel is not cacheable', funnel.headers.get('cache-control') === 'no-store');
  const stage = (key) => funnel.body?.stages?.find((s) => s.key === key)?.count;
  check('seeded funnel: 3 leads in range', stage('leads') === 3, `got ${stage('leads')}`);
  check('seeded funnel: 6 signups (referrer outside range, staff excluded)', stage('signups') === 6, `got ${stage('signups')}`);
  check('seeded funnel: 3 activated', stage('activated') === 3, `got ${stage('activated')}`);
  check('seeded funnel: 2 engaged', stage('engaged') === 2, `got ${stage('engaged')}`);
  check('seeded funnel: 2 paying', stage('paying') === 2, `got ${stage('paying')}`);
  check('seeded funnel: the 2-day-old signup is pending', funnel.body?.pending?.activation === 1);

  const acq = await get('acquisition');
  check('staff can read acquisition', acq.status === 200);
  const rows = acq.body?.rows || [];
  const insta = rows.find((r) => r.channel === 'campaign' && r.utm_source === 'instagram');
  check('seeded acquisition: instagram/social/launch groups 2 signups', insta?.signups === 2 && insta?.utm_campaign === 'launch', JSON.stringify(rows));
  check('seeded acquisition: instagram activated 1, paying 1', insta?.activated === 1 && insta?.paying === 1);
  const byChannel = Object.fromEntries((acq.body?.byChannel || []).map((c) => [c.channel, c.signups]));
  check('seeded acquisition: referral 2 / campaign 3 / organic 1', byChannel.referral === 2 && byChannel.campaign === 3 && byChannel.organic === 1, JSON.stringify(byChannel));

  const refs = await get('referrals');
  check('staff can read referrals', refs.status === 200);
  const top = refs.body?.leaderboard?.[0];
  check('seeded referrals: the referrer shows first name and masked email', top?.firstName === 'Dana' && top?.maskedEmail === 'd***@e***.com', JSON.stringify(top));
  check('seeded referrals: 2 invites, 1 activated, 1 conversion, 60 reward days', top?.invites === 2 && top?.activated === 1 && top?.conversions === 1 && top?.rewardsEarned === 60, JSON.stringify(top));

  const ret = await get('retention');
  check('staff can read retention', ret.status === 200);
  const cohort = (ret.body?.cohorts || []).find((c) => c.size === 5);
  check('seeded retention: week 0 is 3 of 5', cohort?.cells?.[0]?.active === 3 && cohort?.cells?.[0]?.rate === 0.6, JSON.stringify(cohort?.cells?.slice(0, 3)));
  check('seeded retention: week 1 is 1 of 5', cohort?.cells?.[1]?.rate === 0.2);
  check('seeded retention: the current week has no rate yet', cohort?.cells?.[2]?.rate === null);

  const leads = await get('leads/summary');
  check('staff can read the leads summary', leads.status === 200);
  check('seeded leads: 3 leads, 1 became an account', leads.body?.total === 3 && leads.body?.signups === 1, JSON.stringify(leads.body && { total: leads.body.total, signups: leads.body.signups }));
  check('seeded leads: one bucket per day of the range', leads.body?.perDay?.length === 29);

  // Nothing any endpoint returns may carry a real address.
  const everything = [funnel, acq, refs, ret, leads].map((r) => r.text).join('\n');
  check(
    'no full email appears in any analytics response',
    !/[a-z0-9._-]+@[a-z0-9-]+\.[a-z]/i.test(everything.replace(/[a-z0-9]\*\*\*@[a-z0-9]\*\*\*/gi, '')),
    everything.match(/[^"]*@[^"]*/)?.[0]
  );
  check('the referrer email is not in the response', !everything.includes('dana.cohen'));
}

(async () => {
  let code = 1;
  try {
    unit();
  } catch (error) {
    failed++;
    console.error('unit part crashed:', error && error.stack);
  }

  const port = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers', 'analytics-server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'analytics-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));

  try {
    if (!(await waitForServer())) {
      failed++;
      console.error('server did not start:\n' + log.join(''));
    } else {
      await endpoints();
    }
  } catch (error) {
    failed++;
    console.error('suite crashed:', error && error.stack);
  } finally {
    server.kill();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  code = failed === 0 ? 0 : 1;
  process.exit(code);
})();
