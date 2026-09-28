/**
 * Onboarding wizard backend.
 *
 * What matters: a brand-new account is sent through the wizard, an account
 * that was already in use is not, the preview's numbers are the calculator's
 * numbers (not a second copy of the formula), and the safety cases give a
 * flag instead of a number that looks authoritative.
 *
 *   node tests/onboarding.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'onboarding-test-secret';
process.env.VERCEL = '1'; // index.js exports the app instead of binding a port

const db = require('../utils/database');
const nutrition = require('../utils/nutrition-calculator');
const { calculateWaterTarget, calculateSleepTarget, calculateBMI } = require('../utils/health-calculations');

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

let seq = 0;
async function signup() {
  seq++;
  const res = await call('POST', '/api/auth/signup', {
    body: { email: `onb-test-${Date.now()}-${seq}@example.com`, password: 'correct horse battery' }
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const adult = {
  goal: 'lose_weight',
  sex: 'female',
  age: 34,
  heightCm: 165,
  weightKg: 72,
  targetWeightKg: 65,
  activityLevel: 'light'
};

async function run() {
  // ── auth ──────────────────────────────────────────────────────────────────
  check('status requires auth', (await call('GET', '/api/onboarding')).status === 401);
  check('preview requires auth', (await call('POST', '/api/onboarding/targets-preview', { body: adult })).status === 401);
  check('complete requires auth', (await call('POST', '/api/onboarding', { body: {} })).status === 401);

  // ── a new account is not onboarded ────────────────────────────────────────
  const fresh = await signup();
  let status = await call('GET', '/api/onboarding', { token: fresh.token });
  check(
    'a new signup is not onboarded yet',
    status.status === 200 && status.body?.completed === false && status.body?.source === null,
    JSON.stringify(status.body)
  );

  // ── preview: numbers come from the calculators ────────────────────────────
  const preview = await call('POST', '/api/onboarding/targets-preview', { token: fresh.token, body: adult });
  const expected = nutrition.calculateDailyTarget({ ...adult, goal: 'lose' });
  check('preview succeeds', preview.status === 200, JSON.stringify(preview.body));
  check(
    'calories are the nutrition calculator’s',
    JSON.stringify(preview.body?.calories) === JSON.stringify(expected.calorieTarget),
    `${JSON.stringify(preview.body?.calories)} vs ${JSON.stringify(expected.calorieTarget)}`
  );
  check('macros are the nutrition calculator’s', JSON.stringify(preview.body?.macros) === JSON.stringify(expected.macros));
  check('lose_weight maps to a deficit', preview.body?.inputs?.calcGoal === 'lose' && preview.body?.calories?.center < preview.body?.tdee);
  check('water comes from calculateWaterTarget', preview.body?.waterLiters === calculateWaterTarget(72, 20), String(preview.body?.waterLiters));
  check('sleep comes from calculateSleepTarget', preview.body?.sleepHours === calculateSleepTarget(34));
  check('BMI is reported', preview.body?.bmi === calculateBMI(72, 165));
  check('safe floor is surfaced for edits', preview.body?.safety?.safeCalorieFloor === nutrition.MIN_SAFE_CALORIES.female);
  check('an ordinary adult gets no safety flags', preview.body?.safety?.flags?.length === 0 && preview.body?.safety?.needsProfessional === false, JSON.stringify(preview.body?.safety));

  const maintain = await call('POST', '/api/onboarding/targets-preview', {
    token: fresh.token,
    body: { ...adult, goal: 'sleep_better', targetWeightKg: null }
  });
  check('non-weight goals keep maintenance calories', maintain.body?.inputs?.calcGoal === 'maintain' && maintain.body?.calories?.center === maintain.body?.tdee, JSON.stringify(maintain.body?.calories));

  const byYear = await call('POST', '/api/onboarding/targets-preview', {
    token: fresh.token,
    body: { ...adult, age: undefined, birthYear: new Date().getFullYear() - 40 }
  });
  check('birth year works instead of age', byYear.status === 200 && byYear.body?.inputs?.age === 40, JSON.stringify(byYear.body?.inputs));

  // ── preview: validation ───────────────────────────────────────────────────
  const bad = [
    ['missing age and birth year', { ...adult, age: undefined }],
    ['unknown goal', { ...adult, goal: 'get_huge' }],
    ['height out of range', { ...adult, heightCm: 40 }],
    ['weight as a string', { ...adult, weightKg: '72' }],
    ['unknown activity level', { ...adult, activityLevel: 'couch' }],
    ['implausible birth year', { ...adult, age: undefined, birthYear: 1850 }]
  ];
  for (const [name, body] of bad) {
    const r = await call('POST', '/api/onboarding/targets-preview', { token: fresh.token, body });
    check(`rejects ${name}`, r.status === 400, `status ${r.status}`);
  }

  // ── preview: safety ───────────────────────────────────────────────────────
  const minor = await call('POST', '/api/onboarding/targets-preview', { token: fresh.token, body: { ...adult, age: 15 } });
  check(
    'a minor gets no calorie or macro numbers',
    minor.status === 200 && minor.body?.calories === null && minor.body?.macros === null,
    JSON.stringify(minor.body)
  );
  check('a minor is flagged for a professional', minor.body?.safety?.flags?.includes('minor') && minor.body?.safety?.needsProfessional === true);
  check('a minor still gets water and sleep guidance', minor.body?.waterLiters > 0 && minor.body?.sleepHours === calculateSleepTarget(15));

  const tiny = await call('POST', '/api/onboarding/targets-preview', {
    token: fresh.token,
    body: { ...adult, age: 70, heightCm: 150, weightKg: 45, targetWeightKg: 40, activityLevel: 'sedentary' }
  });
  check('a target under the safe floor gives no number', tiny.body?.calories === null, JSON.stringify(tiny.body));
  check('…and says why', tiny.body?.safety?.flags?.includes('below-safe-floor') || tiny.body?.safety?.flags?.includes('lose-while-underweight'), JSON.stringify(tiny.body?.safety));

  const under = await call('POST', '/api/onboarding/targets-preview', {
    token: fresh.token,
    body: { ...adult, weightKg: 48, targetWeightKg: 44, heightCm: 170 }
  });
  check('no deficit is planned for someone underweight', under.body?.inputs?.calcGoal === 'maintain', JSON.stringify(under.body?.inputs));
  check('underweight + lose goal is flagged', ['bmi-low', 'lose-while-underweight', 'target-bmi-low'].every((f) => under.body?.safety?.flags?.includes(f)), JSON.stringify(under.body?.safety));

  const high = await call('POST', '/api/onboarding/targets-preview', { token: fresh.token, body: { ...adult, weightKg: 130 } });
  check('a very high BMI is flagged', high.body?.safety?.flags?.includes('bmi-high') && high.body?.calories !== null, JSON.stringify(high.body?.safety));

  // ── the wizard saves through existing endpoints ───────────────────────────
  const prefs = {
    onboarding: { goal: 'lose_weight', profile: { sex: 'female', age: 34, heightCm: 165, activityLevel: 'light' } },
    dietary: { vegetarian: true, kosher: true, allergies: 'peanuts' },
    macroTargets: { calorieOverride: 1700, protein_grams: 140, carbs_grams: 160, fat_grams: 50 },
    waterTargetLiters: 2.4,
    sleepTargetHours: 7.5,
    reminders: { whatsapp: true, email: false }
  };
  const put = await call('PUT', '/api/users/me/preferences', { token: fresh.token, body: { preferences: prefs } });
  check('preferences save', put.status === 200, JSON.stringify(put.body));
  check('a confirmed calorie target survives preference normalisation', put.body?.preferences?.macroTargets?.calorieOverride === 1700, JSON.stringify(put.body?.preferences?.macroTargets));

  const targets = await call('GET', '/api/targets', { token: fresh.token });
  check(
    '/api/targets returns the confirmed targets',
    targets.status === 200 &&
      targets.body?.targets?.calories === 1700 &&
      targets.body?.targets?.protein_grams === 140 &&
      targets.body?.targets?.carbs_grams === 160 &&
      targets.body?.targets?.fat_grams === 50,
    JSON.stringify(targets.body)
  );

  const putTargets = await call('PUT', '/api/targets', { token: fresh.token, body: { calories: 1800, protein_grams: 130 } });
  check('PUT /api/targets works', putTargets.status === 200, JSON.stringify(putTargets.body));
  const afterPut = await db.getUserPreferences(fresh.id);
  check('PUT /api/targets keeps the rest of the preferences', afterPut?.reminders?.whatsapp === true && afterPut?.macroTargets?.calorieOverride === 1800, JSON.stringify(afterPut));

  // ── completion ────────────────────────────────────────────────────────────
  const done = await call('POST', '/api/onboarding', { token: fresh.token, body: {} });
  check('completion is recorded', done.status === 200 && done.body?.completed === true && typeof done.body?.completedAt === 'string', JSON.stringify(done.body));
  status = await call('GET', '/api/onboarding', { token: fresh.token });
  check('status reads back as completed by the wizard', status.body?.completed === true && status.body?.source === 'wizard' && status.body?.completedAt === done.body.completedAt);

  const again = await call('POST', '/api/onboarding', { token: fresh.token, body: {} });
  check('completing twice keeps the first date', again.body?.completedAt === done.body.completedAt);

  const junk = await call('POST', '/api/onboarding', { token: fresh.token, body: { completedAt: '1999-01-01' } });
  check('the client cannot choose the completion date', junk.status === 400, `status ${junk.status}`);

  const skipper = await signup();
  const skipped = await call('POST', '/api/onboarding', { token: skipper.token, body: { skipped: true } });
  check('skipping counts as done, so nobody is nagged forever', skipped.status === 200 && skipped.body?.skipped === true);
  check('…and is persisted', (await db.getUser(skipper.id)).onboarding_completed_at === skipped.body?.completedAt);

  // ── existing users are never pushed into the wizard ───────────────────────
  const withGoal = await signup();
  await call('POST', '/api/weight-goals', { token: withGoal.token, body: { startWeightKg: 80, targetWeightKg: 75 } });
  status = await call('GET', '/api/onboarding', { token: withGoal.token });
  check('an account with a weight goal counts as onboarded', status.body?.completed === true && status.body?.source === 'existing', JSON.stringify(status.body));

  const withPrefs = await signup();
  await db.updateUserPreferences(withPrefs.id, { macroTargets: { protein_grams: 120 } });
  status = await call('GET', '/api/onboarding', { token: withPrefs.token });
  check('an account with preferences counts as onboarded', status.body?.completed === true && status.body?.source === 'existing');

  const withLogs = await signup();
  await call('POST', '/api/hydration-logs', { token: withLogs.token, body: { litersConsumed: 0.25 } });
  status = await call('GET', '/api/onboarding', { token: withLogs.token });
  check('an account with logs counts as onboarded', status.body?.completed === true && status.body?.source === 'existing');

  const langOnly = await signup();
  await db.updateUserPreferences(langOnly.id, { language: 'he' });
  status = await call('GET', '/api/onboarding', { token: langOnly.token });
  check('a language preference alone is not "set up"', status.body?.completed === false, JSON.stringify(status.body));
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

    console.log('\nonboarding\n');
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
