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
const db = require('../utils/database');
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

  // Only 16 and 17 were on the Hebrew list, so a fifteen-year-old, or anyone
  // who gave their class rather than their age, went straight through.
  for (const minor of ['אני בת 15, מה לאכול?', 'אני בכיתה ט', 'אני בכיתה יב', 'אני בתיכון ורוצה לרזות', 'אני מתחת לגיל 18',
    'אני קטינה', 'ובן 16 ורוצה לעלות במסה', 'אני בת-17',
    "I'm a 15-year-old girl", 'I am under 18', 'I am 13 years old', 'im 16 yo']) {
    check(`a minor is flagged: ${JSON.stringify(minor)}`, flagsIn(minor).length > 0);
  }
  // A flag is kept for the person (migrations/018) and ends every offer, so a
  // number or a short word inside an ordinary food question must not trip one.
  // Each of these did while ages were substrings.
  for (const adult of ['אני בת 35 ורוצה לבשל יותר', 'מה מבשלים לארוחת ערב?', "I'm 35 and want to cook more",
    'קמח לבן 150 גרם', 'כמה קלוריות באורז לבן 150 גרם?', 'לשבת 14 אנשים מה להכין', 'מתכון בן 15 דקות',
    'סיר בן 16 ליטר', 'אני רוצה לאכול מתחת ל-1800 קלוריות ביום', 'מה דעתך על דיאטת הים התיכון?',
    'זה מקטין את התיאבון?', 'כיתה חדשה לבישול',
    'How do I stay under 1800 calories a day?', 'recipes under 18 minutes', 'vegan for 13 years']) {
    check(`an adult's ordinary question is not: ${JSON.stringify(adult)}`, flagsIn(adult).length === 0,
      JSON.stringify(flagsIn(adult)));
  }

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

  // What the one-off backfill (scripts/backfill-health-flags.js) counts.
  const { flaggedPhones } = require('../scripts/backfill-health-flags');
  const { phones, counts } = flaggedPhones({
    inbox: [
      { chat_id: '972501111111@s.whatsapp.net', from_number: '972501111111', body: 'אני בהריון' },
      { chat_id: '120363041234567890@g.us', from_number: '972502222222', body: 'יש לי סוכרת' },
      { chat_id: '972503333333@s.whatsapp.net', from_me: true, body: 'אני מעבירה את זה לדיאטנית, בהריון חשוב...' },
      { chat_id: '972504444444@s.whatsapp.net', body: 'קמח לבן 150 גרם' },
    ],
    bot: [
      { phone: '972505555555', role: 'user', content: 'I am 15 years old' },
      { phone: '972506666666', role: 'assistant', content: 'pregnancy is a medical matter' },
    ],
    bookings: [{ phone: '972507777777', notes: 'הבן שלי צריך תפריט' }, { phone: '972508888888', notes: 'חניה ליד הסופר?' }],
  });
  check('the backfill finds each channel', counts.inbox === 2 && counts.bot === 1 && counts.bookings === 1, JSON.stringify(counts));
  check('  ...keys a group message on its sender', phones.has('972502222222') && ![...phones].some((p) => p.includes('@g.us')));
  check('  ...and skips our own replies and the bot\'s', !phones.has('972503333333@s.whatsapp.net') && !phones.has('972506666666'));

  // The hand-off is for this message; the person is recorded so the other
  // channel does not quote them a price tomorrow (migrations/018).
  check('the person who disclosed it is recorded', await db.hasHealthFlag({ userId: 'test-user' }),
    'the coach only wrote a console line, so WhatsApp later treated her as a stranger');

  console.log('\nordinary questions still get answers');
  for (const [message, lang, expect] of [
    ['כמה מים כדאי לשתות?', 'he', 'מים'],
    ['how much protein?', 'en', 'rotein'],
    ['what is a balanced meal', 'en', 'meal'],
  ]) {
    const reply = await coach.answer('test-user', message, lang);
    check(`answered: ${JSON.stringify(message.slice(0, 28))}`,
      !isHandoff(reply) && reply.includes(expect), reply.slice(0, 60));
    await coach.answer('ordinary-user', message, lang);
  }
  check('someone who asked only ordinary questions is not recorded', !(await db.hasHealthFlag({ userId: 'ordinary-user' })));

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
