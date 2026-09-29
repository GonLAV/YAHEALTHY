/**
 * Observability: structured logs, redaction, access log, error handler,
 * Sentry-compatible reporting, job registry, /api/admin/health and
 * POST /api/client-errors.
 *
 *   node tests/observability.test.js
 *
 * Part 1 runs in-process against the modules. Part 2 boots the real app
 * (tests/helpers/staff-server.js, memory store) with JSON logs at info level
 * and reads what it actually wrote to stdout/stderr.
 */

const assert = require('assert');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const express = require('express');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${err && err.message}`);
  }
}

const logger = require('../utils/logger');
const { redact, redactString, createLogger, setSink } = logger;
const { sanitizePath } = require('../middleware/accessLog');
const registry = require('../utils/health-registry');
const tracker = require('../utils/error-tracker');

function captureLogs() {
  const lines = [];
  const restore = setSink((level, line, entry) => lines.push({ level, line, entry }));
  return { lines, restore };
}

async function unitTests() {
  console.log('\nobservability — units\n');

  await test('emails are masked, keeping only the first character and the domain', () => {
    const out = redactString('contact noam.cohen@example.co.il now');
    assert.ok(!out.includes('noam.cohen@'), out);
    assert.match(out, /n\*\*\*@example\.co\.il/);
  });

  await test('phone numbers keep only their last two digits', () => {
    for (const phone of ['+972-50-123-4567', '0501234567', '972501234567', '+1 415 555 0123']) {
      const out = redactString(`call ${phone} please`);
      assert.ok(!out.includes(phone), `${phone} leaked: ${out}`);
      assert.match(out, /\*\*\*\d\d please$/);
    }
  });

  await test('bearer tokens, JWTs, share paths and secret query params are removed', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl';
    const out = redactString(`Authorization: Bearer abc.def.ghi ${jwt} /s/Zx9TokenValue123/card.png ?token=sekret&x=1`);
    assert.ok(!out.includes('abc.def.ghi'), out);
    assert.ok(!out.includes(jwt), out);
    assert.ok(!out.includes('Zx9TokenValue123'), out);
    assert.ok(!out.includes('sekret'), out);
    assert.ok(out.includes('x=1'));
  });

  await test('secret-named keys are redacted at any depth; PII keys masked; other values kept', () => {
    const out = redact({
      headers: { authorization: 'Bearer x', Cookie: 'sid=1', 'x-api-key': 'k' },
      body: { password: 'hunter22', nested: { refresh_token: 't', email: 'dana@example.com', phone: '0501234567' } },
      SUPABASE_KEY: 'svc',
      count: 3,
      route: '/api/foo/:id'
    });
    assert.strictEqual(out.headers.authorization, '[REDACTED]');
    assert.strictEqual(out.headers.Cookie, '[REDACTED]');
    assert.strictEqual(out.headers['x-api-key'], '[REDACTED]');
    assert.strictEqual(out.body.password, '[REDACTED]');
    assert.strictEqual(out.body.nested.refresh_token, '[REDACTED]');
    assert.strictEqual(out.body.nested.email, 'd***@example.com');
    assert.strictEqual(out.body.nested.phone, '***67');
    assert.strictEqual(out.SUPABASE_KEY, '[REDACTED]');
    assert.strictEqual(out.count, 3);
    assert.strictEqual(out.route, '/api/foo/:id');
  });

  await test('errors serialise with redacted message and stack; cycles do not throw', () => {
    const err = new Error('lookup failed for dana@example.com');
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    const out = redact({ err, cyclic });
    assert.strictEqual(out.err.type, 'Error');
    assert.ok(!out.err.message.includes('dana@'));
    assert.ok(!out.err.stack.includes('dana@'));
    assert.strictEqual(out.cyclic.self, '[Circular]');
  });

  await test('JSON format: one parseable line with time, level, msg and child bindings', () => {
    const prevFormat = process.env.LOG_FORMAT;
    const prevLevel = process.env.LOG_LEVEL;
    process.env.LOG_FORMAT = 'json';
    process.env.LOG_LEVEL = 'info';
    const { lines, restore } = captureLogs();
    try {
      const child = createLogger({ component: 'x' }).child({ requestId: 'req-12345678' });
      child.debug('hidden at info');
      child.info('hello', { token: 'secret-token', n: 1 });
      assert.strictEqual(lines.length, 1, 'debug should be filtered at info');
      const parsed = JSON.parse(lines[0].line);
      assert.strictEqual(parsed.level, 'info');
      assert.strictEqual(parsed.msg, 'hello');
      assert.strictEqual(parsed.component, 'x');
      assert.strictEqual(parsed.requestId, 'req-12345678');
      assert.strictEqual(parsed.token, '[REDACTED]');
      assert.ok(!Number.isNaN(Date.parse(parsed.time)));
    } finally {
      restore();
      process.env.LOG_FORMAT = prevFormat === undefined ? '' : prevFormat;
      process.env.LOG_LEVEL = prevLevel === undefined ? '' : prevLevel;
    }
  });

  await test('pretty format is a single human line with key=value fields', () => {
    const prevFormat = process.env.LOG_FORMAT;
    process.env.LOG_FORMAT = 'pretty';
    const { lines, restore } = captureLogs();
    try {
      createLogger().warn('careful', { route: '/s/:token', status: 500 });
      assert.match(lines[0].line, /WARN\s+careful route=\/s\/:token status=500/);
    } finally {
      restore();
      process.env.LOG_FORMAT = prevFormat === undefined ? '' : prevFormat;
    }
  });

  await test('sanitizePath: tokens, ids, emails and query strings never survive', () => {
    assert.strictEqual(sanitizePath('/s/abc'), '/s/:token');
    assert.strictEqual(sanitizePath('/s/Ab3dEf9hIjKlMnOp/card.png'), '/s/:token/card.png');
    assert.strictEqual(sanitizePath('/api/share/c/Ab3dEf9hIjKlMnOpQr'), '/api/share/c/:token');
    assert.strictEqual(sanitizePath('/api/x/550e8400-e29b-41d4-a716-446655440000?email=a@b.com'), '/api/x/:id');
    assert.strictEqual(sanitizePath('/api/leads/dana%40example.com'), '/api/leads/:email');
    assert.strictEqual(sanitizePath('/api/foods/12345'), '/api/foods/:id');
    assert.strictEqual(sanitizePath('/signup'), '/signup');
    assert.strictEqual(sanitizePath('/sleep'), '/sleep');
  });

  await test('error handler answers with the request id and logs it (no PII)', async () => {
    const { requestContext } = require('../middleware/requestContext');
    const { accessLog } = require('../middleware/accessLog');
    const { errorHandler } = require('../utils/error-handler');
    registry.reset();
    const app = express();
    app.use(requestContext);
    app.use(accessLog);
    app.get('/boom/:token', () => {
      throw new Error('failed for dana@example.com');
    });
    app.use(errorHandler);
    const server = app.listen(0);
    const { lines, restore } = captureLogs();
    try {
      const port = server.address().port;
      const res = await fetch(`http://127.0.0.1:${port}/boom/SuperSecretToken12345?email=dana@example.com`);
      const body = await res.json();
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(res.status, 500);
      assert.ok(body.requestId, 'no requestId in the body');
      assert.strictEqual(body.requestId, res.headers.get('x-request-id'));
      const all = lines.map((l) => l.line).join('\n');
      assert.ok(all.includes(body.requestId), 'request id missing from the error log');
      assert.ok(!all.includes('dana@example.com'), 'email leaked into the log');
      assert.ok(!all.includes('SuperSecretToken12345'), 'token leaked into the log');
      const summary = registry.errors.summary();
      assert.strictEqual(summary.serverErrors, 1);
      assert.strictEqual(summary.routes[0].route, 'GET /boom/:token');

      const idRes = await fetch(`http://127.0.0.1:${port}/boom/x`, { headers: { 'X-Request-Id': 'upstream-id-0001' } });
      assert.strictEqual((await idRes.json()).requestId, 'upstream-id-0001', 'a well-formed upstream id is kept');
      const badId = await fetch(`http://127.0.0.1:${port}/boom/x`, { headers: { 'X-Request-Id': 'x"}{inject' } });
      assert.notStrictEqual((await badId.json()).requestId, 'x"}{inject', 'a malformed upstream id must be replaced');
    } finally {
      restore();
      server.close();
    }
  });

  await test('job registry records start/end, duration, counts and last error', () => {
    registry.reset();
    registry.jobs.register('demo', { schedule: '* * * * *', enabled: true });
    let t = 1000;
    const clock = () => t;
    const run = registry.jobs.start('demo', clock);
    t = 1250;
    run.finish({ sent: 3, failed: 1, skipped: 2 });
    run.fail(new Error('ignored: already finished'));
    let job = registry.jobs.list().find((j) => j.name === 'demo');
    assert.strictEqual(job.runs, 1);
    assert.strictEqual(job.lastDurationMs, 250);
    assert.deepStrictEqual(job.lastCounts, { sent: 3, failed: 1, skipped: 2 });
    assert.strictEqual(job.lastStatus, 'ok');
    assert.strictEqual(job.running, false);

    const second = registry.jobs.start('demo');
    second.fail(new Error('db down for dana@example.com'));
    job = registry.jobs.list().find((j) => j.name === 'demo');
    assert.strictEqual(job.lastStatus, 'error');
    assert.strictEqual(job.failures, 1);
    assert.ok(!job.lastError.message.includes('dana@'), 'last error must be redacted');
  });

  await test('Sentry reporting is off by default and sends a redacted envelope when SENTRY_DSN is set', async () => {
    delete process.env.SENTRY_DSN;
    tracker.reset();
    assert.strictEqual(tracker.isEnabled(), false);
    let calls = 0;
    const fakeFetch = async (url, init) => {
      calls++;
      fakeFetch.last = { url, init };
      return { ok: true, status: 200, headers: { get: () => null } };
    };
    assert.strictEqual(await tracker.captureException(new Error('x'), {}, { fetchImpl: fakeFetch }), false);
    assert.strictEqual(calls, 0, 'nothing may leave the server without a DSN');

    assert.deepStrictEqual(tracker.parseDsn('https://pub@o1.ingest.sentry.io/42'), {
      key: 'pub',
      projectId: '42',
      endpoint: 'https://o1.ingest.sentry.io/api/42/envelope/'
    });
    assert.strictEqual(tracker.parseDsn('not a dsn'), null);

    process.env.SENTRY_DSN = 'https://pubkey@sentry.example.test/7';
    tracker.reset();
    try {
      const ok = await tracker.captureException(new Error('failed for dana@example.com'), { requestId: 'req-abc12345', route: 'GET /s/:token' }, { fetchImpl: fakeFetch });
      assert.strictEqual(ok, true);
      assert.strictEqual(fakeFetch.last.url, 'https://sentry.example.test/api/7/envelope/');
      assert.match(fakeFetch.last.init.headers['X-Sentry-Auth'], /sentry_key=pubkey/);
      const [header, itemHeader, event] = fakeFetch.last.init.body.trim().split('\n').map((l) => JSON.parse(l));
      assert.strictEqual(header.event_id, event.event_id);
      assert.strictEqual(itemHeader.type, 'event');
      assert.strictEqual(event.tags.requestId, 'req-abc12345');
      assert.strictEqual(event.exception.values[0].type, 'Error');
      assert.ok(!fakeFetch.last.init.body.includes('dana@example.com'), 'email reached Sentry');
    } finally {
      delete process.env.SENTRY_DSN;
      tracker.reset();
    }
  });
}

