/**
 * Fast food logging — mounted at /api/food-logs, ahead of the older handlers
 * in index.js (so `/suggestions` is not taken for an `:id`).
 *
 *   POST   /                       log one food: from the catalog (foodId + grams,
 *                                  values computed here) or typed/quick-add
 *                                  (name + calories)
 *   GET    /suggestions?meal=&tz=  "Log again": own foods ranked by frequency,
 *                                  recency and time of day (utils/food-logging.js)
 *   POST   /copy                   copy a day, or one meal of it, into another
 *                                  (defaults: yesterday → today in `tz`)
 *   POST   /undo                   delete just-logged rows (own rows only)
 *   POST   /template               save a favourite food or a whole meal
 *   POST   /templates/from-meal    save what was logged at a meal as a saved meal
 *   GET    /templates              list favourites + saved meals
 *   PATCH  /templates/:id          rename / change meal slot
 *   DELETE /templates/:id
 *   POST   /templates/:id/log      log a favourite / saved meal in one tap
 *
 * Every read and write is scoped by req.user.userId in utils/database.js, so a
 * template or log id belonging to someone else is simply "not found".
 * Rows are written with db.createFoodLog(s), the same path as every other
 * log, so streaks and the Health Score (utils/engagement.js) see them.
 */

const express = require('express');
const { z, ZodError } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');
const { forRequest: reqLog } = require('../utils/logger');
const { resolveRequestDate } = require('../utils/log-date');
const { MEAL_TYPES, rankSuggestions, mealForHour, localHour, addDaysIso, scaleFood } = require('../utils/food-logging');

const router = express.Router();

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TZ = z.string().max(64);
const ID = z.string().uuid();
const SUGGESTION_WINDOW_DAYS = 90;
const MAX_MEAL_ITEMS = 30;

const round1 = (v) => (v == null ? null : Math.round(Number(v) * 10) / 10);

function fail(req, res, error, message) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
  }
  if (error && error.status) {
    return res.status(error.status).json({ error: error.message, requestId: req.id });
  }
  reqLog(req).error(message, { err: error });
  return res.status(500).json({ error: message, requestId: req.id });
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

function dayFor(req, { date, tz }) {
  const resolved = resolveRequestDate({ date, tz });
  if (resolved.error) throw httpError(400, resolved.error);
  return resolved.date;
}

// One food as the client describes it. A catalog food (foodId + grams) has its
// values computed here from the sourced per-100 g row; whatever calories the
// client sent for it are ignored.
const foodFields = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    mealType: z.enum(MEAL_TYPES).nullable().optional(),
    calories: z.number().nonnegative().max(20000).optional(),
    proteinGrams: z.number().nonnegative().max(2000).nullable().optional(),
    carbsGrams: z.number().nonnegative().max(2000).nullable().optional(),
    fatGrams: z.number().nonnegative().max(2000).nullable().optional(),
    quantity: z.number().nonnegative().max(100000).nullable().optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    foodId: ID.nullable().optional(),
    grams: z.number().positive().max(5000).optional()
  });
const hasValues = [
  (v) => (v.foodId ? v.grams != null : Boolean(v.name) && v.calories != null),
  { message: 'Give foodId + grams, or name + calories' }
];
const foodInput = foodFields.refine(...hasValues);

/** Client food description → food_logs/template columns. */
async function resolveFood(data) {
  if (data.foodId) {
    const food = await db.getFoodById(data.foodId);
    if (!food) throw httpError(404, 'Food not found');
    const v = scaleFood(food, data.grams);
    return {
      name: data.name || food.name_he,
      calories: v.kcal ?? 0,
      protein_grams: v.proteinG,
      carbs_grams: v.carbsG,
      fat_grams: v.fatG,
      quantity: data.grams,
      unit: 'g',
      food_id: food.id,
      notes: data.notes?.trim() || null
    };
  }
  return {
    name: data.name,
    calories: data.calories,
    protein_grams: data.proteinGrams ?? null,
    carbs_grams: data.carbsGrams ?? null,
    fat_grams: data.fatGrams ?? null,
    quantity: data.quantity ?? null,
    unit: data.unit || null,
    food_id: null,
    notes: data.notes?.trim() || null
  };
}

/** A stored row (log or template item) → a new log row for `date`/`mealType`. */
const copyOf = (row, date, mealType) => ({
  date,
  name: row.name,
  meal_type: mealType ?? row.meal_type ?? null,
  calories: row.calories ?? 0,
  protein_grams: row.protein_grams ?? null,
  carbs_grams: row.carbs_grams ?? null,
  fat_grams: row.fat_grams ?? null,
  quantity: row.quantity ?? null,
  unit: row.unit ?? null,
  food_id: row.food_id ?? null,
  notes: row.notes ?? null
});

