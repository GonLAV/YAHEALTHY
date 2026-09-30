/**
 * The calculated calorie target is withheld everywhere, not only on the home
 * screen.
 *
 * The formula (utils/health-calculations.js) is clinical content waiting for a
 * registered professional's approval, and /api/targets withheld its number.
 * Nothing else did: the coaching screen printed "You've consumed 600 of your
 * 1850 calorie target", the dashboard's daily insights, the weekly email, the
 * survey itself and six more endpoints all read it straight off the survey.
 *
 * The server runs twice. Unapproved, no calculated target may appear in any
 * response. Approved (tests/helpers/approve-calorie-target.js, preloaded), the
 * same requests must show it: otherwise the first half would pass just as well
 * if the target had simply been deleted.
 *
 *   node tests/calorie-gate.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

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

/**
 * Every number in a response that is a calculated target, by where it sits:
 * a key naming a target, a remainder against one, or the formula's own
 * intermediate values. Water and sleep targets are not waiting for approval.
 */
function calculatedTargets(value, trail = '') {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => calculatedTargets(v, `${trail}[${i}]`));
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => calculatedTargets(v, trail ? `${trail}.${k}` : k));
  }
  if (typeof value !== 'number') return [];
  const key = trail.toLowerCase();
  // The goal weight and the time frame are what the person typed in.
  if (/water|sleep|hydration|target_weight_kg|target_days/.test(key)) return [];
  const named = /target|remaining|overby|(^|\.)tdee$|(^|\.)bmr$|dailydeficit|weekstogoal|daystogoal/.test(key);
  return named ? [`${trail}=${value}`] : [];
}

