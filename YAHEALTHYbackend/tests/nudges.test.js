/**
 * Reminders: water, breakfast, today's menu, and a "well done" — opt-in,
 * sent only when still needed, never to someone with an open health flag,
 * never twice for the same slot, and switched off by replying "עצור".
 *
 * WHAPI and the bot brain are stubbed through require.cache; the database is
 * the memory store; time is fixed per check.
 *
 *   node tests/nudges.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'nudge-test-secret';
delete process.env.WHAPI_TOKEN;

const path = require('path');
const express = require('express');

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

// ── stubs ───────────────────────────────────────────────────────────────────
const sent = [];
function stub(relative, exports) {
  const file = require.resolve(path.join(__dirname, '..', relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stub('utils/whapi', {
  sendText: async (to, body) => { sent.push({ to, body }); },
  sendTyping: async () => {},
  downloadMediaAsBase64: async () => ({ base64: '', mimeType: 'image/jpeg' }),
  verifyWebhookSecret: () => true
});
stub('utils/whapi-brain', {
  generateReply: async () => 'reply',
  generateReplyWithTools: async () => 'reply',
  PROMPT_VERSIONS: { adi: 'adi:test', yoni: 'yoni:test' }
});
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);

const db = require('../utils/database');
const nudges = require('../utils/nudges');
const { zonedToUtc } = require('../utils/booking');

// 2026-09-29, a Tuesday, at a given Israel hour.
const at = (hour) => new Date(zonedToUtc(2026, 9, 29, hour * 60 + 5, 'Asia/Jerusalem'));
const DAY = '2026-09-29';

async function makeUser(email, { phone, nudgesOn = true, water = 2 } = {}) {
  const user = await db.createUser(email, 'x', email);
  if (phone) await db.setUserPhone(user.id, phone);
  await db.createSurvey(user.id, { water_target_liters: water });
  if (nudgesOn) await db.updateUserPreferences(user.id, { nudges: { enabled: true } });
  return db.getUser(user.id);
}

async function run() {
  // ── what the words say, and when they are held back ──────────────────────
  const base = { target: 2.4, liters: 0, food: [], planned: [] };
  check('water with nothing logged asks about water', /שתיתם מים/.test(nudges.compose('water', base, { share: 0.35 })));
  check('water shows progress when there is some', /0\.5 מתוך 2\.4/.test(nudges.compose('water', { ...base, liters: 0.5 }, { share: 0.6 })));
  check('water on track is not sent', nudges.compose('water', { ...base, liters: 1 }, { share: 0.35 }) === null);
  check('breakfast is asked while none is logged', /אכלתם ארוחת בוקר/.test(nudges.compose('breakfast', base)));
  check('and not once breakfast is logged', nudges.compose('breakfast', { ...base, food: [{ meal_type: 'breakfast' }] }) === null);
  const menu = nudges.compose('menu', { ...base, planned: [{ meal: 'breakfast', name: 'שקשוקה' }, { meal: 'dinner', name: 'סלמון' }] });
  check("the morning menu lists today's planned meals", /ארוחת בוקר: שקשוקה/.test(menu) && /ארוחת ערב: סלמון/.test(menu), menu);
  check('no plan, no menu reminder', nudges.compose('menu', base) === null);
  check('"well done" when the water target was met', /כל הכבוד! היום הגעתם ליעד המים/.test(nudges.compose('praise', { ...base, liters: 2.5 })));
  check('"well done" for three logged meals', /רשמתם היום 3 ארוחות/.test(nudges.compose('praise', { ...base, food: [{ meal_type: 'breakfast' }, { meal_type: 'lunch' }, { meal_type: 'dinner' }] })));
  check('no "well done" for a day with nothing in it', nudges.compose('praise', base) === null);

  // ── the job ───────────────────────────────────────────────────────────────
  const dana = await makeUser('dana@example.com', { phone: '050-1111111' });
  const quiet = await makeUser('quiet@example.com', { phone: '050-2222222', nudgesOn: false });
  const flagged = await makeUser('flagged@example.com', { phone: '050-3333333' });
  await db.saveWhatsappMessage({ id: 'esc1', chat_id: '972503333333@s.whatsapp.net', body: 'יש לי הפרעת אכילה', status: 'escalated' });

  let r = await nudges.runNudges({ now: at(10) });
  const feed = await db.listNudges(dana.id);
  check('at 10:00 an opted-in user is asked about breakfast', feed.some((n) => n.kind === 'breakfast'), JSON.stringify(r));
  check('someone who did not opt in gets nothing', (await db.listNudges(quiet.id)).length === 0);
  check('someone with an open health flag gets nothing', (await db.listNudges(flagged.id)).length === 0 && r.paused === 1, JSON.stringify(r));
  check('without WHAPI it goes to the in-app feed only', feed[0]?.channel === 'app' && sent.length === 0);

  r = await nudges.runNudges({ now: at(10) });
  check('running the same hour again sends nothing twice', r.sent === 0 && (await db.listNudges(dana.id)).length === 1, JSON.stringify(r));

  await db.createFoodLog(dana.id, { date: DAY, name: 'שקשוקה', calories: 350, meal_type: 'breakfast' });
  r = await nudges.runNudges({ now: at(15) });
  check('an hour with nothing scheduled sends nothing', r.due.length === 0 && r.sent === 0);

  process.env.WHAPI_TOKEN = 'test';
  r = await nudges.runNudges({ now: at(11) });
  check('at 11:00 a water reminder goes out on WhatsApp', sent.some((m) => m.to === '972501111111@s.whatsapp.net' && /מים/.test(m.body)), JSON.stringify(sent));

  await db.createHydrationLog(dana.id, { date: DAY, liters_consumed: 2.2 });
  sent.length = 0;
  r = await nudges.runNudges({ now: at(14) });
  check('water already on track at 14:00 is not sent', !sent.some((m) => /מים/.test(m.body) && !/כל הכבוד/.test(m.body)), JSON.stringify(sent));
  r = await nudges.runNudges({ now: at(20) });
  check('at 20:00 the target met earns a "well done"', sent.some((m) => /כל הכבוד/.test(m.body)), JSON.stringify(sent));

  await db.updateUserPreferences(dana.id, { nudges: { enabled: true, water: false } });
  const danaNow = await db.getUser(dana.id);
  check('each kind can be switched off on its own', nudges.settingsOf(danaNow).water === false && nudges.settingsOf(danaNow).breakfast === true);

  // ── the app: settings, feed, test ────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: req.get('x-user') }; next(); });
  app.use('/api/notifications', require('../routes/notifications'));
  const cronApp = require('../routes/cron');
  app.use('/api/cron', cronApp);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, route, userId, body) => {
    const res = await fetch(BASE + route, { method, headers: { 'Content-Type': 'application/json', 'x-user': userId || '' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const settings = await call('GET', '/api/notifications/settings', quiet.id);
  check('settings show reminders off by default', settings.body?.settings?.enabled === false && settings.body?.hasPhone === true);
  const saved = await call('PUT', '/api/notifications/settings', quiet.id, { enabled: true, breakfast: false });
  check('turning them on is saved, per kind', saved.body?.settings?.enabled === true && saved.body?.settings?.breakfast === false && saved.body?.settings?.water === true);
  check('the flagged user is told reminders are paused for health', (await call('GET', '/api/notifications/settings', flagged.id)).body?.pausedForHealth === true);

  const feedRes = await call('GET', '/api/notifications', dana.id);
  check('the bell shows unread reminders', feedRes.body?.unread > 0 && feedRes.body.items.length === feedRes.body.unread, JSON.stringify(feedRes.body));
  await call('POST', '/api/notifications/read', dana.id);
  check('and marking them read clears the count', (await call('GET', '/api/notifications', dana.id)).body.unread === 0);

  sent.length = 0;
  const test = await call('POST', '/api/notifications/test', dana.id, { kind: 'water' });
  check('"send me a test" sends one now', test.status === 200 && Boolean(test.body?.body) && sent.length === 1, JSON.stringify(test.body));
  check('but not twice in a row', (await call('POST', '/api/notifications/test', dana.id, { kind: 'water' })).status === 429);
  check('and never to someone paused for health', (await call('POST', '/api/notifications/test', flagged.id, {})).status === 409);

  check('the hourly job refuses without the secret', (await call('GET', '/api/cron/nudges')).status === 401);

  // Awaited, not fire-and-forget: exiting while the listener is still closing
  // trips a libuv assertion on Windows (UV_HANDLE_CLOSING) and fails the run.
  await new Promise((resolve) => server.close(resolve));

  // ── "עצור" on WhatsApp switches them off ─────────────────────────────────
  const { handleIncomingMessage } = require('../routes/whapi');
  sent.length = 0;
  await handleIncomingMessage({ id: 'stop1', type: 'text', chat_id: '972501111111@s.whatsapp.net', text: { body: 'עצור' } });
  check('replying "עצור" switches reminders off', (await db.getUser(dana.id)).preferences.nudges.enabled === false);
  check('and says so', sent.some((m) => /הפסקנו את התזכורות/.test(m.body)), JSON.stringify(sent));

  global.setTimeout = realSetTimeout;
}

run()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    // exitCode rather than process.exit(): let open sockets close on their own.
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('suite crashed:', error && error.stack);
    process.exit(1);
  });
