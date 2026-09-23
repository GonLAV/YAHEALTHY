/**
 * Whether a weigh-in is worth congratulating.
 *
 * 🔴 What this replaces: POST /api/weight-logs congratulated any decrease at
 * all, with the sentence built on the server:
 *
 *     if (weightLost > 0) celebration = { message: `Great job! Lost ${x}kg` }
 *
 * No floor, so 0.1 kg of overnight water read as an achievement. No rate check,
 * so 20 kg in a month was congratulated in exactly the same words as 0.3 kg in
 * a fortnight. No direction check, so somebody whose goal was to gain weight
 * was congratulated for moving away from it. And the sentence was hardcoded
 * English, rendered as-is inside a Hebrew interface.
 *
 * In a product whose WhatsApp bot refuses to answer anyone who mentions an
 * eating disorder, "any loss is good news, the faster the better" is the one
 * message it should never send.
 *
 * What this module does and does not claim:
 *
 *   It returns a CODE, never a sentence. The wording belongs to the client,
 *   which knows the reader's language.
 *
 *   Every rule here can only ever WITHHOLD a celebration, never add advice.
 *   Declining to congratulate somebody needs far less justification than
 *   telling them something about their body — which matters, because
 *   docs/nutrition/FORMULAS-RESEARCH-STATUS.md marks this project's weight
 *   formulas as unverified. Silence is a position this codebase can defend.
 *
 *   It says nothing about losing too fast. It just goes quiet and logs, so
 *   somebody can see it. Telling a person they are losing too quickly is
 *   clinical advice and needs a route to a human, which the app does not yet
 *   have.
 */

// Day-to-day weight moves by more than this from water alone. Below it, a
// "loss" is noise, and celebrating noise teaches people to weigh themselves
// until the scale says something nice.
const MIN_MEANINGFUL_KG = 0.5;

// Two weigh-ins a day apart describe hydration, not progress.
const MIN_DAYS_BETWEEN = 2;

// Above roughly 1% of body weight per week, LOSS stops being something to
// cheer. Not a diagnosis and never shown to anyone — it only turns the
// celebration off.
//
// Loss only, and the asymmetry is deliberate. This number comes from guidance
// about safe rates of weight loss, and it says nothing about gain. Somebody
// working towards a gain goal is quite possibly recovering from being
// underweight, and withholding their progress because they gained 0.9 kg in a
// week would be the exact opposite of what this rule is for. A test caught that
// the first version did precisely that.
const MAX_WEEKLY_LOSS_PERCENT = 1;

const DAY_MS = 86400000;

/**
 * @param {object} input
 * @param {number} input.previousKg the weight at the last weigh-in
 * @param {string} input.previousAt when that weigh-in happened (ISO)
 * @param {number} input.currentKg the weight just recorded
 * @param {number} input.startKg where the goal began
 * @param {number} input.targetKg where the goal is going
 * @param {Date}   [input.now]
 * @returns {{code: 'goal_reached'|'progress'|null, deltaKg: number|null,
 *            remainingKg: number|null, tooFast: boolean}}
 */
function assessWeighIn({ previousKg, previousAt, currentKg, startKg, targetKg, now = new Date() }) {
  const quiet = { code: null, deltaKg: null, remainingKg: null, tooFast: false };

  const current = Number(currentKg);
  const target = Number(targetKg);
  const start = Number(startKg);
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(start)) return quiet;

  const remainingKg = Math.round(Math.abs(current - target) * 10) / 10;

  // Which way this goal is meant to move. A goal to gain weight is a real
  // goal, and losing is not progress towards it.
  const wantsLoss = target < start;

  // Reaching the target is the one moment worth marking on its own, and it
  // does not depend on the size or speed of the last step.
  const reached = wantsLoss ? current <= target : current >= target;
  if (reached) {
    return { code: 'goal_reached', deltaKg: null, remainingKg: 0, tooFast: false };
  }

  const previous = Number(previousKg);
  if (!Number.isFinite(previous)) return quiet; // first weigh-in: nothing to compare

  const moved = wantsLoss ? previous - current : current - previous;
  if (moved < MIN_MEANINGFUL_KG) return { ...quiet, remainingKg };

  const elapsedDays = previousAt
    ? (now.getTime() - new Date(previousAt).getTime()) / DAY_MS
    : null;

  if (elapsedDays == null || !Number.isFinite(elapsedDays) || elapsedDays < MIN_DAYS_BETWEEN) {
    return { ...quiet, remainingKg };
  }

  const weeklyPercent = ((moved / elapsedDays) * 7 / previous) * 100;
  if (wantsLoss && weeklyPercent > MAX_WEEKLY_LOSS_PERCENT) {
    // Quiet, and flagged for a person rather than for the user.
    return { ...quiet, remainingKg, tooFast: true };
  }

  return {
    code: 'progress',
    deltaKg: Math.round(moved * 10) / 10,
    remainingKg,
    tooFast: false
  };
}

module.exports = {
  assessWeighIn,
  MIN_MEANINGFUL_KG,
  MIN_DAYS_BETWEEN,
  MAX_WEEKLY_LOSS_PERCENT
};
