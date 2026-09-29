/**
 * Referral program and signup attribution.
 *
 * The rules that matter here are all refusals: nobody refers themselves, a
 * person is attributed to one referrer only, a bad code never costs someone
 * their signup, and the public validate endpoint never gives away an email.
 * Each of those fails silently in production — a referral that should not
 * exist looks exactly like one that should — so each is asserted directly.
 *
 *   node tests/referrals.test.js
 *
 * The app runs in this process, on the in-memory store and a port the OS
 * picks, so the test can read back what signup stored without an endpoint
 * that exposes it.
 */

// Before anything reads process.env at load time.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'referrals-test-secret';
process.env.VERCEL = '1'; // index.js exports the app instead of binding a port
process.env.REFERRAL_MAX_REWARDED = '2';
process.env.REFERRAL_REWARD_DAYS = '14';
process.env.REFERRAL_FRIEND_REWARD_DAYS = '7';
process.env.REFERRAL_VALIDATE_LIMIT = '30';

const db = require('../utils/database');
const referrals = require('../utils/referrals');
const { REFERRAL_REWARDS } = require('../utils/constants');
const { generateReferralCode, normalizeReferralCode, REFERRAL_CODE_ALPHABET } = require('../utils/id-generator');

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
    /* some responses carry no body */
  }
  return { status: res.status, body: json };
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

const password = 'correct horse battery';
let seq = 0;
async function signup(extra = {}) {
  seq++;
  const email = `ref-test-${Date.now()}-${seq}@example.com`;
  const res = await call('POST', '/api/auth/signup', { body: { email, password, ...extra } });
  return { ...res, email };
}

