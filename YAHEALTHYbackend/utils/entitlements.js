/**
 * Entitlements — what a person may use, derived, never stored.
 *
 * Sources, all read fresh on each question:
 *   1. subscriptions   — every active row (status 'active', no ends_at or one
 *                        in the future). Its plan (catalog id or legacy alias,
 *                        utils/plans.js) says which keys it grants, until its
 *                        ends_at (null = no end: one-time purchases and the
 *                        legacy open-ended rows).
 *   2. premium_until   — referral premium days (utils/referrals.js). Grants
 *                        PREMIUM_BUNDLE until that moment.
 *   3. staff           — users.is_staff: everything, so staff can see what
 *                        customers see.
 *
 * ENFORCEMENT IS OFF BY DEFAULT. Unless ENTITLEMENTS_ENFORCED=true every gate
 * lets everyone through; responses still say what WOULD be gated (header
 * X-Premium-Feature, `features[key].wouldGate` in /api/entitlements/me) so the
 * UI can show "Premium" badges before anything is charged for.
 *
 * NEVER GATED, enforced or not — do not put requireEntitlement on these:
 *   safety paths (coach safety cards, onboarding safety flags, stop-flag
 *   referrals to a professional, the WhatsApp bot's answer to a stop-flag
 *   message), data export and account deletion, basic logging (food, water,
 *   sleep, weight), streaks / Health Score / achievements, the basic coach
 *   chat (/ask), settings, password and logout.
 */

const logger = require('./logger').child({ component: 'entitlements' });
const db = require('./database');
const plans = require('./plans');
const { APP_URL } = require('./mailer');

const { ENTITLEMENT_KEYS } = plans;

// What referral premium days unlock: the app tier, not people's time.
const PREMIUM_BUNDLE = Object.freeze(['premium', 'coach_insights', 'meal_planner']);

// Features that are candidates for a gate, and the key each needs.
const FEATURES = Object.freeze({
  coach_insights: 'coach_insights', // insight cards; safety cards always shown
  meal_planner: 'meal_planner', // POST /api/meal-plans/generate
  chef_whatsapp: 'chef_whatsapp', // Yoni on WhatsApp, after a free trial
  share_branded: 'premium' // branded share card (not built yet — key reserved)
});

const DEFAULT_CHEF_TRIAL = 5;

function isEnforced(env = process.env) {
  return env.ENTITLEMENTS_ENFORCED === 'true';
}

function chefTrialLimit(env = process.env) {
  const n = Number(env.CHEF_FREE_TRIAL_MESSAGES);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : DEFAULT_CHEF_TRIAL;
}

/**
 * Pure. Which keys this person holds right now, and until when.
 *
 * @returns {{ keys: string[], until: Record<string, string|null>, sources: Record<string, string[]>,
 *             premiumUntil: string|null, staff: boolean }}
 *   until[key] null = no end.
 */
function computeEntitlements({ subscriptions = [], premiumUntil = null, isStaff = false, now = new Date() } = {}) {
  const nowMs = new Date(now).getTime();
  const until = {};
  const sources = {};

  const grant = (key, end, source) => {
    if (!ENTITLEMENT_KEYS.includes(key)) return;
    (sources[key] = sources[key] || []).includes(source) || sources[key].push(source);
    if (!(key in until)) {
      until[key] = end;
      return;
    }
    // null (no end) beats any date; otherwise the later date wins.
    if (until[key] === null || end === null) until[key] = null;
    else if (new Date(end).getTime() > new Date(until[key]).getTime()) until[key] = end;
  };

  for (const row of subscriptions) {
    if (!row || row.status !== 'active') continue;
    const endMs = row.ends_at ? new Date(row.ends_at).getTime() : null;
    if (endMs !== null && !(endMs > nowMs)) continue;
    const plan = plans.getPlan(row.plan);
    if (!plan) continue; // unknown plan grants nothing
    const end = endMs === null ? null : new Date(endMs).toISOString();
    for (const key of plan.includes) grant(key, end, `plan:${plan.id}`);
  }

  const premiumMs = premiumUntil ? new Date(premiumUntil).getTime() : NaN;
  const premiumActive = Number.isFinite(premiumMs) && premiumMs > nowMs;
  if (premiumActive) {
    for (const key of PREMIUM_BUNDLE) grant(key, new Date(premiumMs).toISOString(), 'referral');
  }

  if (isStaff) for (const key of ENTITLEMENT_KEYS) grant(key, null, 'staff');

  return {
    keys: ENTITLEMENT_KEYS.filter((k) => k in until),
    until,
    sources,
    premiumUntil: premiumActive ? new Date(premiumMs).toISOString() : null,
    staff: Boolean(isStaff)
  };
}

/** Loads the inputs for one user and computes. */
async function getUserEntitlements(userId, { now = new Date(), user = null } = {}) {
  const [row, subscriptions] = await Promise.all([
    user ? Promise.resolve(user) : db.getUser(userId),
    db.getActiveSubscriptions(userId)
  ]);
  return computeEntitlements({
    subscriptions,
    premiumUntil: row ? row.premium_until || null : null,
    isStaff: Boolean(row && row.is_staff === true),
    now
  });
}

