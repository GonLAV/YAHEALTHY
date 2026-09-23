/**
 * Whether a weight goal is one this product is willing to draw a line to.
 *
 * 🔴 What this closes: POST /api/weight-goals checked only validateWeight,
 * which accepts anything from 30 to 300 kg with no reference to the body it
 * belongs to. A person 1.65 m tall could set a target of 32 kg — a BMI of 11.8,
 * where the underweight line is 18.5 — and the app would accept it, draw a goal
 * line to it, compute a progress percentage, and congratulate them on the way
 * down. Nothing anywhere in the project prevented that.
 *
 * A target weight is not data entry. The moment the app renders a goal line it
 * is asserting that the number at the end of it is a reasonable place for this
 * body to arrive, and that assertion is the product's to defend.
 *
 * Two floors, because height is not always known:
 *
 *  - Height known (from the latest survey): the real test, BMI >= 18.5.
 *  - Height unknown: the app cannot make a claim about this body, so it falls
 *    back to a floor no adult height makes safe. 18.5 at 1.50 m is 41.6 kg, so
 *    anything under that is below the underweight line for essentially any
 *    adult. It is a blunt guard and it is meant to be — it exists to catch the
 *    indefensible case, not to approve everything above it.
 *
 * What this deliberately does NOT do: judge a goal that is merely ambitious,
 * cap the rate of loss, or say anything about how long it should take. Those
 * are clinical judgements this codebase has no approved basis for.
 */

const { HEALTH_CONSTANTS } = require('./constants');
const { calculateBMI } = require('./health-calculations');

// 18.5, read from the table rather than repeated here.
const MIN_HEALTHY_BMI = HEALTH_CONSTANTS.BMI_CATEGORIES.underweight.max;

// The shortest adult height worth reasoning about, in cm. Used only for the
// no-height fallback.
const FALLBACK_HEIGHT_CM = 150;

// 18.5 at 1.50 m, to one decimal.
const ABSOLUTE_FLOOR_KG =
  Math.round(MIN_HEALTHY_BMI * (FALLBACK_HEIGHT_CM / 100) ** 2 * 10) / 10;

/**
 * @param {number} targetWeightKg the weight being aimed at
 * @param {number|null} heightCm from the user's latest survey, if there is one
 * @returns {{ok: true} | {ok: false, reason: string, minimumKg: number}}
 */
function checkGoalWeight(targetWeightKg, heightCm) {
  const target = Number(targetWeightKg);
  if (!Number.isFinite(target)) {
    return { ok: false, reason: 'not_a_number', minimumKg: ABSOLUTE_FLOOR_KG };
  }

  const height = Number(heightCm);

  if (Number.isFinite(height) && height > 0) {
    const bmi = calculateBMI(target, height);
    if (bmi < MIN_HEALTHY_BMI) {
      // Rounded up, so the number we hand back is itself above the line.
      const minimumKg = Math.ceil(MIN_HEALTHY_BMI * (height / 100) ** 2 * 10) / 10;
      return { ok: false, reason: 'below_healthy_bmi', minimumKg, bmi };
    }
    return { ok: true, bmi };
  }

  if (target < ABSOLUTE_FLOOR_KG) {
    return { ok: false, reason: 'below_absolute_floor', minimumKg: ABSOLUTE_FLOOR_KG };
  }

  return { ok: true, bmi: null };
}

module.exports = {
  checkGoalWeight,
  MIN_HEALTHY_BMI,
  ABSOLUTE_FLOOR_KG
};
