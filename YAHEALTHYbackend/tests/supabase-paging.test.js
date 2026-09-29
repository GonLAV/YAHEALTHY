/**
 * Whole-table reads on Supabase must page past the server's row cap.
 *
 * PostgREST answers at most "Max rows" (1000 on Supabase by default) per
 * request, whatever `.limit()` says. The lifecycle runner and the push
 * scheduler read every user / lead / preference row / send and every enabled
 * reminder setting in one call, so past 1000 rows they silently saw a prefix:
 *   - lifecycle_sends ordered oldest-first → the newest sends were invisible,
 *     so the daily cap and "already sent this step" checks stopped working
 *     (the unique key still blocked exact duplicates, but a user could get a
 *     second message the same day, and a step whose send was invisible was
 *     re-proposed, lost the claim and blocked the next step);
 *   - notification_preferences → users past row 1000 were treated as
 *     defaults (service email ON), so an unsubscribe could be ignored;
 *   - users / leads / reminder settings → everyone past row 1000 was skipped.
 * The memory store has no cap, so every other suite passed.
 *
 *   node tests/supabase-paging.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_KEY = 'fake-anon-key';
delete process.env.ALLOW_MEMORY_DB;

const fake = require('./helpers/fake-supabase').install({ maxRows: 1000 });
const db = require('../utils/database');

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

const N = 1500;
const iso = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
const id = (p, i) => `${p}-${String(i).padStart(5, '0')}`;

fake.tables.users = Array.from({ length: N }, (_, i) => ({ id: id('u', i), email: `u${i}@x.test`, name: `U${i}`, created_at: iso(i) }));
fake.tables.marketing_leads = Array.from({ length: N }, (_, i) => ({ id: id('l', i), email: `l${i}@x.test`, created_at: iso(i) }));
fake.tables.notification_preferences = Array.from({ length: N }, (_, i) => ({ user_id: id('u', i), email_lifecycle: false, unsubscribed_at: iso(i) }));
fake.tables.push_reminder_settings = Array.from({ length: N }, (_, i) => ({ user_id: id('u', i), enabled: true, settings: {}, state: {} }));
fake.tables.lifecycle_sends = Array.from({ length: N }, (_, i) => ({
  id: id('s', i), recipient_type: 'user', recipient_id: id('u', i), campaign: 'onboarding',
  step: 'day0', period_key: 'day0', status: 'sent', created_at: iso(i), sent_at: iso(i)
}));

// Food-log suggestions (routes/food-logging.js) rank 90 days of one user's
// logs; a heavy logger passes 1000 rows in that window.
fake.tables.food_logs = Array.from({ length: N }, (_, i) => ({
  id: id('f', i), user_id: 'u-heavy', date: '2026-09-01', name: `Food ${i}`, meal_type: 'lunch', calories: 100, created_at: iso(i)
}));

(async () => {
  console.log('\nsupabase whole-table reads page past the row cap\n');
  try {
    const users = await db.getAllUsers();
    check('getAllUsers returns every user', users.length === N, users.length);

    const leads = await db.listLeads();
    check('listLeads returns every lead', leads.length === N, leads.length);
    check('listLeads keeps its limit', (await db.listLeads({ limit: 10 })).length === 10);

    const prefs = await db.listNotificationPrefs();
    check('listNotificationPrefs returns every row', prefs.size === N, prefs.size);
    check('the last user\'s unsubscribe is visible', prefs.get(id('u', N - 1))?.email_lifecycle === false);

    const sends = await db.listLifecycleSends();
    check('listLifecycleSends returns every send', sends.length === N, sends.length);
    check('the newest send is visible (daily cap / dedupe input)', sends.some((s) => s.id === id('s', N - 1)));

    const foodLogs = await db.getFoodLogs('u-heavy', { start: '2026-07-01', end: '2026-09-29' });
    check('getFoodLogs (suggestion window) returns every row', foodLogs.length === N, foodLogs.length);
    check('the newest food log is visible to suggestions', foodLogs.some((r) => r.id === id('f', N - 1)));

    const reminders = await db.listEnabledPushReminderSettings();
    check('listEnabledPushReminderSettings returns every row', reminders.length === N, reminders.length);
  } catch (error) {
    failed++;
    console.error('suite crashed:', error && error.stack);
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
