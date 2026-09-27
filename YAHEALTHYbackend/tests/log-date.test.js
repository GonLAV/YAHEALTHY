/**
 * Log dates follow the user's calendar, not the server's UTC clock.
 *
 * Around local midnight in Israel (00:00–03:00) the UTC date is still
 * "yesterday". Logs saved then must land on the user's today, or the dashboard
 * reports today as unlogged. The first half checks resolveRequestDate; the
 * second boots the real server in memory mode and checks the endpoints that
 * used to default `date` to server UTC.
 *
 *   node tests/log-date.test.js
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { resolveRequestDate, isValidIsoDate } = require('../utils/log-date');
const { localDate } = require('../utils/engagement');

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

// 01:30 in Jerusalem on 2026-09-28 is still 2026-09-27 in UTC.
const AFTER_MIDNIGHT_IL = new Date('2026-09-27T22:30:00Z');

console.log('\nlog-date — resolveRequestDate\n');
check('an explicit date wins', resolveRequestDate({ date: '2026-01-05', tz: 'Asia/Jerusalem', now: AFTER_MIDNIGHT_IL }).date === '2026-01-05');
check('no date + tz → today in that zone', resolveRequestDate({ tz: 'Asia/Jerusalem', now: AFTER_MIDNIGHT_IL }).date === '2026-09-28');
check('no date, no tz → UTC fallback', resolveRequestDate({ now: AFTER_MIDNIGHT_IL }).date === '2026-09-27');
check('an unknown tz falls back to UTC', resolveRequestDate({ tz: 'Mars/Base', now: AFTER_MIDNIGHT_IL }).date === '2026-09-27');
check('empty date counts as omitted', resolveRequestDate({ date: '', tz: 'Asia/Jerusalem', now: AFTER_MIDNIGHT_IL }).date === '2026-09-28');
check('a malformed date is an error', !!resolveRequestDate({ date: '28/09/2026' }).error);
check('an impossible date is an error', !!resolveRequestDate({ date: '2026-02-30' }).error);
check('isValidIsoDate accepts a leap day', isValidIsoDate('2028-02-29') && !isValidIsoDate('2027-02-29'));

// ── the endpoints, end to end (memory store) ───────────────────────────────
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

// A zone whose calendar date differs from UTC right now, so the test proves
// the server used tz rather than its own clock whatever time it runs.
function zoneOffUtcToday() {
  const utc = localDate(new Date(), 'UTC');
  return ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find((z) => localDate(new Date(), z) !== utc);
}

async function runEndpoints(BASE) {
  const call = async (method, route, { token, body } = {}) => {
    const res = await fetch(BASE + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, body: json };
  };

  const signup = await call('POST', '/api/auth/signup', {
    body: { email: `log-date-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const token = signup.body?.token;
  check('an account exists to log with', !!token);

  const zone = zoneOffUtcToday();
  const zoneToday = localDate(new Date(), zone);
  const utcToday = localDate(new Date(), 'UTC');
  check('a zone off UTC today exists (+14 / -11 always straddle)', !!zone && zoneToday !== utcToday);

  const water = await call('POST', '/api/hydration-logs', { token, body: { litersConsumed: 0.5, tz: zone } });
  check('hydration without date uses the client tz', water.status === 201 && water.body?.date === zoneToday, JSON.stringify(water.body));

  const sleep = await call('POST', '/api/sleep-logs', { token, body: { sleepHours: 7, tz: zone } });
  check('sleep without date uses the client tz', sleep.status === 201 && sleep.body?.date === zoneToday, JSON.stringify(sleep.body));

  const explicit = await call('POST', '/api/hydration-logs', { token, body: { litersConsumed: 0.25, date: '2026-09-01', tz: zone } });
  check('an explicit date is stored as sent', explicit.body?.date === '2026-09-01');

  const bare = await call('POST', '/api/hydration-logs', { token, body: { litersConsumed: 0.25 } });
  check('no date and no tz still falls back to UTC', bare.body?.date === utcToday);

  const bad = await call('POST', '/api/sleep-logs', { token, body: { sleepHours: 7, date: 'yesterday' } });
  check('a malformed date is refused', bad.status === 400);

  const insights = await call('GET', `/api/insights/daily?tz=${encodeURIComponent(zone)}`, { token });
  check('daily insights accept tz', insights.status === 200, `status ${insights.status}`);
  check('daily insights refuse a malformed date', (await call('GET', '/api/insights/daily?date=nope', { token })).status === 400);

  const userId = signup.body?.id;
  const coach = await call('GET', `/api/crm/users/${userId}/insights?lang=en&tz=${encodeURIComponent(zone)}`, { token });
  check('coach insights accept tz', coach.status === 200, `status ${coach.status}`);
  const ask = await call('POST', `/api/crm/users/${userId}/ask?lang=he&tz=${encodeURIComponent(zone)}`, { token, body: { message: 'water?' } });
  check('coach ask accepts tz', ask.status === 200 && typeof ask.body?.response === 'string', `status ${ask.status}`);
  const overview = await call('GET', `/api/progress/overview?tz=${encodeURIComponent(zone)}`, { token });
  check('progress overview accepts tz', overview.status === 200, `status ${overview.status}`);
}

(async () => {
  const port = Number(process.env.TEST_PORT) || (await freePort());
  const BASE = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'log-date-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));

  let code = 1;
  try {
    const deadline = Date.now() + 20000;
    let up = false;
    while (!up && Date.now() < deadline) {
      try { up = (await fetch(BASE + '/api/health')).ok; } catch { /* not yet */ }
      if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    if (!up) {
      console.error('server did not start:\n' + log.join(''));
      failed++;
    } else {
      console.log('\nlog-date — endpoints\n');
      await runEndpoints(BASE);
    }
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.message);
  } finally {
    server.kill();
  }
  process.exit(code);
})();
