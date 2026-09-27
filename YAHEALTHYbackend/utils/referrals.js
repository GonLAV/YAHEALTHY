/**
 * Referral program — the rules, independent of HTTP.
 *
 * routes/referrals.js and the signup handler in index.js both go through
 * here, so "what counts as a valid referral" is decided in one place.
 *
 * Nothing in this file touches billing. A reward is *recorded* (see
 * REFERRAL_REWARDS in utils/constants.js); applying it is someone else's job.
 */

const db = require('./database');
const { APP_URL } = require('./mailer');
const { REFERRAL_REWARDS } = require('./constants');
const { generateReferralCode, normalizeReferralCode } = require('./id-generator');

/**
 * The name we may show a stranger holding this user's code, or null.
 *
 * createUser falls back to the email's local part when no name is given, so a
 * name equal to that local part is really a piece of the email address and is
 * withheld. Only the first word is ever returned.
 */
function publicFirstName(user) {
  if (!user || typeof user.name !== 'string') return null;
  const name = user.name.trim();
  if (!name) return null;

  const localPart = String(user.email || '').split('@')[0].toLowerCase();
  if (localPart && name.toLowerCase() === localPart) return null;
  if (name.includes('@')) return null;

  const first = name.split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

function shareUrlFor(code) {
  return `${APP_URL.replace(/\/+$/, '')}/signup?ref=${encodeURIComponent(code)}`;
}

async function getOrCreateCode(userId) {
  return db.ensureReferralCode(userId, generateReferralCode);
}

/**
 * Look a code up. Returns the referrer or null — never throws for bad input.
 */
async function findReferrer(rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const referrer = await db.getUserByReferralCode(code);
  return referrer ? { referrer, code } : null;
}

/**
 * Attribute a new user to whoever owns `rawCode`, and record the reward.
 *
 * Every refusal is a return value, not an exception: an unusable code must
 * never be the reason somebody's signup fails.
 *
 *   { applied: true,  referralId, reward }
 *   { applied: false, reason: 'invalid' | 'self' | 'duplicate' }
 */
async function applyReferral({ rawCode, refereeId }) {
  const found = await findReferrer(rawCode);
  if (!found) return { applied: false, reason: 'invalid' };

  const { referrer, code } = found;
  if (referrer.id === refereeId) return { applied: false, reason: 'self' };

  const result = await db.createReferral({ referrerId: referrer.id, refereeId, code });
  if (!result.created) return { applied: false, reason: result.reason };

  let reward = null;
  const rule = REFERRAL_REWARDS.referrer;
  const earned = await db.getReferralRewards(referrer.id);
  if (earned.length < REFERRAL_REWARDS.maxRewardedReferrals && rule.amount > 0) {
    const recorded = await db.createReferralReward({
      userId: referrer.id,
      referralId: result.referral.id,
      type: rule.type,
      amount: rule.amount,
      reason: rule.trigger
    });
    if (recorded.created) reward = { type: rule.type, amount: rule.amount };
  }

  return { applied: true, referralId: result.referral.id, reward };
}

/**
 * Everything the invite page shows. No referee identities leave this
 * function — counts only.
 */
async function getSummary(userId) {
  const code = await getOrCreateCode(userId);
  if (!code) return null;

  const [referrals, rewards] = await Promise.all([
    db.getReferralsByReferrer(userId),
    db.getReferralRewards(userId)
  ]);
  const convertedCount = await db.countSubscribedUsers(referrals.map((r) => r.referee_id));

  const earnedByType = {};
  for (const reward of rewards) {
    earnedByType[reward.type] = (earnedByType[reward.type] || 0) + Number(reward.amount || 0);
  }

  return {
    code,
    shareUrl: shareUrlFor(code),
    invitedCount: referrals.length,
    convertedCount,
    rewards: {
      type: REFERRAL_REWARDS.referrer.type,
      perReferral: REFERRAL_REWARDS.referrer.amount,
      maxRewardedReferrals: REFERRAL_REWARDS.maxRewardedReferrals,
      earnedCount: rewards.length,
      earnedPremiumDays: earnedByType.premium_days || 0
    }
  };
}

module.exports = {
  publicFirstName,
  shareUrlFor,
  getOrCreateCode,
  findReferrer,
  applyReferral,
  getSummary
};
