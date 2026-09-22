#!/usr/bin/env node
/**
 * Unit tests for utils/nutrition-calculator.js.
 *
 * This repo has no unit-test framework (no Jest/Mocha/vitest in package.json).
 * The only existing test entrypoint, test-system.sh, is a curl-based smoke
 * test against a running server -- not suited to unit-testing pure functions.
 * So: a plain Node script using the built-in node:assert/strict module.
 * No new dependency, no new framework.
 *
 * Run directly:
 *   node tests/nutrition-calculator.test.js
 * Exits 0 if every test passes, non-zero (and prints a FAIL line per failure)
 * otherwise.
 */
'use strict';

const assert = require('node:assert/strict');
const {
  calculateBMR,
  calculateTDEE,
  calculateDailyTarget,
  ACTIVITY_MULTIPLIERS,
  MIN_SAFE_CALORIES
} = require('../utils/nutrition-calculator');

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

console.log('nutrition-calculator.js');

// ---------------------------------------------------------------------------
// calculateBMR / calculateTDEE -- Mifflin-St Jeor, verified independently by
// hand (not by calling the module):
//   BMR male   = 10*kg + 6.25*cm - 5*age + 5
//   BMR female = 10*kg + 6.25*cm - 5*age - 161
// ---------------------------------------------------------------------------

test('calculateBMR: male reference case (80kg/180cm/30y) matches hand-computed Mifflin-St Jeor', () => {
  // base = 10*80 + 6.25*180 - 5*30 = 800 + 1125 - 150 = 1775; male: +5 = 1780
  const bmr = calculateBMR({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 });
  assert.equal(bmr, 1780);
});

test('calculateBMR: female reference case (60kg/165cm/25y) matches hand-computed Mifflin-St Jeor', () => {
  // base = 10*60 + 6.25*165 - 5*25 = 600 + 1031.25 - 125 = 1506.25; female: -161 = 1345.25
  const bmr = calculateBMR({ sex: 'female', weightKg: 60, heightCm: 165, age: 25 });
  assert.equal(bmr, 1345.25);
});

test('calculateTDEE: male reference case x sedentary (1.2) multiplier', () => {
  assert.equal(ACTIVITY_MULTIPLIERS.sedentary, 1.2);
  const tdee = calculateTDEE({ sex: 'male', weightKg: 80, heightCm: 180, age: 30, activityLevel: 'sedentary' });
  assert.equal(tdee, 1780 * 1.2); // 2136
});

test('calculateTDEE: male reference case x moderate (1.55) multiplier', () => {
  assert.equal(ACTIVITY_MULTIPLIERS.moderate, 1.55);
  const tdee = calculateTDEE({ sex: 'male', weightKg: 80, heightCm: 180, age: 30, activityLevel: 'moderate' });
  assert.equal(tdee, 1780 * 1.55); // 2759
});

test('calculateTDEE: female reference case x active (1.725) multiplier', () => {
  assert.equal(ACTIVITY_MULTIPLIERS.active, 1.725);
  const tdee = calculateTDEE({ sex: 'female', weightKg: 60, heightCm: 165, age: 25, activityLevel: 'active' });
  assert.equal(tdee, 1345.25 * 1.725); // 2320.55625
});

// ---------------------------------------------------------------------------
// calculateDailyTarget -- goal handling, checked as invariants rather than
// magic numbers:
//   - calorieTarget.center must equal tdee + the goal's fixed adjustment
//   - macro grams (.center) must roughly reconstruct calorieTarget.center
//   - every ranged value must satisfy low < center < high
// Subject: the male reference case above, activityLevel 'moderate' -> tdee
// = 2759, comfortably clear of the floor for every goal below.
// ---------------------------------------------------------------------------

const DAILY_TARGET_SUBJECT = { sex: 'male', weightKg: 80, heightCm: 180, age: 30, activityLevel: 'moderate' };
// Mirrors the private GOAL_CALORIE_ADJUSTMENT map in nutrition-calculator.js
// (not exported, hence hardcoded here from reading the source).
const KNOWN_GOAL_ADJUSTMENTS = { lose: -500, gain: 350, maintain: 0 };

function assertIsAscendingRange(range, label) {
  assert.ok(range.low < range.center, `${label}: expected low(${range.low}) < center(${range.center})`);
  assert.ok(range.center < range.high, `${label}: expected center(${range.center}) < high(${range.high})`);
}

for (const goal of ['lose', 'gain', 'maintain']) {
  test(`calculateDailyTarget: goal='${goal}' calorieTarget.center = tdee + fixed adjustment`, () => {
    const result = calculateDailyTarget({ ...DAILY_TARGET_SUBJECT, goal });
    assert.equal(result.needsProfessional, false);
    assert.equal(result.tdee, 2759);
    assert.equal(result.deficitOrSurplus, KNOWN_GOAL_ADJUSTMENTS[goal]);
    assert.equal(result.calorieTarget.center, result.tdee + KNOWN_GOAL_ADJUSTMENTS[goal]);
  });

  test(`calculateDailyTarget: goal='${goal}' macro grams (.center) reconstruct calorieTarget.center within rounding tolerance`, () => {
    const result = calculateDailyTarget({ ...DAILY_TARGET_SUBJECT, goal });
    const { proteinG, fatG, carbsG } = result.macros;
    const reconstructed = proteinG.center * 4 + fatG.center * 9 + carbsG.center * 4;
    const diff = Math.abs(reconstructed - result.calorieTarget.center);
    assert.ok(
      diff <= 10,
      `expected reconstructed calories (${reconstructed}) within 10 of calorieTarget.center (${result.calorieTarget.center}), diff=${diff}`
    );
  });

  test(`calculateDailyTarget: goal='${goal}' every ranged value has low < center < high`, () => {
    const result = calculateDailyTarget({ ...DAILY_TARGET_SUBJECT, goal });
    assertIsAscendingRange(result.calorieTarget, 'calorieTarget');
    assertIsAscendingRange(result.macros.proteinG, 'macros.proteinG');
    assertIsAscendingRange(result.macros.fatG, 'macros.fatG');
    assertIsAscendingRange(result.macros.carbsG, 'macros.carbsG');
  });
}

