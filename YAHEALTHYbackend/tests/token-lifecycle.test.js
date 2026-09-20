/**
 * Token lifecycle — the first automated tests in this repository.
 *
 * They exist because the fix they cover is invisible from the outside: a token
 * that should have stopped working keeps returning 200 and nothing looks wrong.
 * Every case below asserts that the server FAILS CLOSED — refuses a token it
 * can no longer vouch for, rather than honouring a valid signature.
 *
 * No test framework on purpose. There is no runner in this project yet, and a
 * dependency is a poor reason to postpone the first test.
 *
 *   node tests/token-lifecycle.test.js
 *
 * Runs against the in-memory store on a throwaway port, so it never touches
 * the real Supabase project and leaves nothing behind.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

/**
 * Ask the OS for a free port instead of hard-coding one. A fixed port is worse
 * than inconvenient here: a leftover dev server still holding it answers the
 * health check, our own spawn quietly loses the bind, and the whole suite then
 * tests whatever stale build that process is running. Which is exactly what
 * happened the first time these tests were run.
 */
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

let PORT;
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
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* some responses carry no body */
  }
  return { status: res.status, body: json };
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function run() {
  const email = `token-test-${Date.now()}@example.com`;
  const password = 'correct horse battery';

  // ── a token is good until something revokes it ────────────────────────────
  const signup = await call('POST', '/api/auth/signup', { body: { email, password } });
  check('signup returns a token', signup.status === 201 && !!signup.body?.token, `status ${signup.status}`);
  const firstToken = signup.body?.token;

  const me = await call('GET', '/api/auth/me', { token: firstToken });
  check('fresh token is accepted', me.status === 200, `status ${me.status}`);

  // ── missing and malformed credentials ─────────────────────────────────────
  check('no token is refused', (await call('GET', '/api/auth/me')).status === 401);
  check(
    'malformed token is refused',
    (await call('GET', '/api/auth/me', { token: 'not.a.jwt' })).status === 401
  );
  check(
    'token signed with another key is refused',
    (await call('GET', '/api/auth/me', {
      // header/payload/signature that parse fine but were never signed by us
      token:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhdHRhY2tlciIsInR2IjowLCJ0eXAiOiJhY2Nlc3MifQ.' +
        'ZmFrZXNpZ25hdHVyZQ'
    })).status === 401
  );

  // ── logout actually ends the session on the server ────────────────────────
  const loggedOut = await call('POST', '/api/auth/logout', { token: firstToken });
  check('logout succeeds', loggedOut.status === 200, `status ${loggedOut.status}`);

  const afterLogout = await call('GET', '/api/auth/me', { token: firstToken });
  check('token is refused after logout', afterLogout.status === 401, `status ${afterLogout.status}`);

  const secondLogout = await call('POST', '/api/auth/logout', { token: firstToken });
  check('a revoked token cannot log out again', secondLogout.status === 401, `status ${secondLogout.status}`);

  // ── logging back in issues a working token ────────────────────────────────
  const login = await call('POST', '/api/auth/login', { body: { email, password } });
  check('login after logout works', login.status === 200 && !!login.body?.token, `status ${login.status}`);
  const secondToken = login.body?.token;
  check(
    'token from that login is accepted',
    (await call('GET', '/api/auth/me', { token: secondToken })).status === 200
  );

  // ── changing a password cuts the old sessions, keeps this caller signed in ─
  const newPassword = 'a different long passphrase';
  const changed = await call('POST', '/api/auth/change-password', {
    token: secondToken,
    body: { oldPassword: password, newPassword }
  });
  check('change-password succeeds', changed.status === 200, `status ${changed.status}`);
  check('change-password returns a replacement token', !!changed.body?.token);
  check(
    'the pre-change token is refused',
    (await call('GET', '/api/auth/me', { token: secondToken })).status === 401
  );
  check(
    'the replacement token is accepted',
    (await call('GET', '/api/auth/me', { token: changed.body?.token })).status === 200
  );

  // ── password reset: single use, and it cuts every earlier session ──────────
  const liveToken = changed.body?.token;
  const requested = await call('POST', '/api/auth/request-password-reset', { body: { email } });
  const resetToken = requested.body?.resetToken;
  check('reset request returns a token outside production', !!resetToken);

  check(
    'a reset token is not accepted as an access token',
    (await call('GET', '/api/auth/me', { token: resetToken })).status === 401,
    'a reset token used as a session would be a full account takeover'
  );

  const reset = await call('POST', '/api/auth/reset-password', {
    body: { token: resetToken, newPassword: 'third passphrase entirely' }
  });
  check('reset-password succeeds', reset.status === 200, `status ${reset.status}`);

  check(
    'sessions from before the reset are refused',
    (await call('GET', '/api/auth/me', { token: liveToken })).status === 401,
    'this is the whole point of resetting a password'
  );

  const replay = await call('POST', '/api/auth/reset-password', {
    body: { token: resetToken, newPassword: 'attacker chosen password' }
  });
  check('the same reset token cannot be used twice', replay.status === 400, `status ${replay.status}`);

  const finalLogin = await call('POST', '/api/auth/login', {
    body: { email, password: 'third passphrase entirely' }
  });
  check('the password set by the reset is the live one', finalLogin.status === 200);
  check(
    'the password the replay tried to set was never applied',
    (await call('POST', '/api/auth/login', { body: { email, password: 'attacker chosen password' } })).status === 401
  );
}

(async () => {
  PORT = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${PORT}`;

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      // Run against memory, never the real project: these tests create users.
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'token-lifecycle-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const serverLog = [];
  server.stdout.on('data', (d) => serverLog.push(String(d)));
  server.stderr.on('data', (d) => serverLog.push(String(d)));

  let code = 1;
  try {
    if (!(await waitForServer())) {
      console.error('server did not start:\n' + serverLog.join(''));
    } else if (serverLog.join('').includes('EADDRINUSE')) {
      // Something else answered the health check. Refuse to report on it.
      console.error(`port ${PORT} is already in use — aborting rather than testing another process`);
    } else {
      console.log('\ntoken lifecycle\n');
      await run();
      console.log(`\n${passed} passed, ${failed} failed\n`);
      code = failed === 0 ? 0 : 1;
    }
  } catch (error) {
    console.error('\nsuite crashed:', error && error.message);
  } finally {
    // Kill before exiting, not in a finally around process.exit — that call
    // ends the process immediately and would leave this server running.
    server.kill();
  }
  process.exit(code);
})();
