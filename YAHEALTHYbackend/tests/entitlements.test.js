/**
 * Entitlements and paid-feature gates (utils/entitlements.js).
 *
 * Two promises are tested here, because both fail silently in production:
 *   1. SAFE BY DEFAULT — with ENTITLEMENTS_ENFORCED unset nothing is gated,
 *      and responses only say what WOULD be.
 *   2. SAFE WHEN ENFORCED — gated features answer 402 with an upgrade
 *      payload, but safety, basic logging, streaks, the coach chat and
 *      account deletion never do.
 *
 *   node tests/entitlements.test.js
 *
 * The app runs in this process on the in-memory store; the flag is read at
 * request time, so the suite flips process.env between the two halves.
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'entitlements-test-secret';
process.env.VERCEL = '1'; // index.js exports the app instead of binding a port
delete process.env.ENTITLEMENTS_ENFORCED;
delete process.env.CHECKOUT_ENABLED;
process.env.CHEF_FREE_TRIAL_MESSAGES = '2';

const db = require('../utils/database');
const ent = require('../utils/entitlements');

let BASE;
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

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json, headers: res.headers };
}

const password = 'correct horse battery';
let seq = 0;
async function signup() {
  seq++;
  const email = `ent-test-${Date.now()}-${seq}@example.com`;
  const res = await call('POST', '/api/auth/signup', { body: { email, password } });
  return { id: res.body.id, token: res.body.token, email };
}

const NOW = new Date('2026-10-01T12:00:00.000Z');
const later = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();

function pure() {
  const c = (input) => ent.computeEntitlements({ now: NOW, ...input });

  check('nobody holds anything by default', c({}).keys.length === 0);

  const combo = c({ subscriptions: [{ plan: 'combo_3m', status: 'active', ends_at: later(30) }] });
  check(
    'an active combo grants all five keys until its end',
    combo.keys.length === 5 && combo.until.chef_whatsapp === later(30),
    JSON.stringify(combo)
  );
  check(
    'an ended subscription grants nothing',
    c({ subscriptions: [{ plan: 'combo_3m', status: 'active', ends_at: later(-1) }] }).keys.length === 0
  );
  check(
    'a cancelled or expired row grants nothing',
    c({ subscriptions: [{ plan: 'combo_3m', status: 'cancelled', ends_at: null }, { plan: 'app_m', status: 'expired' }] }).keys.length === 0
  );
  const legacy = c({ subscriptions: [{ plan: 'yoni', status: 'active', ends_at: null }] });
  check(
    'a legacy open-ended "yoni" row still grants the combo, with no end',
    legacy.keys.includes('chef_whatsapp') && legacy.until.chef_whatsapp === null,
    JSON.stringify(legacy)
  );
  check(
    'a legacy "base" row grants coaching but not the chef',
    (() => {
      const e = c({ subscriptions: [{ plan: 'base', status: 'active', ends_at: null }] });
      return e.keys.includes('human_coaching') && !e.keys.includes('chef_whatsapp');
    })()
  );
  check('an unknown plan grants nothing', c({ subscriptions: [{ plan: 'platinum', status: 'active' }] }).keys.length === 0);
  check(
    'a one-time plan grants without an end',
    c({ subscriptions: [{ plan: 'plan_once', status: 'active', ends_at: null }] }).until.meal_planner === null
  );

  const merged = c({
    subscriptions: [
      { plan: 'app_m', status: 'active', ends_at: later(10) },
      { plan: 'app_y', status: 'active', ends_at: later(200) }
    ],
    premiumUntil: later(40)
  });
  check('overlapping sources: the latest end wins', merged.until.premium === later(200), JSON.stringify(merged.until));

  const referral = c({ premiumUntil: later(14) });
  check(
    'referral premium days grant premium, insights and the planner — not the chef or people',
    referral.keys.join(',') === 'premium,coach_insights,meal_planner' && referral.premiumUntil === later(14),
    JSON.stringify(referral)
  );
  check('lapsed referral premium grants nothing', c({ premiumUntil: later(-1) }).keys.length === 0);
  check('staff see everything', c({ isStaff: true }).keys.length === 5);

  const view = ent.featureView(referral, false);
  check(
    'not enforced: nothing is locked, but the chef "would" be',
    Object.values(view).every((f) => f.locked === false) && view.chef_whatsapp.wouldGate === true && view.coach_insights.wouldGate === false,
    JSON.stringify(view)
  );
  check('enforced: what is missing is locked', ent.featureView(referral, true).chef_whatsapp.locked === true);

  const payload = ent.upgradePayload('meal_planner');
  check(
    'the 402 payload is bilingual and points at /upgrade and the plans that unlock it',
    payload.error === 'upgrade_required' && payload.message.he && payload.message.en && payload.upgradeUrl === '/upgrade' &&
      payload.plans.includes('app_m') && payload.plans.includes('combo_3m'),
    JSON.stringify(payload)
  );

  check(
    'stop-flag words are recognised in Hebrew and English',
    ['אני בהריון, מה לבשל?', 'יש לי סוכרת', 'I take insulin', 'eating disorder'].every(ent.isStopFlagText) &&
      !ent.isStopFlagText('מה מבשלים היום עם עוף?')
  );
  let threw = false;
  try {
    ent.requireEntitlement('no_such_feature');
  } catch {
    threw = true;
  }
  check('a gate for an unknown feature fails at startup, not at request time', threw);
}

async function run() {
  pure();

  const alice = await signup(); // no plan
  const staff = await signup();
  (await db.getUser(staff.id)).is_staff = true;

  // A calorie target under the safe floor produces a safety card.
  await db.updateUserPreferences(alice.id, { macroTargets: { calorieOverride: 900 } });

  // ── 1. not enforced (the default) ────────────────────────────────────────
  const me = await call('GET', '/api/entitlements/me', { token: alice.token });
  check(
    '/api/entitlements/me: not enforced, nothing held, everything would-gate but nothing locked',
    me.status === 200 && me.body?.enforced === false && me.body?.entitlements?.length === 0 &&
      me.body?.features?.coach_insights?.wouldGate === true && me.body?.features?.coach_insights?.locked === false &&
      me.body?.checkout?.enabled === false,
    JSON.stringify(me.body)
  );
  check('/api/entitlements/me needs a session', (await call('GET', '/api/entitlements/me')).status === 401);

  const generateBody = { startDate: '2026-10-05', endDate: '2026-10-06' };
  const freeGen = await call('POST', '/api/meal-plans/generate', { token: alice.token, body: generateBody });
  check(
    'not enforced: the meal planner is open, and says it is a Premium feature',
    freeGen.status !== 402 && freeGen.headers.get('x-premium-feature') === 'meal_planner',
    `status ${freeGen.status}`
  );
  const freeIns = await call('GET', `/api/crm/users/${alice.id}/insights?lang=en`, { token: alice.token });
  check(
    'not enforced: all insight cards, none locked',
    freeIns.status === 200 && Array.isArray(freeIns.body) && !freeIns.body.some((c) => c.kind === 'premium') &&
      freeIns.headers.get('x-premium-feature') === 'coach_insights' && !freeIns.headers.get('x-premium-locked'),
    JSON.stringify(freeIns.body)
  );
  const chefFree = await ent.checkChefWhatsapp('972500000001', 'מה מבשלים?');
  check('not enforced: Yoni answers, and no trial is spent', chefFree.allowed && chefFree.reason === 'not_enforced');

  // ── 2. enforced ──────────────────────────────────────────────────────────
  process.env.ENTITLEMENTS_ENFORCED = 'true';

  const gated = await call('POST', '/api/meal-plans/generate', { token: alice.token, body: generateBody });
  check(
    'enforced: the meal planner answers 402 with the upgrade payload',
    gated.status === 402 && gated.body?.error === 'upgrade_required' && gated.body?.feature === 'meal_planner' &&
      gated.body?.message?.he && gated.body?.upgradeUrl === '/upgrade',
    `status ${gated.status} ${JSON.stringify(gated.body)}`
  );
  check(
    'enforced: an unauthenticated call is still a 401, not a 402',
    (await call('POST', '/api/meal-plans/generate', { body: generateBody })).status === 401
  );

  const lockedIns = await call('GET', `/api/crm/users/${alice.id}/insights?lang=he`, { token: alice.token });
  const kinds = (lockedIns.body || []).map((c) => c.kind);
  check(
    'enforced: insight cards are locked — but the safety card is still shown',
    lockedIns.status === 200 && kinds.includes('safety') && kinds.includes('premium') &&
      kinds.every((k) => k === 'safety' || k === 'premium') && lockedIns.headers.get('x-premium-locked') === 'coach_insights',
    JSON.stringify(kinds)
  );
  const lockCard = (lockedIns.body || []).find((c) => c.kind === 'premium');
  check('the locked card is in the requested language and links to /upgrade', lockCard?.cta?.href === '/upgrade' && /[֐-׿]/.test(lockCard?.title || ''));

  const today = new Date().toISOString().slice(0, 10);
  const basics = [
    ['water log', await call('POST', '/api/hydration-logs', { token: alice.token, body: { litersConsumed: 0.5 } })],
    ['food log', await call('POST', '/api/food-logs', { token: alice.token, body: { date: today, name: 'Salad', calories: 200 } })],
    ['sleep log', await call('POST', '/api/sleep-logs', { token: alice.token, body: { hoursSlept: 7, quality: 4 } })],
    ['streaks / Health Score', await call('GET', '/api/engagement/summary', { token: alice.token })],
    ['coach chat', await call('POST', `/api/crm/users/${alice.id}/ask?lang=en`, { token: alice.token, body: { message: 'what should I eat for dinner?' } })],
    ['referral page', await call('GET', '/api/referrals/me', { token: alice.token })],
    ['my plans', await call('GET', '/api/payments/my-plans', { token: alice.token })]
  ];
  for (const [label, res] of basics) {
    check(`enforced: ${label} is never gated`, res.status !== 402, `status ${res.status}`);
  }

  // Held entitlements open the gate.
  await db.createSubscription(alice.id, 'app_m', { endsAtFor: () => new Date(Date.now() + 30 * 86400000) });
  const opened = await call('POST', '/api/meal-plans/generate', { token: alice.token, body: generateBody });
  check('enforced: a paying user passes the gate', opened.status !== 402, `status ${opened.status}`);
  const paidIns = await call('GET', `/api/crm/users/${alice.id}/insights?lang=en`, { token: alice.token });
  check('enforced: a paying user gets the full insight cards', !(paidIns.body || []).some((c) => c.kind === 'premium'));

  const staffGen = await call('POST', '/api/meal-plans/generate', { token: staff.token, body: generateBody });
  check('enforced: staff pass every gate', staffGen.status !== 402, `status ${staffGen.status}`);

  // Referral premium days open it too.
  const bob = await signup();
  await db.extendPremiumUntil(bob.id, 14);
  const bobGen = await call('POST', '/api/meal-plans/generate', { token: bob.token, body: generateBody });
  check('enforced: referral premium days pass the planner gate', bobGen.status !== 402, `status ${bobGen.status}`);

  // Account deletion is never gated.
  const deleted = await call('DELETE', '/api/users/me', { token: bob.token, body: { password } });
  check('enforced: account deletion is never gated', deleted.status === 200, `status ${deleted.status}`);

  // ── Yoni on WhatsApp ─────────────────────────────────────────────────────
  const stranger = '972500000002';
  const t1 = await ent.checkChefWhatsapp(stranger, 'מה מבשלים?');
  const t2 = await ent.checkChefWhatsapp(stranger, 'ועוד שאלה');
  const t3 = await ent.checkChefWhatsapp(stranger, 'ועוד אחת');
  check(
    'enforced: a stranger gets the free trial (2 here), then the upsell',
    t1.allowed && t1.reason === 'trial' && t2.allowed && !t3.allowed && t3.reason === 'upgrade_required',
    JSON.stringify([t1, t2, t3])
  );
  check('the upsell links to /upgrade and offers Adi instead', /\/upgrade/.test(t3.message) && /עדי/.test(t3.message));
  const safety = await ent.checkChefWhatsapp(stranger, 'אני בהריון, מה מותר לאכול?');
  check('enforced: a stop-flag message always reaches the bot, trial or not', safety.allowed && safety.reason === 'safety');

  const chef = await signup();
  await db.setUserPhone(chef.id, '0500000003');
  await db.createSubscription(chef.id, 'chef_addon', { endsAtFor: () => new Date(Date.now() + 30 * 86400000) });
  const paidChef = await ent.checkChefWhatsapp('972500000003@s.whatsapp.net', 'מה מבשלים?');
  check('enforced: a chef subscriber is recognised by their WhatsApp number', paidChef.allowed && paidChef.reason === 'entitled', JSON.stringify(paidChef));

  delete process.env.ENTITLEMENTS_ENFORCED;
}

(async () => {
  let code = 1;
  let server;
  try {
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;

    console.log('\nentitlements & gates\n');
    await run();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
