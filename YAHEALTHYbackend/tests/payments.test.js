/**
 * Payments.
 *
 * The callback endpoint is the one place where an outside party can create an
 * account and grant a paid plan, so most of this file is about refusing. The
 * rest walks the journey a customer actually takes: pay, get a link, choose a
 * password, sign in, and end up holding exactly one subscription.
 *
 *   node tests/payments.test.js
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const path = require('path');

const SECRET = 'payplus-test-secret';

let BASE;
let passed = 0;
let failed = 0;
const serverLog = [];

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
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
}

/** A callback exactly as PayPlus would send it, signed with the account secret. */
async function sendCallback(payload, { hash, userAgent = 'PayPlus' } = {}) {
  const raw = JSON.stringify(payload);
  const signature =
    hash !== undefined ? hash : crypto.createHmac('sha256', SECRET).update(raw).digest('base64');

  const headers = { 'Content-Type': 'application/json' };
  if (signature !== null) headers.hash = signature;
  if (userAgent) headers['user-agent'] = userAgent;

  const res = await fetch(BASE + '/api/payments/callback', { method: 'POST', headers, body: raw });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
}

function transaction({ uid, plan = 'yoni', email, statusCode = '000' }) {
  return {
    transaction_type: 'Charge',
    transaction: {
      uid,
      payment_request_uid: uid,
      status_code: statusCode,
      amount: 499,
      currency: 'ILS',
      more_info: plan,
      more_info_2: email
    },
    data: { customer_uid: 'cust_1' }
  };
}

