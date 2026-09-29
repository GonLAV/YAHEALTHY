/**
 * Referral program — the rules, independent of HTTP.
 *
 * routes/referrals.js, the signup handler and the activation hook in index.js
 * all go through here, so "what counts as a valid referral" and "what it
 * earns" are decided in one place.
 *
 * The reward (REFERRAL_REWARDS in utils/constants.js):
 *   - is earned when the invited friend ACTIVATES — logs anything (food,
 *     water, sleep, weigh-in) within 7 days of signing up — never at signup;
 *   - goes to the referrer (capped at maxRewardedReferrals) and, separately,
 *     to the friend (REFERRAL_FRIEND_REWARD_DAYS, 0 = off, not capped);
 *   - is applied as premium days: users.premium_until moves out, stacking on
 *     whatever is left (utils/database.js extendPremiumUntil), which
 *     utils/entitlements.js reads;
 *   - is idempotent: one reward row per (referral, user) by a unique index,
 *     and a row is claimed (earned → applied) before the date moves.
 *
 * Rewards recorded under the old signup rule (reason 'referee_signup') were
 * promised on the invite page; they are applied like any other earned reward.
 */

const db = require('./database');
const logger = require('./logger').child({ component: 'referrals' });
const { APP_URL } = require('./mailer');
const { REFERRAL_REWARDS } = require('./constants');
const { generateReferralCode, normalizeReferralCode } = require('./id-generator');

const DAY_MS = 24 * 60 * 60 * 1000;
const FRIEND_REASON = REFERRAL_REWARDS.referee.trigger;
// Past this many unrewarded referrals, /me stops reconciling on each view.
const RECONCILE_LIMIT = 50;

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
 * Attribute a new user to whoever owns `rawCode`. Nothing is earned yet —
 * that waits for the friend's first log (rewardOnActivation).
 *
 * Every refusal is a return value, not an exception: an unusable code must
 * never be the reason somebody's signup fails.
 *
 *   { applied: true,  referralId, reward: null, rewardPending: true }
 *   { applied: false, reason: 'invalid' | 'self' | 'duplicate' }
 */
async function applyReferral({ rawCode, refereeId }) {
  const found = await findReferrer(rawCode);
  if (!found) return { applied: false, reason: 'invalid' };

  const { referrer, code } = found;
  if (referrer.id === refereeId) return { applied: false, reason: 'self' };

  const result = await db.createReferral({ referrerId: referrer.id, refereeId, code });
  if (!result.created) return { applied: false, reason: result.reason };

  return { applied: true, referralId: result.referral.id, reward: null, rewardPending: true };
}

// ─── activation ─────────────────────────────────────────────────────────────

const dayOf = (value) => new Date(value).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** First and last day (UTC, inclusive) of a user's activation window. */
function activationWindow(user) {
  const first = dayOf(user.created_at);
  return { first, last: addDays(first, REFERRAL_REWARDS.activationWindowDays - 1) };
}

/** Pure: did any of these activity days fall inside the window? */
function isActivatedFrom(user, days) {
  const { first, last } = activationWindow(user);
  return (days || []).some((d) => d >= first && d <= last);
}

async function isActivated(user) {
  const { first } = activationWindow(user);
  const rows = await db.listActivityDays([user.id], first);
  return isActivatedFrom(
    user,
    rows.map((r) => r.day)
  );
}

/**
 * Apply every earned-but-unapplied premium-days reward this user holds.
 * Returns the number of days applied by this call (0 when there was nothing,
 * or another process got there first).
 */
async function applyPendingRewards(userId, { now = new Date() } = {}) {
  const rewards = await db.getReferralRewards(userId);
  let applied = 0;
  for (const reward of rewards) {
    if (reward.status !== 'earned' || reward.type !== 'premium_days' || !(Number(reward.amount) > 0)) continue;
    if (!(await db.claimReferralReward(reward.id, now.toISOString()))) continue;
    try {
      await db.extendPremiumUntil(userId, Number(reward.amount), now);
      applied += Number(reward.amount);
    } catch (error) {
      // Put it back so the next pass (a later log, a visit to /invite) retries.
      await db.releaseReferralReward(reward.id).catch(() => {});
      throw error;
    }
  }
  return applied;
}

/**
 * Called whenever `refereeId` logs something (and when their referrer opens
 * the invite page). If they were invited, and this is within their first 7
 * days, both sides earn their reward — once.
 *
 * → { status: 'not_referred' | 'window_closed' | 'not_activated' | 'rewarded' | 'already_rewarded',
 *     referrer?: { rewarded, capped }, friend?: { rewarded } }
 */
