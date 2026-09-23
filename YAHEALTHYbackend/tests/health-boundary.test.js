/**
 * The health boundary, on the channel where the product actually operates.
 *
 * The WhatsApp number refuses to auto-answer somebody who mentions a
 * pregnancy, diabetes, an eating disorder or a child: 36 flag terms, an
 * 'escalated' status, an approval registry that halts production, and eight
 * adversarial evals. The app had none of it. The same woman who got no bot
 * reply on WhatsApp opened the app and was told to run a 300-500 kcal deficit.
 *
 * Three things are checked here, and each one was a live defect:
 *   1. the coach hands off instead of advising when a flag is tripped,
 *   2. a target weight below a healthy BMI is refused,
 *   3. a calculated calorie target is withheld until it is clinically approved.
 *
 *   node tests/health-boundary.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'health-boundary-test-secret';

const path = require('path');
const coach = require('../utils/coach');
const { flagsIn, HEALTH_FLAGS_HE, HEALTH_FLAGS_EN } = require('../utils/health-flags');
const { checkGoalWeight, MIN_HEALTHY_BMI } = require('../utils/weight-goal-safety');
const clinical = require('../utils/clinical-approval');

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

/** A hand-off, in either language. */
const isHandoff = (reply) =>
  reply.includes('אשת המקצוע') || reply.includes('dietitian');

async function run() {
  // ── one list, both channels ───────────────────────────────────────────────
  console.log('\nthe flag list');
  check('the WhatsApp webhook and the app read the same module',
    require('../utils/health-flags') === require('../utils/health-flags'));
  check('Hebrew terms are present', HEALTH_FLAGS_HE.length >= 30, `${HEALTH_FLAGS_HE.length}`);
  check('English terms are present', HEALTH_FLAGS_EN.length >= 20,
    'the list was Hebrew-only while the app answers in English too');
  check('matching is case-folded', flagsIn('I am PREGNANT').length > 0,
    'an English stem would not match a capitalised word otherwise');

  // ── the coach refuses rather than advises ─────────────────────────────────
  console.log('\nthe coach hands off');
  const flagged = [
    ['אני בהריון ורוצה לרדת במשקל', 'he'],
    ['יש לי סוכרת, מה לאכול?', 'he'],
    ['יש לי הפרעת אכילה', 'he'],
    ['הבת שלי בת 14, איזו דיאטה?', 'he'],
    ['I have diabetes, what should I eat?', 'en'],
    ['I am pregnant and want to lose weight', 'en'],
    ['I have an eating disorder', 'en'],
    ['my daughter is 16, what diet?', 'en'],
  ];

  for (const [message, lang] of flagged) {
    const reply = await coach.answer('test-user', message, lang);
    check(`handed off: ${JSON.stringify(message.slice(0, 32))}`, isHandoff(reply), reply.slice(0, 60));
    check(
      '  ...and no calorie prescription in it',
      !/300-500|deficit|גירעון/.test(reply),
      'this is the exact text the WhatsApp bot is forbidden from sending'
    );
  }

  console.log('\nordinary questions still get answers');
  for (const [message, lang, expect] of [
    ['כמה מים כדאי לשתות?', 'he', 'מים'],
    ['how much protein?', 'en', 'rotein'],
    ['what is a balanced meal', 'en', 'meal'],
  ]) {
    const reply = await coach.answer('test-user', message, lang);
    check(`answered: ${JSON.stringify(message.slice(0, 28))}`,
      !isHandoff(reply) && reply.includes(expect), reply.slice(0, 60));
  }

  // ── a goal the product will not draw a line to ────────────────────────────
  console.log('\ntarget weight has a floor');
  const at165 = checkGoalWeight(32, 165);
  check('32 kg at 1.65 m is refused', at165.ok === false,
    'validateWeight accepted anything from 30 to 300 kg with no reference to the body');
  check('  ...the refusal says what the minimum is', typeof at165.minimumKg === 'number' && at165.minimumKg > 45,
    JSON.stringify(at165));
  check('  ...and the minimum is itself above the line',
    at165.minimumKg / (1.65 ** 2) >= MIN_HEALTHY_BMI, `${at165.minimumKg}`);

  check('a reasonable goal is allowed', checkGoalWeight(60, 165).ok === true);
  check('a goal right on the line is allowed', checkGoalWeight(51, 165).ok === true,
    JSON.stringify(checkGoalWeight(51, 165)));

  check('with no height recorded, 32 kg is still refused', checkGoalWeight(32, null).ok === false,
    'the fallback floor is below the underweight line for any adult height');
  check('with no height recorded, 60 kg is allowed', checkGoalWeight(60, null).ok === true);
  check('a non-numeric target is refused', checkGoalWeight('abc', 165).ok === false);

  // ── the clinical gate covers the app, not only the bots ───────────────────
  console.log('\nthe calculated calorie target is gated');
  const status = clinical.statusFor(
    'app-calorie-target',
    path.join(__dirname, '..', 'utils', 'health-calculations.js')
  );
  check('the app target has a registry entry', status.reason !== 'no registry entry for this persona',
    'the approval mechanism guarded whapi-brain.js alone');
  check('it is not approved, so the number is withheld', status.approved === false, status.reason);
  check('the live hash is recorded so it can be approved', typeof status.liveSha256 === 'string' && status.liveSha256.length === 64);
}

(async () => {
  console.log('\nhealth boundary — the app side');
  try {
    await run();
    console.log(`\n${passed} passed, ${failed} failed\n`);
  } catch (error) {
    console.error('suite crashed:', error && error.message);
    process.exit(1);
  }
  process.exit(failed === 0 ? 0 : 1);
})();
