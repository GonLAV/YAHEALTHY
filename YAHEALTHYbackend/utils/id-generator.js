/**
 * ID generation utilities
 */

const { randomInt } = require('crypto');

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

/**
 * Referral code alphabet: uppercase letters and digits with the look-alikes
 * removed (0/O, 1/I/L), so a code read aloud or typed from a screenshot
 * survives the trip. 31 symbols ^ 6 ≈ 887M codes.
 */
const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const REFERRAL_CODE_LENGTH = 6;

/**
 * Generate a short, human-friendly referral code, e.g. "K7M2QX".
 *
 * crypto.randomInt rather than Math.random: codes are public, and a
 * predictable sequence would let anyone enumerate other people's codes.
 * Uniqueness is enforced by the store, which retries on a collision.
 */
function generateReferralCode(length = REFERRAL_CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Canonical form of a code someone typed or pasted: uppercase, no spaces or
 * dashes. Returns null for anything that cannot be a code, so callers never
 * query the store with arbitrary input.
 */
function normalizeReferralCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  if (code.length < 4 || code.length > 16) return null;
  if (!/^[A-Z0-9]+$/.test(code)) return null;
  return code;
}

module.exports = {
  generateId,
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_CODE_ALPHABET,
  generateSurveyId,
  generateWeightGoalId,
  generateWeightLogId,
  generateFastingWindowId,
  generateMealSwapId,
  generateReadinessId
};
