#!/usr/bin/env node
/**
 * Unit tests for utils/food-calculator.js (backed by data/food-database.json).
 *
 * This repo has no unit-test framework (no Jest/Mocha/vitest in package.json).
 * The only existing test entrypoint, test-system.sh, is a curl-based smoke
 * test against a running server -- not suited to unit-testing pure functions.
 * So: a plain Node script using the built-in node:assert/strict module.
 * No new dependency, no new framework.
 *
 * Run directly:
 *   node tests/food-calculator.test.js
 * Exits 0 if every test passes, non-zero (and prints a FAIL line per failure)
 * otherwise.
 */
'use strict';

const assert = require('node:assert/strict');
const { getFood, listFoods, calculateForAmount, calculateForItems } = require('../utils/food-calculator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log('food-calculator.js');

// ---------------------------------------------------------------------------
// calculateForAmount at 100g must return exactly the per_100g values.
// Literals below are copied directly from data/food-database.json, not read
// back through the module under test.
// ---------------------------------------------------------------------------

const KNOWN_PER_100G = {
  egg: { calories: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11, fiber_g: 0 },
  chicken_breast: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 },
  banana: { calories: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, fiber_g: 2.6 }
};

for (const [foodId, per100] of Object.entries(KNOWN_PER_100G)) {
  test(`calculateForAmount('${foodId}', 100) matches the database's per_100g values exactly`, () => {
    const result = calculateForAmount(foodId, 100);
    assert.deepEqual(result, {
      foodId,
      grams: 100,
      calories: per100.calories,
      proteinG: per100.protein_g,
      carbsG: per100.carbs_g,
      fatG: per100.fat_g,
      fiberG: per100.fiber_g
    });
  });
}

// ---------------------------------------------------------------------------
// Scaling at a non-100g amount: beef_lean's per-100g values (250 kcal / 26P /
// 0C / 15F / 0 fiber) all scale to clean numbers at 150g (x1.5), so the 1.5x
// relationship can be checked exactly, with no rounding ambiguity.
// ---------------------------------------------------------------------------

const BEEF_LEAN_PER_100G = { calories: 250, protein_g: 26, carbs_g: 0, fat_g: 15, fiber_g: 0 };

test("calculateForAmount('beef_lean', 150) scales per-100g values by exactly 1.5x", () => {
  const result = calculateForAmount('beef_lean', 150);
  assert.equal(result.calories, BEEF_LEAN_PER_100G.calories * 1.5);
  assert.equal(result.proteinG, BEEF_LEAN_PER_100G.protein_g * 1.5);
  assert.equal(result.carbsG, BEEF_LEAN_PER_100G.carbs_g * 1.5);
  assert.equal(result.fatG, BEEF_LEAN_PER_100G.fat_g * 1.5);
  assert.equal(result.fiberG, BEEF_LEAN_PER_100G.fiber_g * 1.5);
  // and the concrete numbers, spelled out:
  assert.deepEqual(result, {
    foodId: 'beef_lean', grams: 150, calories: 375, proteinG: 39, carbsG: 0, fatG: 22.5, fiberG: 0
  });
});

// ---------------------------------------------------------------------------
// calculateForItems: totals must equal the sum of its own per-line results
// (invariant check -- not a magic number). Uses the same round-to-1-decimal
// / round-to-integer the module itself applies, since totals are rounded
// sums of already-rounded per-line values.
// ---------------------------------------------------------------------------

function round1(n) {
  return Math.round(n * 10) / 10;
}

test('calculateForItems: totals equal the (rounded) sum of the per-line results', () => {
  const items = [
    { foodId: 'egg', grams: 100 },
    { foodId: 'chicken_breast', grams: 150 },
    { foodId: 'beef_lean', grams: 200 }
  ];
  const result = calculateForItems(items);
  assert.equal(result.lines.length, items.length);

  const rawSum = result.lines.reduce(
    (acc, line) => ({
      calories: acc.calories + line.calories,
      proteinG: acc.proteinG + line.proteinG,
      carbsG: acc.carbsG + line.carbsG,
      fatG: acc.fatG + line.fatG,
      fiberG: acc.fiberG + line.fiberG
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }
  );

  assert.equal(result.totals.calories, Math.round(rawSum.calories));
  assert.equal(result.totals.proteinG, round1(rawSum.proteinG));
  assert.equal(result.totals.carbsG, round1(rawSum.carbsG));
  assert.equal(result.totals.fatG, round1(rawSum.fatG));
  assert.equal(result.totals.fiberG, round1(rawSum.fiberG));

  // Corroborating hand computation (100g egg + 150g chicken_breast + 200g beef_lean):
  //   calories: 155 + 248 + 500 = 903   (chicken_breast 165*1.5=247.5 rounds up to 248)
  //   protein:  13 + 46.5 + 52 = 111.5
  //   carbs:    1.1 + 0 + 0 = 1.1
  //   fat:      11 + 5.4 + 30 = 46.4
  //   fiber:    0
  assert.deepEqual(result.totals, { calories: 903, proteinG: 111.5, carbsG: 1.1, fatG: 46.4, fiberG: 0 });
});

// ---------------------------------------------------------------------------
// Unknown foodId must throw a clear error, not return undefined/NaN.
// ---------------------------------------------------------------------------

test('getFood: throws a clear error for an unknown foodId', () => {
  assert.throws(() => getFood('not_a_real_food'), /Unknown food_id/);
});

test('calculateForAmount: throws a clear error for an unknown foodId', () => {
  assert.throws(() => calculateForAmount('not_a_real_food', 100), /Unknown food_id/);
});

test('calculateForItems: throws a clear error when any item has an unknown foodId', () => {
  assert.throws(
    () => calculateForItems([{ foodId: 'egg', grams: 100 }, { foodId: 'not_a_real_food', grams: 50 }]),
    /Unknown food_id/
  );
});

// ---------------------------------------------------------------------------
// Negative / non-numeric grams must throw.
// ---------------------------------------------------------------------------

test('calculateForAmount: throws on negative grams', () => {
  assert.throws(() => calculateForAmount('egg', -5), /grams must be a non-negative number/);
});

test('calculateForAmount: throws on non-numeric grams (string, undefined, NaN)', () => {
  assert.throws(() => calculateForAmount('egg', 'a lot'), /grams must be a non-negative number/);
  assert.throws(() => calculateForAmount('egg', undefined), /grams must be a non-negative number/);
  assert.throws(() => calculateForAmount('egg', NaN), /grams must be a non-negative number/);
});

// ---------------------------------------------------------------------------
// listFoods(): must list every id used above, and must never leak the full
// nutrition_per_100g object.
// ---------------------------------------------------------------------------

test('listFoods: returns an entry for every id exercised in this file', () => {
  const foods = listFoods();
  assert.ok(Array.isArray(foods));
  for (const id of ['egg', 'chicken_breast', 'banana', 'beef_lean']) {
    const entry = foods.find((f) => f.id === id);
    assert.ok(entry, `expected listFoods() to include an entry for '${id}'`);
  }
});

test('listFoods: entries expose only id/name_he/name_en/category/default_serving_g -- never nutrition_per_100g', () => {
  const foods = listFoods();
  assert.ok(foods.length > 0);
  for (const entry of foods) {
    assert.deepEqual(Object.keys(entry).sort(), ['category', 'default_serving_g', 'id', 'name_en', 'name_he']);
    assert.equal(Object.prototype.hasOwnProperty.call(entry, 'nutrition_per_100g'), false);
  }
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
