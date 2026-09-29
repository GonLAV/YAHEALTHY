/**
 * Weekly meal planner API (auth on every route). Mounted at /api/meal-plans
 * ahead of the single-slot /api/meal-plans/:id routes in index.js.
 *
 *   GET  /api/meal-plans/week?start=YYYY-MM-DD        the week containing `start` (Sunday-based), or plan: null
 *   GET  /api/meal-plans/weeks                        stored weeks, newest first
 *   POST /api/meal-plans/week/generate                { start, seed? } — new week; locked meals are kept
 *   POST /api/meal-plans/week/:start/swap             { day: 0–6, slot } — swap one meal, day stays on target
 *   PUT  /api/meal-plans/week/:start/lock             { day, slot, locked }
 *   GET  /api/meal-plans/week/:start/shopping-list    aggregated list, grouped by section
 *   PUT  /api/meal-plans/week/:start/shopping-list    { checked: string[] } — full list of checked keys
 *
 * The planning itself is pure and lives in utils/meal-planner.js; targets and
 * safety flags are read the way the coach reads them (utils/coach.js).
 */

const express = require('express');
const { z, ZodError } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');
const planner = require('../utils/meal-planner');
const { resolveSafety } = require('../utils/coach');

const router = express.Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'invalid date');
const slotSchema = z.enum(planner.SLOTS);
const daySchema = z.number().int().min(0).max(planner.DAYS - 1);

const todayUtc = () => new Date().toISOString().slice(0, 10);
const pos = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** Everything the planner needs about the user: targets, safety, diet/allergies. */
async function loadUserContext(userId) {
  const [preferences, survey] = await Promise.all([
    Promise.resolve(db.getUserPreferences(userId)).catch(() => null),
    Promise.resolve(db.getLatestSurvey(userId)).catch(() => null)
  ]);
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  const onb = prefs.onboarding && typeof prefs.onboarding === 'object' ? prefs.onboarding : {};
  const macro = prefs.macroTargets && typeof prefs.macroTargets === 'object' ? prefs.macroTargets : {};
  const safety = resolveSafety({
    profile: onb.profile,
    mainGoal: typeof onb.goal === 'string' ? onb.goal : null,
    calorieTarget: pos(macro.calorieOverride) ?? pos(survey?.daily_calories?.targetDailyCalories),
    waterTargetLiters: null,
    sleepTargetHours: null,
    now: new Date()
  });
  const targets = planner.resolvePlanTargets({ preferences: prefs, survey, safety });
  const dietary = planner.dietaryFromPreferences(prefs);
  return { targets, dietary };
}

