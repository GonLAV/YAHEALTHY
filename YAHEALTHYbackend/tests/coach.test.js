/**
 * AI Coach (utils/coach.js) — rule-based, grounded in the user's own data.
 *
 * First half: the pure layer on seeded rows — each insight rule fires on the
 * data it describes and stays quiet otherwise, ordering is deterministic,
 * allergies are never violated by a meal idea, minors never get calorie-cut
 * advice, and both languages work. Second half: the mounted endpoints end to
 * end on the in-memory store.
 *
 *   node tests/coach.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'coach-test-secret';
process.env.VERCEL = '1'; // index.js exports the app instead of binding a port

const coach = require('../utils/coach');
const { MIN_SAFE_CALORIES } = require('../utils/nutrition-calculator');

const {
  buildCoachContext, buildInsights, answerQuestion, matchIntent, suggestMeals,
  parseAllergies, mealConflict, MEALS, ALLERGEN_WORDS, MAX_INSIGHTS
} = coach;

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

// ── seeding helpers ──────────────────────────────────────────────────────────
const TODAY = '2026-09-27';
const NOW = new Date(`${TODAY}T12:00:00Z`);
const day = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const food = (date, { cal = 500, protein = 30, meal = 'lunch', at } = {}) => ({
  date, name: 'x', calories: cal, protein_grams: protein, meal_type: meal, created_at: at || `${date}T12:00:00Z`
});
const water = (date, liters) => ({ date, liters_consumed: liters, created_at: `${date}T09:00:00Z` });
const sleep = (date, hours) => ({ date, sleep_hours: hours, created_at: `${date}T07:00:00Z` });
const weigh = (date, kg) => ({ date, weight_kg: kg, created_at: `${date}T07:00:00Z` });

const ctxOf = (raw = {}, { lang = 'en', tz = 'UTC', today = TODAY, now = NOW } = {}) =>
  buildCoachContext({ foodLogs: [], hydrationLogs: [], sleepLogs: [], weightLogs: [], weightGoals: [], survey: null, preferences: {}, ...raw }, { today, tz, lang, now });
const ids = (insights) => insights.map((i) => i.id);
const insightsOf = (raw, opts) => buildInsights(ctxOf(raw, opts));
const has = (insights, id) => insights.some((i) => i.id === id);
const hebrew = /[֐-׿]/;

// A "good" week: food, 3 L water, 8 h sleep on each of the last 7 days.
const goodWeek = () => {
  const f = [], h = [], s = [];
  for (let i = 1; i <= 7; i++) {
    f.push(food(day(i), { cal: 600, meal: 'breakfast' }), food(day(i), { cal: 700, meal: 'lunch' }), food(day(i), { cal: 700, meal: 'dinner' }));
    h.push(water(day(i), 3));
    s.push(sleep(day(i), 8));
  }
  return { foodLogs: f, hydrationLogs: h, sleepLogs: s };
};
const adultProfile = { sex: 'female', age: 34, heightCm: 165, weightKg: 72, targetWeightKg: 65, activityLevel: 'light' };
const minorProfile = { sex: 'male', age: 15, heightCm: 170, weightKg: 70, targetWeightKg: 62, activityLevel: 'moderate' };

console.log('\ncoach — insight rules\n');

// ── baseline / getting started ────────────────────────────────────────────────
{
  const ins = insightsOf({});
  check('a new account gets the getting-started card first', ins[0]?.id === 'getting-started', ids(ins).join());
  check('cards carry reason, action, priority and a CTA link', ins.every((i) => i.reason && i.action && ['high', 'medium', 'low'].includes(i.priority) && i.cta?.href?.startsWith('/') && i.cta?.label));
  check('legacy fields (title/content/insight_type) are kept', ins.every((i) => i.title && i.content && i.insight_type));
}

// ── streak at risk ────────────────────────────────────────────────────────────
{
  const raw = { hydrationLogs: [water(day(1), 1), water(day(2), 1), water(day(3), 1)] };
  const ins = insightsOf(raw);
  const card = ins.find((i) => i.id === 'streak-at-risk');
  check('streak at risk fires when yesterday is logged but today is not', !!card, ids(ins).join());
  check('streak card cites the streak length', card && /3 days in a row/.test(card.reason), card && card.reason);
  check('streak at risk is ranked first and high priority', ins[0]?.id === 'streak-at-risk' && ins[0].priority === 'high' && ins[0].rank === 1, ids(ins).join());
  check('streak card links to a log page', card && card.cta.href === '/hydration');

  const done = insightsOf({ hydrationLogs: [...raw.hydrationLogs, water(TODAY, 0.5)] });
  check('no streak warning once today is logged', !has(done, 'streak-at-risk'), ids(done).join());
  const short = insightsOf({ hydrationLogs: [water(day(1), 1)] });
  check('no streak warning for a 1-day "streak"', !has(short, 'streak-at-risk'), ids(short).join());
}

// ── new badge ─────────────────────────────────────────────────────────────────
{
  const ins = insightsOf({ foodLogs: [food(day(2)), food(day(1)), food(TODAY)] });
  const card = ins.find((i) => i.id === 'new-badge');
  check('a badge unlocked today is celebrated', !!card && card.kind === 'celebrate', ids(ins).join());
  check('the newest, biggest badge is named (Warming Up = 3-day streak)', card && /Warming Up/.test(card.title), card && card.title);
  check('badge card links to achievements', card && card.cta.href === '/achievements');

  const old = insightsOf({ foodLogs: [food(day(20)), food(TODAY)] });
  check('no celebration when nothing was unlocked today/yesterday', !has(old, 'new-badge'), ids(old).join());
}

// ── sleep below target 3+ nights ──────────────────────────────────────────────
{
  const w = goodWeek();
  w.sleepLogs = [sleep(day(1), 6), sleep(day(2), 5.5), sleep(day(3), 6.5), sleep(day(4), 6), sleep(day(5), 8)];
  const ins = insightsOf(w);
  const card = ins.find((i) => i.id === 'sleep-below-target');
  check('sleep under target on 3+ nights fires', !!card, ids(ins).join());
  check('sleep reason cites nights and the average', card && /on 4 of the 5 nights/.test(card.reason) && /average 6\.4 h/.test(card.reason), card && card.reason);
  check('sleep card links to /sleep', card && card.cta.href === '/sleep');
  check('generic weakest-sleep card is not shown next to it', !has(ins, 'weakest-sleep'));

  const two = goodWeek();
  two.sleepLogs = [sleep(day(1), 6), sleep(day(2), 6), ...[3, 4, 5, 6, 7].map((i) => sleep(day(i), 8))];
  check('only 2 short nights → no sleep card', !has(insightsOf(two), 'sleep-below-target'));

  const custom = goodWeek();
  custom.sleepLogs = [1, 2, 3, 4].map((i) => sleep(day(i), 7));
  check('uses the onboarding sleep target (7 h → 7 h nights are fine)', !has(insightsOf({ ...custom, preferences: { sleepTargetHours: 7 } }), 'sleep-below-target'));
}

// ── weakest Health Score component ────────────────────────────────────────────
{
  const w = goodWeek();
  w.hydrationLogs = [1, 2, 3, 4, 5, 6, 7].map((i) => water(day(i), i <= 2 ? 3 : 0.5));
  const ins = insightsOf(w);
  const card = ins.find((i) => i.id === 'weakest-hydration');
  check('weakest component this week is found (hydration)', !!card, ids(ins).join());
  check('reason cites goal hits ("2 of the 7 days")', card && /hit your water goal \(2\.5 L\) on 2 of the 7 days/.test(card.reason), card && card.reason);
  check('reason cites the points it costs', card && /about \d+(\.\d)? points a day/.test(card.reason), card && card.reason);
  check('it links to /hydration with one concrete tip', card && card.cta.href === '/hydration' && /glass of water/.test(card.action));

  const water3 = { ...w, preferences: { waterTargetLiters: 0.5 } };
  check('the user’s own water target is used', !has(insightsOf(water3), 'weakest-hydration'));
  check('a good week has no weakest-component card', !insightsOf(goodWeek()).some((i) => i.id.startsWith('weakest-')));
}

// ── protein consistently below target ─────────────────────────────────────────
{
  const w = goodWeek();
  w.foodLogs = [1, 2, 3, 4, 5].map((i) => food(day(i), { cal: 1800, protein: 60 }));
  const prefs = { macroTargets: { calorieOverride: 1800, protein_grams: 120 } };
  const ins = insightsOf({ ...w, preferences: prefs });
  const card = ins.find((i) => i.id === 'protein-low');
  check('protein under 80% of target on most days fires', !!card, ids(ins).join());
  check('protein reason cites days, target and average', card && /On 5 of the 5 days/.test(card.reason) && /120 g target/.test(card.reason) && /average 60 g/.test(card.reason), card && card.reason);

  const ok = goodWeek();
  ok.foodLogs = [1, 2, 3, 4, 5].map((i) => food(day(i), { cal: 1800, protein: 110 }));
  check('protein near target → no card', !has(insightsOf({ ...ok, preferences: prefs }), 'protein-low'));
  check('no protein target → no card', !has(insightsOf(w), 'protein-low'));

  const vegan = insightsOf({ ...w, preferences: { ...prefs, dietary: { vegan: true, allergies: 'soy' } } }).find((i) => i.id === 'protein-low');
  check('protein tips respect vegan + soy allergy', vegan && /lentils/.test(vegan.action) && !/chicken|fish|eggs|yogurt|tofu/i.test(vegan.action), vegan && vegan.action);
}

// ── late-night eating ─────────────────────────────────────────────────────────
{
  const late = [1, 3, 5].map((i) => food(day(i), { meal: 'snack', at: `${day(i)}T23:10:00Z` }));
  const ins = insightsOf({ foodLogs: late });
  const card = ins.find((i) => i.id === 'late-night-eating');
  check('3 late-night days in 14 fires', !!card, ids(ins).join());
  check('late-night reason cites the days', card && /On 3 of the last 14 days/.test(card.reason), card && card.reason);
  check('late-night wording is cautious ("if that’s when you’re actually eating")', card && /If that's when/.test(card.action));

  const backfilled = [1, 3, 5].map((i) => food(day(i + 1), { meal: 'snack', at: `${day(i)}T23:10:00Z` }));
  check('back-filled entries (logged for an earlier day) do not count', !has(insightsOf({ foodLogs: backfilled }), 'late-night-eating'));
  const lunches = [1, 3, 5].map((i) => food(day(i), { meal: 'lunch', at: `${day(i)}T23:10:00Z` }));
  check('a lunch logged late at night is not "late eating"', !has(insightsOf({ foodLogs: lunches }), 'late-night-eating'));
  const afterMidnight = [1, 3, 5].map((i) => food(day(i), { meal: 'dinner', at: `${day(i - 1)}T01:30:00Z` }));
  check('after-midnight dinner counts toward the previous evening', has(insightsOf({ foodLogs: afterMidnight }), 'late-night-eating'));
  const tzLate = [1, 3, 5].map((i) => food(day(i), { meal: 'dinner', at: `${day(i)}T20:30:00Z` }));
  check('local time decides: 20:30Z is 23:30 in Jerusalem', has(insightsOf({ foodLogs: tzLate }, { tz: 'Asia/Jerusalem' }), 'late-night-eating'));
  check('…and is not late in UTC', !has(insightsOf({ foodLogs: tzLate }, { tz: 'UTC' }), 'late-night-eating'));
  check('two late days → no card', !has(insightsOf({ foodLogs: late.slice(0, 2) }), 'late-night-eating'));
}

// ── weight trend vs goal ──────────────────────────────────────────────────────
{
  const raw = {
    foodLogs: [food(TODAY)],
    weightLogs: [weigh(day(20), 80), weigh(day(10), 79.2), weigh(TODAY, 78.6)],
    weightGoals: [{ start_weight_kg: 80, target_weight_kg: 72 }],
    preferences: { onboarding: { goal: 'lose_weight', profile: { ...adultProfile, weightKg: 80, targetWeightKg: 72 } } }
  };
  const ins = insightsOf(raw);
  const card = ins.find((i) => i.id === 'weight-trend');
  check('weight moving toward the goal is noted', !!card && card.kind === 'celebrate', ids(ins).join());
  check('weight reason cites the numbers and the goal', card && /from 80 to 78\.6 kg/.test(card.reason) && /goal: 72 kg/.test(card.reason), card && card.reason);
  check('weight wording makes no promises', card && !/will (lose|reach)|guarantee|promise/i.test(card.reason + card.action));

  const up = { ...raw, weightLogs: [weigh(day(20), 80), weigh(TODAY, 80.8)] };
  const upCard = insightsOf(up).find((i) => i.id === 'weight-trend');
  check('weight moving away gets a neutral, non-judgmental tip', upCard && upCard.kind === 'tip' && /swings are normal/.test(upCard.action));
  check('under a week of weigh-ins → no weight card', !has(insightsOf({ ...raw, weightLogs: [weigh(day(3), 80), weigh(TODAY, 79)] }), 'weight-trend'));
  const minor = { ...raw, preferences: { onboarding: { goal: 'lose_weight', profile: minorProfile } } };
  check('minors get no weight-trend card', !has(insightsOf(minor), 'weight-trend'));
}

// ── safety: extreme targets / flags ───────────────────────────────────────────
{
  const raw = { foodLogs: [food(TODAY)], preferences: { macroTargets: { calorieOverride: 900 }, onboarding: { goal: 'lose_weight', profile: adultProfile } } };
  const ins = insightsOf(raw);
  check('a calorie target under the safe floor → professional card first', ins[0]?.id === 'safety-professional', ids(ins).join());
  check('safety card cites the target and the floor', /900 kcal/.test(ins[0].reason) && new RegExp(`${MIN_SAFE_CALORIES.female.toLocaleString('en-US')} kcal`).test(ins[0].reason), ins[0].reason);
  check('no calories-left card next to an unsafe target', !has(ins, 'calories-today'));

  const bmiHigh = insightsOf({ foodLogs: [food(TODAY)], preferences: { onboarding: { goal: 'lose_weight', profile: { ...adultProfile, weightKg: 125 } } } });
  check('onboarding bmi-high flag → professional card', has(bmiHigh, 'safety-professional'));
  const water = insightsOf({ preferences: { waterTargetLiters: 7 } });
  check('an extreme water target → professional card', has(water, 'safety-professional') && /7 L/.test(water.find((i) => i.id === 'safety-professional').reason));
  check('an ordinary adult gets no safety card', !has(insightsOf({ foodLogs: [food(TODAY)], preferences: { macroTargets: { calorieOverride: 1800 }, onboarding: { goal: 'lose_weight', profile: adultProfile } } }), 'safety-professional'));
}

// ── minors ────────────────────────────────────────────────────────────────────
{
  const raw = {
    foodLogs: [food(TODAY, { cal: 900 })],
    weightLogs: [weigh(day(20), 70), weigh(TODAY, 71)],
    weightGoals: [{ start_weight_kg: 70, target_weight_kg: 62 }],
    preferences: { onboarding: { goal: 'lose_weight', profile: minorProfile } }
  };
  const ctx = ctxOf(raw);
  check('onboarding age < 18 marks the context as minor', ctx.safety.minor && ctx.safety.flags.includes('minor'));
  const ins = buildInsights(ctx);
  check('minors: no calories card', !has(ins, 'calories-today'), ids(ins).join());
  check('minors: the under-18 note is shown', has(ins, 'safety-professional') && /under 18/.test(ins.find((i) => i.id === 'safety-professional').reason));
  const withTarget = ctxOf({ ...raw, preferences: { ...raw.preferences, macroTargets: { calorieOverride: 1500, protein_grams: 100 } } });
  check('minors: a stored calorie/protein target is ignored', withTarget.goals.calorieTarget === null && withTarget.goals.proteinTarget === null);
  for (const lang of ['en', 'he']) {
    const c = ctxOf(raw, { lang });
    const w = answerQuestion(c, lang === 'he' ? 'איך לרדת במשקל מהר?' : 'how do I lose weight fast?');
    check(`minors (${lang}): weight question gets no deficit advice`, !/deficit|גירעון קלורי קטן|300|500/.test(w) && /(18|parent|הורה)/.test(w), w);
    const d = answerQuestion(c, lang === 'he' ? 'מה לאכול לארוחת ערב?' : 'what should I eat for dinner?');
    check(`minors (${lang}): dinner ideas carry no calorie numbers`, !/kcal|קק"ל|left today|נשארו/.test(d), d);
    const cal = answerQuestion(c, lang === 'he' ? 'כמה קלוריות נשארו לי?' : 'how many calories do I have left?');
    check(`minors (${lang}): calorie question gets the under-18 note, not a number to cut to`, /(under 18|מתחת לגיל 18)/.test(cal) && !/left|נותרו/.test(cal), cal);
  }
}

// ── max, ordering, determinism ────────────────────────────────────────────────
{
  const w = goodWeek();
  w.foodLogs = [1, 2, 3, 4, 5].map((i) => food(day(i), { cal: 1800, protein: 50, meal: 'dinner', at: `${day(i)}T23:00:00Z` }));
  w.hydrationLogs = [1, 2, 3, 4, 5].map((i) => water(day(i), 0.5));
  w.sleepLogs = [1, 2, 3, 4, 5].map((i) => sleep(day(i), 5));
  const raw = { ...w, preferences: { macroTargets: { calorieOverride: 1800, protein_grams: 120 } } };
  const a = insightsOf(raw);
  const reversed = insightsOf({ ...raw, foodLogs: raw.foodLogs.slice().reverse(), sleepLogs: raw.sleepLogs.slice().reverse(), hydrationLogs: raw.hydrationLogs.slice().reverse() });
  check(`never more than ${MAX_INSIGHTS} insights`, a.length === MAX_INSIGHTS, `${a.length}: ${ids(a).join()}`);
  check('ranks are 1..n in order', a.every((i, n) => i.rank === n + 1));
  check('ordering is deterministic regardless of row order', JSON.stringify(ids(a)) === JSON.stringify(ids(reversed)), `${ids(a)} vs ${ids(reversed)}`);
  check('expected priority order: streak → sleep → weakest → protein', JSON.stringify(ids(a)) === JSON.stringify(['streak-at-risk', 'sleep-below-target', 'weakest-hydration', 'protein-low']), ids(a).join());
  const again = insightsOf(raw);
  check('same input → identical output', JSON.stringify(a) === JSON.stringify(again));
}

// ── bilingual ─────────────────────────────────────────────────────────────────
{
  const raw = { hydrationLogs: [water(day(1), 1), water(day(2), 1), water(day(3), 1)] };
  const en = insightsOf(raw, { lang: 'en' });
  const he = insightsOf(raw, { lang: 'he' });
  check('Hebrew and English produce the same cards', JSON.stringify(ids(en)) === JSON.stringify(ids(he)));
  check('Hebrew cards are in Hebrew', he.every((i) => hebrew.test(i.title) && hebrew.test(i.reason) && hebrew.test(i.action) && hebrew.test(i.cta.label)));
  check('English cards contain no Hebrew', en.every((i) => !hebrew.test(i.title + i.reason + i.action + i.cta.label)));
  check('Hebrew streak reason cites the number', /3 ימים ברצף/.test(he.find((i) => i.id === 'streak-at-risk').reason));
}

console.log('\ncoach — allergies & meal ideas\n');

// ── allergy parsing ───────────────────────────────────────────────────────────
{
  const cases = [
    ['peanuts', ['peanut']],
    ['Allergic to peanuts and sesame', ['peanut', 'sesame']],
    ['בוטנים ושומשום', ['peanut', 'sesame']],
    ['פירות ים, ביצים', ['shellfish', 'egg']],
    ['nuts', ['peanut', 'tree_nut']],
    ['gluten / milk', ['gluten', 'dairy']],
    ['טחינה', ['sesame']],
    ['Shrimp', ['shellfish']]
  ];
  for (const [text, cats] of cases) {
    const p = parseAllergies(text);
    check(`"${text}" → ${cats.join('+')}`, cats.every((c) => p.categories.has(c)), [...p.categories].join());
  }
}

// ── no meal idea ever matches a stated allergy ────────────────────────────────
{
  let violations = [];
  let combos = 0;
  const dietSets = [[], ['vegan'], ['vegetarian'], ['kosher'], ['gluten_free'], ['lactose_free'], ['vegetarian', 'gluten_free']];
  for (const [cat, words] of Object.entries(ALLERGEN_WORDS)) {
    for (const word of words) {
      for (const diets of dietSets) {
        for (const lang of ['en', 'he']) {
          const dietary = Object.fromEntries(diets.map((d) => [d, true]));
          const ctx = ctxOf({ foodLogs: [food(TODAY, { cal: 900 })], preferences: { macroTargets: { calorieOverride: 2000, protein_grams: 110 }, dietary: { ...dietary, allergies: word } } }, { lang });
          for (const meal of ['main', 'breakfast', 'snack']) {
            combos++;
            const { ideas } = suggestMeals(ctx, meal, 50);
            for (const m of ideas) {
              if (m.contains.includes(cat)) violations.push(`${word}/${diets}/${meal}: ${m.id}`);
            }
          }
          // The chat answer must not name a dish that contains the allergen.
          const text = answerQuestion(ctx, lang === 'he' ? 'מה לאכול לארוחת ערב?' : 'what should I eat for dinner?');
          for (const m of MEALS.filter((x) => x.contains.includes(cat))) {
            if (text.includes(m[lang])) violations.push(`answer ${lang} "${word}": ${m.id}`);
          }
        }
      }
    }
  }
  check(`no meal idea contains an allergen the user listed (${combos} combinations)`, violations.length === 0, violations.slice(0, 5).join('; '));
}
{
  const ctx = ctxOf({ preferences: { dietary: { allergies: 'tomatoes, kiwi' } } });
  const { ideas } = suggestMeals(ctx, 'main', 50);
  check('free-text allergy with no category (tomatoes) still filters by ingredient', ideas.length > 0 && ideas.every((m) => !m.words.some((w) => /tomato/.test(w))), ideas.map((m) => m.id).join());
  const he = ctxOf({ preferences: { dietary: { allergies: 'עגבניות' } } });
  check('Hebrew free-text allergy (עגבניות) filters by ingredient', suggestMeals(he, 'main', 50).ideas.every((m) => !m.words.includes('עגבניות')));
}
{
  const ctx = ctxOf({ preferences: { dietary: { vegan: true, allergies: 'peanuts' } } });
  const { ideas } = suggestMeals(ctx, 'main', 50);
  check('vegan ideas contain no animal products', ideas.length > 0 && ideas.every((m) => !m.contains.some((c) => ['meat', 'poultry', 'fish', 'shellfish', 'egg', 'dairy'].includes(c))), ideas.map((m) => m.id).join());
  check('kosher excludes shellfish', !suggestMeals(ctxOf({ preferences: { dietary: { kosher: true } } }), 'main', 50).ideas.some((m) => m.contains.includes('shellfish')));
  check('mealConflict explains why', mealConflict(MEALS.find((m) => m.id === 'apple-pb'), ctx.dietary) === 'allergy:peanut');
}
{
  const everything = 'peanuts, tree nuts, sesame, fish, shellfish, eggs, milk, gluten, soy, legumes, chicken, beef, fruit, quinoa, rice, potatoes, oats';
  const ctx = ctxOf({ preferences: { dietary: { vegan: true, allergies: everything } } });
  const text = answerQuestion(ctx, 'what should I eat for dinner?');
  check('when nothing fits, the coach says so instead of guessing', /couldn't find/.test(text) && /dietitian/.test(text), text);
}

// ── dinner uses today's remaining macros ──────────────────────────────────────
{
  const ctx = ctxOf({
    foodLogs: [food(TODAY, { cal: 1500, protein: 50, meal: 'lunch' })],
    preferences: { macroTargets: { calorieOverride: 2000, protein_grams: 120 }, dietary: { allergies: 'sesame' } }
  });
  const text = answerQuestion(ctx, 'what should I eat for dinner?');
  check('dinner answer cites the remaining calories and protein', /about 500 kcal and 70 g protein left today/.test(text), text);
  check('dinner answer mentions the allergy it respected', /sesame/.test(text) && /ingredient labels/.test(text));
  const { ideas } = suggestMeals(ctx, 'main');
  check('with protein left, the highest-protein ideas that fit come first', ideas[0].protein >= 30 && ideas.every((m) => m.kcal <= 600), ideas.map((m) => `${m.id}:${m.kcal}/${m.protein}`).join());
  const over = ctxOf({ foodLogs: [food(TODAY, { cal: 2300, protein: 130 })], preferences: { macroTargets: { calorieOverride: 2000 } } });
  const overText = answerQuestion(over, 'dinner?');
  check('over target → lighter options, and no "skip the meal"', /lighter options first/.test(overText) && /No need to skip/.test(overText), overText);
  const he = answerQuestion(ctxOf({ foodLogs: [food(TODAY, { cal: 1500, protein: 50 })], preferences: { macroTargets: { calorieOverride: 2000, protein_grams: 120 } } }, { lang: 'he' }), 'מה לאכול לארוחת ערב?');
  check('Hebrew dinner answer cites the numbers', /כ-500 קק"ל/.test(he) && /70 גרם חלבון/.test(he), he);
  const low = answerQuestion(ctxOf({ foodLogs: [food(TODAY, { cal: 400 })], preferences: { macroTargets: { calorieOverride: 900 }, onboarding: { goal: 'lose_weight', profile: adultProfile } } }), 'dinner ideas');
  check('an unsafe calorie target is flagged inside the dinner answer', /safe minimum/.test(low), low);
}

console.log('\ncoach — /ask intents\n');

{
  const cases = [
    ['how am I doing this week?', 'week'], ['hows it goinggg', 'week'], ['איך הלך לי השבוע?', 'week'], ['מה המצב?', 'week'],
    ['what should I eat for dinner', 'meal'], ['what shoud i eat for diner', 'meal'], ['dinnr ideas pls', 'meal'], ['מה לאכול לארוחת ערב?', 'meal'], ['אני רעבה', 'meal'],
    ['why is my score low', 'score'], ['why is my scroe so low??', 'score'], ['למה הציון שלי נמוך?', 'score'],
    ['how do I keep my streak', 'streak'], ['how do i keep my streek', 'streak'], ['איך שומרים על הרצף?', 'streak'],
    ['am I drinking enough wter', 'water'], ['שתיתי מספיק מים?', 'water'],
    ['slep tips', 'sleep'], ['protien?', 'protein'], ['ומה עם חלבון', 'protein'], ['weigth', 'weight'],
    ['do I have diabetes?', 'medical'], ['אני בהריון, מה לאכול?', 'medical'], ['should I take pills to lose weight', 'medical'],
    ['I want to eat 800 calories a day', 'low-calorie'], ['500 קלוריות ביום זה בסדר?', 'low-calorie'],
    ['I had steak', 'fallback'], ['asdf qwerty', 'fallback'], ['hi', 'help'], ['ערב טוב', 'help'], ['thanks!', 'thanks']
  ];
  for (const [msg, want] of cases) {
    const got = matchIntent(msg).id;
    check(`"${msg}" → ${want}`, got === want, `got ${got}`);
  }
}

{
  const w = goodWeek();
  w.hydrationLogs = [1, 2, 3, 4, 5, 6, 7].map((i) => water(day(i), i <= 2 ? 3 : 1));
  const raw = { ...w, foodLogs: [...w.foodLogs, food(TODAY, { cal: 400 })], preferences: { macroTargets: { calorieOverride: 2000, protein_grams: 100 } } };
  const en = ctxOf(raw);
  const week = answerQuestion(en, 'how am I doing this week?');
  check('week answer cites logged days, water hits and averages', /logged food on 7/.test(week) && /2\.5 L goal on 2 of 7 days/.test(week) && /8 h on average over 7 logged nights/.test(week), week);
  check('week answer gives one next step and today so far', /Best next step:/.test(week) && /Today so far: 400 kcal of 2,000/.test(week), week);
  const heWeek = answerQuestion(ctxOf(raw, { lang: 'he' }), 'איך הלך לי השבוע?');
  check('Hebrew week answer is Hebrew and grounded', hebrew.test(heWeek) && /ב-2 מתוך 7 ימים/.test(heWeek), heWeek);

  const score = answerQuestion(en, 'why is my score low');
  check('score answer quotes today’s score and the components that lost points', score.includes(`${en.eng.healthScore.today}/100`) && /Where the points went:/.test(score) && /not a medical assessment/.test(score), score);
  const streak = answerQuestion(en, 'how do I keep my streak?');
  check('streak answer uses the real streak and what counts', /8-day streak/.test(streak) && /Any entry counts/.test(streak), streak);
  const empty = answerQuestion(ctxOf({}), 'how am I doing this week?');
  check('no data → says so instead of inventing a week', /don't have any logs/.test(empty), empty);
  const fb = answerQuestion(en, 'what is the capital of France');
  check('unknown intent → helpful fallback with real data, no invention', /not sure I understood/.test(fb) && /Today so far/.test(fb), fb);
  const med = answerQuestion(ctxOf({}, { lang: 'he' }), 'יש לי סוכרת, מה לעשות?');
  check('medical question → referral, no diagnosis (he)', /רופא/.test(med) && /לא יכול לאבחן/.test(med), med);
  const lowCal = answerQuestion(ctxOf({ preferences: { onboarding: { profile: adultProfile } } }), 'is 800 calories a day ok?');
  check('a sub-floor calorie plan is refused with the floor', /800 kcal/.test(lowCal) && /1,200 kcal/.test(lowCal), lowCal);
  const adultWeight = answerQuestion(ctxOf({ preferences: { onboarding: { goal: 'lose_weight', profile: adultProfile } } }), 'how do I lose weight');
  check('adult weight answer: gradual, no promises', /small steady deficit/.test(adultWeight) && /No promises/.test(adultWeight), adultWeight);
  const underweight = answerQuestion(ctxOf({ preferences: { onboarding: { goal: 'lose_weight', profile: { ...adultProfile, weightKg: 48 } } } }), 'how do I lose weight');
  check('underweight + lose goal → no deficit, see a doctor', /won't suggest a calorie deficit/.test(underweight), underweight);
}

// ── mounted endpoints ─────────────────────────────────────────────────────────
let BASE;
async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}

async function endToEnd() {
  console.log('\ncoach — endpoints\n');
  const signup = await call('POST', '/api/auth/signup', { body: { email: `coach-${Date.now()}@example.com`, password: 'correct horse battery' } });
  check('signup', signup.status === 201, JSON.stringify(signup.body));
  const token = signup.body?.token;
  const userId = signup.body?.id || signup.body?.user?.id;
  const prefs = await call('PUT', '/api/users/me/preferences', {
    token,
    body: { preferences: { macroTargets: { calorieOverride: 2000, protein_grams: 120 }, dietary: { vegetarian: true, allergies: 'peanuts, sesame' }, onboarding: { goal: 'eat_healthier', profile: adultProfile } } }
  });
  check('preferences saved', prefs.status === 200, JSON.stringify(prefs.body));
  const today = new Date().toISOString().slice(0, 10);
  await call('POST', '/api/food-logs', { token, body: { date: today, name: 'Oats', mealType: 'breakfast', calories: 1200, proteinGrams: 40 } });

  const ins = await call('GET', `/api/crm/users/${userId}/insights?lang=en&tz=Asia/Jerusalem&date=${today}`, { token });
  check('insights endpoint returns prioritized cards', ins.status === 200 && Array.isArray(ins.body) && ins.body.length >= 1 && ins.body.length <= MAX_INSIGHTS && ins.body[0].rank === 1 && ins.body[0].cta?.href, JSON.stringify(ins.body));
  const insHe = await call('GET', `/api/crm/users/${userId}/insights?lang=he&date=${today}`, { token });
  check('insights endpoint speaks Hebrew', insHe.status === 200 && insHe.body.every((i) => hebrew.test(i.title)));
  const other = await call('GET', `/api/crm/users/not-me/insights`, { token });
  check('someone else’s insights are refused', other.status === 403);

  const ask = await call('POST', `/api/crm/users/${userId}/ask?lang=en&date=${today}`, { token, body: { message: 'what should I eat for dinner?' } });
  const text = ask.body?.response || '';
  check('ask: dinner answer uses remaining calories', ask.status === 200 && /about 800 kcal and 80 g protein left today/.test(text), text);
  const banned = MEALS.filter((m) => m.contains.some((c) => ['peanut', 'sesame', 'meat', 'poultry', 'fish', 'shellfish'].includes(c)));
  check('ask: no idea with peanuts/sesame or meat for a vegetarian', banned.every((m) => !text.includes(m.en)), text);
  const askHe = await call('POST', `/api/crm/users/${userId}/ask?lang=he&date=${today}`, { token, body: { message: 'איך שומרים על הרצף?' } });
  check('ask: Hebrew streak answer', askHe.status === 200 && /רצף/.test(askHe.body?.response || ''), askHe.body?.response);
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
    await endToEnd();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
