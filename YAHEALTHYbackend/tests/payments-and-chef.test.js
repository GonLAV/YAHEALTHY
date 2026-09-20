/**
 * Payments and the chef track.
 *
 * The callback endpoint is the one place where an outside party can create an
 * account and grant a paid plan, so most of this file is about refusing. The
 * rest walks the journey a customer actually takes: pay, get a link, choose a
 * password, sign in, plan a week, then reach the chef.
 *
 *   node tests/payments-and-chef.test.js
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

function transaction({ uid, plan = 'chef', email, statusCode = '000' }) {
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
    'exactly one chef subscription, not two',
    plans.body?.plans?.length === 1 && plans.body.plans[0].plan === 'chef',
    JSON.stringify(plans.body)
  );

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

  // ── checkout refuses to run unconfigured ──────────────────────────────────
  const checkout = await call('POST', '/api/payments/checkout', {
    body: { email: 'someone@example.com', plan: 'chef' }
  });
  check(
    'checkout refuses while PayPlus is unconfigured',
    checkout.status === 503,
    'better a refusal than a payment page that cannot be honoured'
  );
  check(
    'checkout rejects an unknown plan',
    (await call('POST', '/api/payments/checkout', {
      body: { email: 'someone@example.com', plan: 'platinum' }
    })).status === 400
  );

  // ── the chef gates ────────────────────────────────────────────────────────
  const outsider = await call('POST', '/api/auth/signup', {
    body: { email: `outsider-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const outsiderToken = outsider.body?.token;

  const outsiderView = await call('GET', '/api/chef/availability', { token: outsiderToken });
  check('someone with no plan is not offered the chef', outsiderView.body?.canOffer === false);
  check(
    'and cannot request one',
    (await call('POST', '/api/chef/request', { token: outsiderToken })).status === 403,
    'the gate is the server, not the button'
  );

  const beforePlanning = await call('GET', '/api/chef/availability', { token });
  check(
    'a subscriber with no week planned is not offered the chef yet',
    beforePlanning.body?.subscribed === true && beforePlanning.body?.canOffer === false,
    'ADR-007: the chef comes after the week and the shopping list'
  );
  check(
    'and the request is refused until the week exists',
    (await call('POST', '/api/chef/request', { token })).status === 409
  );

  // Plan a week, which is the thing the gate is waiting for.
  await call('POST', '/api/meal-plans/generate', {
    token,
    body: { startDate: '2026-10-12', endDate: '2026-10-14' }
  });

  const afterPlanning = await call('GET', '/api/chef/availability', { token });
  check('now the chef can be offered', afterPlanning.body?.canOffer === true);

  const requested = await call('POST', '/api/chef/request', {
    token,
    body: { note: 'אשמח ללמוד לעבוד עם הוק' }
  });
  check('the request is recorded', requested.status === 201 && requested.body?.status === 'open');

  const again = await call('POST', '/api/chef/request', { token });
  check(
    'pressing twice does not queue a second conversation',
    again.status === 200 && again.body?.alreadyOpen === true
  );
  check(
    'availability reports the open request',
    (await call('GET', '/api/chef/availability', { token })).body?.alreadyRequested === true
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
      PAYPLUS_PAYMENT_PAGE_UID: ''
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
      console.log('\npayments and the chef track\n');
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
