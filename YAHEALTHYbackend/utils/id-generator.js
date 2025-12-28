/**
 * ID generation utilities
 */

/**
 * Generate unique ID
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Generate survey ID
 */
function generateSurveyId() {
  return generateId('survey');
}

/**
 * Generate weight goal ID
 */
function generateWeightGoalId() {
  return generateId('wgoal');
}

/**
 * Generate weight log ID
 */
function generateWeightLogId() {
  return generateId('wlog');
}

/**
 * Generate fasting window ID
 */
function generateFastingWindowId() {
  return generateId('fasting');
}

/**
 * Generate meal swap ID
 */
function generateMealSwapId() {
  return generateId('swap');
}

/**
 * Generate readiness score ID
 */
function generateReadinessId() {
  return generateId('readiness');
}

module.exports = {
  generateId,
  generateSurveyId,
  generateWeightGoalId,
  generateWeightLogId,
  generateFastingWindowId,
  generateMealSwapId,
  generateReadinessId
};