async function startServer(approved) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const args = approved ? ['-r', path.join(__dirname, 'helpers', 'approve-calorie-target.js')] : [];
  const server = spawn(process.execPath, [...args, path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'calorie-gate-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(base + '/api/health')).ok) return { base, server };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  server.kill();
  throw new Error('server did not start:\n' + log.join(''));
}

async function call(base, method, route, { token, body } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

const TODAY = new Date().toISOString().slice(0, 10);
const WEEK_AGO = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);

/** One person with a survey and a meal, and every response that could carry a target. */
async function responses(base) {
  const signup = await call(base, 'POST', '/api/auth/signup', {
    body: { email: `gate-${Date.now()}@example.com`, password: 'a sufficiently long one' }
  });
  const token = signup.body?.token;
  const userId = signup.body?.id;
  const survey = await call(base, 'POST', '/api/surveys', {
    token,
    body: { gender: 'female', age: 34, heightCm: 165, weightKg: 72, targetWeightKg: 64, targetDays: 120, lifestyle: 'moderate' }
  });
  await call(base, 'POST', '/api/food-logs', {
    token,
    body: { date: TODAY, name: 'שקשוקה', mealType: 'breakfast', calories: 420, proteinGrams: 22 }
  });

  const get = async (route) => (await call(base, 'GET', route, { token })).body;
  return {
    setup: { token: !!token, userId: !!userId, survey: survey.status },
    bodies: {
      'POST /api/surveys': survey.body,
      'GET /api/surveys': await get('/api/surveys'),
      [`GET /api/surveys/:id`]: await get(`/api/surveys/${survey.body?.id}`),
      'GET /api/targets': await get('/api/targets'),
      'GET /api/calorie-balance': await get(`/api/calorie-balance?date=${TODAY}`),
      'GET /api/weekly-calorie-balance': await get(`/api/weekly-calorie-balance?start=${WEEK_AGO}&end=${TODAY}`),
      'GET /api/macro-balance': await get(`/api/macro-balance?date=${TODAY}`),
      'GET /api/macro-balance/range': await get(`/api/macro-balance/range?start=${WEEK_AGO}&end=${TODAY}`),
      'GET /api/nutrition-score': await get(`/api/nutrition-score?date=${TODAY}`),
      'GET /api/nutrition-score/range': await get(`/api/nutrition-score/range?start=${WEEK_AGO}&end=${TODAY}`),
      'GET /api/weekly-nutrition': await get(`/api/weekly-nutrition?start=${WEEK_AGO}&end=${TODAY}`),
      'GET /api/insights/daily': await get(`/api/insights/daily?date=${TODAY}`),
      'GET coach insights (en)': await get(`/api/crm/users/${userId}/insights?lang=en`),
      'GET coach insights (he)': await get(`/api/crm/users/${userId}/insights?lang=he`)
    }
  };
}

// The coach puts the number in a sentence, so it is looked for as text.
const COACH_TARGET_TEXT = /calorie target|יעד של \d|יעד הקלוריות|protein target|g target|גרם מתוך יעד/i;

async function run() {
  console.log('\nnot approved: no calculated target anywhere');
  let s = await startServer(false);
  let r;
  try {
    r = await responses(s.base);
  } finally {
    s.server.kill();
  }
  check('a person, a survey and a meal exist', r.setup.token && r.setup.userId && r.setup.survey === 201, JSON.stringify(r.setup));
  for (const [where, body] of Object.entries(r.bodies)) {
    if (where.startsWith('GET coach')) {
      const text = JSON.stringify(body);
      check(`${where}: no target in the coach's words`, !COACH_TARGET_TEXT.test(text), text.slice(0, 200));
      continue;
    }
    const found = calculatedTargets(body);
    check(`${where}: withheld`, body && found.length === 0, found.slice(0, 4).join(', ') || JSON.stringify(body).slice(0, 160));
  }
  check('the survey still keeps what the person entered', r.bodies['POST /api/surveys']?.weight_kg === 72 && r.bodies['POST /api/surveys']?.target_weight_kg === 64);
  check('and still says how much water to drink', r.bodies['POST /api/surveys']?.water_target_liters > 0);
  check('/api/targets still says why there is no number', r.bodies['GET /api/targets']?.withheldPendingApproval === true);
  // The dashboard gets a verdict rather than the number, and a verdict against
  // a withheld target gives the target away just the same.
  const daily = r.bodies['GET /api/insights/daily'];
  check('the dashboard gives no verdict against a withheld target', daily && daily.calorieStatus == null && daily.meetsProteinTarget == null,
    JSON.stringify({ calorieStatus: daily?.calorieStatus, meetsProteinTarget: daily?.meetsProteinTarget }));

  console.log('\napproved: the same requests show it');
  s = await startServer(true);
  try {
    r = await responses(s.base);
  } finally {
    s.server.kill();
  }
  const shown = (where) => calculatedTargets(r.bodies[where]).length > 0;
  for (const where of ['POST /api/surveys', 'GET /api/targets', 'GET /api/calorie-balance', 'GET /api/weekly-calorie-balance',
    'GET /api/macro-balance']) {
    check(`${where}: shown once approved`, shown(where), JSON.stringify(r.bodies[where]).slice(0, 160));
  }
  check('the dashboard gives its verdict once approved', ['under', 'over', 'perfect'].includes(r.bodies['GET /api/insights/daily']?.calorieStatus),
    JSON.stringify(r.bodies['GET /api/insights/daily']).slice(0, 160));
  check("the coach names the target once approved", COACH_TARGET_TEXT.test(JSON.stringify(r.bodies['GET coach insights (en)'])));

  // The weekly email is built in this process, from its own memory store.
  console.log('\nthe weekly email');
  const clinical = require('../utils/clinical-approval');
  const db = require('../utils/database');
  const { buildWeeklySummary, renderWeeklySummaryEmail } = require('../utils/weekly-summary');
  const user = await db.createUser('weekly@test', 'x', 'weekly@test');
  await db.createSurvey(user.id, { daily_calories: { targetDailyCalories: 1850 }, protein_target_g: 115, weight_kg: 72 });
  await db.createFoodLog(user.id, { date: WEEK_AGO, name: 'x', calories: 500, protein_grams: 20 });
  const unapproved = await buildWeeklySummary(user.id);
  check('the email carries no calculated target', unapproved.calorieTarget === null && unapproved.proteinTarget === null,
    JSON.stringify({ c: unapproved.calorieTarget, p: unapproved.proteinTarget }));
  const email = JSON.stringify(renderWeeklySummaryEmail(user, unapproved));
  check('  ...not in the text either', !/1850|115/.test(email), email.slice(0, 200));
  const real = clinical.statusFor;
  clinical.statusFor = (persona, file) => (persona === 'app-calorie-target' ? { ...real(persona, file), approved: true } : real(persona, file));
  const approved = await buildWeeklySummary(user.id);
  clinical.statusFor = real;
  check('once approved it does', approved.calorieTarget === 1850 && approved.proteinTarget === 115,
    JSON.stringify({ c: approved.calorieTarget, p: approved.proteinTarget }));
}

run()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('suite crashed:', error && error.stack);
    process.exitCode = 1;
  });
