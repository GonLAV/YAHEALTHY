/**
 * The real app on the in-memory store, seeded with a small, fully known
 * marketing history for tests/analytics.test.js, plus the same test-only
 * "grant staff" route tests/helpers/staff-server.js has (production grants
 * staff by hand in SQL; there is deliberately no endpoint for it).
 *
 * Seeded relative to today (T), all inside the range T-29 … T-1:
 *
 *   A  T-20  utm instagram/social/launch  logs T-20, T-18, T-15   paying
 *   B  T-20  utm instagram/social/launch  log  T-10 (too late)
 *   C  T-20  utm google/cpc/brand         log  T-19
 *   D  T-20  no attribution               —
 *   E  T-20  referred by R                logs T-20, T-19, T-18   paying
 *   F  T-2   referred by R                —  (window still open)
 *   R  T-40  the referrer, outside the range
 *
 *   leads: A's address (instagram, T-5), a stranger (google, T-3),
 *          one with no source (T-1), and one at T-40 (outside the range).
 */

const express = require('express');
const db = require('../../utils/database');
const auth = require('../../utils/auth');

const PORT = Number(process.env.PORT);
const DAY_MS = 86400000;

const dayAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const at = (n) => `${dayAgo(n)}T10:00:00.000Z`;

async function user(email, name, daysAgo, attribution) {
  const created = await db.createUser(email, 'not-a-real-hash', name);
  if (attribution) await db.setUserAttribution(created.id, attribution);
  const stored = await db.getUser(created.id);
  stored.created_at = at(daysAgo); // memory mode hands back the stored object
  return stored;
}

async function food(userId, daysAgo) {
  await db.createFoodLog(userId, { date: dayAgo(daysAgo), name: 'test', calories: 100 });
}

async function refer(referrer, referee, daysAgo) {
  const { referral } = await db.createReferral({ referrerId: referrer.id, refereeId: referee.id, code: 'TESTCODE' });
  referral.created_at = at(daysAgo);
  await db.createReferralReward({
    userId: referrer.id,
    referralId: referral.id,
    type: 'premium_days',
    amount: 30,
    reason: 'referee_signup'
  });
}

async function lead(email, daysAgo, extra = {}) {
  const { lead: row } = await db.createLead({ email, consent_at: at(daysAgo), lang: 'he', ...extra });
  row.created_at = at(daysAgo);
}

async function seed() {
  const insta = { utm_source: 'Instagram', utm_medium: 'social', utm_campaign: 'launch' };
  const R = await user('dana.cohen@example.com', 'Dana Cohen', 40);
  const A = await user('alpha@example.com', null, 20, insta);
  const B = await user('bravo@example.com', null, 20, { ...insta, utm_source: 'instagram ' });
  const C = await user('charlie@example.com', null, 20, { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' });
  await user('delta@example.com', null, 20);
  const E = await user('echo@example.com', null, 20);
  const F = await user('foxtrot@example.com', null, 2);

  await refer(R, E, 20);
  await refer(R, F, 2);

  for (const d of [20, 18, 15]) await food(A.id, d);
  await food(B.id, 10);
  await db.createHydrationLog(C.id, { date: dayAgo(19), liters_consumed: 1 });
  for (const d of [20, 19, 18]) await food(E.id, d);

  await db.createSubscription(A.id, 'base');
  await db.createSubscription(E.id, 'base');

  await lead('alpha@example.com', 5, { utm_source: 'instagram' });
  await lead('stranger@example.com', 3, { utm_source: 'google' });
  await lead('nosource@example.com', 1);
  await lead('old@example.com', 40, { utm_source: 'instagram' });
}

async function main() {
  await seed();

  process.env.VERCEL = '1';
  const realApp = require('../../index.js');

  const wrapper = express();
  wrapper.use(express.json());
  wrapper.post('/api/test-only/grant-staff', auth.authMiddleware, async (req, res) => {
    const u = await db.getUser(req.user.userId);
    if (!u) return res.status(404).json({ error: 'no user' });
    u.is_staff = true;
    return res.json({ ok: true });
  });
  wrapper.use(realApp);
  wrapper.listen(PORT, () => console.log(`analytics test server on ${PORT}`));
}

main().catch((error) => {
  console.error('analytics test server failed to start:', error);
  process.exit(1);
});