async function rewardOnActivation(refereeId, { now = new Date(), user = null, fromLogEvent = false } = {}) {
  const referee = user || (await db.getUser(refereeId));
  if (!referee || !referee.referred_by || !referee.created_at) return { status: 'not_referred' };

  // A log made after the window cannot activate anyone, and an in-window one
  // already ran this check when it was made (or the referrer's invite page
  // reconciles it) — so the hot path stops here after a single user read.
  const { last } = activationWindow(referee);
  if (fromLogEvent && dayOf(now) > last) return { status: 'window_closed' };

  const referral = await db.getReferralByReferee(refereeId);
  if (!referral) return { status: 'not_referred' };

  const [referrerRewards, friendRewards] = await Promise.all([
    db.getReferralRewards(referral.referrer_id),
    db.getReferralRewards(refereeId)
  ]);
  const referrerDone = referrerRewards.some((r) => r.referral_id === referral.id);
  const friendDone =
    !(REFERRAL_REWARDS.referee.amount > 0) || friendRewards.some((r) => r.referral_id === referral.id);
  if (referrerDone && friendDone) {
    // Recorded before; make sure it was applied (a crash between the two).
    await applyPendingRewards(refereeId, { now });
    return { status: 'already_rewarded' };
  }

  const activated = await isActivated(referee);
  if (!activated) return { status: dayOf(now) > last ? 'window_closed' : 'not_activated' };

  const result = { status: 'rewarded', referrer: { rewarded: false, capped: false }, friend: { rewarded: false } };

  if (!referrerDone) {
    const rule = REFERRAL_REWARDS.referrer;
    const counted = referrerRewards.filter((r) => r.reason !== FRIEND_REASON).length;
    if (counted >= REFERRAL_REWARDS.maxRewardedReferrals) {
      result.referrer.capped = true;
    } else if (rule.amount > 0) {
      const recorded = await db.createReferralReward({
        userId: referral.referrer_id,
        referralId: referral.id,
        type: rule.type,
        amount: rule.amount,
        reason: rule.trigger
      });
      result.referrer.rewarded = recorded.created;
    }
  }

  if (!friendDone) {
    const rule = REFERRAL_REWARDS.referee;
    const recorded = await db.createReferralReward({
      userId: refereeId,
      referralId: referral.id,
      type: rule.type,
      amount: rule.amount,
      reason: rule.trigger
    });
    result.friend.rewarded = recorded.created;
  }

  await applyPendingRewards(referral.referrer_id, { now });
  await applyPendingRewards(refereeId, { now });

  if (result.referrer.rewarded || result.friend.rewarded) {
    logger.info('referral rewards granted on activation', {
      referralId: referral.id,
      referrer: result.referrer.rewarded,
      friend: result.friend.rewarded
    });
  }
  return result;
}

/**
 * Fire-and-forget wrapper for the log endpoints: a reward problem must never
 * fail somebody's food log.
 */
function noteActivity(userId) {
  if (!userId) return;
  rewardOnActivation(userId, { fromLogEvent: true }).catch((error) => {
    logger.warn('referral activation check failed', { userId, err: error });
  });
}

/**
 * Everything the invite page shows. No referee identities leave this
 * function — counts only. Reconciles first: a friend who activated through a
 * path without the hook (e.g. a WhatsApp log) still earns the reward here.
 */
async function getSummary(userId, { now = new Date() } = {}) {
  const code = await getOrCreateCode(userId);
  if (!code) return null;

  const referrals = await db.getReferralsByReferrer(userId);
  let rewards = await db.getReferralRewards(userId);

  const rewardedReferralIds = new Set(rewards.map((r) => r.referral_id));
  const unrewarded = referrals.filter((r) => !rewardedReferralIds.has(r.id)).slice(0, RECONCILE_LIMIT);
  let pendingActivation = 0;
  if (unrewarded.length) {
    const referees = await db.getUsersByIds(unrewarded.map((r) => r.referee_id));
    const earliest = referees.map((u) => dayOf(u.created_at)).sort()[0];
    const activity = earliest ? await db.listActivityDays(referees.map((u) => u.id), earliest) : [];
    const daysBy = new Map();
    for (const row of activity) {
      if (!daysBy.has(row.user_id)) daysBy.set(row.user_id, []);
      daysBy.get(row.user_id).push(row.day);
    }
    for (const referee of referees) {
      if (isActivatedFrom(referee, daysBy.get(referee.id))) {
        try {
          await rewardOnActivation(referee.id, { now, user: referee });
        } catch (error) {
          logger.warn('referral reconcile failed', { err: error });
        }
      } else if (dayOf(now) <= activationWindow(referee).last) {
        pendingActivation++;
      }
    }
    rewards = await db.getReferralRewards(userId);
  }

  try {
    await applyPendingRewards(userId, { now });
    rewards = await db.getReferralRewards(userId);
  } catch (error) {
    logger.warn('applying pending referral rewards failed', { err: error });
  }

  const convertedCount = await db.countSubscribedUsers(referrals.map((r) => r.referee_id));
  const user = await db.getUser(userId);

  const referrerRewards = rewards.filter((r) => r.reason !== FRIEND_REASON && r.status !== 'revoked');
  const premiumDays = (list) =>
    list.filter((r) => r.type === 'premium_days' && r.status !== 'revoked').reduce((n, r) => n + Number(r.amount || 0), 0);
  const premiumUntil =
    user && user.premium_until && new Date(user.premium_until).getTime() > now.getTime() ? user.premium_until : null;

  return {
    code,
    shareUrl: shareUrlFor(code),
    invitedCount: referrals.length,
    convertedCount,
    pendingActivationCount: pendingActivation,
    rewards: {
      type: REFERRAL_REWARDS.referrer.type,
      trigger: REFERRAL_REWARDS.referrer.trigger,
      perReferral: REFERRAL_REWARDS.referrer.amount,
      friendReward: REFERRAL_REWARDS.referee.amount,
      activationWindowDays: REFERRAL_REWARDS.activationWindowDays,
      maxRewardedReferrals: REFERRAL_REWARDS.maxRewardedReferrals,
      earnedCount: referrerRewards.length,
      earnedPremiumDays: premiumDays(rewards),
      premiumUntil
    }
  };
}

module.exports = {
  publicFirstName,
  shareUrlFor,
  getOrCreateCode,
  findReferrer,
  applyReferral,
  activationWindow,
  isActivatedFrom,
  applyPendingRewards,
  rewardOnActivation,
  noteActivity,
  getSummary
};