/** A stable per-user, per-week starting seed (so a first generate is reproducible). */
function initialSeed(userId, weekStart) {
  let h = 2166136261;
  for (const ch of `${userId}|${weekStart}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 2147483646) + 1;
}

const sameTargets = (a, b) =>
  a && b && a.mode === b.mode && a.calories === b.calories && a.protein === b.protein;

/**
 * Bring a stored week in line with the user's current settings: meals that a
 * newly stated allergy/diet rules out are replaced, and when the targets
 * changed the unlocked meals are re-sized. Saves when anything moved.
 */
async function refreshStored(userId, row, ctx) {
  let plan = row.plan;
  let changed = false;
  const res = planner.revalidate(plan, ctx);
  if (res.changed) {
    plan = res.plan;
    changed = true;
  }
  if (!sameTargets(plan.targets, ctx.targets)) {
    plan = { ...plan, targets: ctx.targets, days: plan.days.map((d) => ({ ...d, meals: planner.sizeDay(d.meals, ctx.targets) })) };
    changed = true;
  }
  if (changed) row = await db.saveMealPlannerWeek(userId, row.week_start, { seed: row.seed, plan });
  return row;
}

function respond(res, row, ctx) {
  return res.json({
    weekStart: row.week_start,
    plan: planner.presentPlan(row.plan, { targets: ctx.targets, dietary: ctx.dietary, checked: row.checked_items || [] }),
    checked: row.checked_items || []
  });
}

function handleError(res, req, error, what) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
  }
  console.error(`[meal-planner] ${what} failed:`, error.message);
  return res.status(500).json({ error: `Failed to ${what}`, requestId: req.id });
}

async function loadWeek(req, res) {
  const start = planner.weekStartOf(isoDate.parse(req.params.start));
  const userId = req.user.userId;
  const ctx = await loadUserContext(userId);
  let row = await db.getMealPlannerWeek(userId, start);
  if (!row) {
    res.status(404).json({ error: 'No plan for that week', requestId: req.id });
    return null;
  }
  row = await refreshStored(userId, row, ctx);
  return { start, userId, ctx, row };
}

router.get('/week', auth.authMiddleware, async (req, res) => {
  try {
    const start = planner.weekStartOf(isoDate.parse(req.query.start || todayUtc()));
    const userId = req.user.userId;
    const ctx = await loadUserContext(userId);
    let row = await db.getMealPlannerWeek(userId, start);
    if (!row) {
      return res.json({
        weekStart: start,
        plan: null,
        checked: [],
        targets: ctx.targets.mode === 'minor'
          ? { mode: 'minor', calories: null, protein: null, carbs: null, fat: null }
          : { mode: ctx.targets.mode, calories: ctx.targets.calories, protein: ctx.targets.protein, carbs: ctx.targets.carbs, fat: ctx.targets.fat }
      });
    }
    row = await refreshStored(userId, row, ctx);
    return respond(res, row, ctx);
  } catch (error) {
    return handleError(res, req, error, 'load the meal plan');
  }
});

router.get('/weeks', auth.authMiddleware, async (req, res) => {
  try {
    const rows = await db.listMealPlannerWeeks(req.user.userId);
    return res.json({ weeks: rows.map((r) => ({ weekStart: r.week_start, updatedAt: r.updated_at })) });
  } catch (error) {
    return handleError(res, req, error, 'list meal plans');
  }
});

router.post('/week/generate', auth.authMiddleware, async (req, res) => {
  try {
    const body = z.object({ start: isoDate.optional(), seed: z.number().int().min(1).max(2147483646).optional() }).strict().parse(req.body || {});
    const start = planner.weekStartOf(body.start || todayUtc());
    const userId = req.user.userId;
    const ctx = await loadUserContext(userId);
    const existing = await db.getMealPlannerWeek(userId, start);
    const seed = body.seed ?? (existing ? (Number(existing.seed) % 2147483646) + 1 : initialSeed(userId, start));
    const plan = planner.generateWeek({ weekStart: start, seed, targets: ctx.targets, dietary: ctx.dietary, previous: existing ? existing.plan : null });
    // Keep ticks for items still on the list.
    const stillThere = new Set(planner.buildShoppingList(plan).sections.flatMap((s) => s.items.map((i) => i.key)));
    const checkedItems = (existing?.checked_items || []).filter((k) => stillThere.has(k));
    const row = await db.saveMealPlannerWeek(userId, start, { seed, plan, checkedItems });
    return res.status(existing ? 200 : 201).json({
      weekStart: row.week_start,
      plan: planner.presentPlan(row.plan, { targets: ctx.targets, dietary: ctx.dietary, checked: row.checked_items || [] }),
      checked: row.checked_items || []
    });
  } catch (error) {
    return handleError(res, req, error, 'generate the meal plan');
  }
});

router.post('/week/:start/swap', auth.authMiddleware, async (req, res) => {
  try {
    const { day, slot } = z.object({ day: daySchema, slot: slotSchema }).strict().parse(req.body || {});
    const loaded = await loadWeek(req, res);
    if (!loaded) return undefined;
    const { userId, ctx, row } = loaded;
    const meal = row.plan.days[day]?.meals.find((m) => m.slot === slot);
    if (meal && meal.locked) {
      return res.status(409).json({ error: 'That meal is locked — unlock it to swap', requestId: req.id });
    }
    const result = planner.swapMeal(row.plan, { dayIndex: day, slot, targets: ctx.targets, dietary: ctx.dietary });
    if (!result.swapped) {
      return res.status(409).json({ error: 'No other meal fits this slot with your preferences', code: 'no-alternative', requestId: req.id });
    }
    const saved = await db.saveMealPlannerWeek(userId, row.week_start, { seed: row.seed, plan: result.plan });
    return respond(res, saved, ctx);
  } catch (error) {
    return handleError(res, req, error, 'swap the meal');
  }
});

router.put('/week/:start/lock', auth.authMiddleware, async (req, res) => {
  try {
    const { day, slot, locked } = z.object({ day: daySchema, slot: slotSchema, locked: z.boolean() }).strict().parse(req.body || {});
    const loaded = await loadWeek(req, res);
    if (!loaded) return undefined;
    const { userId, ctx, row } = loaded;
    const saved = await db.saveMealPlannerWeek(userId, row.week_start, { seed: row.seed, plan: planner.setLocked(row.plan, { dayIndex: day, slot, locked }) });
    return respond(res, saved, ctx);
  } catch (error) {
    return handleError(res, req, error, 'lock the meal');
  }
});

router.get('/week/:start/shopping-list', auth.authMiddleware, async (req, res) => {
  try {
    const loaded = await loadWeek(req, res);
    if (!loaded) return undefined;
    return res.json({ weekStart: loaded.row.week_start, ...planner.buildShoppingList(loaded.row.plan, loaded.row.checked_items || []) });
  } catch (error) {
    return handleError(res, req, error, 'build the shopping list');
  }
});

router.put('/week/:start/shopping-list', auth.authMiddleware, async (req, res) => {
  try {
    const { checked } = z.object({ checked: z.array(z.string().max(64)).max(200) }).strict().parse(req.body || {});
    const start = planner.weekStartOf(isoDate.parse(req.params.start));
    const userId = req.user.userId;
    const row = await db.getMealPlannerWeek(userId, start);
    if (!row) return res.status(404).json({ error: 'No plan for that week', requestId: req.id });
    const known = new Set(planner.buildShoppingList(row.plan).sections.flatMap((s) => s.items.map((i) => i.key)));
    const clean = Array.from(new Set(checked.filter((k) => known.has(k))));
    const saved = await db.setMealPlannerChecked(userId, start, clean);
    return res.json({ weekStart: start, checked: saved ? saved.checked_items : clean });
  } catch (error) {
    return handleError(res, req, error, 'save the shopping list');
  }
});

module.exports = router;
module.exports.loadUserContext = loadUserContext;
