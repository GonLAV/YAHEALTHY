/**
 * Food values — lookup and arithmetic, nothing more.
 *
 * Every number returned here came from a cited database and travels with the
 * reference it came from, so a nutrition consultant answering a customer can
 * always say where it is from. Nothing in this file estimates, rounds a guess
 * into place, or fills a gap: a food with no sourced value is reported as
 * unknown, which is a useful answer, unlike a plausible wrong one.
 *
 * 🩺 This is arithmetic on published values. It is not advice. Nothing here
 * tells anyone what they should eat, how much they should weigh, or what their
 * deficit ought to be — those come from the survey and from a person.
 */

const express = require('express');
const auth = require('../utils/auth');
const db = require('../utils/database');

const router = express.Router();

// Attribution travels with the value, not in a footnote somewhere else.
function present(food) {
  return {
    id: food.id,
    nameHe: food.name_he,
    nameEn: food.name_en,
    category: food.category,
    state: food.state,
    per100g: {
      kcal: food.kcal_per_100g,
      proteinG: food.protein_g,
      carbsG: food.carbs_g,
      fatG: food.fat_g,
      fiberG: food.fiber_g,
      sugarG: food.sugar_g,
      sodiumMg: food.sodium_mg,
    },
    commonServings: food.common_servings || [],
    source: {
      name: food.source,
      ref: food.source_ref,
      detail: food.source_detail,
      retrievedAt: food.retrieved_at,
    },
    noteHe: food.note_he || null,
  };
}

/**
 * GET /api/foods/search?q=עגבנייה
 */
router.get('/search', auth.authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Search for at least two characters', requestId: req.id });
    }

    const found = await db.searchFoods(q, 20);
    return res.json({ query: q, count: found.length, foods: found.map(present) });
  } catch (error) {
    return res.status(500).json({ error: 'Food search failed', requestId: req.id });
  }
});

/**
 * POST /api/foods/calculate
 *
 * Body: { items: [{ foodId, grams }] } or { items: [{ foodId, servings: 2 }] }
 *
 * This is what turns "250 grams of chicken and 150 of rice" into a number. It
 * refuses rather than guesses: an item with no grams and no known serving
 * weight comes back in `unresolved` with the reason, and is left out of the
 * total. A total that quietly skipped an item it could not price would be
 * worse than no total at all.
 */
router.post('/calculate', auth.authMiddleware, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'items is required', requestId: req.id });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: 'Too many items in one request', requestId: req.id });
    }

    const resolved = [];
    const unresolved = [];

    for (const item of items) {
      const food = item.foodId ? await db.getFoodById(item.foodId) : null;
      if (!food) {
        unresolved.push({ item, reason: 'no such food in the database' });
        continue;
      }

      let grams = null;

      if (typeof item.grams === 'number' && item.grams > 0) {
        grams = item.grams;
      } else if (item.servingName) {
        // Portion weights come from the source database, so this conversion is
        // as traceable as the calorie value itself.
        const serving = (food.common_servings || []).find(
          (s) => s.name_he === item.servingName || s.name_en === item.servingName
        );
        if (serving) grams = serving.grams * (item.servings || 1);
      }

      if (grams == null) {
        unresolved.push({
          item,
          foodNameHe: food.name_he,
          reason:
            'no weight given and no sourced portion weight for this food — ' +
            'ask for grams rather than assuming one',
          availableServings: food.common_servings || [],
        });
        continue;
      }

      const factor = grams / 100;
      const scale = (value) => (value == null ? null : Math.round(value * factor * 10) / 10);

      resolved.push({
        foodId: food.id,
        nameHe: food.name_he,
        grams,
        kcal: scale(food.kcal_per_100g),
        proteinG: scale(food.protein_g),
        carbsG: scale(food.carbs_g),
        fatG: scale(food.fat_g),
        source: { name: food.source, ref: food.source_ref },
      });
    }

    const sum = (key) =>
      Math.round(resolved.reduce((total, row) => total + (row[key] || 0), 0) * 10) / 10;

    return res.json({
      items: resolved,
      total: {
        kcal: sum('kcal'),
        proteinG: sum('proteinG'),
        carbsG: sum('carbsG'),
        fatG: sum('fatG'),
      },
      // Named, not hidden. Whoever reads the total has to see what is missing
      // from it.
      unresolved,
      complete: unresolved.length === 0,
      noteHe:
        'ערכים ל-100 גרם ממקור מצוטט. זן, בשלות ואופן הבישול משנים את הערך בפועל.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Calculation failed', requestId: req.id });
  }
});

/**
 * GET /api/foods/coverage — how much of the catalogue actually has values.
 *
 * Exists so nobody has to assume the database is complete. A consultant
 * looking something up deserves to know the shape of what is behind it.
 */
router.get('/coverage', auth.authMiddleware, async (req, res) => {
  try {
    const catalog = require('../data/food-catalog-he.json');
    const loaded = await db.countFoods();

    return res.json({
      catalogued: catalog.count,
      loaded,
      awaitingIsraeliSource: catalog.foods.filter((f) => f.source_plan !== 'usda_fdc').length,
      noteHe:
        'המאגר נטען מ-USDA FoodData Central. מוצרים ישראליים ללא מקביל ' +
        'אמריקאי ממתינים למאגר משרד הבריאות או לתווית יצרן, ואינם מקבלים ' +
        'ערך משוער בינתיים.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Coverage check failed', requestId: req.id });
  }
});

module.exports = router;
