/**
 * The landing page's back end: public plans, lead capture, and the staff-only
 * list of who left an email.
 *
 * Most of these cases are about refusing — an address with no consent, a
 * stranger asking for the list, a bot filling the hidden field, a visitor
 * submitting the form over and over.
 *
 *   node tests/marketing.test.js
 *
 * Runs against tests/helpers/staff-server.js, the real app plus the test-only
 * way of granting staff rights that the product itself does not have.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const RATE_LIMIT = 12;

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

async function run() {
  let submissions = 0;
  const submit = (body) => {
    submissions++;
    return call('POST', '/api/marketing/leads', { body });
  };

  // ── plans ─────────────────────────────────────────────────────────────────
  const plans = await call('GET', '/api/marketing/plans');
  check('plans are public', plans.status === 200, `got ${plans.status}`);
  const ids = (plans.body?.plans || []).map((p) => p.id).sort().join(',');
  check(
    'plans are the catalog checkout sells',
    ids === 'app_m,app_y,chef_addon,coaching_3m,combo_3m,plan_once',
    `got ${ids}`
  );
  check(
    'a plan with no configured price has no price, not zero',
    (plans.body?.plans || []).every((p) => p.amount === null),
    'the landing page must not advertise a price nobody set'
  );
  check(
    'a price comes only from its PLAN_PRICE_* variable',
    (plans.body?.plans || []).find((p) => p.id === 'app_m')?.amount === null,
    'PLAN_PRICE_APP_M is unset in this suite'
  );
  check(
    'each plan carries a bilingual name, a period and what it includes',
    (plans.body?.plans || []).every(
      (p) => p.name?.he && p.name?.en && typeof p.period === 'string' && Array.isArray(p.includes) && p.includes.length > 0
    ),
    JSON.stringify(plans.body?.plans?.[0])
  );
  check(
    'checkout is reported off by default',
    plans.body?.checkout?.enabled === false,
    JSON.stringify(plans.body?.checkout)
  );

  // ── capture ───────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const email = `Lead-${stamp}@Example.com`;
  const first = await submit({
    email: `  ${email}  `,
    name: 'דנה',
    consent: true,
    lang: 'he',
    source: 'landing-hero',
    utm_source: 'instagram',
    utm_campaign: 'launch'
  });
  check('a lead with consent is accepted', first.status === 201, `got ${first.status} ${first.text}`);

  const noConsent = await submit({ email: `other-${stamp}@example.com`, consent: false });
  check('a lead without consent is refused', noConsent.status === 400, `got ${noConsent.status}`);
  const missingConsent = await submit({ email: `other-${stamp}@example.com` });
  check('a missing consent box is a refusal too', missingConsent.status === 400);
  const badEmail = await submit({ email: 'not-an-email', consent: true });
  check('an invalid address is refused', badEmail.status === 400);

  const repeat = await submit({
    email: email.toUpperCase(),
    consent: true,
    utm_source: 'google',
    utm_campaign: 'retarget'
  });
  check(
    'a repeat looks exactly like a first submission',
    repeat.status === first.status && repeat.text === first.text,
    'the form must not reveal who is already on the list'
  );

  const bot = await submit({
    email: `bot-${stamp}@example.com`,
    consent: true,
    website: 'http://spam.example'
  });
  check('the honeypot is answered like a success', bot.status === 201);

  // ── the list ──────────────────────────────────────────────────────────────
  check(
    'an anonymous caller cannot read leads',
    (await call('GET', '/api/marketing/leads')).status === 401
  );

  const stranger = await call('POST', '/api/auth/signup', {
    body: { email: `stranger-${stamp}@example.com`, password: 'a long enough one' }
  });
  const strangerToken = stranger.body?.token;
  check('a stranger account exists', !!strangerToken);
  const asStranger = await call('GET', '/api/marketing/leads', { token: strangerToken });
  check(
    'a signed-in stranger gets the same 404 as an unknown route',
    asStranger.status === 404 && !asStranger.text.includes(email.toLowerCase())
  );

  const staff = await call('POST', '/api/auth/signup', {
    body: { email: `staff-${stamp}@example.com`, password: 'a long enough one' }
  });
  const staffToken = staff.body?.token;
  const granted = await call('POST', '/api/test-only/grant-staff', { token: staffToken, body: {} });
  check('the harness can grant staff', granted.status === 200, `got ${granted.status}`);

  const list = await call('GET', '/api/marketing/leads', { token: staffToken });
  check('staff can read leads', list.status === 200, `got ${list.status}`);

  const leads = list.body?.leads || [];
  const mine = leads.filter((l) => l.email === email.toLowerCase());
  check('the address is stored trimmed and lower-cased', mine.length === 1, JSON.stringify(leads.map((l) => l.email)));
  check('two submissions of one address make one row', mine.length === 1 && mine[0].submissions === 2);
  check(
    'the first visit keeps its attribution',
    mine[0]?.utm_source === 'instagram' && mine[0]?.utm_campaign === 'launch' && mine[0]?.source === 'landing-hero',
    JSON.stringify(mine[0])
  );
  check('the name and language are kept', mine[0]?.name === 'דנה' && mine[0]?.lang === 'he');
  check('the moment of consent is recorded', !!mine[0]?.consent_at);
  check(
    'the honeypot submission was not stored',
    !leads.some((l) => l.email === `bot-${stamp}@example.com`)
  );
  check(
    'refused submissions were not stored',
    !leads.some((l) => l.email === `other-${stamp}@example.com`)
  );

  // A formula-looking name must reach a spreadsheet as text.
  await submit({ email: `formula-${stamp}@example.com`, name: '=HYPERLINK("x")', consent: true });

  const csv = await call('GET', '/api/marketing/leads?format=csv', { token: staffToken });
  check('staff can export CSV', csv.status === 200, `got ${csv.status}`);
  check('the export is served as CSV', (csv.headers.get('content-type') || '').includes('text/csv'));
  check('the export downloads as a file', (csv.headers.get('content-disposition') || '').includes('attachment'));
  const lines = csv.text.replace(/^﻿/, '').trim().split(/\r\n/);
  check('the CSV starts with its header row', lines[0]?.startsWith('id,email,name'), lines[0]);
  check('the CSV holds the lead', csv.text.includes(email.toLowerCase()));
  check(
    'a formula in a visitor-typed field is neutralised',
    csv.text.includes(`"'=HYPERLINK(""x"")"`),
    lines.find((l) => l.includes('formula-'))
  );
  check(
    'a stranger cannot export either',
    (await call('GET', '/api/marketing/leads?format=csv', { token: strangerToken })).status === 404
  );

  // ── rate limit (last: it uses up this IP's budget) ────────────────────────
  let limited = null;
  for (let i = submissions; i <= RATE_LIMIT + 1; i++) {
    const r = await submit({ email: `flood-${i}-${stamp}@example.com`, consent: true });
    if (r.status === 429) {
      limited = i;
      break;
    }
  }
  check(
    'repeated submissions from one address are rate-limited',
    limited !== null && limited <= RATE_LIMIT + 1,
    `no 429 after ${submissions} submissions`
  );
}

(async () => {
  const port = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, [path.join(__dirname, 'helpers', 'staff-server.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'marketing-test-secret',
      LEAD_RATE_LIMIT_MAX: String(RATE_LIMIT),
      // A legacy price must not leak into the catalog.
      PLAN_BASE_AMOUNT: '150',
      PLAN_YONI_AMOUNT: '250',
      PLAN_PRICE_APP_M: '',
      PLAN_PRICE_APP_Y: '',
      PLAN_PRICE_CHEF_ADDON: '',
      PLAN_PRICE_COACHING_3M: '',
      PLAN_PRICE_COMBO_3M: '',
      PLAN_PRICE_PLAN_ONCE: '',
      CHECKOUT_ENABLED: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));

  let code = 1;
  try {
    if (!(await waitForServer())) {
      console.error('server did not start:\n' + log.join(''));
    } else {
      console.log('\nmarketing: plans and lead capture\n');
      await run();
      console.log(`\n${passed} passed, ${failed} failed\n`);
      code = failed === 0 ? 0 : 1;
    }
  } catch (error) {
    console.error('suite crashed:', error && error.message);
  } finally {
    server.kill();
  }
  process.exit(code);
})();
