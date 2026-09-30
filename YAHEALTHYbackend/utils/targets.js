/**
 * Whether a calorie or protein target we calculated may be shown to anyone.
 *
 * The formula in utils/health-calculations.js is registered as clinical
 * content ('app-calorie-target' in data/clinical-approvals.json), and until a
 * registered professional approves it the number is withheld. /api/targets
 * enforced that, and it was the only place that did: the coach's insights,
 * the daily insights on the dashboard, the weekly email and six API endpoints
 * read the same number straight off the survey and showed it anyway. So the
 * home screen withheld a target that the coaching screen, one tap away,
 * printed in a sentence.
 *
 * Everything that shows a calculated target asks this module. A target the
 * person typed in themselves is theirs and needs no approval; that path does
 * not come through here.
 */
const path = require('path');
const clinicalApproval = require('./clinical-approval');

const FORMULA = path.join(__dirname, 'health-calculations.js');

/** Read per call, like the bots' prompts: an approval or an edit takes effect without a restart. */
function computedTargetsApproved() {
  return clinicalApproval.statusFor('app-calorie-target', FORMULA).approved;
}

// What the formula derives from the body toward a calorie target. The inputs
// (height, weight, age, goal) are the person's own and are left alone, and so
// are water and sleep, which are not part of what is waiting for approval.
const COMPUTED_FIELDS = ['bmr', 'tdee', 'daily_calories', 'protein_target_g'];

/** A survey as it may be sent back to its owner: the calculated targets removed until approved. */
function withoutUnapprovedTargets(survey) {
  if (!survey || computedTargetsApproved()) return survey;
  const copy = { ...survey };
  for (const field of COMPUTED_FIELDS) if (field in copy) copy[field] = null;
  return copy;
}

module.exports = { computedTargetsApproved, withoutUnapprovedTargets, COMPUTED_FIELDS };