/** A log row → the item shape stored in a saved meal. */
const itemOf = (row) => ({
  name: row.name,
  calories: Number(row.calories) || 0,
  protein_grams: row.protein_grams ?? null,
  carbs_grams: row.carbs_grams ?? null,
  fat_grams: row.fat_grams ?? null,
  quantity: row.quantity ?? null,
  unit: row.unit ?? null,
  food_id: row.food_id ?? null
});

function totalsOf(items) {
  const sum = (key) => {
    const known = items.filter((i) => i[key] != null);
    return known.length ? round1(known.reduce((s, i) => s + Number(i[key]), 0)) : null;
  };
  return {
    calories: sum('calories') ?? 0,
    protein_grams: sum('protein_grams'),
    carbs_grams: sum('carbs_grams'),
    fat_grams: sum('fat_grams')
  };
}

// ── log one food ──────────────────────────────────────────────────────────
router.post('/', auth.authMiddleware, async (req, res) => {
  try {
    const data = foodFields
      .extend({ date: ISO.optional(), tz: TZ.optional() })
      .refine(...hasValues)
      .parse(req.body || {});
    const date = dayFor(req, data);
    const food = await resolveFood(data);
    const row = await db.createFoodLog(req.user.userId, { date, meal_type: data.mealType || null, ...food });
    return res.status(201).json(row);
  } catch (error) {
    return fail(req, res, error, 'Failed to create food log');
  }
});

// ── "log again" suggestions ───────────────────────────────────────────────
router.get('/suggestions', auth.authMiddleware, async (req, res) => {
  try {
    const q = z
      .object({
        meal: z.enum(MEAL_TYPES).optional(),
        tz: TZ.optional(),
        limit: z.coerce.number().int().min(1).max(20).optional()
      })
      .parse(req.query);
    const now = new Date();
    const today = dayFor(req, { tz: q.tz });
    const meal = q.meal || mealForHour(localHour(now, q.tz || 'UTC'));
    const logs = await db.getFoodLogs(req.user.userId, { start: addDaysIso(today, -SUGGESTION_WINDOW_DAYS), end: today });
    const suggestions = rankSuggestions(logs, { meal, tz: q.tz || 'UTC', now, limit: q.limit ?? 8 });
    return res.json({ meal, inferredMeal: !q.meal, date: today, suggestions });
  } catch (error) {
    return fail(req, res, error, 'Failed to get food suggestions');
  }
});

// ── copy a day or a meal ──────────────────────────────────────────────────
router.post('/copy', auth.authMiddleware, async (req, res) => {
  try {
    const body = z
      .object({
        fromDate: ISO.optional(),
        toDate: ISO.optional(),
        tz: TZ.optional(),
        mealType: z.enum(MEAL_TYPES).optional(),
        toMealType: z.enum(MEAL_TYPES).optional()
      })
      .parse(req.body || {});
    // "Today" and "yesterday" are the user's, not the server's.
    const toDate = dayFor(req, { date: body.toDate, tz: body.tz });
    const fromDate = body.fromDate || addDaysIso(toDate, -1);
    const targetMeal = body.toMealType || body.mealType || null;
    if (fromDate === toDate && (!body.mealType || !targetMeal || targetMeal === body.mealType)) {
      throw httpError(400, 'fromDate must be different than toDate');
    }

    const source = (await db.getFoodLogs(req.user.userId, { date: fromDate }))
      .filter((l) => !body.mealType || l.meal_type === body.mealType)
      // Oldest first, so the copies keep the day's order.
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const created = await db.createFoodLogs(
      req.user.userId,
      source.map((l) => copyOf(l, toDate, body.mealType ? targetMeal : null))
    );
    return res.status(201).json({
      fromDate,
      toDate,
      mealType: body.mealType || null,
      copiedCount: created.length,
      ids: created.map((r) => r.id),
      logs: created
    });
  } catch (error) {
    return fail(req, res, error, 'Failed to copy food logs');
  }
});

// ── undo ──────────────────────────────────────────────────────────────────
router.post('/undo', auth.authMiddleware, async (req, res) => {
  try {
    const { ids } = z.object({ ids: z.array(ID).min(1).max(100) }).parse(req.body || {});
    const deleted = await db.deleteFoodLogs(req.user.userId, ids);
    if (!deleted.length) return res.status(404).json({ error: 'Food log not found', requestId: req.id });
    return res.json({ status: 'ok', deletedCount: deleted.length, ids: deleted.map((r) => r.id) });
  } catch (error) {
    return fail(req, res, error, 'Failed to undo food logs');
  }
});

// ── favourites & saved meals ──────────────────────────────────────────────
const templateBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meal'),
    name: z.string().trim().min(1).max(120),
    mealType: z.enum(MEAL_TYPES).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    items: z.array(foodInput).min(1).max(MAX_MEAL_ITEMS)
  }),
  z.object({ kind: z.literal('food') }).passthrough()
]);

