/**
 * The hourly lifecycle run and the five-minute push reminder tick must read
 * the database in pages, not once per user: with a few thousand users a
 * per-user read loop is thousands of round trips every five minutes.
 *
 * Every function on utils/database.js is wrapped with a counter (the runners
 * call it through the module object, so the wrapper sees every call), the
 * memory store is filled with N users, and one pass of each runner is made.
 * Reads must grow with the number of pages (users / page size), and doubling
 * the users must not double the reads. Writes are counted apart: a decided
 * reminder slot is one state write per user, which is the work itself.
 *
 *   node tests/scheduler-batching.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'batching-test-secret';
process.env.LIFECYCLE_TOKEN_SECRET = 'batching-test-lifecycle';
process.env.APP_URL = 'https://app.example.test';
process.env.VAPID_PUBLIC_KEY = 'BTestPublicKeyForTheSuite_abcdefghijklmnopqrstuvwxyz0123456789';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

// No request may leave the machine.
const pushed = [];
const webPushPath = require.resolve('web-push');
require.cache[webPushPath] = {
  id: webPushPath,
  filename: webPushPath,
  loaded: true,
  exports: {
    generateVAPIDKeys: () => ({ publicKey: 'p', privateKey: 'q' }),
    setVapidDetails: () => {},
    sendNotification: async (sub, body) => {
      pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
      return { statusCode: 201 };
    }
  }
};

const db = require('../utils/database');
const runner = require('../utils/lifecycle-runner');
const push = require('../utils/push');

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

// ── call counter ────────────────────────────────────────────────────────────
const WRITES = new Set(['updatePushReminderState', 'claimLifecycleSend', 'updateLifecycleSend', 'markLifecycleConverted', 'markPushSubscriptionResult']);
const calls = new Map();
for (const [name, fn] of Object.entries(db)) {
  if (typeof fn !== 'function') continue;
  db[name] = function counted(...args) {
    calls.set(name, (calls.get(name) || 0) + 1);
    return fn.apply(this, args);
  };
}
const resetCalls = () => calls.clear();
const count = (filter) => Array.from(calls.entries()).filter(([n]) => filter(n)).reduce((s, [, c]) => s + c, 0);
const reads = () => count((n) => !WRITES.has(n));
const breakdown = () => JSON.stringify(Object.fromEntries(calls));

// ── fixtures ────────────────────────────────────────────────────────────────
// Sunday 2026-09-27, 09:30 in Jerusalem (UTC+3): not Shabbat, not evening,
// inside the default water window.
const NOW = new Date('2026-09-27T06:30:00Z');
const TODAY = '2026-09-27';

let seq = 0;
async function addUsers(n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    seq++;
    const u = await db.createUser(`batch-${seq}@example.com`, 'x', `User ${seq}`);
    // An old account that logged today: nothing is due for the lifecycle
    // (no onboarding, no win-back, no streak risk), so the run is all reads.
    u.created_at = '2026-01-01T08:00:00Z';
    await db.createFoodLog(u.id, { date: TODAY, name: 'Toast', calories: 200, meal_type: 'breakfast' });
    await db.createFoodLog(u.id, { date: '2026-09-26', name: 'Soup', calories: 300, meal_type: 'dinner' });
    await db.createHydrationLog(u.id, { date: TODAY, liters_consumed: 3 });
    await db.createSleepLog(u.id, { date: TODAY, sleep_hours: 8 });
    if (seq % 3 === 0) await db.upsertNotificationPrefs(u.id, { timezone: 'Europe/London', lang: 'en' });
    // Variety for the equivalence checks: history beyond the 60-day window,
    // weigh-ins against a goal, a survey target, a stored preference.
    if (seq % 4 === 0) {
      await db.createFoodLog(u.id, { date: '2026-06-01', name: 'Old', calories: 500, meal_type: 'lunch' });
      await db.createHydrationLog(u.id, { date: '2026-05-01', liters_consumed: 1 });
      await db.createWeightGoal(u.id, { start_weight_kg: 90, target_weight_kg: 80 });
      await db.createWeightLog(u.id, { weight_kg: 88 });
      await db.createWeightLog(u.id, { weight_kg: 84.5 });
    }
    if (seq % 5 === 0) await db.createSurvey(u.id, { water_target_liters: 3, sleep_target_hours: 7 });
    if (seq % 7 === 0) await db.updateUserPreferences(u.id, { waterTargetLiters: 2.5 });
    // Reminders on, one device: the water slot is due by the clock, and the
    // day's 3 L means it is decided (skipped) — no push leaves.
    await db.savePushReminderSettings(u.id, { enabled: true, tz: 'Asia/Jerusalem', lang: 'he', settings: push.DEFAULT_REMINDER_SETTINGS });
    await db.savePushSubscription(u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/batch-${seq}`, p256dh: 'k', auth: 'a' });
    ids.push(u.id);
  }
  return ids;
}

async function measure(label) {
  const users = (await db.getAllUsers()).length;

  resetCalls();
  const life = await runner.runLifecycle({ now: NOW, dryRun: true });
  const lifeReads = reads();
  const lifeDetail = breakdown();

  resetCalls();
  pushed.length = 0;
  // Reset the slot bookkeeping so every user is due again.
  for (const row of await db.listEnabledPushReminderSettings()) await db.updatePushReminderState(row.user_id, {});
  resetCalls();
  const tick = await push.runReminderTick({ now: NOW });
  const tickReads = reads();
  const tickWrites = count((n) => n === 'updatePushReminderState');
  const tickDetail = breakdown();

  console.log(`\n  [${label}] users=${users}`);
  console.log(`    lifecycle: ${lifeReads} reads  ${lifeDetail}`);
  console.log(`    push tick: ${tickReads} reads, ${tickWrites} state writes  ${tickDetail}`);
  return { users, life, lifeReads, tick, tickReads, tickWrites };
}

(async () => {
  console.log('\nscheduler batching — database calls per pass\n');

  await addUsers(450);
  const a = await measure('450 users');
  check('lifecycle evaluates every user', a.life.evaluated.users === 450, JSON.stringify(a.life.evaluated));
  check('lifecycle plans nothing for active old accounts', a.life.planned.length === 0, JSON.stringify(a.life.skipped));
  check('push tick visits every user', a.tick.users === 450, JSON.stringify(a.tick));
  check('push tick skips every water reminder (goal met) and sends nothing', a.tick.sent === 0 && a.tick.skipped === 450 && pushed.length === 0, JSON.stringify(a.tick));
  check('each decided slot is written once', a.tickWrites === 450);

  await addUsers(450);
  const b = await measure('900 users');

  // A page costs a fixed handful of reads (the page itself, then one bulk
  // read per table); a per-user loop costs five or more per user.
  const PER_PAGE = 10;
  const pages = (n) => Math.ceil(n / db.SCHEDULER_PAGE) + 1; // +1: the empty lead page, or a final empty page
  for (const [label, r] of [['450', a], ['900', b]]) {
    check(`lifecycle reads are O(pages) at ${label} users: ${r.lifeReads} ≤ ${PER_PAGE * pages(r.users)}`,
      r.lifeReads <= PER_PAGE * pages(r.users) && r.lifeReads < r.users / 10);
    check(`push tick reads are O(pages) at ${label} users: ${r.tickReads} ≤ ${PER_PAGE * pages(r.users)}`,
      r.tickReads <= PER_PAGE * pages(r.users) && r.tickReads < r.users / 10);
  }
  check('push tick still visits and decides everyone at 900', b.tick.users === 900 && b.tick.skipped === 900 && b.tickWrites === 900, JSON.stringify(b.tick));

  // The streak reminder reads the whole history — still per page.
  for (const row of await db.listEnabledPushReminderSettings()) await db.updatePushReminderState(row.user_id, {});
  resetCalls();
  const evening = await push.runReminderTick({ now: new Date('2026-09-27T17:10:00Z') }); // 20:10 Jerusalem
  const eveningReads = reads();
  console.log(`    evening tick: ${eveningReads} reads  ${breakdown()}`);
  check(`the evening (streak) tick is O(pages) too: ${eveningReads}`, eveningReads <= PER_PAGE * pages(b.users));
  check('…and finds every streak safe (all logged today)', evening.skipped === 900 && evening.sent === 0, JSON.stringify(evening));

  // The batched read gives every user exactly what the per-user read gave.
  const users = await db.getAllUsers();
  const tzById = new Map(users.map((u, i) => [u.id, i % 3 === 0 ? 'Europe/London' : 'Asia/Jerusalem']));
  const batched = await runner.loadActivityForUsers(tzById, NOW);
  let same = 0;
  for (const u of users) {
    const single = await runner.loadUserActivity(u.id, tzById.get(u.id), NOW);
    if (JSON.stringify(single) === JSON.stringify(batched.get(u.id))) same++;
  }
  check(`batched activity equals the per-user read for all ${users.length} users`, same === users.length, `${same} equal`);

  // Half take the streak path (whole history), half the today-only path.
  const sample = users.slice(0, 60);
  const kindsFor = (i) => (i % 2 ? ['water', 'meal'] : ['water', 'meal', 'streak']);
  const facts = await push.loadReminderFactsForUsers(
    sample.map((u, i) => ({ userId: u.id, tz: tzById.get(u.id), kinds: kindsFor(i) })),
    NOW
  );
  let sameFacts = 0;
  for (const [i, u] of sample.entries()) {
    const single = await push.loadReminderFacts(u.id, { tz: tzById.get(u.id), now: NOW, kinds: kindsFor(i) });
    if (JSON.stringify(single) === JSON.stringify(facts.get(u.id))) sameFacts++;
  }
  check('batched reminder facts equal the per-user read (streak and today-only paths)', sameFacts === sample.length, `${sameFacts} equal`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('\nsuite crashed:', error && error.stack);
  process.exit(1);
});