function welcomeLinkToken() {
  const matches = serverLog.join('').match(/reset-password\?token=([^\s&"]+)/g) || [];
  if (!matches.length) return null;
  return decodeURIComponent(matches[matches.length - 1].split('token=')[1]);
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
  const email = `buyer-${Date.now()}@example.com`;
  const uid = `pay_${Date.now()}`;

  // ── the callback refuses anything it cannot verify ────────────────────────
  check(
    'a callback with no signature is refused',
    (await sendCallback(transaction({ uid, email }), { hash: null })).status === 401,
    'without this the endpoint is a public mark-as-paid button'
  );
  check(
    'a callback with a wrong signature is refused',
    (await sendCallback(transaction({ uid, email }), { hash: 'bm90LWl0' })).status === 401
  );
  check(
    'a signature over different content is refused',
    (await sendCallback(transaction({ uid, email }), {
      hash: crypto.createHmac('sha256', SECRET).update('{"transaction":{}}').digest('base64')
    })).status === 401,
    'the signature has to cover the body that arrived, not just be well formed'
  );
  check(
    'a callback signed with the wrong key is refused',
    (await sendCallback(transaction({ uid, email }), {
      hash: crypto
        .createHmac('sha256', 'not-the-secret')
        .update(JSON.stringify(transaction({ uid, email })))
        .digest('base64')
    })).status === 401
  );

  // Nothing above should have created anything.
  check(
    'no account exists after the refused callbacks',
    (await call('POST', '/api/auth/login', { body: { email, password: 'anything at all' } })).status === 401
  );

  // ── a real one ────────────────────────────────────────────────────────────
  const accepted = await sendCallback(transaction({ uid, email }));
  check('a correctly signed callback is accepted', accepted.status === 200, `status ${accepted.status}`);

  const replay = await sendCallback(transaction({ uid, email }));
  check(
    'the same callback delivered twice changes nothing',
    replay.status === 200 && replay.body?.duplicate === true,
    'PayPlus retries, and a retry must not sell a second subscription'
  );

  // ── the customer's journey: link, password, sign in ───────────────────────
  await new Promise((r) => setTimeout(r, 300));
  const setupToken = welcomeLinkToken();
  check('a set-password link was mailed', !!setupToken);

  const password = 'the one they chose';
  const setPassword = await call('POST', '/api/auth/reset-password', {
    body: { token: setupToken, newPassword: password }
  });
  check('the link sets a password', setPassword.status === 200, `status ${setPassword.status}`);

  const login = await call('POST', '/api/auth/login', { body: { email, password } });
  check('the customer can sign in', login.status === 200, `status ${login.status}`);
  const token = login.body?.token;

  const plans = await call('GET', '/api/payments/my-plans', { token });
  check(
    'exactly one subscription, not two — the legacy "yoni" id lands as combo_3m',
    plans.body?.plans?.length === 1 && plans.body.plans[0].plan === 'combo_3m',
    JSON.stringify(plans.body)
  );
  const firstEnd = plans.body?.plans?.[0]?.endsAt;
  const months = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / (30.44 * 24 * 3600 * 1000));
  check(
    'the callback sets ends_at from the plan period (3 months for combo_3m)',
    !!firstEnd && months(new Date().toISOString(), firstEnd) === 3,
    String(firstEnd)
  );

  // ── a renewal paid while the period runs extends it from its end ──────────
  await sendCallback(transaction({ uid: `${uid}_renew`, email, plan: 'combo_3m' }));
  const renewed = await call('GET', '/api/payments/my-plans', { token });
  check(
    'paying again extends the running period instead of opening a second one',
    renewed.body?.plans?.length === 1 && months(firstEnd, renewed.body.plans[0].endsAt) === 3,
    JSON.stringify(renewed.body)
  );

  // ── other periods ─────────────────────────────────────────────────────────
  await sendCallback(transaction({ uid: `${uid}_app`, email, plan: 'app_m' }));
  await sendCallback(transaction({ uid: `${uid}_once`, email, plan: 'plan_once' }));
  await sendCallback(transaction({ uid: `${uid}_legacy`, email, plan: 'base' }));
  const all = (await call('GET', '/api/payments/my-plans', { token })).body?.plans || [];
  const byId = Object.fromEntries(all.map((p) => [p.plan, p]));
  check('a monthly plan ends a month out', !!byId.app_m && months(new Date().toISOString(), byId.app_m.endsAt) === 1, JSON.stringify(byId.app_m));
  check('a one-time plan has no end date', !!byId.plan_once && byId.plan_once.endsAt === null, JSON.stringify(byId.plan_once));
  check('the legacy "base" id maps to coaching_3m', !!byId.coaching_3m, JSON.stringify(all.map((p) => p.plan)));

  const ent = await call('GET', '/api/entitlements/me', { token });
  check(
    'what was bought shows up as entitlements',
    ['premium', 'coach_insights', 'meal_planner', 'chef_whatsapp', 'human_coaching'].every((k) => ent.body?.entitlements?.includes(k)),
    JSON.stringify(ent.body)
  );
  check('entitlements are not enforced by default', ent.body?.enforced === false);

  const unknown = await sendCallback(transaction({ uid: `${uid}_unknown`, email, plan: 'platinum' }));
  check('an approved payment for an unknown plan grants nothing and asks for attention', unknown.body?.needsAttention === true);

  // ── a declined payment buys nothing ───────────────────────────────────────
  const declinedEmail = `declined-${Date.now()}@example.com`;
  const declined = await sendCallback(
    transaction({ uid: `pay_declined_${Date.now()}`, email: declinedEmail, statusCode: '999' })
  );
  check('a declined transaction is accepted and recorded', declined.status === 200);
  check(
    'a declined transaction creates no account',
    (await call('POST', '/api/auth/login', { body: { email: declinedEmail, password: 'anything at all' } })).status === 401
  );

  // ── checkout validates the request, then the server ───────────────────────
  const checkout = await call('POST', '/api/payments/checkout', {
    body: { email: 'someone@example.com', plan: 'yoni', phone: '0501234567' }
  });
  check(
    'checkout refuses while it is switched off (the default)',
    checkout.status === 503 && checkout.body?.code === 'checkout_disabled' && checkout.body?.reason === 'disabled',
    JSON.stringify(checkout.body)
  );
  check(
    'the refusal carries a bilingual "talk to us" message',
    typeof checkout.body?.message?.he === 'string' && typeof checkout.body?.message?.en === 'string'
  );

  const status = await call('GET', '/api/payments/status');
  check(
    'status says checkout is off, and why, without naming variables',
    status.status === 200 && status.body?.checkoutEnabled === false && status.body?.reason === 'disabled' &&
      !JSON.stringify(status.body).includes('CHECKOUT_ENABLED'),
    JSON.stringify(status.body)
  );
  check(
    'checkout rejects an unknown plan',
    (await call('POST', '/api/payments/checkout', {
      body: { email: 'someone@example.com', plan: 'platinum', phone: '0501234567' }
    })).status === 400
  );

  // The phone number is not a nicety: it is the only thing that will connect
  // this payment to the person who later messages WhatsApp.
  check(
    'checkout refuses without a phone number',
    (await call('POST', '/api/payments/checkout', {
      body: { email: 'someone@example.com', plan: 'yoni' }
    })).status === 400,
    'paying and then not being recognised is the worst outcome for a customer'
  );
  check(
    'checkout refuses a phone number it cannot read',
    (await call('POST', '/api/payments/checkout', {
      body: { email: 'someone@example.com', plan: 'yoni', phone: '021234567' }
    })).status === 400,
    'a landline cannot message on WhatsApp'
  );
  check(
    'a phone number in any written form is accepted',
    (await call('POST', '/api/payments/checkout', {
      body: { email: 'someone@example.com', plan: 'yoni', phone: '+972 50-123-4567' }
    })).status === 503,
    'it should reach the unconfigured-PayPlus refusal, not fail validation'
  );

}

(async () => {
  const port = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'payments-test-secret',
      PAYPLUS_SECRET_KEY: SECRET,
      // API key and page uid deliberately unset: checkout must refuse rather
      // than half-work.
      PAYPLUS_API_KEY: '',
      PAYPLUS_PAYMENT_PAGE_UID: '',
      // The defaults under test: charging off, nothing gated.
      CHECKOUT_ENABLED: '',
      CANCELLATION_POLICY_URL: '',
      ENTITLEMENTS_ENFORCED: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (d) => serverLog.push(String(d)));
  server.stderr.on('data', (d) => serverLog.push(String(d)));

  let code = 1;
  try {
    if (!(await waitForServer())) {
      console.error('server did not start:\n' + serverLog.join(''));
    } else if (serverLog.join('').includes('EADDRINUSE')) {
      console.error(`port ${port} is already in use — aborting rather than testing another process`);
    } else {
      console.log('\npayments\n');
      await run();
      console.log(`\n${passed} passed, ${failed} failed\n`);
      code = failed === 0 ? 0 : 1;
    }
  } catch (error) {
    console.error('\nsuite crashed:', error && error.message);
  } finally {
    server.kill();
  }
  process.exit(code);
})();