router.post('/template', auth.authMiddleware, async (req, res) => {
  try {
    const raw = { kind: 'food', ...(req.body || {}) };
    const parsed = templateBody.parse(raw);
    let template;
    if (parsed.kind === 'meal') {
      const items = [];
      for (const item of parsed.items) items.push(itemOf(await resolveFood(item)));
      template = {
        kind: 'meal',
        name: parsed.name,
        meal_type: parsed.mealType ?? null,
        notes: parsed.notes?.trim() || null,
        items,
        ...totalsOf(items)
      };
    } else {
      const data = foodInput.parse(raw);
      const food = await resolveFood(data);
      template = { kind: 'food', meal_type: data.mealType ?? null, ...food };
    }
    const row = await db.createFoodLogTemplate(req.user.userId, template);
    return res.status(201).json(row);
  } catch (error) {
    return fail(req, res, error, 'Failed to create food log template');
  }
});

router.post('/templates/from-meal', auth.authMiddleware, async (req, res) => {
  try {
    const body = z
      .object({
        date: ISO.optional(),
        tz: TZ.optional(),
        mealType: z.enum(MEAL_TYPES),
        name: z.string().trim().min(1).max(120)
      })
      .parse(req.body || {});
    const date = dayFor(req, body);
    const logs = (await db.getFoodLogs(req.user.userId, { date }))
      .filter((l) => l.meal_type === body.mealType)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, MAX_MEAL_ITEMS);
    if (!logs.length) throw httpError(404, 'Nothing logged at that meal');
    const items = logs.map(itemOf);
    const row = await db.createFoodLogTemplate(req.user.userId, {
      kind: 'meal',
      name: body.name,
      meal_type: body.mealType,
      notes: null,
      items,
      ...totalsOf(items)
    });
    return res.status(201).json(row);
  } catch (error) {
    return fail(req, res, error, 'Failed to save meal');
  }
});

router.get('/templates', auth.authMiddleware, async (req, res) => {
  try {
    const q = z
      .object({
        kind: z.enum(['food', 'meal']).optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        offset: z.coerce.number().int().nonnegative().max(100000).optional()
      })
      .refine((v) => (v.offset == null ? true : v.limit != null), { message: 'offset requires limit' })
      .parse(req.query);
    const rows = await db.getFoodLogTemplates(req.user.userId, { limit: q.limit ?? null, offset: q.offset ?? null });
    return res.json((rows || []).filter((r) => !q.kind || r.kind === q.kind));
  } catch (error) {
    return fail(req, res, error, 'Failed to get food log templates');
  }
});

router.patch('/templates/:id', auth.authMiddleware, async (req, res) => {
  try {
    const id = ID.parse(req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        mealType: z.enum(MEAL_TYPES).nullable().optional()
      })
      .refine((v) => v.name !== undefined || v.mealType !== undefined, { message: 'Nothing to change' })
      .parse(req.body || {});
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.mealType !== undefined ? { meal_type: body.mealType } : {})
    };
    const row = await db.updateFoodLogTemplate(req.user.userId, id, patch);
    if (!row) return res.status(404).json({ error: 'Template not found', requestId: req.id });
    return res.json(row);
  } catch (error) {
    return fail(req, res, error, 'Failed to update food log template');
  }
});

router.delete('/templates/:id', auth.authMiddleware, async (req, res) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const deleted = await db.deleteFoodLogTemplate(req.user.userId, id);
    if (!deleted) return res.status(404).json({ error: 'Template not found', requestId: req.id });
    return res.json({ status: 'ok', deleted });
  } catch (error) {
    return fail(req, res, error, 'Failed to delete food log template');
  }
});

router.post('/templates/:id/log', auth.authMiddleware, async (req, res) => {
  try {
    const id = ID.parse(req.params.id);
    const body = z
      .object({ date: ISO.optional(), tz: TZ.optional(), mealType: z.enum(MEAL_TYPES).optional() })
      .parse(req.body || {});
    const template = await db.getFoodLogTemplateById(req.user.userId, id);
    if (!template) return res.status(404).json({ error: 'Template not found', requestId: req.id });

    const date = dayFor(req, body);
    const meal = body.mealType || template.meal_type || mealForHour(localHour(new Date(), body.tz || 'UTC'));
    const rows = template.kind === 'meal' && template.items?.length
      ? template.items.map((item) => copyOf(item, date, meal))
      : [copyOf({ ...template, notes: null }, date, meal)];
    const created = await db.createFoodLogs(req.user.userId, rows);
    return res.status(201).json({
      templateId: template.id,
      date,
      mealType: meal,
      loggedCount: created.length,
      ids: created.map((r) => r.id),
      logs: created
    });
  } catch (error) {
    return fail(req, res, error, 'Failed to log saved meal');
  }
});

module.exports = router;
