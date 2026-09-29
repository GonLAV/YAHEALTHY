/**
 * Weekly meal planner — the pure planner (utils/meal-planner.js) and the API
 * (routes/meal-planner.js).
 *
 *   node tests/meal-planner.test.js
 *
 * Pure part: targets hit within tolerance, never an allergen (100 seeds ×
 * allergy sets), kosher (no meat with dairy in one meal), vegan/vegetarian,
 * variety, determinism, swap keeps the day on target, lock + regenerate,
 * minors (no numbers, no sizing), the safe calorie floor, shopping list
 * arithmetic and units. API part runs against the in-memory store on a free
 * port.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';

const mp = require('../utils/meal-planner');
const { ALLERGEN_WORDS, parseAllergies, termMatchesWord } = require('../utils/allergens');

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

const WEEK = '2026-09-27';
const ADULT = { minor: false, floor: 1500, needsProfessional: false };

function setup(preferences, safety = ADULT) {
  return {
    targets: mp.resolvePlanTargets({ preferences, safety }),
    dietary: mp.dietaryFromPreferences(preferences)
  };
}
const week = (preferences, seed, safety) => {
  const ctx = setup(preferences, safety);
  const plan = mp.generateWeek({ weekStart: WEEK, seed, ...ctx });
  return { ctx, plan, view: mp.presentPlan(plan, ctx) };
};
const allMeals = (plan) => plan.days.flatMap((d) => d.meals).filter((m) => m.templateId);
const ingredientsOf = (meal) => meal.items.map((i) => mp.INGREDIENTS[i.ing]);

// ─── targets ────────────────────────────────────────────────────────────────
console.log('\nmeal planner — targets\n');
{
  const combos = [
    [2000, 120, {}],
    [1600, 100, {}],
    [2600, 160, { kosher: true }],
    [3000, 180, {}],
    [1800, 130, { vegetarian: true, gluten_free: true }],
    [2200, 100, { lactose_free: true, allergies: 'nuts, sesame' }],
    [1700, 110, { kosher: true, allergies: 'fish' }]
  ];
  for (const [cal, prot, dietary] of combos) {
    const misses = [];
    for (let seed = 1; seed <= 30; seed++) {
      const { view } = week({ macroTargets: { calorieOverride: cal, protein_grams: prot }, dietary }, seed);
      for (const d of view.days) {
        if (!d.withinTolerance.kcal || !d.withinTolerance.protein) misses.push(`seed ${seed} ${d.date}: ${d.totals.kcal} kcal / ${d.totals.protein} g`);
        if (Math.abs(d.totals.kcal - cal) > cal * mp.TOLERANCE.kcal) misses.push(`kcal ${d.totals.kcal}`);
      }
    }
    check(`${cal} kcal / ${prot} g protein ${JSON.stringify(dietary)}: every day within ±${mp.TOLERANCE.kcal * 100}% kcal and ±${mp.TOLERANCE.protein * 100}% protein (30 seeds)`, misses.length === 0, misses.slice(0, 3).join('; '));
  }
  // Vegan: calories always on target; protein flagged honestly when the pool cannot reach it.
  const veganMisses = [];
  let flagged = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { view } = week({ macroTargets: { calorieOverride: 1600, protein_grams: 90 }, dietary: { vegan: true } }, seed);
    for (const d of view.days) {
      if (!d.withinTolerance.kcal) veganMisses.push(`${d.totals.kcal}`);
      const ok = Math.abs(d.totals.protein - 90) <= 90 * mp.TOLERANCE.protein;
      if (ok !== d.withinTolerance.protein) flagged++;
    }
  }
  check('vegan 1600 kcal: calories on target every day and the protein flag is truthful', veganMisses.length === 0 && flagged === 0, veganMisses.slice(0, 3).join());

  const { view } = week({ macroTargets: { calorieOverride: 2000, protein_grams: 120 } }, 5);
  const recomputed = view.days[0].meals.reduce((n, m) => n + m.items.reduce((a, i) => a + i.nutrition.kcal, 0), 0);
  check('day totals are the sum of the (rounded) ingredient values', Math.abs(recomputed - view.days[0].totals.kcal) <= 4, `${recomputed} vs ${view.days[0].totals.kcal}`);
  check('7 days × 4 meals', view.days.length === 7 && view.days.every((d) => d.meals.map((m) => m.slot).join() === mp.SLOTS.join()));
  check('dates run from the week start', view.days[0].date === WEEK && view.days[6].date === '2026-10-03');
  check('week starts on Sunday', mp.weekStartOf('2026-10-01') === WEEK && mp.weekStartOf(WEEK) === WEEK);

  const floor = mp.resolvePlanTargets({ preferences: { macroTargets: { calorieOverride: 900 } }, safety: ADULT });
  check('a calorie target under the safe floor is raised to the floor', floor.calories === 1500 && floor.warnings.includes('raised-to-floor'));
  const none = week({}, 3);
  check('no calorie target → base portions, flagged', none.ctx.targets.mode === 'no-target' && none.view.warnings.includes('no-target') && none.view.days[0].totals.kcal > 0);
  const survey = mp.resolvePlanTargets({ preferences: {}, survey: { daily_calories: { targetDailyCalories: 2100 }, protein_target_g: 110 }, safety: ADULT });
  check('falls back to the survey targets', survey.calories === 2100 && survey.protein === 110 && survey.source === 'survey');
}

// ─── safety: minors ─────────────────────────────────────────────────────────
console.log('\nmeal planner — minors\n');
{
  const prefs = { macroTargets: { calorieOverride: 1200, protein_grams: 60 } };
  const minor = { minor: true, floor: 1400, needsProfessional: true };
  const { ctx, plan, view } = week(prefs, 4, minor);
  check('minor: no targets at all (the override is ignored)', ctx.targets.mode === 'minor' && ctx.targets.calories === null && view.targets.calories === null);
  check('minor: no calorie or macro numbers anywhere', view.days.every((d) => d.totals === null && d.meals.every((m) => m.totals === null && m.items.every((i) => i.nutrition === undefined))));
  const base = allMeals(plan).every((m) => m.items.every((it, idx) => {
    const tpl = mp.TEMPLATES[m.templateId].items[idx];
    return Math.abs(it.grams - tpl.grams) <= Math.max(5, tpl.grams * 0.05) || mp.INGREDIENTS[it.ing].buy.gramsPerUnit;
  }));
  check('minor: base portions — nothing is shrunk towards a deficit', base);
  check('minor: warning carried to the client', view.warnings.includes('minor'));
}

// ─── allergies & diets ──────────────────────────────────────────────────────
console.log('\nmeal planner — allergies & diets\n');
{
  const allergySets = [
    ...Object.keys(ALLERGEN_WORDS).map((cat) => ALLERGEN_WORDS[cat][0]),
    'בוטנים ושומשום', 'פירות ים, ביצים', 'nuts', 'gluten / milk', 'tomatoes, kiwi', 'עגבניות', 'rice', 'banana', 'chickpeas and eggs',
    'peanuts, tree nuts, sesame, fish, shellfish, eggs, milk, gluten, soy'
  ];
  const dietSets = [{}, { vegan: true }, { kosher: true }, { vegetarian: true, gluten_free: true }];
  const violations = [];
  let weeks = 0;
  for (const text of allergySets) {
    const allergy = parseAllergies(text);
    for (const diets of dietSets) {
      for (let seed = 1; seed <= 100; seed++) {
        const { plan } = week({ macroTargets: { calorieOverride: 2000, protein_grams: 110 }, dietary: { ...diets, allergies: text } }, seed);
        weeks++;
        for (const m of allMeals(plan)) {
          for (const ing of ingredientsOf(m)) {
            for (const cat of ing.contains) if (allergy.categories.has(cat)) violations.push(`${text}: ${m.templateId}/${ing.id} (${cat})`);
            for (const term of allergy.terms) if (ing.words.some((w) => termMatchesWord(term, w))) violations.push(`${text}: ${m.templateId}/${ing.id} (word ${term})`);
          }
        }
      }
    }
  }
  check(`never an allergen: ${weeks} weeks (100 seeds × ${allergySets.length} allergy sets × ${dietSets.length} diets)`, violations.length === 0, violations.slice(0, 5).join('; '));

  let kosherBad = 0;
  let sawMixedWithoutKosher = false;
  for (let seed = 1; seed <= 100; seed++) {
    for (const m of allMeals(week({ macroTargets: { calorieOverride: 2200 } , dietary: { kosher: true } }, seed).plan)) {
      const cats = new Set(ingredientsOf(m).flatMap((i) => i.contains));
      if ((cats.has('meat') || cats.has('poultry')) && cats.has('dairy')) kosherBad++;
      if (cats.has('shellfish')) kosherBad++;
    }
    for (const m of allMeals(week({ macroTargets: { calorieOverride: 2200 } }, seed).plan)) {
      const cats = new Set(ingredientsOf(m).flatMap((i) => i.contains));
      if ((cats.has('meat') || cats.has('poultry')) && cats.has('dairy')) sawMixedWithoutKosher = true;
    }
  }
  check('kosher: no meal has meat/poultry with dairy, and no shellfish (100 seeds)', kosherBad === 0, `${kosherBad} meals`);
  check('the kosher test is meaningful: without kosher a meat+dairy meal does get planned', sawMixedWithoutKosher);
  check('templateConflict names the kosher rule', mp.templateConflict(mp.TEMPLATES['chicken-yogurt-rice'], mp.dietaryFromPreferences({ dietary: { kosher: true } })) === 'diet:kosher-meat-dairy');

  const animal = ['meat', 'poultry', 'fish', 'shellfish', 'egg', 'dairy'];
  let veganBad = 0;
  let vegetarianBad = 0;
  for (let seed = 1; seed <= 100; seed++) {
    for (const m of allMeals(week({ macroTargets: { calorieOverride: 1800 }, dietary: { vegan: true } }, seed).plan)) {
      if (ingredientsOf(m).some((i) => i.contains.some((c) => animal.includes(c)))) veganBad++;
    }
    for (const m of allMeals(week({ macroTargets: { calorieOverride: 1800 }, dietary: { vegetarian: true } }, seed).plan)) {
      if (ingredientsOf(m).some((i) => i.contains.some((c) => ['meat', 'poultry', 'fish', 'shellfish'].includes(c)))) vegetarianBad++;
    }
  }
  check('vegan: no animal products (100 seeds)', veganBad === 0, `${veganBad}`);
  check('vegetarian: no meat, poultry or fish (100 seeds)', vegetarianBad === 0, `${vegetarianBad}`);

  const impossible = week({ macroTargets: { calorieOverride: 2000 }, dietary: { vegan: true, allergies: 'legumes, soy, gluten, nuts, sesame' } }, 1);
  check('when nothing fits a slot it is left empty and reported, never filled with something unsafe',
    impossible.view.warnings.some((w) => w.startsWith('no-options:')) && allMeals(impossible.plan).every((m) => !mp.templateConflict(mp.TEMPLATES[m.templateId], impossible.ctx.dietary)));
}

// ─── variety & determinism ──────────────────────────────────────────────────
console.log('\nmeal planner — variety & determinism\n');
{
  const bad = [];
  for (let seed = 1; seed <= 100; seed++) {
    const { plan } = week({ macroTargets: { calorieOverride: 2000, protein_grams: 120 } }, seed);
    const at = (d, s) => plan.days[d].meals.find((m) => m.slot === s).templateId;
    const counts = new Map();
    for (let d = 0; d < 7; d++) {
      if (d > 0 && at(d, 'dinner') === at(d - 1, 'dinner')) bad.push(`seed ${seed} day ${d}: dinner repeats`);
      if (d > 0 && at(d, 'lunch') === at(d - 1, 'lunch')) bad.push(`seed ${seed} day ${d}: lunch repeats`);
      if (at(d, 'lunch') === at(d, 'dinner')) bad.push(`seed ${seed} day ${d}: lunch = dinner`);
      for (const s of ['lunch', 'dinner']) counts.set(at(d, s), (counts.get(at(d, s)) || 0) + 1);
    }
    for (const [id, n] of counts) if (n > 2) bad.push(`seed ${seed}: ${id} ×${n}`);
  }
  check('variety: no same dinner/lunch two days running, lunch ≠ dinner, a main at most twice a week (100 seeds)', bad.length === 0, bad.slice(0, 3).join('; '));

  const a = week({ macroTargets: { calorieOverride: 2000, protein_grams: 120 } }, 42).plan;
  const b = week({ macroTargets: { calorieOverride: 2000, protein_grams: 120 } }, 42).plan;
  const c = week({ macroTargets: { calorieOverride: 2000, protein_grams: 120 } }, 43).plan;
  check('same seed → the same week', JSON.stringify(a) === JSON.stringify(b));
  check('another seed → a different week', JSON.stringify(a.days) !== JSON.stringify(c.days));
}

// ─── swap, lock, regenerate ─────────────────────────────────────────────────
console.log('\nmeal planner — swap / lock / regenerate\n');
{
  const prefs = { macroTargets: { calorieOverride: 2000, protein_grams: 120 } };
  const { ctx, plan } = week(prefs, 7);
  const swapBad = [];
  for (let d = 0; d < 7; d++) {
    for (const slot of mp.SLOTS) {
      const before = plan.days[d].meals.find((m) => m.slot === slot).templateId;
      const res = mp.swapMeal(plan, { dayIndex: d, slot, ...ctx });
      if (!res.swapped) { swapBad.push(`${d}/${slot} not swapped`); continue; }
      const after = res.plan.days[d].meals.find((m) => m.slot === slot).templateId;
      if (after === before) swapBad.push(`${d}/${slot} same meal`);
      const view = mp.presentPlan(res.plan, ctx);
      if (!view.days[d].withinTolerance.kcal) swapBad.push(`${d}/${slot} ${view.days[d].totals.kcal} kcal`);
      if (JSON.stringify(res.plan.days.filter((_, i) => i !== d)) !== JSON.stringify(plan.days.filter((_, i) => i !== d))) swapBad.push(`${d}/${slot} touched other days`);
      if (slot === 'dinner') {
        const prev = d > 0 ? res.plan.days[d - 1].meals.find((m) => m.slot === 'dinner').templateId : null;
        const next = d < 6 ? res.plan.days[d + 1].meals.find((m) => m.slot === 'dinner').templateId : null;
        if (after === prev || after === next) swapBad.push(`${d}/dinner repeats a neighbour`);
      }
    }
  }
  check('swap: every meal can be swapped for a different one, the day stays within tolerance, other days untouched', swapBad.length === 0, swapBad.slice(0, 3).join('; '));
  // Smaller pool (vegetarian): a meal used twice this week must still be swappable.
  const vegFails = [];
  for (let seed = 1; seed <= 20; seed++) {
    const v = week({ macroTargets: { calorieOverride: 2000, protein_grams: 110 }, dietary: { vegetarian: true, allergies: 'peanuts' } }, seed);
    for (let d = 0; d < 7; d++) {
      for (const slot of mp.SLOTS) {
        if (!mp.swapMeal(v.plan, { dayIndex: d, slot, ...v.ctx }).swapped) vegFails.push(`seed ${seed} ${d}/${slot}`);
      }
    }
  }
  check('swap always finds an alternative when the pool has several (vegetarian, 20 seeds)', vegFails.length === 0, vegFails.slice(0, 3).join('; '));
  const twice = mp.swapMeal(mp.swapMeal(plan, { dayIndex: 2, slot: 'lunch', ...ctx }).plan, { dayIndex: 2, slot: 'lunch', ...ctx });
  check('swap is deterministic in (seed, nonce)', JSON.stringify(twice) === JSON.stringify(mp.swapMeal(mp.swapMeal(plan, { dayIndex: 2, slot: 'lunch', ...ctx }).plan, { dayIndex: 2, slot: 'lunch', ...ctx })));

  // Lock dinner on day 1 and breakfast on day 4, then regenerate with a new seed.
  let locked = mp.setLocked(plan, { dayIndex: 1, slot: 'dinner', locked: true });
  locked = mp.setLocked(locked, { dayIndex: 4, slot: 'breakfast', locked: true });
  const keep1 = JSON.stringify(locked.days[1].meals.find((m) => m.slot === 'dinner'));
  const keep4 = JSON.stringify(locked.days[4].meals.find((m) => m.slot === 'breakfast'));
  const regen = mp.generateWeek({ weekStart: WEEK, seed: 8, ...ctx, previous: locked });
  check('regenerate keeps locked meals exactly (template and grams)',
    JSON.stringify(regen.days[1].meals.find((m) => m.slot === 'dinner')) === keep1 && JSON.stringify(regen.days[4].meals.find((m) => m.slot === 'breakfast')) === keep4);
  check('regenerate changes the unlocked rest', JSON.stringify(regen.days[3]) !== JSON.stringify(plan.days[3]));
  const regenView = mp.presentPlan(regen, ctx);
  check('regenerated days with a locked meal still hit the target', regenView.days[1].withinTolerance.kcal && regenView.days[4].withinTolerance.kcal);
  const swappedAround = mp.swapMeal(locked, { dayIndex: 1, slot: 'lunch', ...ctx }).plan;
  check('swapping next to a locked meal leaves the locked one untouched', JSON.stringify(swappedAround.days[1].meals.find((m) => m.slot === 'dinner')) === keep1);

  // A new allergy after the week was planned.
  const later = mp.dietaryFromPreferences({ dietary: { allergies: 'eggs, fish' } });
  const fixed = mp.revalidate(plan, { targets: ctx.targets, dietary: later });
  check('revalidate replaces meals a newly stated allergy rules out',
    allMeals(fixed.plan).every((m) => !mp.templateConflict(mp.TEMPLATES[m.templateId], later)) && fixed.changed === allMeals(plan).some((m) => mp.templateConflict(mp.TEMPLATES[m.templateId], later)));
}

// ─── shopping list ──────────────────────────────────────────────────────────
console.log('\nmeal planner — shopping list\n');
{
  const { plan } = week({ macroTargets: { calorieOverride: 2000, protein_grams: 120 } }, 11);
  const list = mp.buildShoppingList(plan, ['egg', 'olive_oil']);
  const grams = new Map();
  for (const m of allMeals(plan)) for (const i of m.items) grams.set(i.ing, (grams.get(i.ing) || 0) + i.grams);
  const items = list.sections.flatMap((s) => s.items);
  check('one row per ingredient used in the week', items.length === grams.size && list.totalItems === grams.size);
  const units = items.every((it) => {
    const def = mp.INGREDIENTS[it.key];
    const g = grams.get(it.key);
    if (def.buy.unit === 'ml') return it.unit === 'ml' && it.amount >= g / def.buy.density && it.amount < g / def.buy.density + 10;
    if (def.buy.gramsPerUnit) return it.unit === def.buy.unit && it.amount === Math.ceil(g / def.buy.gramsPerUnit - 1e-9);
    return it.unit === 'g' && it.amount >= g && it.amount < g + 10;
  });
  check('amounts are the week\'s sum in the unit it is bought in (g / ml / whole units)', units);
  const order = list.sections.map((s) => mp.SECTIONS.indexOf(s.id));
  check('grouped by supermarket section in aisle order', order.every((v, i) => i === 0 || v > order[i - 1]) && list.sections.every((s) => s.items.every((it) => mp.INGREDIENTS[it.key].section === s.id)));
  check('checked items come back checked', items.filter((i) => i.checked).map((i) => i.key).sort().join() === ['egg', 'olive_oil'].filter((k) => grams.has(k)).sort().join());
  check('every item has both names', items.every((i) => i.he && i.en));
}

// ─── API ────────────────────────────────────────────────────────────────────

let BASE;
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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}
async function newUser(tag, preferences) {
  const signup = await call('POST', '/api/auth/signup', { body: { email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'a sufficiently long one' } });
  const token = signup.body?.token;
  if (preferences) await call('PUT', '/api/users/me/preferences', { token, body: { preferences } });
  return token;
}
async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE + '/api/health')).ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function api() {
  console.log('\nmeal planner — API\n');
  const prefs = { macroTargets: { calorieOverride: 2000, protein_grams: 120 }, dietary: { kosher: true, allergies: 'peanuts' } };
  const token = await newUser('planner', prefs);
  const other = await newUser('stranger');

  check('401 without a token', (await call('GET', '/api/meal-plans/week')).status === 401);
  const empty = await call('GET', `/api/meal-plans/week?start=2026-10-01`, { token });
  check('no plan yet → plan: null with the targets and the Sunday week start', empty.status === 200 && empty.body.plan === null && empty.body.weekStart === WEEK && empty.body.targets.calories === 2000, JSON.stringify(empty.body));

  const gen = await call('POST', '/api/meal-plans/week/generate', { token, body: { start: '2026-09-30' } });
  check('generate → 201 with 7 days', gen.status === 201 && gen.body.plan.days.length === 7 && gen.body.weekStart === WEEK, `${gen.status} ${JSON.stringify(gen.body).slice(0, 200)}`);
  const plan = gen.body.plan;
  check('API plan is sized to the stored targets', plan.days.every((d) => d.withinTolerance.kcal) && plan.targets.calories === 2000);
  const meals = plan.days.flatMap((d) => d.meals).filter((m) => m.templateId);
  check('API plan honours kosher + peanut allergy', meals.every((m) => !m.items.some((i) => i.id === 'peanut_butter')) && !meals.some((m) => m.templateId === 'chicken-yogurt-rice' || m.templateId === 'shrimp-rice'));
  check('the plan includes the shopping list', plan.shoppingList.totalItems > 5);
  check('the old single-slot meal plan list still works', (await call('GET', '/api/meal-plans', { token })).status === 200);

  const again = await call('GET', `/api/meal-plans/week?start=${WEEK}`, { token });
  check('GET returns the stored week', again.status === 200 && JSON.stringify(again.body.plan.days) === JSON.stringify(plan.days));
  check('another account cannot see it', (await call('GET', `/api/meal-plans/week?start=${WEEK}`, { token: other })).body.plan === null
    && (await call('POST', `/api/meal-plans/week/${WEEK}/swap`, { token: other, body: { day: 0, slot: 'lunch' } })).status === 404);

  const before = plan.days[2].meals.find((m) => m.slot === 'dinner').templateId;
  const swap = await call('POST', `/api/meal-plans/week/${WEEK}/swap`, { token, body: { day: 2, slot: 'dinner' } });
  const after = swap.body?.plan?.days[2].meals.find((m) => m.slot === 'dinner');
  check('swap → a different dinner, the day still on target', swap.status === 200 && after.templateId !== before && swap.body.plan.days[2].withinTolerance.kcal, `${swap.status}`);
  check('swap validates its input', (await call('POST', `/api/meal-plans/week/${WEEK}/swap`, { token, body: { day: 9, slot: 'dinner' } })).status === 400
    && (await call('POST', `/api/meal-plans/week/${WEEK}/swap`, { token, body: { day: 1, slot: 'brunch' } })).status === 400);

  const lock = await call('PUT', `/api/meal-plans/week/${WEEK}/lock`, { token, body: { day: 2, slot: 'dinner', locked: true } });
  check('lock → the meal comes back locked', lock.status === 200 && lock.body.plan.days[2].meals.find((m) => m.slot === 'dinner').locked === true);
  check('a locked meal cannot be swapped (409)', (await call('POST', `/api/meal-plans/week/${WEEK}/swap`, { token, body: { day: 2, slot: 'dinner' } })).status === 409);

  const shopping = lock.body.plan.shoppingList.sections.flatMap((s) => s.items.map((i) => i.key));
  const tick = await call('PUT', `/api/meal-plans/week/${WEEK}/shopping-list`, { token, body: { checked: [shopping[0], shopping[1], 'not-an-item'] } });
  check('shopping list ticks are saved; unknown keys dropped', tick.status === 200 && tick.body.checked.length === 2 && !tick.body.checked.includes('not-an-item'));
  const list = await call('GET', `/api/meal-plans/week/${WEEK}/shopping-list`, { token });
  check('ticks persist', list.status === 200 && list.body.sections.flatMap((s) => s.items).filter((i) => i.checked).length === 2);

  const regen = await call('POST', '/api/meal-plans/week/generate', { token, body: { start: WEEK } });
  const kept = regen.body.plan.days[2].meals.find((m) => m.slot === 'dinner');
  check('regenerate (200) keeps the locked dinner exactly', regen.status === 200 && kept.locked && kept.templateId === after.templateId && JSON.stringify(kept.items) === JSON.stringify(after.items));
  check('regenerate uses a new seed', regen.body.plan.seed !== plan.seed);

  // A new allergy after planning → the stored week drops what it rules out.
  await call('PUT', '/api/users/me/preferences', { token, body: { preferences: { ...prefs, dietary: { kosher: true, allergies: 'peanuts, eggs, fish' } } } });
  const refreshed = await call('GET', `/api/meal-plans/week?start=${WEEK}`, { token });
  const refreshedItems = refreshed.body.plan.days.flatMap((d) => d.meals).flatMap((m) => m.items.map((i) => i.id));
  check('a newly stated allergy is applied to the stored week on the next read', !refreshedItems.some((id) => ['egg', 'salmon', 'tuna', 'tilapia'].includes(id)));

  // Changed targets re-size the stored week.
  await call('PUT', '/api/users/me/preferences', { token, body: { preferences: { macroTargets: { calorieOverride: 2500, protein_grams: 140 } } } });
  const resized = await call('GET', `/api/meal-plans/week?start=${WEEK}`, { token });
  check('changed targets re-size the stored week', resized.body.plan.targets.calories === 2500 && resized.body.plan.days.every((d) => d.withinTolerance.kcal), JSON.stringify(resized.body.plan.days.map((d) => d.totals.kcal)));

  // Minor account: no numbers over the API either.
  const teen = await newUser('teen', { macroTargets: { calorieOverride: 1200 }, onboarding: { goal: 'lose_weight', profile: { age: 15, sex: 'female', heightCm: 160, weightKg: 55 } } });
  const teenPlan = await call('POST', '/api/meal-plans/week/generate', { token: teen, body: { start: WEEK } });
  check('minor: API plan has no calorie/macro numbers and no target', teenPlan.status === 201 && teenPlan.body.plan.targets.calories === null
    && teenPlan.body.plan.days.every((d) => d.totals === null) && teenPlan.body.plan.warnings.includes('minor'), JSON.stringify(teenPlan.body).slice(0, 200));

  const weeks = await call('GET', '/api/meal-plans/weeks', { token });
  check('weeks lists the stored week', weeks.status === 200 && weeks.body.weeks.length === 1 && weeks.body.weeks[0].weekStart === WEEK);
}

(async () => {
  const port = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', SUPABASE_URL: '', SUPABASE_KEY: '', ALLOW_MEMORY_DB: 'true', JWT_SECRET: 'meal-planner-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));
  let crashed = false;
  try {
    if (!(await waitForServer())) {
      console.error('server did not start:\n' + log.join(''));
      crashed = true;
    } else {
      await api();
    }
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
    crashed = true;
  } finally {
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 && !crashed ? 0 : 1);
})();
