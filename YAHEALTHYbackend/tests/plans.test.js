/**
 * The plan catalog (utils/plans.js) and the checkout switch (utils/checkout.js).
 *
 * The rules that matter: a price comes only from its own environment
 * variable (never a number in code, never a legacy variable), an unknown plan
 * resolves to nothing, the legacy ids keep working, and a period turns into an
 * end date that a renewal extends rather than restarts.
 *
 *   node tests/plans.test.js
 */

const fs = require('fs');
const path = require('path');
const plans = require('../utils/plans');
const { checkoutStatus, cancellationPolicyUrl, maxInstallments } = require('../utils/checkout');

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\nplan catalog\n');

// ── the catalog ─────────────────────────────────────────────────────────────
const ids = plans.CATALOG.map((p) => p.id);
check(
  'the catalog is the six plans',
  ids.join(',') === 'app_m,app_y,chef_addon,coaching_3m,combo_3m,plan_once',
  ids.join(',')
);
check(
  'every plan has a Hebrew and an English name',
  plans.CATALOG.every((p) => p.name.he && p.name.en && /[֐-׿]/.test(p.name.he))
);
check(
  'every plan includes only known entitlement keys',
  plans.CATALOG.every((p) => p.includes.length && p.includes.every((k) => plans.ENTITLEMENT_KEYS.includes(k)))
);
check(
  'each plan reads its own PLAN_PRICE_<ID> variable',
  plans.CATALOG.every((p) => p.priceEnv === `PLAN_PRICE_${p.id.toUpperCase()}`)
);
check(
  'periods: monthly 1, yearly 12, packages 3, one-time none',
  plans.getPlan('app_m').months === 1 &&
    plans.getPlan('app_y').months === 12 &&
    plans.getPlan('chef_addon').months === 1 &&
    plans.getPlan('coaching_3m').months === 3 &&
    plans.getPlan('combo_3m').months === 3 &&
    plans.getPlan('plan_once').months === null
);
check(
  'only the combo holds everything, including the chef and people',
  ['premium', 'coach_insights', 'meal_planner', 'chef_whatsapp', 'human_coaching'].every((k) =>
    plans.getPlan('combo_3m').includes.includes(k)
  )
);
check(
  'the app subscription does not include the chef or human coaching',
  !plans.getPlan('app_m').includes.includes('chef_whatsapp') && !plans.getPlan('app_m').includes.includes('human_coaching')
);

// ── prices ──────────────────────────────────────────────────────────────────
check('no price set → null, never 0', plans.listPlans({}).every((p) => p.amount === null));
check(
  'a price comes from its variable',
  plans.getPlan('app_m', { PLAN_PRICE_APP_M: '49' }).amount === 49 &&
    plans.getPlan('app_y', { PLAN_PRICE_APP_Y: '399.90' }).amount === 399.9
);
check(
  'zero, negative, garbage and scientific notation are "no price"',
  ['0', '-49', 'abc', '49abc', '1e3', '', '   ', '49.999'].every((v) => plans.getPlan('app_m', { PLAN_PRICE_APP_M: v }).amount === null)
);
check(
  'the legacy PLAN_BASE_AMOUNT / PLAN_YONI_AMOUNT are not read',
  plans.getPlan('base', { PLAN_BASE_AMOUNT: '150' }).amount === null &&
    plans.getPlan('yoni', { PLAN_YONI_AMOUNT: '250' }).amount === null
);
check(
  "one plan's price never leaks into another",
  plans.getPlan('combo_3m', { PLAN_PRICE_APP_M: '49' }).amount === null
);

const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'plans.js'), 'utf8');
check(
  'no price from docs/product-truth.md is hard-coded in the catalog',
  !/\b(49|399|149|1,?290|1,?690|690|150|250)\b/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
  'prices belong in the environment'
);

// ── ids and aliases ─────────────────────────────────────────────────────────
check('legacy "base" → coaching_3m', plans.resolvePlanId('base') === 'coaching_3m' && plans.getPlan('base').id === 'coaching_3m');
check('legacy "yoni" → combo_3m', plans.resolvePlanId('yoni') === 'combo_3m');
check('legacy ids are recognised as legacy', plans.isLegacyId('base') && plans.isLegacyId('yoni') && !plans.isLegacyId('app_m'));
check(
  'unknown, empty and prototype-ish ids resolve to nothing',
  ['platinum', '', 'constructor', '__proto__', 'toString', null, undefined, 42].every((id) => plans.getPlan(id) === null)
);
check('plans including the chef', plans.plansIncluding('chef_whatsapp').join(',') === 'chef_addon,combo_3m');

const pub = plans.publicPlan(plans.getPlan('combo_3m', { PLAN_PRICE_COMBO_3M: '1690' }));
check(
  'the public shape carries names, period, price and includes — and not the env name',
  pub.id === 'combo_3m' && pub.amount === 1690 && pub.currency === 'ILS' && pub.period === '3_months' &&
    pub.featured === true && pub.label === pub.name.he && !('priceEnv' in pub),
  JSON.stringify(pub)
);