// ---------------------------------------------------------------------------
// Safety floor: a small, low-activity female on 'lose' must trip
// needsProfessional and must NOT return calorieTarget/macros at all.
// ---------------------------------------------------------------------------

test('calculateDailyTarget: small low-activity female on lose trips needsProfessional and omits calorieTarget/macros', () => {
  // BMR  = 10*50 + 6.25*155 - 5*50 - 161 = 500 + 968.75 - 250 - 161 = 1057.75
  // TDEE = 1057.75 * 1.2 (sedentary) = 1269.3
  // target (lose) = 1269.3 - 500 = 769.3, well under the female floor of 1200
  const result = calculateDailyTarget({
    sex: 'female', weightKg: 50, heightCm: 155, age: 50, activityLevel: 'sedentary', goal: 'lose'
  });
  assert.equal(result.needsProfessional, true);
  assert.equal(result.reason, 'below-safe-floor');
  assert.equal(result.floor, MIN_SAFE_CALORIES.female);
  assert.equal(result.floor, 1200);
  assert.equal(result.tdee, 1269); // Math.round(1269.3)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'calorieTarget'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'macros'), false);
});

// ---------------------------------------------------------------------------
// Input validation -- must throw, not silently return garbage.
// ---------------------------------------------------------------------------

test('calculateBMR: throws on invalid sex', () => {
  assert.throws(
    () => calculateBMR({ sex: 'other', weightKg: 70, heightCm: 170, age: 30 }),
    /sex must be 'male' or 'female'/
  );
});

test('calculateBMR: throws on non-positive weightKg (zero and negative)', () => {
  assert.throws(() => calculateBMR({ sex: 'male', weightKg: 0, heightCm: 170, age: 30 }), /weightKg must be a positive number/);
  assert.throws(() => calculateBMR({ sex: 'male', weightKg: -70, heightCm: 170, age: 30 }), /weightKg must be a positive number/);
});

test('calculateBMR: throws on non-positive heightCm (zero and negative)', () => {
  assert.throws(() => calculateBMR({ sex: 'male', weightKg: 70, heightCm: 0, age: 30 }), /heightCm must be a positive number/);
  assert.throws(() => calculateBMR({ sex: 'male', weightKg: 70, heightCm: -170, age: 30 }), /heightCm must be a positive number/);
});

test('calculateBMR: throws on non-positive age (zero and negative)', () => {
  assert.throws(() => calculateBMR({ sex: 'male', weightKg: 70, heightCm: 170, age: 0 }), /age must be a positive number/);
  assert.throws(() => calculateBMR({ sex: 'male', weightKg: 70, heightCm: 170, age: -5 }), /age must be a positive number/);
});

test('calculateBMR: throws on non-numeric weightKg', () => {
  assert.throws(
    () => calculateBMR({ sex: 'male', weightKg: 'seventy', heightCm: 170, age: 30 }),
    /weightKg must be a positive number/
  );
});

test('calculateTDEE: throws on invalid activityLevel', () => {
  assert.throws(
    () => calculateTDEE({ sex: 'male', weightKg: 70, heightCm: 170, age: 30, activityLevel: 'super_active' }),
    /activityLevel must be one of/
  );
});

test('calculateDailyTarget: throws on invalid goal', () => {
  assert.throws(
    () => calculateDailyTarget({ sex: 'male', weightKg: 70, heightCm: 170, age: 30, activityLevel: 'moderate', goal: 'shred' }),
    /goal must be one of/
  );
});

test('calculateDailyTarget: propagates invalid activityLevel with an otherwise-valid goal', () => {
  assert.throws(
    () => calculateDailyTarget({ sex: 'male', weightKg: 70, heightCm: 170, age: 30, activityLevel: 'nope', goal: 'maintain' }),
    /activityLevel must be one of/
  );
});

test('calculateDailyTarget: propagates invalid sex with otherwise-valid goal/activityLevel', () => {
  assert.throws(
    () => calculateDailyTarget({ sex: 'x', weightKg: 70, heightCm: 170, age: 30, activityLevel: 'moderate', goal: 'maintain' }),
    /sex must be 'male' or 'female'/
  );
});

test('calculateDailyTarget: propagates non-positive weightKg with otherwise-valid inputs', () => {
  assert.throws(
    () => calculateDailyTarget({ sex: 'male', weightKg: -10, heightCm: 170, age: 30, activityLevel: 'moderate', goal: 'maintain' }),
    /weightKg must be a positive number/
  );
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
