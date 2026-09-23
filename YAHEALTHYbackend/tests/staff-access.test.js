/**
 * Who may read other people's messages, and when a subscription stops.
 *
 * Both of these were live defects. `/api/whatsapp/pending` checked only that
 * the caller was signed in, while signup is open and unverified — so any
 * stranger could read every inbound message, including the ones flagged
 * because somebody disclosed a pregnancy or an eating disorder. And
 * getActiveSubscriptions tested status alone, so a subscription with an end
 * date in the past still granted access.
 *
 *   node tests/staff-access.test.js
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

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
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
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
  // ── an ordinary account ───────────────────────────────────────────────────
  const stranger = await call('POST', '/api/auth/signup', {
    body: { email: `stranger-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const strangerToken = stranger.body?.token;
  check('anyone can still sign up', stranger.status === 201, 'signup is open, which is why authorisation matters');

  check(
    'an anonymous caller cannot read inbound messages',
    (await call('GET', '/api/whatsapp/pending')).status === 401
  );

  const asStranger = await call('GET', '/api/whatsapp/pending', { token: strangerToken });
  check(
    'a signed-in stranger cannot read inbound messages',
    asStranger.status === 404,
    `got ${asStranger.status} — before this fix it was 200, with every health-flagged message in it`
  );
  check(
    'and the refusal reveals nothing about the route existing',
    asStranger.status === 404,
    'a signed-in prober should not learn which staff endpoints are real'
  );
  check(
    'no message content leaks in the refusal',
    !JSON.stringify(asStranger.body || {}).includes('בהריון')
  );

  check(
    'escalated messages are no more reachable than pending ones',
    (await call('GET', '/api/whatsapp/pending?status=escalated', { token: strangerToken })).status === 404,
    'these are by definition the most sensitive messages in the system'
  );

  // ── staff ─────────────────────────────────────────────────────────────────
  const staff = await call('POST', '/api/auth/signup', {
    body: { email: `staff-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const staffToken = staff.body?.token;

  // Granted the way it is granted in production: directly, with no endpoint
  // that hands out staff rights.
  const granted = await call('POST', '/api/test-only/grant-staff', {
    token: staffToken,
    body: {}
  });
  check('the test harness can mark an account as staff', granted.status === 200, `got ${granted.status}`);

  const asStaff = await call('GET', '/api/whatsapp/pending', { token: staffToken });
  check('staff can read inbound messages', asStaff.status === 200, `got ${asStaff.status}`);

  const message = asStaff.body?.messages?.[0];
  check('there is a message to inspect', !!message, JSON.stringify(asStaff.body).slice(0, 120));
  check(
    'the raw WHAPI payload is never returned',
    message && !('raw' in message),
    `keys: ${JSON.stringify(Object.keys(message || {}))}`
  );
  check(
    'the fields a person answering actually needs are present',
    message && 'body' in message && 'from_number' in message && 'status' in message
  );

  check(
    'an unknown status is refused rather than passed to the database',
    (await call('GET', '/api/whatsapp/pending?status=nonsense', { token: staffToken })).status === 400
  );
  check(
    'a valid status works',
    (await call('GET', '/api/whatsapp/pending?status=escalated', { token: staffToken })).status === 200
  );

  // ── subscriptions that have ended ─────────────────────────────────────────
  const expiry = await call('GET', '/api/test-only/subscription-check', { token: staffToken });
  check('an open-ended subscription counts as active', expiry.body?.openEnded === 1, JSON.stringify(expiry.body));
  check(
    'a subscription whose end date has passed does not',
    expiry.body?.afterExpiry === 0,
    'status alone used to be the whole test, so an ended plan granted access forever'
  );
  check(
    'a subscription ending in the future still does',
    expiry.body?.futureEnd === 1
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
      JWT_SECRET: 'staff-access-test-secret'
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
      console.log('\nstaff access and subscription expiry\n');
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