// ── end dates ───────────────────────────────────────────────────────────────
const now = new Date('2026-01-31T10:00:00.000Z');
check(
  'a month from Jan 31 is the last day of February',
  plans.computeEndsAt('app_m', { now }).toISOString() === '2026-02-28T10:00:00.000Z'
);
check(
  'three months, a year',
  plans.computeEndsAt('combo_3m', { now }).toISOString() === '2026-04-30T10:00:00.000Z' &&
    plans.computeEndsAt('app_y', { now }).toISOString() === '2027-01-31T10:00:00.000Z'
);
check('a one-time purchase has no end', plans.computeEndsAt('plan_once', { now }) === null);
check(
  'a renewal while the period runs starts where it ends',
  plans.computeEndsAt('app_m', { now, currentEndsAt: '2026-02-15T00:00:00.000Z' }).toISOString() === '2026-03-15T00:00:00.000Z'
);
check(
  'a renewal after it lapsed starts now',
  plans.computeEndsAt('app_m', { now, currentEndsAt: '2025-12-01T00:00:00.000Z' }).toISOString() === '2026-02-28T10:00:00.000Z'
);
check('an unknown plan has no end date to compute', plans.computeEndsAt('platinum', { now }) === null);

// ── the checkout switch ─────────────────────────────────────────────────────
const on = { payplusConfigured: true };
check('checkout is off by default', checkoutStatus({}, on).enabled === false && checkoutStatus({}, on).reason === 'disabled');
check(
  'CHECKOUT_ENABLED alone is not enough: a cancellation policy is required',
  checkoutStatus({ CHECKOUT_ENABLED: 'true' }, on).reason === 'no_cancellation_policy'
);
check(
  'and PayPlus has to be configured',
  checkoutStatus({ CHECKOUT_ENABLED: 'true', CANCELLATION_POLICY_URL: 'https://x.example/cancel' }, { payplusConfigured: false })
    .reason === 'payments_not_configured'
);
const enabled = checkoutStatus({ CHECKOUT_ENABLED: 'true', CANCELLATION_POLICY_URL: '/terms#cancel' }, on);
check('all three → enabled', enabled.enabled === true && enabled.reason === null && enabled.cancellationPolicyUrl === '/terms#cancel');
check(
  '"yes", "1", "TRUE" are not "true"',
  ['yes', '1', 'TRUE', ' true'].every(
    (v) => !checkoutStatus({ CHECKOUT_ENABLED: v, CANCELLATION_POLICY_URL: '/t' }, on).enabled
  )
);
check(
  'a policy URL must be http(s) or a site path',
  cancellationPolicyUrl({ CANCELLATION_POLICY_URL: 'javascript:alert(1)' }) === null &&
    cancellationPolicyUrl({ CANCELLATION_POLICY_URL: '//evil.example' }) === null &&
    cancellationPolicyUrl({ CANCELLATION_POLICY_URL: 'https://yahealthy.example/cancel' }) === 'https://yahealthy.example/cancel'
);
check(
  'installments are off unless 2–36',
  maxInstallments({}) === null &&
    maxInstallments({ PAYPLUS_MAX_INSTALLMENTS: '1' }) === null &&
    maxInstallments({ PAYPLUS_MAX_INSTALLMENTS: '3' }) === 3 &&
    maxInstallments({ PAYPLUS_MAX_INSTALLMENTS: '99' }) === null
);

// ── recurring billing = a renewal reminder, not a stored card ───────────────
const lifecycle = require('../utils/lifecycle');
const { renderMessage } = require('../utils/lifecycle-templates');
const rNow = new Date('2026-10-05T09:00:00.000Z'); // a Monday, 12:00 in Israel
const subs = [
  { plan: 'app_y', status: 'active', ends_at: '2027-06-01T00:00:00.000Z' },
  { plan: 'yoni', status: 'active', ends_at: '2026-10-09T10:00:00.000Z' },
  { plan: 'plan_once', status: 'active', ends_at: null }
];
const cand = lifecycle.renewalCandidate(subs, rNow);
check('the soonest-ending periodic plan is the one to renew (legacy id resolved)', cand && cand.plan === 'combo_3m', JSON.stringify(cand));
check('one-time and open-ended purchases never need renewing', lifecycle.renewalCandidate([subs[2]], rNow) === null);

const user = { id: 'u1', email: 'a@example.com', created_at: '2026-01-01T00:00:00Z' };
const base = { user, prefs: {}, activity: { renewal: cand }, sends: [], now: rNow };
check(
  'no renewal reminder while checkout is off (the default)',
  lifecycle.decideUser({ ...base, config: lifecycle.DEFAULT_CONFIG }).campaign !== 'renewal'
);
const on7 = { ...lifecycle.DEFAULT_CONFIG, renewal: { enabled: true, daysBefore: 7 } };
const d = lifecycle.decideUser({ ...base, config: on7 });
check(
  'checkout on: a period ending within 7 days gets one service email',
  d.action === 'send' && d.campaign === 'renewal' && d.marketing === false && d.channel === 'email' && d.periodKey === 'combo_3m:2026-10-09',
  JSON.stringify(d)
);
check(
  'never twice for the same period',
  lifecycle.decideUser({ ...base, config: on7, sends: [{ campaign: 'renewal', period_key: d.periodKey, status: 'sent', sent_at: '2026-09-01T00:00:00Z' }] }).campaign !== 'renewal'
);
const msg = renderMessage({ campaign: 'renewal', step: 'before_end', lang: 'he', marketing: false, vars: { renewal: cand, renewUrl: 'https://x/upgrade?plan=combo_3m' } });
check(
  'the reminder names the plan, links to /upgrade, promises no automatic charge and carries no price',
  /שילוב מלא/.test(msg.text) && /\/upgrade\?plan=combo_3m/.test(msg.text) && /לא מחייבים אוטומטית/.test(msg.text) && !/₪|\d{3,}\s*ש/.test(msg.text) && !/^פרסומת/.test(msg.subject),
  msg.subject
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
