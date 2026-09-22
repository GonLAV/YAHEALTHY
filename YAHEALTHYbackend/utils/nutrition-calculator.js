/**
 * Deterministic BMR / TDEE / calorie-target / macro-range calculator --
 * Mifflin-St Jeor. This is the "real math" layer: the LLM identifies and
 * explains, this file calculates. Nothing here is ever guessed by a model.
 *
 * Not yet wired into the live conversation (whapi-brain.js) -- this is
 * phase 1, building and proving the engine itself. docs/bot/nuri-bot-prompt.md
 * still holds the current customer-facing boundary (general structure, no
 * exact numbers) until wiring this in is a deliberate, separate step.
 */

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,      // desk job, little to no exercise
  light: 1.375,        // light exercise 1-3 days/week
  moderate: 1.55,      // moderate exercise 3-5 days/week
  active: 1.725,       // hard exercise 6-7 days/week
  very_active: 1.9     // very hard exercise or physical job
};

// Below this, a deficit stops being a general-guidance question and becomes
// a medical-supervision one. Commonly used conservative floors, not a
// diagnosis -- calculateDailyTarget returns needsProfessional instead of a
// number when the goal-adjusted target would land under them.
const MIN_SAFE_CALORIES = { male: 1500, female: 1200 };

const GOAL_CALORIE_ADJUSTMENT = {
  lose: -500,   // ~0.5kg/week
  gain: 350,    // lean-gain pace
  maintain: 0
};

// Grams of protein per kg bodyweight -- higher for weight loss to help
// preserve lean mass under a deficit, per standard sports-nutrition ranges.
const PROTEIN_PER_KG = { lose: 2.0, gain: 1.8, maintain: 1.6 };

// Fat as a share of total calories, held mid-range regardless of goal.
const FAT_SHARE_OF_CALORIES = 0.27;

// Range widths: calories tight (matches "2000 ± 50"-style guidance), macros
// looser -- a macro target should read as "aim for roughly this," not a
// clinical exact figure.
const CALORIE_RANGE_PCT = 0.025;
const MACRO_RANGE_PCT = 0.1;

function requirePositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got: ${value}`);
  }
}

function calculateBMR({ sex, weightKg, heightCm, age }) {
  if (sex !== 'male' && sex !== 'female') {
    throw new Error(`sex must be 'male' or 'female', got: ${sex}`);
  }
  requirePositive(weightKg, 'weightKg');
  requirePositive(heightCm, 'heightCm');
  requirePositive(age, 'age');

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function calculateTDEE({ sex, weightKg, heightCm, age, activityLevel }) {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!multiplier) {
    throw new Error(
      `activityLevel must be one of ${Object.keys(ACTIVITY_MULTIPLIERS).join(', ')}, got: ${activityLevel}`
    );
  }
  return calculateBMR({ sex, weightKg, heightCm, age }) * multiplier;
}

function asRange(centerValue, pct) {
  const delta = centerValue * pct;
  return {
    low: Math.round(centerValue - delta),
    high: Math.round(centerValue + delta),
    center: Math.round(centerValue)
  };
}

/**
 * Returns a calorie target + macro ranges for a goal, or a flag saying this
 * needs a human dietitian instead of a number (target below the safe floor).
 */
function calculateDailyTarget({ sex, weightKg, heightCm, age, activityLevel, goal }) {
  if (!(goal in GOAL_CALORIE_ADJUSTMENT)) {
    throw new Error(`goal must be one of ${Object.keys(GOAL_CALORIE_ADJUSTMENT).join(', ')}, got: ${goal}`);
  }

  const tdee = calculateTDEE({ sex, weightKg, heightCm, age, activityLevel });
  const calorieTarget = tdee + GOAL_CALORIE_ADJUSTMENT[goal];
  const floor = MIN_SAFE_CALORIES[sex];

  if (calorieTarget < floor) {
    return { needsProfessional: true, reason: 'below-safe-floor', tdee: Math.round(tdee), floor };
  }

  const proteinG = weightKg * PROTEIN_PER_KG[goal];
  const fatG = (calorieTarget * FAT_SHARE_OF_CALORIES) / 9;
  const carbsG = Math.max(calorieTarget - proteinG * 4 - fatG * 9, 0) / 4;

  return {
    needsProfessional: false,
    tdee: Math.round(tdee),
    deficitOrSurplus: Math.round(calorieTarget - tdee),
    calorieTarget: asRange(calorieTarget, CALORIE_RANGE_PCT),
    macros: {
      proteinG: asRange(proteinG, MACRO_RANGE_PCT),
      fatG: asRange(fatG, MACRO_RANGE_PCT),
      carbsG: asRange(carbsG, MACRO_RANGE_PCT)
    }
  };
}

module.exports = {
  ACTIVITY_MULTIPLIERS,
  MIN_SAFE_CALORIES,
  calculateBMR,
  calculateTDEE,
  calculateDailyTarget
};
