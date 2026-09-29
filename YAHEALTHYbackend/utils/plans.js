/**
 * The plan catalog — the one list of what YAHEALTHY can sell.
 *
 * Everything that talks about a plan reads it from here: checkout
 * (routes/payments.js), the public price list (/api/marketing/plans), the
 * entitlement resolver (utils/entitlements.js), the staff funnel and the
 * renewal reminder. A plan that is not in this file cannot be bought, and a
 * subscription row whose plan is not here grants nothing.
 *
 * PRICES ARE NEVER WRITTEN HERE. Each plan names the environment variable its
 * price comes from (PLAN_PRICE_<ID>). Unset, 0 or garbage → `amount: null`,
 * which the landing page shows as "Price on request" and checkout refuses to
 * sell. A price changes on the business's schedule, not on a deploy's, and a
 * number in code is a number nobody decided on.
 *
 * `includes` lists entitlement keys (see ENTITLEMENT_KEYS). `months` is how
 * long one purchase lasts; null means a one-time purchase whose entitlements
 * do not expire (the callback writes no ends_at).
 *
 * Legacy ids: the first checkout sold `base` ("ליווי") and `yoni` ("ליווי עם
 * יוני"). They stay valid as aliases — old subscription rows, PayPlus
 * callbacks already in flight and old links keep working — and resolve to
 * coaching_3m / combo_3m. Legacy rows keep the ends_at they were sold with
 * (null = open-ended); nothing here shortens something already bought.
 */

const ENTITLEMENT_KEYS = Object.freeze([
  'premium', // the paid app tier (a "Premium" badge; branded share card)
  'coach_insights', // the coach's insight cards (the basic chat stays free)
  'meal_planner', // generated meal plans
  'chef_whatsapp', // Yoni, the chef, on WhatsApp
  'human_coaching' // sessions with the (natural) nutritionist — fulfilled by people
]);

// Order is display order on the landing page and /upgrade.
const CATALOG = Object.freeze([
  {
    id: 'app_m',
    priceEnv: 'PLAN_PRICE_APP_M',
    period: 'month',
    months: 1,
    kind: 'subscription',
    name: { he: 'מנוי אפליקציה — חודשי', en: 'App subscription — monthly' },
    includes: ['premium', 'coach_insights', 'meal_planner']
  },
  {
    id: 'app_y',
    priceEnv: 'PLAN_PRICE_APP_Y',
    period: 'year',
    months: 12,
    kind: 'subscription',
    name: { he: 'מנוי אפליקציה — שנתי', en: 'App subscription — yearly' },
    includes: ['premium', 'coach_insights', 'meal_planner']
  },
  {
    id: 'chef_addon',
    priceEnv: 'PLAN_PRICE_CHEF_ADDON',
    period: 'month',
    months: 1,
    kind: 'addon',
    name: { he: 'ליווי שף (תוספת)', en: 'Chef add-on' },
    includes: ['chef_whatsapp']
  },
  {
    id: 'coaching_3m',
    priceEnv: 'PLAN_PRICE_COACHING_3M',
    period: '3_months',
    months: 3,
    kind: 'package',
    name: { he: 'ליווי תזונאי.ת — 3 חודשים', en: 'Nutrition coaching — 3 months' },
    includes: ['premium', 'coach_insights', 'meal_planner', 'human_coaching']
  },
  {
    id: 'combo_3m',
    priceEnv: 'PLAN_PRICE_COMBO_3M',
    period: '3_months',
    months: 3,
    kind: 'package',
    featured: true,
    name: { he: 'שילוב מלא — 3 חודשים', en: 'Full combo — 3 months' },
    includes: ['premium', 'coach_insights', 'meal_planner', 'chef_whatsapp', 'human_coaching']
  },
  {
    id: 'plan_once',
    priceEnv: 'PLAN_PRICE_PLAN_ONCE',
    period: 'once',
    months: null,
    kind: 'one_time',
    name: { he: 'תוכנית תזונה חד-פעמית', en: 'One-time nutrition plan' },
    // The plan itself is delivered by a person; in the app it unlocks the
    // meal planner for good. Owner decision pending (see the release notes).
    includes: ['meal_planner']
  }
]);

const LEGACY_ALIASES = Object.freeze({ base: 'coaching_3m', yoni: 'combo_3m' });

const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

// Every price variable, for config-check and the release notes. Prices are
// read at call time (getPlan), so a changed environment needs no code change.
const PRICE_ENV_VARS = Object.freeze(CATALOG.map((p) => p.priceEnv));

/** A positive price in shekels (agorot allowed), or null. Never 0, never NaN. */
function parsePrice(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Canonical id for a catalog id or a legacy alias; null for anything else. */
function resolvePlanId(id) {
  if (typeof id !== 'string') return null;
  const key = id.trim();
  if (BY_ID.has(key)) return key;
  if (Object.prototype.hasOwnProperty.call(LEGACY_ALIASES, key)) return LEGACY_ALIASES[key];
  return null;
}

function isLegacyId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_ALIASES, id.trim());
}

/** The catalog entry (with its current price) for an id or alias, or null. */
function getPlan(id, env = process.env) {
  const canonical = resolvePlanId(id);
  if (!canonical) return null;
  const plan = BY_ID.get(canonical);
  return { ...plan, amount: parsePrice(env[plan.priceEnv]), currency: 'ILS' };
}

function listPlans(env = process.env) {
  return CATALOG.map((p) => getPlan(p.id, env));
}

/** Plans whose purchase grants `key`, cheapest-looking first (catalog order). */
function plansIncluding(key) {
  return CATALOG.filter((p) => p.includes.includes(key)).map((p) => p.id);
}

/**
 * The public shape (landing page, /upgrade, /api/marketing/plans). `label`
 * is kept for older clients that read it.
 */
function publicPlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    label: plan.name.he,
    period: plan.period,
    months: plan.months,
    kind: plan.kind,
    featured: Boolean(plan.featured),
    amount: plan.amount,
    currency: plan.currency,
    includes: [...plan.includes]
  };
}

/** Calendar months added in UTC, clamped to the month's last day (Jan 31 + 1m = Feb 28/29). */
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  const out = new Date(d.getTime());
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/**
 * When a purchase made at `now` ends. A renewal bought while the previous
 * period is still running starts where that one ends, so paying early never
 * loses days. null for a one-time purchase (no end).
 */
function computeEndsAt(planOrId, { now = new Date(), currentEndsAt = null } = {}) {
  const plan = typeof planOrId === 'string' ? getPlan(planOrId) : planOrId;
  if (!plan || !plan.months) return null;
  const nowMs = new Date(now).getTime();
  const currentMs = currentEndsAt ? new Date(currentEndsAt).getTime() : NaN;
  const from = Number.isFinite(currentMs) && currentMs > nowMs ? new Date(currentMs) : new Date(nowMs);
  return addMonths(from, plan.months);
}

module.exports = {
  ENTITLEMENT_KEYS,
  CATALOG,
  LEGACY_ALIASES,
  PRICE_ENV_VARS,
  parsePrice,
  resolvePlanId,
  isLegacyId,
  getPlan,
  listPlans,
  plansIncluding,
  publicPlan,
  addMonths,
  computeEndsAt
};
