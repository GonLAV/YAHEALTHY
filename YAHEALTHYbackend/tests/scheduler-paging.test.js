/**
 * The scheduler's bulk reads, on the Supabase branch, against a fake client
 * that caps every response at 1000 rows like PostgREST does.
 *
 * tests/scheduler-batching.test.js proves the runners read per page, on the
 * memory store (which has no cap). This proves those page reads — and the
 * per-user log getters — never silently stop at the cap: a page of 200 users
 * can easily hold more than 1000 water logs, and a heavy logger alone can.
 *
 *   node tests/scheduler-paging.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_KEY = 'fake-anon-key';
delete process.env.ALLOW_MEMORY_DB;

const fake = require('./helpers/fake-supabase').install({ maxRows: 1000 });
const db = require('../utils/database');
const runner = require('../utils/lifecycle-runner');

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  }
}

const pad = (p, i) => `${p}-${String(i).padStart(5, '0')}`;
const USERS = 450;
const users = Array.from({ length: USERS }, (_, i) => ({
  id: pad('u', i),
  email: `u${i}@x.test`,
  name: `U${i}`,
  created_at: '2026-01-01T08:00:00.000Z'
}));
const day = (n) => new Date(Date.UTC(2026, 8, 27) - n * 86400000).toISOString().slice(0, 10);

fake.tables.users = users;
// Every user: 6 water logs over the last 3 days → 2700 rows, 1200 per page of 200.
fake.tables.hydration_logs = users.flatMap((u, i) =>
  Array.from({ length: 6 }, (_, k) => ({
    id: pad(`h${i}`, k),
    user_id: u.id,
    date: day(k % 3),
    liters_consumed: 0.5,
    created_at: `${day(k % 3)}T0${k}:00:00.000Z`
  }))
);
// One heavy logger with 1500 rows of their own.
fake.tables.hydration_logs.push(
  ...Array.from({ length: 1500 }, (_, k) => ({
    id: pad('heavy', k),
    user_id: users[0].id,
    date: day(10 + Math.floor(k / 5)),
    liters_consumed: 0.25,
    created_at: `${day(10 + Math.floor(k / 5))}T10:${String(k % 60).padStart(2, '0')}:00.000Z`
  }))
);
fake.tables.food_logs = users.map((u, i) => ({ id: pad('f', i), user_id: u.id, date: day(0), calories: 100, meal_type: 'lunch', created_at: `${day(0)}T09:00:00.000Z` }));
fake.tables.lifecycle_sends = users.flatMap((u, i) =>
  Array.from({ length: 6 }, (_, k) => ({
    id: pad(`s${i}`, k), recipient_type: 'user', recipient_id: u.id, campaign: 'onboarding', step: `d${k}`,
    period_key: `d${k}`, status: 'sent', created_at: `2026-01-0${k + 1}T08:00:00.000Z`, sent_at: `2026-01-0${k + 1}T08:00:00.000Z`
  }))
);
fake.tables.notification_preferences = users.map((u) => ({ user_id: u.id, email_lifecycle: false }));
fake.tables.push_reminder_settings = users.map((u) => ({ user_id: u.id, enabled: true, tz: 'UTC', lang: 'he', settings: {}, state: {} }));

(async () => {
  console.log('\nscheduler bulk reads page past the Supabase row cap\n');
  try {
    // Keyset pages of users cover everyone exactly once.
    const seen = [];
    let afterId = null;
    for (;;) {
      const page = await db.listUsersPage({ afterId });
      if (!page.length) break;
      seen.push(...page.map((u) => u.id));
      afterId = page[page.length - 1].id;
      if (page.length < db.SCHEDULER_PAGE) break;
    }
    check('listUsersPage walks every user once', seen.length === USERS && new Set(seen).size === USERS, seen.length);

    const firstPage = users.slice(0, 200).map((u) => u.id);
    const logs = await db.listLogsForUsers(firstPage, { hydration: true });
    const total = Array.from(logs.hydration.values()).reduce((s, rows) => s + rows.length, 0);
    check('a page of 200 users gets all 2700 of its water logs (1200 + the heavy logger\'s 1500)', total === 1200 + 1500, total);
    check('the heavy logger\'s rows are all there, newest first',
      logs.hydration.get(users[0].id).length === 1506 &&
      logs.hydration.get(users[0].id)[0].created_at >= logs.hydration.get(users[0].id)[1505].created_at);

    const dated = await db.listLogsForUsers(firstPage, { hydration: { since: day(0), until: day(0) } });
    const todayRows = Array.from(dated.hydration.values()).reduce((s, rows) => s + rows.length, 0);
    check('a date-bounded bulk read keeps only that day', todayRows === 400, todayRows);

    const sends = await db.listLifecycleSendsFor('user', firstPage);
    check('listLifecycleSendsFor returns all 1200 sends of the page', sends.length === 1200, sends.length);

    const prefs = await db.listNotificationPrefsFor(users.map((u) => u.id));
    check('listNotificationPrefsFor returns every row', prefs.size === USERS, prefs.size);

    const single = await db.getHydrationLogs(users[0].id);
    check('getHydrationLogs pages past the cap for one heavy logger', single.length === 1506, single.length);

    const reminderIds = [];
    let after = null;
    for (;;) {
      const page = await db.listEnabledPushReminderSettingsPage({ afterUserId: after });
      if (!page.length) break;
      reminderIds.push(...page.map((r) => r.user_id));
      after = page[page.length - 1].user_id;
      if (page.length < db.SCHEDULER_PAGE) break;
    }
    check('listEnabledPushReminderSettingsPage walks every enabled row once', reminderIds.length === USERS && new Set(reminderIds).size === USERS);

    // The batched activity matches the per-user read on this backend too.
    const tzById = new Map(users.slice(0, 5).map((u) => [u.id, 'UTC']));
    const now = new Date('2026-09-27T12:00:00Z');
    const batched = await runner.loadActivityForUsers(tzById, now);
    let same = 0;
    for (const id of tzById.keys()) {
      if (JSON.stringify(batched.get(id)) === JSON.stringify(await runner.loadUserActivity(id, 'UTC', now))) same++;
    }
    check('batched activity equals the per-user read (Supabase branch)', same === 5, same);

    const run = await runner.runLifecycle({ dryRun: true, now });
    check('a dry lifecycle run evaluates all 450 users', run.evaluated.users === USERS, JSON.stringify(run.evaluated));
  } catch (error) {
    failed++;
    console.error('suite crashed:', error && error.stack);
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
