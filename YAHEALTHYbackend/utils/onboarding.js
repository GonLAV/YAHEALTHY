/**
 * Onboarding: turning a new signup into a set-up account.
 *
 * Two jobs live here, both deliberately thin:
 *
 *   previewTargets(input)  — the daily targets the wizard shows for
 *                            confirmation. Every number comes from the
 *                            existing calculators (nutrition-calculator.js for
 *                            calories/macros, health-calculations.js for BMI,
 *                            water and sleep). Nothing is re-derived here and
 *                            nothing is re-derived in the frontend.
 *   getStatus(userId)      — has this person finished (or skipped) onboarding?
 *                            Accounts that pre-date the wizard and already
 *                            have goals, preferences or logs count as done, so
 *                            nobody who was using the app gets pushed into it.
 *
 * The safety side is flags, not advice: the wizard shows a plain note and
 * suggests talking to a professional. Where a number would be inappropriate
 * (a minor, or a target under the calculator's safe floor) no number is given.
 */

const db = require('./database');
const nutrition = require('./nutrition-calculator');
const {
  calculateBMI,
  calculateWaterTarget,
  calculateSleepTarget
} = require('./health-calculations');
const { HEALTH_CONSTANTS } = require('./constants');

// What the wizard offers as a "main goal", and which calculator goal each one
// maps to. Only the weight goals move calories; the rest keep maintenance.
const MAIN_GOALS = {
  lose_weight: 'lose',
  maintain_weight: 'maintain',
  gain_weight: 'gain',
  eat_healthier: 'maintain',
  sleep_better: 'maintain',
  more_energy: 'maintain'
};

const ACTIVITY_LEVELS = Object.keys(nutrition.ACTIVITY_MULTIPLIERS);

// Rough daily exercise minutes per activity level, only to feed the existing
// water calculator's activity bonus.
const ACTIVITY_MINUTES = { sedentary: 0, light: 20, moderate: 40, active: 60, very_active: 90 };

const DIETARY_OPTIONS = ['vegetarian', 'vegan', 'kosher', 'gluten_free', 'lactose_free'];

const ADULT_AGE = 18;
const UNDERWEIGHT_BMI = HEALTH_CONSTANTS.BMI_CATEGORIES.underweight.max; // 18.5
// Past this the general formulas are a poor guide on their own. A prompt to
// involve a professional, not a label.
const VERY_HIGH_BMI = 40;

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Age from either `age` or `birthYear`. Returns null when neither is usable.
 */
function resolveAge({ age, birthYear }, now = new Date()) {
  if (Number.isFinite(age)) return Math.floor(age);
  if (Number.isFinite(birthYear)) return now.getFullYear() - Math.floor(birthYear);
  return null;
}

/**
 * Targets for the confirmation step. `input` is already validated by the
 * route (types and ranges); this only computes.
 */
function previewTargets(input) {
  const { goal, sex, heightCm, weightKg, activityLevel } = input;
  const age = resolveAge(input);
  const targetWeightKg = Number.isFinite(input.targetWeightKg) ? input.targetWeightKg : null;

  const flags = [];
  const bmi = calculateBMI(weightKg, heightCm);
  const targetBmi = targetWeightKg ? calculateBMI(targetWeightKg, heightCm) : null;

  let calcGoal = MAIN_GOALS[goal] || 'maintain';

  // From a birth year alone the age is only known to within a year (the
  // birthday may not have come yet), so "this year − 18" may still be 17.
  // The minor rule has to hold for the younger of the two.
  const youngestAge = !Number.isFinite(input.age) && Number.isFinite(input.birthYear) ? age - 1 : age;
  const minor = youngestAge < ADULT_AGE;

  if (minor) flags.push('minor');
  if (bmi < UNDERWEIGHT_BMI) {
    flags.push('bmi-low');
    // Never plan a deficit for someone already under the healthy range.
    if (calcGoal === 'lose') {
      calcGoal = 'maintain';
      flags.push('lose-while-underweight');
    }
  }
  if (bmi >= VERY_HIGH_BMI) flags.push('bmi-high');
  if (targetBmi !== null && targetBmi < UNDERWEIGHT_BMI) flags.push('target-bmi-low');

  const safeCalorieFloor = nutrition.MIN_SAFE_CALORIES[sex];

  let calories = null;
  let macros = null;
  let tdee = null;

  // The calculator is an adult formula; for minors we give no calorie or
  // macro numbers at all rather than a number that looks authoritative.
  if (!minor) {
    const result = nutrition.calculateDailyTarget({
      sex,
      weightKg,
      heightCm,
      age,
      activityLevel,
      goal: calcGoal
    });
    tdee = result.tdee;
    if (result.needsProfessional) {
      flags.push('below-safe-floor');
    } else {
      calories = result.calorieTarget;
      macros = result.macros;
    }
  }

  return {
    inputs: { goal, calcGoal, sex, age, heightCm, weightKg, targetWeightKg, activityLevel },
    bmi: round1(bmi),
    targetBmi: targetBmi === null ? null : round1(targetBmi),
    tdee,
    calories,
    macros,
    waterLiters: calculateWaterTarget(weightKg, ACTIVITY_MINUTES[activityLevel] || 0),
    sleepHours: calculateSleepTarget(age),
    safety: {
      safeCalorieFloor,
      needsProfessional: flags.some((f) => ['minor', 'below-safe-floor', 'bmi-high', 'lose-while-underweight'].includes(f)),
      flags
    }
  };
}

// Preference keys that say nothing about whether someone set the app up.
const NON_SETUP_PREFERENCE_KEYS = new Set(['language', 'lang']);

function hasSetupPreferences(preferences) {
  if (!preferences || typeof preferences !== 'object') return false;
  return Object.keys(preferences).some((key) => !NON_SETUP_PREFERENCE_KEYS.has(key));
}

/**
 * { completed, completedAt, source }
 *   source: 'wizard'   — finished or skipped the wizard (onboarding_completed_at)
 *           'existing' — an account that already had goals/preferences/logs
 *           null       — not onboarded yet
 */
async function getStatus(userId) {
  const user = await db.getUser(userId);
  if (!user) return null;

  if (user.onboarding_completed_at) {
    return { completed: true, completedAt: user.onboarding_completed_at, source: 'wizard' };
  }

  if (hasSetupPreferences(user.preferences)) {
    return { completed: true, completedAt: null, source: 'existing' };
  }

  // Cheapest checks first; stop at the first sign of an established account.
  const checks = [
    () => db.getWeightGoals(userId),
    () => db.getSurveys(userId),
    () => db.getFoodLogs(userId, { limit: 1 }),
    () => db.getHydrationLogs(userId)
  ];
  for (const check of checks) {
    const rows = await check();
    if (Array.isArray(rows) && rows.length) {
      return { completed: true, completedAt: null, source: 'existing' };
    }
  }

  return { completed: false, completedAt: null, source: null };
}

module.exports = {
  MAIN_GOALS,
  ACTIVITY_LEVELS,
  DIETARY_OPTIONS,
  ADULT_AGE,
  resolveAge,
  previewTargets,
  getStatus,
  hasSetupPreferences
};
