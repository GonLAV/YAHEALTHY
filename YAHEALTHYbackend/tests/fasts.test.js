/**
 * Fasting timer — /api/fasts.
 *
 * Covers the one-open-fast rule, ownership (another user's fast is a 404, not
 * a 403 that confirms it exists), the arithmetic on end (duration, completed),
 * validation of the times a client may send, stats, and deletion.
 *
 *   node tests/fasts.test.js
 *
 * Runs against the in-memory store on a port the OS hands out.
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

async function newUser(tag) {
  const signup = await call('POST', '/api/auth/signup', {
    body: { email: `${tag}-${Date.now()}@example.com`, password: 'a sufficiently long one' }
  });
  return signup.body?.token;
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

const HOUR = 3600 * 1000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

// computeStats is pure; the streak's day arithmetic is easiest to pin here.
function unitStats() {
  process.env.ALLOW_MEMORY_DB = 'true';
  const { computeStats } = require('../routes/fasts')._internal;
  const now = new Date('2026-09-30T10:00:00Z');
  const fast = (endedAt, hours, completed) => ({
    started_at: new Date(new Date(endedAt).getTime() - hours * HOUR).toISOString(),
    ended_at: endedAt,
    duration_hours: hours,
    target_hours: 16,
    completed
  });
  const stats = computeStats(
    [
      fast('2026-09-29T08:00:00Z', 16.5, true),
      fast('2026-09-28T08:00:00Z', 17, true),
      fast('2026-09-26T08:00:00Z', 20, true), // gap on the 27th breaks the streak
      fast('2026-09-25T08:00:00Z', 10, false),
      fast('2026-07-01T08:00:00Z', 30, true) // outside the 30-day average
    ],
    now,
    0
  );
  check('stats: streak counts back from yesterday when today is still open', stats.currentStreakDays === 2, JSON.stringify(stats));
  check('stats: totalCompleted', stats.totalCompleted === 4);
  check('stats: longest is all-time', stats.longestHours === 30);
  check('stats: average covers the last 30 days only', stats.averageHours === 15.88, `got ${stats.averageHours}`);

  // 22:30 UTC on the 29th is already the 30th in Israel (UTC+3, offset -180).
  const tz = computeStats([fast('2026-09-29T22:30:00Z', 16, true)], now, -180);
  check('stats: days are bucketed in the caller\'s time zone', tz.currentStreakDays === 1);
  // DST: New York leaves EDT (UTC-4) for EST (UTC-5) on 2026-11-01. A fast
  // ending 00:30 EDT on Nov 1 belongs to Nov 1; today's fixed EST offset would
  // put it on Oct 31 and break a 3-day streak. An IANA zone gets it right.
  const nov = new Date('2026-11-03T15:00:00Z');
  const dstFasts = [
    fast('2026-11-03T14:00:00Z', 16, true),
    fast('2026-11-02T14:00:00Z', 16, true),
    fast('2026-11-01T04:30:00Z', 16, true)
  ];
  check('stats: an IANA zone buckets days correctly across DST', computeStats(dstFasts, nov, 'America/New_York').currentStreakDays === 3);
  const empty = computeStats([], now, 0);
  check('stats: empty history', empty.totalCompleted === 0 && empty.currentStreakDays === 0 && empty.averageHours === null && empty.longestHours === 0);
}

async function run() {
  const token = await newUser('faster');
  const other = await newUser('stranger');
  check('two accounts exist', !!token && !!other);

  check('auth is required', (await call('GET', '/api/fasts')).status === 401);
  check('nothing is active at first', (await call('GET', '/api/fasts/active', { token })).body === null);

  // ── validation ────────────────────────────────────────────────────────────
  for (const [label, body] of [
    ['a target under 8 hours', { targetHours: 7 }],
    ['a target over 72 hours', { targetHours: 73 }],
    ['a missing target', {}],
    ['a string target', { targetHours: '16' }],
    ['a start in the future', { targetHours: 16, startedAt: new Date(Date.now() + HOUR).toISOString() }],
    ['a start more than a week ago', { targetHours: 16, startedAt: iso(8 * 24 * HOUR) }],
    ['a start that is not a date', { targetHours: 16, startedAt: 'yesterday' }],
    ['unknown fields', { targetHours: 16, user_id: 'someone-else' }]
  ]) {
    const r = await call('POST', '/api/fasts/start', { token, body });
    check(`refuses ${label}`, r.status === 400, `status ${r.status}`);
  }

  // ── starting ──────────────────────────────────────────────────────────────
  const started = await call('POST', '/api/fasts/start', { token, body: { targetHours: 16, startedAt: iso(17 * HOUR) } });
  check('a fast starts', started.status === 201, `status ${started.status}`);
  const fastId = started.body?.id;
  check(
    'the record has the expected shape',
    started.body?.target_hours === 16 && started.body?.ended_at === null && started.body?.completed === false && started.body?.duration_hours === null,
    JSON.stringify(started.body)
  );

  const second = await call('POST', '/api/fasts/start', { token, body: { targetHours: 16 } });
  check('a second open fast is a conflict', second.status === 409, `status ${second.status}`);
  check('the conflict names the running fast', second.body?.active?.id === fastId);

  const active = await call('GET', '/api/fasts/active', { token });
  check('the running fast is active', active.body?.id === fastId);
  check('another user sees nothing active', (await call('GET', '/api/fasts/active', { token: other })).body === null);
  check('another user may start their own', (await call('POST', '/api/fasts/start', { token: other, body: { targetHours: 13 } })).status === 201);

  // ── ending ────────────────────────────────────────────────────────────────
  check('another user cannot end it', (await call('POST', `/api/fasts/${fastId}/end`, { token: other })).status === 404);
  check('a malformed id is a miss', (await call('POST', '/api/fasts/not-a-uuid/end', { token })).status === 404);
  check(
    'an end before the start is refused',
    (await call('POST', `/api/fasts/${fastId}/end`, { token, body: { endedAt: iso(18 * HOUR) } })).status === 400
  );
  check(
    'an end in the future is refused',
    (await call('POST', `/api/fasts/${fastId}/end`, { token, body: { endedAt: new Date(Date.now() + HOUR).toISOString() } })).status === 400
  );

  const ended = await call('POST', `/api/fasts/${fastId}/end`, { token, body: { endedAt: iso(30 * 60 * 1000) } });
  check('it ends', ended.status === 200, `status ${ended.status}`);
  check('duration is computed', ended.body?.duration_hours === 16.5, `got ${ended.body?.duration_hours}`);
  check('reaching the target marks it completed', ended.body?.completed === true);
  check('ending twice is a conflict', (await call('POST', `/api/fasts/${fastId}/end`, { token })).status === 409);
  check('nothing is active after ending', (await call('GET', '/api/fasts/active', { token })).body === null);

  const short = await call('POST', '/api/fasts/start', { token, body: { targetHours: 18, startedAt: iso(5 * HOUR) } });
  const shortEnd = await call('POST', `/api/fasts/${short.body?.id}/end`, { token });
  check('a fast ended early is not completed', shortEnd.body?.completed === false && shortEnd.body?.duration_hours === 5, JSON.stringify(shortEnd.body));

  // ── reading ───────────────────────────────────────────────────────────────
  const list = await call('GET', '/api/fasts', { token });
  check('history lists own fasts only', list.body?.length === 2, `got ${list.body?.length}`);
  check('history is newest first', list.body?.[0]?.id === short.body?.id);
  check('limit is honoured', (await call('GET', '/api/fasts?limit=1', { token })).body?.length === 1);
  check('a bad limit is refused', (await call('GET', '/api/fasts?limit=0', { token })).status === 400);

  const stats = await call('GET', '/api/fasts/stats', { token });
  check(
    'stats reflect history',
    stats.body?.totalCompleted === 1 && stats.body?.longestHours === 16.5 && stats.body?.averageHours === 10.75 && stats.body?.currentStreakDays === 1,
    JSON.stringify(stats.body)
  );
  check('an unknown IANA zone is refused', (await call('GET', '/api/fasts/stats?tz=Mars%2FOlympus', { token })).status === 400);
  check('a valid IANA zone is accepted', (await call('GET', '/api/fasts/stats?tz=Asia%2FJerusalem', { token })).status === 200);
  check('a bad tz offset is refused', (await call('GET', '/api/fasts/stats?tzOffsetMinutes=abc', { token })).status === 400);

  // ── deleting ──────────────────────────────────────────────────────────────
  check('another user cannot delete it', (await call('DELETE', `/api/fasts/${fastId}`, { token: other })).status === 404);
  check('deleting works', (await call('DELETE', `/api/fasts/${fastId}`, { token })).status === 200);
  check('deleting again is a miss', (await call('DELETE', `/api/fasts/${fastId}`, { token })).status === 404);
  check('the deleted fast leaves history', (await call('GET', '/api/fasts', { token })).body?.length === 1);

  // ── and the whole lot goes with the account ───────────────────────────────
  await call('DELETE', '/api/users/me', { token, body: { password: 'a sufficiently long one' } });
  check('fasts do not outlive the account', (await call('GET', '/api/fasts', { token })).status === 401);
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
      JWT_SECRET: 'fasts-test-secret'
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
    } else if (log.join('').includes('EADDRINUSE')) {
      console.error(`port ${port} is already in use — aborting rather than testing another process`);
    } else {
      console.log('\nfasts\n');
      unitStats();
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
