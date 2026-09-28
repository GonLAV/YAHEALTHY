/**
 * Correctness regressions — logic that used to give a wrong answer without
 * failing anything. Each case names the bug it pins down.
 *
 *   node tests/correctness-regressions.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'correctness-test-secret';
process.env.VERCEL = '1';

const db = require('../utils/database');
const onboarding = require('../utils/onboarding');

let BASE;
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  }
}

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
}

let seq = 0;
async function signup() {
  seq++;
  const email = `correctness-${Date.now()}-${seq}@example.com`;
  const res = await call('POST', '/api/auth/signup', { body: { email, password: 'correct horse battery', name: 'Dana' } });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${res.text}`);
  return { id: res.body.id, token: res.body.token };
}

const DAY = 86400000;

async function run() {
  // ── onboarding: a birth year that may still mean 17 ──────────────────────
  // Year arithmetic overstates age by up to a year: born in (this year − 18)
  // is 17 until the birthday. The wizard's rule is "no calorie numbers for a
  // minor", so a birth year that cannot rule that out must be treated as one.
  const adult = { goal: 'lose_weight', sex: 'female', heightCm: 165, weightKg: 70, activityLevel: 'light' };
  const thisYear = new Date().getFullYear();
  const maybe17 = onboarding.previewTargets({ ...adult, birthYear: thisYear - 18 });
  check('birth year of (this year − 18) gets no calorie number', maybe17.calories === null && maybe17.macros === null, JSON.stringify(maybe17.calories));
  check('…and is flagged as a possible minor', maybe17.safety.flags.includes('minor') && maybe17.safety.needsProfessional === true, JSON.stringify(maybe17.safety));
  const surely18 = onboarding.previewTargets({ ...adult, birthYear: thisYear - 19 });
  check('birth year of (this year − 19) is an adult', surely18.calories !== null && !surely18.safety.flags.includes('minor'), JSON.stringify(surely18.safety));
  const age18 = onboarding.previewTargets({ ...adult, age: 18 });
  check('an explicit age of 18 is an adult', age18.calories !== null && !age18.safety.flags.includes('minor'));

  // ── share card: the week's weight change covers the card's own week ──────
  // The card shows the 7 local days ending TODAY, but the weight change came
  // from weekly-summary's window (the 7 UTC days ending YESTERDAY), so a
  // weigh-in made today never counted.
  const u = await signup();
  const early = await db.createWeightLog(u.id, { weight_kg: 81 });
  early.created_at = new Date(Date.now() - 5 * DAY).toISOString(); // inside both windows
  await db.createWeightLog(u.id, { weight_kg: 80 }); // today
  const preview = await call('GET', '/api/share/weekly-card?lang=en&tz=UTC', { token: u.token });
  const pc = preview.body?.card || preview.body;
  check('share card counts a weigh-in made today', pc?.weightChangeKg === -1, JSON.stringify(pc?.weightChangeKg));

  // …and a weigh-in from before the card's week does not move it.
  const v = await signup();
  const old = await db.createWeightLog(v.id, { weight_kg: 90 });
  old.created_at = new Date(Date.now() - 7 * DAY - 3600000).toISOString(); // 7 days ago: outside the card week
  const mid = await db.createWeightLog(v.id, { weight_kg: 88 });
  mid.created_at = new Date(Date.now() - 3 * DAY).toISOString();
  await db.createWeightLog(v.id, { weight_kg: 87.5 });
  const pv = await call('GET', '/api/share/weekly-card?lang=en&tz=UTC', { token: v.token });
  const pvc = pv.body?.card || pv.body;
  check('share card weight change uses only the card week', pvc?.weightChangeKg === -0.5, JSON.stringify(pvc?.weightChangeKg));
}

(async () => {
  let code = 1;
  let server;
  try {
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;
    console.log('\ncorrectness regressions\n');
    await run();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
