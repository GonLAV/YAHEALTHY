/**
 * Engagement layer — streaks, Health Score, achievements.
 *
 * Streaks are the part users feel most: breaking one they did not break is
 * the fastest way to lose them. So most cases here are about the edges —
 * gaps, "today isn't logged yet", and which calendar day it is in the user's
 * own time zone. The second half boots the real server in memory mode and
 * checks GET /api/engagement/summary end to end.
 *
 *   node tests/engagement.test.js
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const {
  buildEngagementSummary,
  computeStreak,
  scoreDay,
  buildDays,
  resolveGoals,
  localDate,
  SCORE_WEIGHTS
} = require('../utils/engagement');

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

// Noon UTC on 2026-09-27 unless a case says otherwise.
const NOW = new Date('2026-09-27T12:00:00Z');
const food = (date, calories = 500, meal_type = 'lunch') => ({ date, calories, meal_type, created_at: `${date}T10:00:00Z` });
const water = (date, liters) => ({ date, liters_consumed: liters, created_at: `${date}T09:00:00Z` });
const sleep = (date, hours) => ({ date, sleep_hours: hours, created_at: `${date}T07:00:00Z` });
const days = (end, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  return d.toISOString().slice(0, 10);
});
const summary = (input) => buildEngagementSummary({ now: NOW, tz: 'UTC', lang: 'en', ...input });

console.log('\nengagement — streaks\n');

// ── streak edge cases ─────────────────────────────────────────────────────
{
  const s = computeStreak(new Set(), '2026-09-27');
  check('no logs → no streak', s.current === 0 && s.best === 0 && !s.atRisk && s.lastDate === null);
}
{
  const s = computeStreak(new Set(days('2026-09-27', 5)), '2026-09-27');
  check('five days ending today → current 5', s.current === 5 && s.best === 5 && s.todayDone && !s.atRisk, JSON.stringify(s));
}
{
  const s = computeStreak(new Set(days('2026-09-26', 4)), '2026-09-27');
  check(
    'today not logged yet does not break the streak',
    s.current === 4 && !s.todayDone && s.atRisk,
    JSON.stringify(s)
  );
}
{
  const s = computeStreak(new Set(days('2026-09-25', 4)), '2026-09-27');
  check('a full missed day (yesterday) resets current to 0', s.current === 0 && s.best === 4 && !s.atRisk, JSON.stringify(s));
}
{
  const set = new Set([...days('2026-09-27', 2), ...days('2026-09-20', 6)]);
  const s = computeStreak(set, '2026-09-27');
  check('a gap splits runs: current is the recent run, best the longer one', s.current === 2 && s.best === 6, JSON.stringify(s));
  check('best streak records where it ended', s.bestEndedOn === '2026-09-20', s.bestEndedOn);
}
{
  const s = computeStreak(new Set(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']), '2026-09-27');
  check('future-dated rows do not extend a streak', s.current === 2 && s.best === 2, JSON.stringify(s));
}
{
  const s = computeStreak(new Set(['2026-02-27', '2026-02-28', '2026-03-01']), '2026-03-01');
  check('streaks run across month ends', s.current === 3);
}
{
  const s = summary({ foodLogs: [food('2026-09-27'), food('2026-09-27', 300, 'dinner'), food('2026-09-26')] });
  check('several entries on one day count once', s.streaks.food.current === 2, JSON.stringify(s.streaks.food));
}

// ── time zones ────────────────────────────────────────────────────────────
{
  // 22:30 UTC on the 27th is already 01:30 on the 28th in Jerusalem.
  const lateNow = new Date('2026-09-27T22:30:00Z');
  check('local date follows the time zone', localDate(lateNow, 'Asia/Jerusalem') === '2026-09-28');
  check('an invalid zone falls back to UTC', localDate(lateNow, 'Not/AZone') === '2026-09-27');

  const logs = days('2026-09-27', 3).map((d) => food(d));
  const utc = buildEngagementSummary({ foodLogs: logs, now: lateNow, tz: 'UTC' });
  const jlm = buildEngagementSummary({ foodLogs: logs, now: lateNow, tz: 'Asia/Jerusalem' });
  check('in UTC it is still the 27th — today is done', utc.today === '2026-09-27' && utc.streaks.food.todayDone && utc.streaks.food.current === 3);
  check(
    'in Jerusalem it is the 28th — not logged yet, streak kept and at risk',
    jlm.today === '2026-09-28' && !jlm.streaks.food.todayDone && jlm.streaks.food.current === 3 && jlm.streaks.food.atRisk,
    JSON.stringify(jlm.streaks.food)
  );

  const la = buildEngagementSummary({ foodLogs: [food('2026-09-27')], now: new Date('2026-09-28T03:00:00Z'), tz: 'America/Los_Angeles' });
  check('west of UTC, the local day lags behind UTC', la.today === '2026-09-27' && la.streaks.food.todayDone);

  // Weight logs only carry a timestamp: its local date decides the day.
  const wl = [{ weight_kg: 80, created_at: '2026-09-27T22:30:00Z' }];
  const w = buildEngagementSummary({ weightLogs: wl, now: lateNow, tz: 'Asia/Jerusalem' });
  check('a timestamp-only row lands on its local date', w.streaks.anyLog.todayDone && w.today === '2026-09-28');
}

// ── habits ────────────────────────────────────────────────────────────────
{
  const s = summary({
    hydrationLogs: [water('2026-09-27', 1.5), water('2026-09-27', 1.2), water('2026-09-26', 1)],
    sleepLogs: [sleep('2026-09-27', 8), sleep('2026-09-26', 6)],
    goals: { waterTargetLiters: 2.5, sleepTargetHours: 7.5 }
  });
  check('hydration streak needs the goal hit, summed across entries', s.streaks.hydration.current === 1 && s.streaks.hydration.todayDone);
  check('sleep streak needs the target hit', s.streaks.sleep.current === 1 && s.streaks.sleep.best === 1);
  check('any-log streak counts every kind of log', s.streaks.anyLog.current === 2);
}

console.log('\nengagement — health score\n');

// ── score bounds and breakdown ─────────────────────────────────────────────
{
  const weightSum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  check('component weights sum to 100', weightSum === 100, `got ${weightSum}`);

  const empty = summary({});
  check('no data → score 0', empty.healthScore.today === 0);
  check('trend has 7 days ending today', empty.healthScore.trend7d.length === 7 && empty.healthScore.trend7d[6].date === '2026-09-27');

  const goals = resolveGoals({ calorieTarget: 2000, waterTargetLiters: 2, sleepTargetHours: 7 });
  const perfectLogs = {
    foodLogs: days('2026-09-27', 7).map((d) => food(d, 2000)),
    hydrationLogs: days('2026-09-27', 7).map((d) => water(d, 3)),
    sleepLogs: days('2026-09-27', 7).map((d) => sleep(d, 9))
  };
  const full = summary({ ...perfectLogs, goals });
  check('everything on target for a week → exactly 100', full.healthScore.today === 100, `got ${full.healthScore.today}`);
  const pointsSum = full.healthScore.components.reduce((s, c) => s + c.points, 0);
  check('breakdown points add up to the headline', Math.round(pointsSum) === full.healthScore.today, `got ${pointsSum}`);

  // Absurd values must not escape the range.
  const extreme = summary({
    foodLogs: [food('2026-09-27', 99999)],
    hydrationLogs: [water('2026-09-27', 50)],
    sleepLogs: [sleep('2026-09-27', 24)],
    goals
  });
  check('extreme inputs stay within 0–100', extreme.healthScore.today >= 0 && extreme.healthScore.today <= 100, `got ${extreme.healthScore.today}`);
  check('far over the calorie target scores 0 for nutrition', extreme.healthScore.components.find((c) => c.key === 'nutrition').score === 0);
  const negative = summary({ foodLogs: [food('2026-09-27', -500)], hydrationLogs: [water('2026-09-27', -3)], goals });
  check('negative inputs stay within 0–100', negative.healthScore.today >= 0 && negative.healthScore.today <= 100);

  const d = buildDays({ foodLogs: [food('2026-09-27', 1700)] }, 'UTC', '2026-09-27');
  const nut = scoreDay(d, '2026-09-27', goals).components.find((c) => c.key === 'nutrition');
  check('15 % under target loses some nutrition points but not all', nut.score > 0 && nut.score < 100, `got ${nut.score}`);
  const dNear = buildDays({ foodLogs: [food('2026-09-27', 1850)] }, 'UTC', '2026-09-27');
  check('within ±10 % of target is full nutrition marks', scoreDay(dNear, '2026-09-27', goals).components[0].score === 100);

  const noTarget = summary({ foodLogs: [food('2026-09-27', 400, 'breakfast'), food('2026-09-27', 600, 'lunch')] });
  check(
    'without a calorie target, logging meals is what earns nutrition points',
    noTarget.healthScore.components.find((c) => c.key === 'nutrition').score === 80
  );
  check('unusable goals fall back to defaults', resolveGoals({ waterTargetLiters: -1, sleepTargetHours: 'x' }).waterTargetLiters === 2.5);
}

console.log('\nengagement — achievements\n');

// ── achievements ──────────────────────────────────────────────────────────
{
  const none = summary({});
  check('nothing logged → nothing unlocked', none.unlockedCount === 0);
  check('12 achievements in the catalogue', none.achievements.length === 12, `got ${none.achievements.length}`);
  check('next milestone exists for a new user', !!none.nextMilestone.id && /more to unlock/.test(none.nextMilestone.message));
  const kg = none.achievements.find((a) => a.id === 'first-kg-down');
  check('the weight badge is unavailable without a weight goal', kg.available === false && !kg.unlocked);

  const first = summary({ foodLogs: [food('2026-09-20')] });
  const fl = first.achievements.find((a) => a.id === 'first-log');
  check('first log unlocks, dated the day it happened', fl.unlocked && fl.unlockedAt === '2026-09-20', JSON.stringify(fl));

  const week = summary({ foodLogs: days('2026-09-27', 8).map((d) => food(d)) });
  const s7 = week.achievements.find((a) => a.id === 'streak-7');
  check('7-day streak unlocks on the 7th consecutive day', s7.unlocked && s7.unlockedAt === '2026-09-26', JSON.stringify(s7));
  const s30 = week.achievements.find((a) => a.id === 'streak-30');
  check('30-day streak shows progress while locked', !s30.unlocked && s30.progress.current === 8 && s30.progress.target === 30);

  const broken = summary({ foodLogs: [...days('2026-09-27', 3), ...days('2026-09-23', 3)].map((d) => food(d)) });
  check('a gap stops a run from counting toward the streak badge', !broken.achievements.find((a) => a.id === 'streak-7').unlocked);

  const goals = { waterTargetLiters: 2, sleepTargetHours: 7 };
  const five = summary({
    foodLogs: days('2026-09-27', 5).map((d) => food(d)),
    hydrationLogs: days('2026-09-27', 5).map((d) => water(d, 2)),
    sleepLogs: days('2026-09-27', 5).map((d) => sleep(d, 7)),
    goals
  });
  const p5 = five.achievements.find((a) => a.id === 'perfect-5');
  check('5 perfect days unlock "perfect-5"', p5.unlocked && p5.unlockedAt === '2026-09-27', JSON.stringify(p5));
  check('hydration hero tracks progress toward 7 days', five.achievements.find((a) => a.id === 'hydration-hero').progress.current === 5);

  const weightGoals = [{ id: 'g1', start_weight_kg: 90, target_weight_kg: 80, created_at: '2026-09-01T08:00:00Z' }];
  const halfway = summary({ weightGoals, weightLogs: [{ weight_kg: 89.5, created_at: '2026-09-10T07:00:00Z' }] });
  const hk = halfway.achievements.find((a) => a.id === 'first-kg-down');
  check('0.5 kg down is progress, not the badge', hk.available && !hk.unlocked && hk.progress.current === 0.5, JSON.stringify(hk));
  const down = summary({
    weightGoals,
    weightLogs: [
      { weight_kg: 89.5, created_at: '2026-09-10T07:00:00Z' },
      { weight_kg: 88.9, created_at: '2026-09-17T07:00:00Z' }
    ]
  });
  const dk = down.achievements.find((a) => a.id === 'first-kg-down');
  check('1 kg below the goal start unlocks the weight badge', dk.unlocked && dk.unlockedAt === '2026-09-17', JSON.stringify(dk));

  const he = summary({ lang: 'he' });
  check('Hebrew titles and milestone message', /[֐-׿]/.test(he.achievements[0].title) && /[֐-׿]/.test(he.nextMilestone.message));
}

// ── the endpoint, end to end (memory store) ────────────────────────────────
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

async function runEndpoint(BASE) {
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

  check('the summary needs a login', (await call('GET', '/api/engagement/summary')).status === 401);

  const signup = await call('POST', '/api/auth/signup', {
    body: { email: `engagement-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const token = signup.body?.token;
  check('an account exists to query with', !!token);

  const today = localDate(new Date(), 'UTC');
  await call('POST', '/api/food-logs', { token, body: { date: today, name: 'Salad', calories: 350, mealType: 'lunch' } });
  await call('POST', '/api/hydration-logs', { token, body: { date: today, litersConsumed: 3 } });

  const res = await call('GET', '/api/engagement/summary?lang=he&tz=UTC', { token });
  const b = res.body || {};
  check('summary responds 200', res.status === 200, `status ${res.status}`);
  check('it has the documented shape',
    typeof b.healthScore?.today === 'number' && Array.isArray(b.healthScore?.components) &&
    b.healthScore?.trend7d?.length === 7 && !!b.streaks?.food && Array.isArray(b.achievements) && !!b.nextMilestone,
    JSON.stringify(Object.keys(b)));
  check('logs written through the API show up in streaks', b.streaks?.food?.current === 1 && b.streaks?.hydration?.todayDone === true);
  check('first-log is unlocked', b.achievements?.find((a) => a.id === 'first-log')?.unlocked === true);
  check('lang=he is honoured', /[֐-׿]/.test(b.nextMilestone?.message || ''));
  check('a bad time zone is refused', (await call('GET', '/api/engagement/summary?tz=Mars/Base', { token })).status === 400);
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
      JWT_SECRET: 'engagement-test-secret'
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
      console.log('\nengagement — GET /api/engagement/summary\n');
      await runEndpoint(BASE);
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
