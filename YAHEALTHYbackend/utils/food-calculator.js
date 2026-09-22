/**
 * Deterministic per-food and per-meal calorie/macro arithmetic, backed by
 * data/food-database.json. The LLM identifies which foods and how much
 * (from text or a photo) and calls this -- it never computes the numbers
 * itself. See nutrition-calculator.js's header and docs/bot/nuri-bot-prompt.md's
 * "לא ממציאים" rule for why.
 */
const foodDb = require('../data/food-database.json');

const FOODS_BY_ID = Object.fromEntries(foodDb.foods.map((food) => [food.id, food]));

function getFood(foodId) {
  const food = FOODS_BY_ID[foodId];
  if (!food) {
    throw new Error(`Unknown food_id: "${foodId}" -- not in data/food-database.json.`);
  }
  return food;
}

function listFoods() {
  return foodDb.foods.map(({ id, name_he, name_en, category, default_serving_g }) => ({
    id,
    name_he,
    name_en,
    category,
    default_serving_g
  }));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {string} foodId
 * @param {number} grams
 */
function calculateForAmount(foodId, grams) {
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams < 0) {
    throw new Error(`grams must be a non-negative number, got: ${grams}`);
  }
  const food = getFood(foodId);
  const ratio = grams / 100;
  const per100 = food.nutrition_per_100g;
  return {
    foodId,
    grams,
    calories: Math.round(per100.calories * ratio),
    proteinG: round1(per100.protein_g * ratio),
    carbsG: round1(per100.carbs_g * ratio),
    fatG: round1(per100.fat_g * ratio),
    fiberG: round1(per100.fiber_g * ratio)
  };
}

/**
 * @param {{foodId: string, grams: number}[]} items
 */
function calculateForItems(items) {
  const lines = items.map((item) => calculateForAmount(item.foodId, item.grams));
  const totals = lines.reduce(
    (acc, line) => ({
      calories: acc.calories + line.calories,
      proteinG: acc.proteinG + line.proteinG,
      carbsG: acc.carbsG + line.carbsG,
      fatG: acc.fatG + line.fatG,
      fiberG: acc.fiberG + line.fiberG
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }
  );
  return {
    lines,
    totals: {
      calories: Math.round(totals.calories),
      proteinG: round1(totals.proteinG),
      carbsG: round1(totals.carbsG),
      fatG: round1(totals.fatG),
      fiberG: round1(totals.fiberG)
    }
  };
}

module.exports = { getFood, listFoods, calculateForAmount, calculateForItems };