function has(ent, key) {
  return Boolean(ent && ent.keys.includes(key));
}

/** The per-feature view the UI reads: entitled, and whether it is / would be locked. */
function featureView(ent, enforced = isEnforced()) {
  const out = {};
  for (const [feature, key] of Object.entries(FEATURES)) {
    const entitled = has(ent, key);
    out[feature] = { key, entitled, wouldGate: !entitled, locked: enforced && !entitled };
  }
  return out;
}

/** The body of a 402 — what to show instead of the feature. */
function upgradePayload(feature) {
  const key = FEATURES[feature] || feature;
  return {
    error: 'upgrade_required',
    feature,
    entitlement: key,
    message: {
      he: 'זו תכונת פרימיום. אפשר לשדרג, ובינתיים כל הרישום, הרצפים והבטיחות נשארים פתוחים.',
      en: 'This is a Premium feature. You can upgrade — logging, streaks and safety stay open either way.'
    },
    upgradeUrl: '/upgrade',
    plans: plans.plansIncluding(key)
  };
}

/**
 * Express middleware, after auth.authMiddleware. Not enforced → always next(),
 * with the X-Premium-Feature header. Enforced and not entitled → 402.
 *
 * A failed lookup lets the request through (and logs): an outage must not
 * lock paying customers out of what they bought. The cost is a free request.
 */
function requireEntitlement(feature) {
  const key = FEATURES[feature] || feature;
  if (!ENTITLEMENT_KEYS.includes(key)) throw new Error(`Unknown entitlement: ${feature}`);
  return async function entitlementGate(req, res, next) {
    res.set('X-Premium-Feature', feature);
    if (!isEnforced()) return next();
    if (!req.user || !req.user.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const ent = await getUserEntitlements(req.user.userId);
      if (has(ent, key)) return next();
      return res.status(402).json({ ...upgradePayload(feature), requestId: req.id });
    } catch (error) {
      logger.error('entitlement lookup failed; allowing the request', { feature, err: error });
      return next();
    }
  };
}

// ─── WhatsApp: Yoni the chef ────────────────────────────────────────────────

// A message about any of these goes to the bot, whose prompt refers the person
// to a professional (docs/product-truth.md §5). A paywall must never stand
// between someone and that referral.
const STOP_FLAG_PATTERN = new RegExp(
  [
    'הריון', 'היריון', 'בהריון', 'מניקה', 'הנקה', 'סוכרת', 'אינסולין', 'תרופ', 'כדורים',
    'הפרעת אכילה', 'הפרעות אכילה', 'אנורקסיה', 'בולימיה', 'הקאה', 'מקיא', 'מחלה כרונית', 'מחלה',
    'pregnan', 'breastfeed', 'nursing', 'diabet', 'insulin', 'medication', 'meds\\b', 'pills',
    'eating disorder', 'anorexi', 'bulimi', 'purg', 'chronic'
  ].join('|'),
  'i'
);

function isStopFlagText(text) {
  return typeof text === 'string' && STOP_FLAG_PATTERN.test(text);
}

function chefUpsell(remainingTrial = 0) {
  const link = `${String(APP_URL || '').replace(/\/+$/, '')}/upgrade`;
  return [
    'יוני, השף שלנו, זמין במנוי עם ליווי שף.',
    remainingTrial > 0 ? '' : 'השיחות החינמיות עם יוני הסתיימו.',
    `לפרטים ולשדרוג: ${link}`,
    'אפשר גם לכתוב "עדי" ולחזור לעדי — היא כאן בשבילכם בחינם.'
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Should this WhatsApp message reach Yoni?
 * → { allowed, reason, message? }   reason: 'not_enforced' | 'safety' |
 *   'entitled' | 'trial' | 'upgrade_required' | 'lookup_failed'
 *
 * Not enforced → allowed, and the trial is not spent.
 */
async function checkChefWhatsapp(phone, text = '', { env = process.env } = {}) {
  if (!isEnforced(env)) return { allowed: true, reason: 'not_enforced' };
  if (isStopFlagText(text)) return { allowed: true, reason: 'safety' };
  try {
    const access = await db.getWhatsappAccess(phone);
    if (access.user) {
      const ent = await getUserEntitlements(access.user.id, { user: access.user });
      if (has(ent, 'chef_whatsapp')) return { allowed: true, reason: 'entitled' };
    }
    const trial = await db.consumeChefTrial(String(phone), chefTrialLimit(env));
    if (trial.allowed) return { allowed: true, reason: 'trial', trialUsed: trial.used };
    return { allowed: false, reason: 'upgrade_required', message: chefUpsell(0) };
  } catch (error) {
    // Same reasoning as requireEntitlement: an outage is not a lapse.
    logger.error('chef access lookup failed; allowing the message', { err: error });
    return { allowed: true, reason: 'lookup_failed' };
  }
}

module.exports = {
  ENTITLEMENT_KEYS,
  PREMIUM_BUNDLE,
  FEATURES,
  isEnforced,
  chefTrialLimit,
  computeEntitlements,
  getUserEntitlements,
  has,
  featureView,
  upgradePayload,
  requireEntitlement,
  isStopFlagText,
  checkChefWhatsapp
};
