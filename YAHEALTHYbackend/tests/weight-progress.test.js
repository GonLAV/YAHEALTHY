/**
 * What a weigh-in is allowed to be congratulated for.
 *
 * The version this replaces congratulated any decrease at all — no floor, no
 * rate check, no direction check — with an English sentence built on the server
 * and rendered inside a Hebrew interface. "Any loss is good news, the faster
 * the better" is the one message a product with an eating-disorder boundary
 * should never send.
 *
 *   node tests/weight-progress.test.js
 */

const {
  assessWeighIn,
  MIN_MEANINGFUL_KG,
  MIN_DAYS_BETWEEN,
  MAX_WEEKLY_LOSS_PERCENT
} = require('../utils/weight-progress');

let passed = 0;
let failed = 0;

const check = (name, condition, detail) => {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// A loss goal: 90 kg down to 75 kg.
const LOSS = { startKg: 90, targetKg: 75 };
// A gain goal, which is a real goal too.
const GAIN = { startKg: 55, targetKg: 65 };

console.log('\nweigh-in celebration rules\n');

console.log('what is celebrated');
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 87.2 });
  check('steady progress towards a loss goal', v.code === 'progress', JSON.stringify(v));
  check('  ...and it reports the change, not a sentence', v.deltaKg === 0.8, JSON.stringify(v));
  check('  ...and how far is left', v.remainingKg === 12.2, JSON.stringify(v));
}
{
  const v = assessWeighIn({ ...GAIN, previousKg: 57, previousAt: daysAgo(7), currentKg: 57.9 });
  check('gaining towards a gain goal is progress', v.code === 'progress', JSON.stringify(v));
  // 0.9 kg at 57 kg is 1.58% a week, over the loss ceiling. Applying a
  // safe-weight-LOSS rate to somebody working their way up from underweight
  // would silence exactly the person who most needs the encouragement.
  check('  ...and the loss rate ceiling does not apply to it', v.tooFast === false, JSON.stringify(v));
}
{
  const v = assessWeighIn({ ...LOSS, previousKg: 76, previousAt: daysAgo(7), currentKg: 75 });
  check('reaching the goal is its own moment', v.code === 'goal_reached', JSON.stringify(v));
  check('  ...with nothing left to go', v.remainingKg === 0);
}
{
  const v = assessWeighIn({ ...GAIN, previousKg: 64, previousAt: daysAgo(7), currentKg: 65.5 });
  check('passing a gain target counts as reached', v.code === 'goal_reached', JSON.stringify(v));
}

console.log('\nwhat is not — the floor');
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 87.9 });
  check(`0.1 kg is below the ${MIN_MEANINGFUL_KG} kg floor`, v.code === null,
    'this used to fire — overnight water read as an achievement');
  check('  ...but it still reports what is left', v.remainingKg === 12.9, JSON.stringify(v));
}
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 88 });
  check('no change at all is not progress', v.code === null);
}

console.log('\nwhat is not — direction');
{
  const v = assessWeighIn({ ...GAIN, previousKg: 57, previousAt: daysAgo(7), currentKg: 55.5 });
  check('losing weight against a GAIN goal is not congratulated', v.code === null,
    'the old code congratulated any decrease, whatever the goal was');
}
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 89.5 });
  check('gaining against a loss goal is not congratulated', v.code === null);
  check('  ...and nothing scolds them either', v.tooFast === false, JSON.stringify(v));
}

console.log('\nwhat is not — too soon to mean anything');
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(1), currentKg: 87.2 });
  check(`a weigh-in ${MIN_DAYS_BETWEEN - 1} day apart describes hydration`, v.code === null,
    JSON.stringify(v));
}
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: null, currentKg: 87 });
  check('no previous weigh-in means nothing to compare', v.code === null);
}
{
  const v = assessWeighIn({ ...LOSS, previousKg: undefined, previousAt: null, currentKg: 88 });
  check('the very first weigh-in is not an achievement', v.code === null);
}

console.log('\nwhat is not — too fast');
{
  // 4 kg in a week at 88 kg is ~4.5% of body weight.
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 84 });
  check(`above ${MAX_WEEKLY_LOSS_PERCENT}% of body weight a week, nothing is celebrated`,
    v.code === null, JSON.stringify(v));
  check('  ...and it is flagged for a person, not for the user', v.tooFast === true);
}
{
  // 20 kg in a month — the case the old code congratulated identically to 0.3 kg.
  const v = assessWeighIn({ ...LOSS, previousKg: 90, previousAt: daysAgo(30), currentKg: 70 });
  check('20 kg in a month is not congratulated', v.code !== 'progress', JSON.stringify(v));
}
{
  // 0.8 kg in a week at 88 kg is ~0.9%, just inside.
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 87.2 });
  check('a healthy rate is still celebrated', v.code === 'progress', JSON.stringify(v));
  check('  ...and is not flagged', v.tooFast === false);
}

console.log('\nit never returns a sentence');
{
  const v = assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 87.2 });
  check('no message field anywhere in the verdict',
    !('message' in v) && Object.values(v).every((x) => typeof x !== 'string' || x === v.code),
    JSON.stringify(v));
}

console.log('\nbad input');
{
  check('a non-numeric weight is quiet',
    assessWeighIn({ ...LOSS, previousKg: 88, previousAt: daysAgo(7), currentKg: 'x' }).code === null);
  check('a missing goal is quiet',
    assessWeighIn({ startKg: undefined, targetKg: undefined, previousKg: 88, previousAt: daysAgo(7), currentKg: 87 }).code === null);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