// ─── Part 2: the real app ──────────────────────────────────────────────────

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

let BASE;
async function call(method, route, { token, body, raw, headers = {} } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
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

const CLIENT_LIMIT = 6;

async function appTests(log) {
  console.log('\nobservability — running app\n');
  const logText = () => log.join('');
  const jsonLines = () =>
    logText()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  const settle = () => new Promise((r) => setTimeout(r, 150));

  const strangerEmail = `obs-stranger-${Date.now()}@example.com`;
  const stranger = await call('POST', '/api/auth/signup', { body: { email: strangerEmail, password: 'a long enough one' } });
  const staffEmail = `obs-staff-${Date.now()}@example.com`;
  const staff = await call('POST', '/api/auth/signup', { body: { email: staffEmail, password: 'a long enough one' } });
  await call('POST', '/api/test-only/grant-staff', { token: staff.body?.token, body: {} });

  await test('health endpoint: anonymous callers get 401', async () => {
    assert.strictEqual((await call('GET', '/api/admin/health')).status, 401);
  });

  await test('health endpoint: signed-in non-staff get the same 404 as an unknown route', async () => {
    const res = await call('GET', '/api/admin/health', { token: stranger.body?.token });
    assert.strictEqual(res.status, 404);
    const unknown = await call('GET', '/api/admin/nope-nothing-here', { token: stranger.body?.token });
    assert.deepStrictEqual(Object.keys(res.body).sort(), Object.keys(unknown.body).sort());
    assert.strictEqual(res.body.error, 'NotFound');
  });

  // Make one share link, visit it, and send a request with an email in the URL.
  const link = await call('POST', '/api/share/weekly-card/link', { token: stranger.body?.token, body: { lang: 'en', tz: 'UTC' } });
  const shareToken = link.body?.token;
  await call('GET', `/s/${shareToken}`);
  await call('GET', `/s/${shareToken}/card.svg`);
  await call('GET', `/api/share/c/${shareToken}`);
  await call('GET', `/api/referrals/validate/NOPE?email=${encodeURIComponent('leak.me@example.com')}&token=${shareToken}`);

  await test('access log: one JSON line per request with method, route pattern, status, ms and request id', async () => {
    await settle();
    const lines = jsonLines().filter((l) => l.msg === 'request');
    assert.ok(lines.length >= 5, `only ${lines.length} access lines`);
    const sharePage = lines.find((l) => l.route === '/s/:token' && l.method === 'GET');
    assert.ok(sharePage, `no /s/:token line; routes: ${[...new Set(lines.map((l) => l.route))].join(', ')}`);
    assert.strictEqual(sharePage.status, 200);
    assert.strictEqual(typeof sharePage.durationMs, 'number');
    assert.ok(sharePage.requestId && sharePage.requestId.length >= 8);
    assert.ok(lines.some((l) => l.route === '/s/:token/card.svg'));
    assert.ok(lines.some((l) => l.route === '/api/share/c/:token'));
    assert.ok(lines.some((l) => l.route === '/api/referrals/validate/:code'));
  });

  await test('the log never contains a share token or an email address', async () => {
    assert.ok(shareToken && shareToken.length >= 8, 'share link was not created');
    const text = logText();
    assert.ok(!text.includes(shareToken), 'share token appeared in the log');
    for (const email of [strangerEmail, staffEmail, 'leak.me@example.com']) {
      assert.ok(!text.includes(email), `${email} appeared in the log`);
    }
  });

  await test('health endpoint: staff get uptime, version, db, config names, jobs and error counts', async () => {
    const res = await call('GET', '/api/admin/health', { token: staff.body?.token });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    const h = res.body;
    assert.ok(['ok', 'degraded'].includes(h.status));
    assert.strictEqual(typeof h.uptimeSeconds, 'number');
    assert.ok(h.version && typeof h.version.app === 'string' && 'commit' in h.version);
    assert.strictEqual(h.db.mode, 'memory');
    assert.strictEqual(h.db.ok, true);
    assert.strictEqual(typeof h.db.latencyMs, 'number');
    assert.ok(Array.isArray(h.config.disabledFeatures));
    assert.ok(h.config.disabledFeatures.every((f) => /^[a-z-]+$/.test(f)), 'feature names only');
    assert.ok(!JSON.stringify(h.config).includes('_'), 'no env variable names in the config summary');
    assert.strictEqual(h.errorTracking.enabled, false);
    const names = h.jobs.map((j) => j.name);
    assert.ok(names.includes('lifecycle') && names.includes('push-reminders'), names.join(','));
    assert.ok(h.jobs.every((j) => j.enabled === false && j.disabledReason), 'jobs are off under NODE_ENV=test');
    assert.strictEqual(typeof h.errors.windowMinutes, 'number');
    assert.ok(Array.isArray(h.errors.routes));
    assert.ok(!JSON.stringify(h).includes('@'), 'no email-shaped data in the health payload');
  });

  await test('a staff "run now" of the lifecycle job shows up in the job registry', async () => {
    await call('POST', '/api/marketing/campaigns/run?dryRun=false', { token: staff.body?.token, body: {} });
    const h = (await call('GET', '/api/admin/health', { token: staff.body?.token })).body;
    const job = h.jobs.find((j) => j.name === 'lifecycle');
    assert.ok(job.runs >= 1, JSON.stringify(job));
    assert.ok(job.lastStartedAt && job.lastFinishedAt);
    assert.strictEqual(typeof job.lastDurationMs, 'number');
    assert.ok(job.lastCounts && 'sent' in job.lastCounts && 'failed' in job.lastCounts && 'skipped' in job.lastCounts);
  });

  await test('error handler: a malformed JSON body gets a 400 carrying the request id', async () => {
    const res = await call('POST', '/api/auth/login', { raw: '{"email": nope' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body && res.body.requestId, JSON.stringify(res.body));
    assert.strictEqual(res.body.requestId, res.headers.get('x-request-id'));
  });

  await test('client errors: a valid report is accepted (204) and logged without PII', async () => {
    const res = await call('POST', '/api/client-errors', {
      body: {
        kind: 'error',
        message: 'TypeError: cannot read x of undefined (user dana.client@example.com, 050-123-4567)',
        stack: 'TypeError: boom\n    at render (https://app.example.com/assets/index-abc.js?v=1:1:200)',
        path: `/s/${shareToken}?utm_source=x`,
        source: 'https://app.example.com/assets/index-abc.js?token=zzz',
        line: 1,
        col: 200,
        lang: 'he'
      }
    });
    assert.strictEqual(res.status, 204);
    await settle();
    const entry = jsonLines().find((l) => l.msg === 'client error');
    assert.ok(entry, 'client error was not logged');
    assert.strictEqual(entry.level, 'warn');
    assert.strictEqual(entry.page, '/s/:token');
    assert.strictEqual(entry.source, '/assets/index-abc.js');
    const text = JSON.stringify(entry);
    assert.ok(!text.includes('dana.client@example.com'));
    assert.ok(!text.includes('050-123-4567'));
    assert.ok(!text.includes('zzz'));
  });

  await test('client errors: invalid reports are refused with 400', async () => {
    assert.strictEqual((await call('POST', '/api/client-errors', { body: { kind: 'nope', message: 'x' } })).status, 400);
    assert.strictEqual((await call('POST', '/api/client-errors', { body: { kind: 'error' } })).status, 400);
  });

  await test('client errors: bodies over 8 KB are refused with 413 before parsing', async () => {
    const res = await call('POST', '/api/client-errors', { raw: JSON.stringify({ kind: 'error', message: 'x'.repeat(9000) }) });
    assert.strictEqual(res.status, 413);
    assert.ok(res.body && res.body.requestId);
  });

  await test('client errors: sendBeacon-style text/plain bodies are accepted', async () => {
    const res = await call('POST', '/api/client-errors', {
      raw: JSON.stringify({ kind: 'unhandledrejection', message: 'rejected' }),
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
    assert.strictEqual(res.status, 204);
  });

  await test(`client errors: rate limited per IP (${CLIENT_LIMIT} per window, then 429)`, async () => {
    const statuses = [];
    for (let i = 0; i < CLIENT_LIMIT + 2; i++) {
      statuses.push((await call('POST', '/api/client-errors', { body: { kind: 'error', message: `n${i}` } })).status);
    }
    assert.ok(statuses.includes(429), statuses.join(','));
  });

  await test('client error count reaches the health endpoint', async () => {
    const h = (await call('GET', '/api/admin/health', { token: staff.body?.token })).body;
    assert.ok(h.errors.clientErrors >= 2, JSON.stringify(h.errors));
  });
}

(async () => {
  await unitTests();

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
      JWT_SECRET: 'observability-test-secret',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      SENTRY_DSN: '',
      SHARE_BASE_URL: 'https://app.example.test',
      CLIENT_ERROR_RATE_LIMIT_MAX: String(CLIENT_LIMIT)
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
      await appTests(log);
      code = failed === 0 ? 0 : 1;
    }
  } catch (error) {
    console.error('suite crashed:', error && error.stack);
  } finally {
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? code : 1);
})();