async function run() {
  // ── codes ─────────────────────────────────────────────────────────────────
  const sample = Array.from({ length: 200 }, () => generateReferralCode());
  check(
    'generated codes are 6 characters from the unambiguous alphabet',
    sample.every((c) => c.length === 6 && [...c].every((ch) => REFERRAL_CODE_ALPHABET.includes(ch))),
    sample.slice(0, 3).join(',')
  );
  check('look-alike characters never appear', sample.every((c) => !/[01OIL]/.test(c)));
  check(
    'typed codes are normalised (case, spaces, dashes)',
    normalizeReferralCode(' k7m-2qx ') === 'K7M2QX'
  );
  check('junk is not a code', normalizeReferralCode("x'; drop table--") === null && normalizeReferralCode(42) === null);

  // ── referrer gets a code lazily, and it is stable ─────────────────────────
  const alice = await signup({ name: 'Dana Levi' });
  check('referrer signs up', alice.status === 201, `status ${alice.status}`);
  const aliceId = alice.body?.id;
  check('no code exists until someone asks for one', !(await db.getUser(aliceId)).referral_code);

  const me1 = await call('GET', '/api/referrals/me', { token: alice.body.token });
  const me2 = await call('GET', '/api/referrals/me', { token: alice.body.token });
  const code = me1.body?.code;
  check('GET /me returns a code', me1.status === 200 && typeof code === 'string' && code.length === 6, JSON.stringify(me1.body));
  check('the code is stable across requests', me2.body?.code === code);
  check('shareUrl carries the code', typeof me1.body?.shareUrl === 'string' && me1.body.shareUrl.endsWith(`/signup?ref=${code}`), me1.body?.shareUrl);
  check('a new referrer starts at zero', me1.body?.invitedCount === 0 && me1.body?.convertedCount === 0);
  check(
    'reward config is surfaced',
    me1.body?.rewards?.perReferral === REFERRAL_REWARDS.referrer.amount && me1.body?.rewards?.earnedPremiumDays === 0,
    JSON.stringify(me1.body?.rewards)
  );
  check('GET /me requires auth', (await call('GET', '/api/referrals/me')).status === 401);

  // ── validate: public, and leaks nothing ───────────────────────────────────
  const valid = await call('GET', `/api/referrals/validate/${code.toLowerCase()}`);
  check('a real code validates (case-insensitive)', valid.status === 200 && valid.body?.valid === true, JSON.stringify(valid.body));
  check('validate returns the chosen first name only', valid.body?.referrerFirstName === 'Dana', JSON.stringify(valid.body));
  check('validate never returns an email', !JSON.stringify(valid.body).includes('@') && !JSON.stringify(valid.body).includes('ref-test'));

  const nameless = await signup();
  const namelessMe = await call('GET', '/api/referrals/me', { token: nameless.body.token });
  const namelessValid = await call('GET', `/api/referrals/validate/${namelessMe.body.code}`);
  check(
    'a name derived from the email is withheld',
    namelessValid.body?.valid === true && !('referrerFirstName' in namelessValid.body),
    JSON.stringify(namelessValid.body)
  );

  const bogus = await call('GET', '/api/referrals/validate/ZZZZZZ');
  check('an unknown code is not valid', bogus.status === 200 && bogus.body?.valid === false, JSON.stringify(bogus.body));

  // ── signup with a referral code + attribution ─────────────────────────────
  const attribution = {
    utm_source: 'instagram',
    utm_medium: 'social',
    utm_campaign: 'spring-2026',
    utm_content: 'story-a',
    utm_term: 'diet app',
    landing_path: '/?ref=' + code,
    referrer: 'https://l.instagram.com/'
  };
  const bob = await signup({ referralCode: code, attribution });
  check('referee signs up with a code', bob.status === 201 && bob.body?.referralApplied === true, JSON.stringify(bob.body));

  const bobRow = await db.getUser(bob.body.id);
  check(
    'attribution is stored on the user',
    bobRow.attribution &&
      Object.entries(attribution).every(([k, v]) => bobRow.attribution[k] === v) &&
      typeof bobRow.attribution.captured_at === 'string',
    JSON.stringify(bobRow.attribution)
  );
  check('referee is linked to the referrer', bobRow.referred_by === aliceId);

  let aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check('invitedCount counts the referee', aliceMe.body?.invitedCount === 1, JSON.stringify(aliceMe.body));
  check(
    'signing up alone earns nothing — the reward waits for activation',
    aliceMe.body?.rewards?.earnedCount === 0 && aliceMe.body?.rewards?.earnedPremiumDays === 0 &&
      aliceMe.body?.pendingActivationCount === 1 && !(await db.getUser(aliceId)).premium_until,
    JSON.stringify(aliceMe.body)
  );
  check(
    'the invite page is told the rule: activation, window, friend reward',
    aliceMe.body?.rewards?.trigger === 'referee_activation' &&
      aliceMe.body?.rewards?.activationWindowDays === 7 &&
      aliceMe.body?.rewards?.friendReward === REFERRAL_REWARDS.referee.amount,
    JSON.stringify(aliceMe.body?.rewards)
  );

  // ── activation: the friend's first log earns both sides their days ───────
  const before = Date.now();
  const logged = await call('POST', '/api/hydration-logs', { token: bob.body.token, body: { litersConsumed: 0.5 } });
  check('the friend logs water', logged.status === 201, `status ${logged.status}`);
  const rewarded = await waitFor(async () => (await db.getReferralRewards(aliceId)).length === 1);
  check('the first log rewards the referrer (after the response, not in it)', rewarded);

  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check(
    'the referrer earns the configured reward',
    aliceMe.body?.rewards?.earnedCount === 1 &&
      aliceMe.body?.rewards?.earnedPremiumDays === REFERRAL_REWARDS.referrer.amount,
    JSON.stringify(aliceMe.body?.rewards)
  );
  check('/me exposes counts, never referee identities', !JSON.stringify(aliceMe.body).includes(bob.email));

  const days = (iso) => Math.round((Date.parse(iso) - before) / 86400000);
  const alicePremium = (await db.getUser(aliceId)).premium_until;
  check(
    "the reward is applied: the referrer's premium end moves out",
    !!alicePremium && days(alicePremium) === REFERRAL_REWARDS.referrer.amount,
    String(alicePremium)
  );
  const bobPremium = (await db.getUser(bob.body.id)).premium_until;
  check(
    'the invited friend gets their own reward too',
    !!bobPremium && days(bobPremium) === REFERRAL_REWARDS.referee.amount,
    String(bobPremium)
  );
  check(
    'applied rewards are marked applied, once',
    (await db.getReferralRewards(aliceId)).every((r) => r.status === 'applied' && r.applied_at)
  );

  const bobEnt = await call('GET', '/api/entitlements/me', { token: bob.body.token });
  check(
    'premium days show up as entitlements (premium, insights, planner — not the chef)',
    ['premium', 'coach_insights', 'meal_planner'].every((k) => bobEnt.body?.entitlements?.includes(k)) &&
      !bobEnt.body?.entitlements?.includes('chef_whatsapp') && !!bobEnt.body?.premiumUntil,
    JSON.stringify(bobEnt.body)
  );

  // ── idempotency ───────────────────────────────────────────────────────────
  await call('POST', '/api/hydration-logs', { token: bob.body.token, body: { litersConsumed: 0.3 } });
  const replays = await Promise.all([
    referrals.rewardOnActivation(bob.body.id),
    referrals.rewardOnActivation(bob.body.id),
    referrals.rewardOnActivation(bob.body.id)
  ]);
  await new Promise((r) => setTimeout(r, 200));
  check(
    'more logs and repeated checks pay nothing twice',
    (await db.getReferralRewards(aliceId)).length === 1 &&
      (await db.getReferralRewards(bob.body.id)).length === 1 &&
      (await db.getUser(aliceId)).premium_until === alicePremium &&
      (await db.getUser(bob.body.id)).premium_until === bobPremium,
    JSON.stringify(replays)
  );
  check('a repeat check says so', replays.every((r) => r.status === 'already_rewarded'), JSON.stringify(replays));

  // ── invalid codes never block signup ──────────────────────────────────────
  const withUnknown = await signup({ referralCode: 'NOPE99' });
  check('an unknown code still signs the person up', withUnknown.status === 201 && withUnknown.body?.referralApplied === false, `status ${withUnknown.status}`);

  const withJunk = await signup({ referralCode: '<script>alert(1)</script>'.repeat(10) });
  check('a malformed code still signs the person up', withJunk.status === 201, `status ${withJunk.status} ${JSON.stringify(withJunk.body)}`);

  const withWrongType = await signup({ referralCode: 12345, attribution: 'not-an-object' });
  check('wrong-typed growth fields are dropped, not rejected', withWrongType.status === 201, `status ${withWrongType.status}`);
  check('dropped attribution stores nothing', !(await db.getUser(withWrongType.body.id)).attribution);

  const noGrowth = await signup();
  check('plain signup is unchanged', noGrowth.status === 201 && noGrowth.body?.referralApplied === false);
  check('plain signup stores no attribution', !(await db.getUser(noGrowth.body.id)).attribution);

  const badEmail = await call('POST', '/api/auth/signup', { body: { email: 'nope', password, referralCode: code } });
  check('core validation still applies', badEmail.status === 400);

  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check('failed attempts did not count as referrals', aliceMe.body?.invitedCount === 1, JSON.stringify(aliceMe.body));

  // ── self-referral ─────────────────────────────────────────────────────────
  const self = await referrals.applyReferral({ rawCode: code, refereeId: aliceId });
  check('self-referral is refused', self.applied === false && self.reason === 'self', JSON.stringify(self));
  const selfAtDb = await db.createReferral({ referrerId: aliceId, refereeId: aliceId, code });
  check('the store refuses self-referral too', selfAtDb.created === false && selfAtDb.reason === 'self');

  // ── duplicate ─────────────────────────────────────────────────────────────
  const again = await referrals.applyReferral({ rawCode: code, refereeId: bob.body.id });
  check('the same referee cannot be counted twice', again.applied === false && again.reason === 'duplicate', JSON.stringify(again));

  const other = await referrals.applyReferral({ rawCode: namelessMe.body.code, refereeId: bob.body.id });
  check('a referee is never reassigned to another referrer', other.applied === false && other.reason === 'duplicate');
  check('referred_by still points at the first referrer', (await db.getUser(bob.body.id)).referred_by === aliceId);

  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check(
    'refusals changed no counts and paid no rewards',
    aliceMe.body?.invitedCount === 1 && aliceMe.body?.rewards?.earnedCount === 1,
    JSON.stringify(aliceMe.body)
  );

  // ── a log that bypassed the hook is still found (invite page reconciles) ──
  const carol = await signup({ referralCode: code });
  await db.createHydrationLog(carol.body.id, { date: new Date().toISOString().slice(0, 10), liters_consumed: 1 });
  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check(
    'an activation logged elsewhere (e.g. WhatsApp) is rewarded when the referrer looks',
    aliceMe.body?.rewards?.earnedCount === 2 && !!(await db.getUser(carol.body.id)).premium_until,
    JSON.stringify(aliceMe.body)
  );

  // ── reward cap (REFERRAL_MAX_REWARDED=2 in this suite) ────────────────────
  // Dave activates with a FOOD log (routes/food-logging.js), not water: the
  // activation hook must sit in front of that router too.
  const dave = await signup({ referralCode: code });
  const daveLog = await call('POST', '/api/food-logs', { token: dave.body.token, body: { name: 'Toast', calories: 150 } });
  check('a quick-add food log succeeds', daveLog.status === 201, `status ${daveLog.status}`);
  check(
    'a food log counts toward referral activation',
    await waitFor(async () => (await db.getReferralRewards(dave.body.id)).length === 1)
  );
  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check(
    'referrals past the cap are counted but not rewarded',
    aliceMe.body?.invitedCount === 3 && aliceMe.body?.rewards?.earnedCount === 2,
    JSON.stringify(aliceMe.body)
  );
  check(
    "the cap is the referrer's: the friend past it still gets their reward",
    !!(await db.getUser(dave.body.id)).premium_until
  );

  // ── the 7-day window ──────────────────────────────────────────────────────
  const namelessCode = namelessMe.body.code;
  const late = await signup({ referralCode: namelessCode });
  (await db.getUser(late.body.id)).created_at = new Date(Date.now() - 10 * 86400000).toISOString();
  await call('POST', '/api/hydration-logs', { token: late.body.token, body: { litersConsumed: 0.5 } });
  await new Promise((r) => setTimeout(r, 200));
  const lateCheck = await referrals.rewardOnActivation(late.body.id);
  check(
    'a first log after the 7-day window earns nothing',
    lateCheck.status === 'window_closed' && (await db.getReferralRewards(nameless.body.id)).length === 0 &&
      !(await db.getUser(late.body.id)).premium_until,
    JSON.stringify(lateCheck)
  );

  const idle = await signup({ referralCode: namelessCode });
  check(
    'no log yet → not activated, nothing paid',
    (await referrals.rewardOnActivation(idle.body.id)).status === 'not_activated' &&
      (await db.getReferralRewards(nameless.body.id)).length === 0
  );
  check('a user nobody invited is not referred', (await referrals.rewardOnActivation(noGrowth.body.id)).status === 'not_referred');

  // ── conversion reads subscriptions, nothing more ──────────────────────────
  await db.createSubscription(bob.body.id, 'base');
  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check('a subscribed referee counts as converted', aliceMe.body?.convertedCount === 1, JSON.stringify(aliceMe.body));

  // ── deletion ──────────────────────────────────────────────────────────────
  const alicePremiumBeforeDelete = (await db.getUser(aliceId)).premium_until;
  await db.deleteUser(bob.body.id);
  aliceMe = await call('GET', '/api/referrals/me', { token: alice.body.token });
  check('a deleted referee drops out of the counts', aliceMe.body?.invitedCount === 2 && aliceMe.body?.convertedCount === 0, JSON.stringify(aliceMe.body));
  check('rewards already earned are kept', aliceMe.body?.rewards?.earnedCount === 2);
  check('and the premium time they bought is kept', (await db.getUser(aliceId)).premium_until === alicePremiumBeforeDelete);

  // ── the public endpoint is rate limited ───────────────────────────────────
  let limited = false;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await call('GET', `/api/referrals/validate/GUESS${i}`);
    if (r.status === 429) limited = true;
  }
  check('validate is rate limited against code guessing', limited);
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

    console.log('\nreferrals & attribution\n');
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
