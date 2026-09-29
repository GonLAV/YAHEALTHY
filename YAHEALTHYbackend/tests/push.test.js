/**
 * Web Push — subscriptions, dead-subscription cleanup, and reminder decisions.
 *
 * web-push is replaced with an in-process fake before anything loads it, so no
 * request leaves the machine and each endpoint can be told how to fail. The
 * rules asserted here all fail silently in production: a reminder at 06:00, a
 * reminder during quiet hours, a subscription that answers 410 forever, or one
 * user's browser still receiving another user's reminders.
 *
 *   node tests/push.test.js
 */

// Before anything reads process.env at load time.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'push-test-secret';
process.env.VERCEL = '1'; // index.js exports the app instead of binding a port
process.env.VAPID_PUBLIC_KEY = 'BTestPublicKeyForTheSuite_abcdefghijklmnopqrstuvwxyz0123456789';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

// ── the fake web-push ────────────────────────────────────────────────────────
const sent = [];
const fakeWebPush = {
  generateVAPIDKeys: () => ({ publicKey: 'generated-public', privateKey: 'generated-private' }),
  setVapidDetails: () => {},
  sendNotification: async (subscription, body, options) => {
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(body), options });
    const fail = (statusCode) => {
      const error = new Error(`fake push error ${statusCode}`);
      error.statusCode = statusCode;
      throw error;
    };
    if (subscription.endpoint.includes('gone')) fail(410);
    if (subscription.endpoint.includes('missing')) fail(404);
    if (subscription.endpoint.includes('flaky')) fail(500);
    return { statusCode: 201 };
  }
};
const webPushPath = require.resolve('web-push');
require.cache[webPushPath] = { id: webPushPath, filename: webPushPath, loaded: true, exports: fakeWebPush };

const db = require('../utils/database');
const push = require('../utils/push');

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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}

let seq = 0;
async function signup() {
  seq++;
  const res = await call('POST', '/api/auth/signup', {
    body: { email: `push-test-${Date.now()}-${seq}@example.com`, password: 'correct horse battery' }
  });
  return { token: res.body?.token, id: res.body?.id };
}

const endpoint = (name) => `https://fcm.googleapis.com/fcm/send/${name}`;
const subscription = (name) => ({
  endpoint: endpoint(name),
  expirationTime: null,
  keys: { p256dh: 'BPublicKeyOfTheBrowser_0123456789abcdef', auth: 'authSecret_0123' }
});

// ── pure decisions ───────────────────────────────────────────────────────────
function runDecisions() {
  console.log('\npush — reminder decisions (time zone, quiet hours)\n');
  const S = push.DEFAULT_REMINDER_SETTINGS;
  const JLM = 'Asia/Jerusalem'; // UTC+3 in late September (IDT)

  // Clock
  const c = push.localClock(new Date('2026-09-27T06:30:00Z'), JLM);
  check('local clock follows the zone (06:30Z is 09:30 in Jerusalem)', c.date === '2026-09-27' && c.minutes === 9 * 60 + 30, JSON.stringify(c));
  const late = push.localClock(new Date('2026-09-27T22:30:00Z'), JLM);
  check('after local midnight the date rolls over', late.date === '2026-09-28' && late.minutes === 90, JSON.stringify(late));
  check('an invalid zone falls back to UTC', push.localClock(new Date('2026-09-27T06:30:00Z'), 'Mars/Base').minutes === 6 * 60 + 30);

  // Quiet hours
  const q = { start: '22:00', end: '08:00' };
  check('quiet hours wrap midnight: 23:30 is quiet', push.inQuietHours(23 * 60 + 30, q));
  check('quiet hours wrap midnight: 07:59 is quiet', push.inQuietHours(7 * 60 + 59, q));
  check('quiet hours end is exclusive: 08:00 is not quiet', !push.inQuietHours(8 * 60, q));
  check('a daytime quiet window works too', push.inQuietHours(13 * 60 + 10, { start: '13:00', end: '14:00' }));
  check('start === end means no quiet hours', !push.inQuietHours(3 * 60, { start: '00:00', end: '00:00' }));

  // Water
  const at = (iso, tz = JLM, state = {}, settings = S) => push.timeDueReminders({ settings, state, now: new Date(iso), tz });
  const kinds = (r) => r.due.map((d) => d.kind).sort().join(',');

  const w1 = at('2026-09-27T06:30:00Z');
  check('09:30 in Jerusalem: water is due, first slot of the day', kinds(w1) === 'water' && w1.due[0].slot === '2026-09-27#0', JSON.stringify(w1));
  const utcSame = at('2026-09-27T06:30:00Z', 'UTC');
  check('the same instant in UTC is 06:30 — inside quiet hours, nothing goes out', utcSame.quiet && utcSame.due.length === 0);
  check('a slot already handled is not sent again', at('2026-09-27T06:55:00Z', JLM, { waterSlot: '2026-09-27#0' }).due.length === 0);
  const w2 = at('2026-09-27T08:05:00Z', JLM, { waterSlot: '2026-09-27#0' });
  check('two hours on, the next slot is due', kinds(w2) === 'water' && w2.due[0].slot === '2026-09-27#1', JSON.stringify(w2));
  check('yesterday\'s last slot does not suppress today\'s first', kinds(at('2026-09-27T06:10:00Z', JLM, { waterSlot: '2026-09-26#5' })) === 'water');
  check('outside the active hours (20:30) no water reminder', !at('2026-09-27T17:30:00Z').due.some((d) => d.kind === 'water'));
  const every90 = { ...S, water: { ...S.water, intervalMinutes: 90 } };
  check('interval is honoured (90 min: 10:35 is slot #1)', at('2026-09-27T07:35:00Z', JLM, {}, every90).due[0].slot === '2026-09-27#1');
  const noWater = { ...S, water: { ...S.water, enabled: false } };
  check('water off → never due', !at('2026-09-27T06:30:00Z', JLM, {}, noWater).due.length);

  // Meal
  check('meal reminder not before its time (12:55)', !at('2026-09-27T09:55:00Z').due.some((d) => d.kind === 'meal'));
  check('meal reminder due at 13:05', at('2026-09-27T10:05:00Z').due.some((d) => d.kind === 'meal'));
  check('meal reminder skipped once its 3h window has passed (16:05)', !at('2026-09-27T13:05:00Z').due.some((d) => d.kind === 'meal'));
  check('meal reminder once per day', !at('2026-09-27T10:05:00Z', JLM, { mealDate: '2026-09-27' }).due.some((d) => d.kind === 'meal'));
  const quietLunch = { ...S, quietHours: { start: '13:00', end: '14:00' } };
  check('quiet hours override a due reminder', at('2026-09-27T10:05:00Z', JLM, {}, quietLunch).due.length === 0);

  // Streak (20:00 local)
  const eve = at('2026-09-27T17:10:00Z');
  check('20:10 in Jerusalem: the streak check is due', eve.due.some((d) => d.kind === 'streak' && d.slot === '2026-09-27'));
  check('20:10 UTC is 23:10 in Jerusalem — quiet, not due', at('2026-09-27T20:10:00Z').due.length === 0);
  const la = at('2026-09-28T03:10:00Z', 'America/Los_Angeles');
  check('west of UTC the evening belongs to the local date (LA, 27th)', la.due.some((d) => d.kind === 'streak' && d.slot === '2026-09-27'), JSON.stringify(la));

  // Facts
  const due = [{ kind: 'water', slot: 'x#0' }, { kind: 'meal', slot: 'x' }, { kind: 'streak', slot: 'x' }];
  const quietDay = push.applyFacts(due, { waterGoalMet: true, foodLoggedToday: true, streakAtRisk: false });
  check('water goal met, food logged, streak safe → nothing sent', quietDay.send.length === 0 && quietDay.skipped.length === 3);
  check('skips say why', quietDay.skipped.map((s) => s.reason).join(',') === 'water-goal-met,food-logged,streak-safe');
  const busyDay = push.applyFacts(due, { waterGoalMet: false, foodLoggedToday: false, streakAtRisk: true });
  check('the opposite day sends all three', busyDay.send.length === 3);
  const whole = push.decideReminders({ settings: S, state: {}, now: new Date('2026-09-27T17:10:00Z'), tz: JLM, facts: { streakAtRisk: true } });
  check('decideReminders combines clock and facts', whole.send.map((s) => s.kind).includes('streak'));

  const st = push.nextState({ waterSlot: 'old' }, [{ kind: 'water', slot: 'd#2' }, { kind: 'meal', slot: 'd' }]);
  check('decided slots are recorded', st.waterSlot === 'd#2' && st.mealDate === 'd');

  // Copy and payload safety
  const he = push.buildReminderPayload('water', 'he', { waterLiters: 1, waterTarget: 2.5 });
  const en = push.buildReminderPayload('water', 'en', { waterLiters: 1, waterTarget: 2.5 });
  check('water reminder opens /hydration', he.url === '/hydration' && en.url === '/hydration');
  check('reminders are bilingual', /[֐-׿]/.test(he.title) && /water/i.test(en.title) && he.lang === 'he' && en.lang === 'en');
  check('streak copy carries the count', /5/.test(push.buildReminderPayload('streak', 'en', { streakCurrent: 5 }).body));
  check('meal reminder opens /food-log', push.buildReminderPayload('meal', 'en').url === '/food-log');
  check('Hebrew payload is RTL', push.normalizePayload(he).dir === 'rtl' && push.normalizePayload(en).dir === 'ltr');
  check('an off-site click URL is replaced', push.normalizePayload({ url: 'https://evil.example/' }).url === '/dashboard');
  check('a protocol-relative URL is replaced', push.normalizePayload({ url: '//evil.example/x' }).url === '/dashboard');

  // Endpoint allowlist
  check('FCM endpoints are accepted', push.isAllowedEndpoint(endpoint('abc')));
  check('Mozilla, Apple and WNS endpoints are accepted',
    push.isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x') &&
    push.isAllowedEndpoint('https://web.push.apple.com/QAbc') &&
    push.isAllowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'));
  check('plain http is refused', !push.isAllowedEndpoint('http://fcm.googleapis.com/fcm/send/x'));
  check('internal addresses are refused', !push.isAllowedEndpoint('https://169.254.169.254/latest') && !push.isAllowedEndpoint('https://localhost:5000/api'));
  check('look-alike hosts are refused', !push.isAllowedEndpoint('https://fcm.googleapis.com.attacker.example/x'));
}

// ── the API and delivery ─────────────────────────────────────────────────────
async function runApi() {
  console.log('\npush — API and delivery\n');

  const key = await call('GET', '/api/push/vapid-public-key');
  check('the VAPID public key is public', key.status === 200 && key.body?.publicKey === process.env.VAPID_PUBLIC_KEY, JSON.stringify(key.body));
  check('the private key is never returned', !JSON.stringify(key.body).includes('test-private-key'));

  const alice = await signup();
  const bob = await signup();
  check('two accounts exist', !!alice.token && !!bob.token);

  // subscribe
  check('subscribe needs a login', (await call('POST', '/api/push/subscribe', { body: { subscription: subscription('a1') } })).status === 401);
  check('unsubscribe needs a login', (await call('DELETE', '/api/push/subscribe', { body: { endpoint: endpoint('a1') } })).status === 401);
  check('reminder settings need a login', (await call('GET', '/api/push/reminders')).status === 401);

  const bad = await call('POST', '/api/push/subscribe', {
    token: alice.token,
    body: { subscription: { ...subscription('x'), endpoint: 'https://10.0.0.5/push' } }
  });
  check('an endpoint outside the push services is refused', bad.status === 400, JSON.stringify(bad.body));
  const noKeys = await call('POST', '/api/push/subscribe', { token: alice.token, body: { subscription: { endpoint: endpoint('x') } } });
  check('a subscription without keys is refused', noKeys.status === 400);

  const s1 = await call('POST', '/api/push/subscribe', { token: alice.token, body: { subscription: subscription('a1'), tz: 'Asia/Jerusalem', lang: 'he' } });
  check('subscribe → 201', s1.status === 201 && s1.body?.devices === 1, JSON.stringify(s1.body));
  const again = await call('POST', '/api/push/subscribe', { token: alice.token, body: { subscription: subscription('a1') } });
  check('subscribing the same browser twice keeps one row', again.body?.devices === 1);
  await call('POST', '/api/push/subscribe', { token: alice.token, body: { subscription: subscription('a2') } });
  check('a second device is a second row', (await db.getPushSubscriptions(alice.id)).length === 2);

  // A browser that signs into another account moves with it.
  await call('POST', '/api/push/subscribe', { token: bob.token, body: { subscription: subscription('a2') } });
  const aliceSubs = await db.getPushSubscriptions(alice.id);
  const bobSubs = await db.getPushSubscriptions(bob.id);
  check('a browser switching accounts stops getting the old account\'s pushes',
    aliceSubs.length === 1 && bobSubs.length === 1 && bobSubs[0].endpoint === endpoint('a2'));

  // unsubscribe
  const foreign = await call('DELETE', '/api/push/subscribe', { token: alice.token, body: { endpoint: endpoint('a2') } });
  check('nobody can remove another user\'s subscription', foreign.status === 200 && foreign.body?.removed === false && (await db.getPushSubscriptions(bob.id)).length === 1);
  const own = await call('DELETE', '/api/push/subscribe', { token: bob.token, body: { endpoint: endpoint('a2') } });
  check('unsubscribe removes the row', own.body?.removed === true && (await db.getPushSubscriptions(bob.id)).length === 0);

  // test push + delivery bookkeeping
  const none = await call('POST', '/api/push/test', { token: bob.token });
  check('a test push with no devices is a 409', none.status === 409, JSON.stringify(none.body));
  sent.length = 0;
  const t = await call('POST', '/api/push/test', { token: alice.token, body: { lang: 'en' } });
  check('a test push reaches the device', t.status === 200 && t.body?.sent === 1 && sent.length === 1, JSON.stringify(t.body));
  check('the pushed payload is the documented shape',
    sent[0]?.payload?.title && sent[0]?.payload?.url === '/settings#reminders' && sent[0]?.payload?.lang === 'en' && sent[0]?.payload?.icon,
    JSON.stringify(sent[0]?.payload));
  check('VAPID details are passed per send', sent[0]?.options?.vapidDetails?.publicKey === process.env.VAPID_PUBLIC_KEY && sent[0]?.options?.TTL > 0);

  // dead-subscription cleanup
  for (const name of ['gone', 'missing', 'flaky']) {
    await call('POST', '/api/push/subscribe', { token: alice.token, body: { subscription: subscription(`${name}-1`) } });
  }
  check('four devices before the send', (await db.getPushSubscriptions(alice.id)).length === 4);
  const result = await push.sendPush(alice.id, { title: 'x', body: 'y', url: '/dashboard' });
  const left = (await db.getPushSubscriptions(alice.id)).map((s) => s.endpoint);
  check('410 and 404 subscriptions are deleted', result.removed === 2 && !left.includes(endpoint('gone-1')) && !left.includes(endpoint('missing-1')), JSON.stringify(result));
  check('a temporary 5xx keeps the subscription but counts the failure',
    left.includes(endpoint('flaky-1')) && (await db.getPushSubscriptions(alice.id)).find((s) => s.endpoint === endpoint('flaky-1')).failure_count === 1);
  check('the healthy device still got it', result.sent === 1 && result.failed === 1);
  await db.deletePushSubscription(alice.id, endpoint('flaky-1'));

  // reminder settings
  const defaults = await call('GET', '/api/push/reminders', { token: alice.token });
  check('reminders are off until the user turns them on', defaults.status === 200 && defaults.body?.enabled === false && defaults.body?.water?.intervalMinutes === 120 && defaults.body?.devices === 1, JSON.stringify(defaults.body));
  const backwards = await call('PUT', '/api/push/reminders', { token: alice.token, body: { enabled: true, water: { enabled: true, intervalMinutes: 60, start: '20:00', end: '09:00' } } });
  check('water active hours must run forwards', backwards.status === 400);
  check('unknown fields are refused', (await call('PUT', '/api/push/reminders', { token: alice.token, body: { enabled: true, sms: true } })).status === 400);
  check('bad times are refused', (await call('PUT', '/api/push/reminders', { token: alice.token, body: { enabled: true, meal: { enabled: true, time: '25:00' } } })).status === 400);
  check('a bad time zone is refused', (await call('PUT', '/api/push/reminders', { token: alice.token, body: { enabled: true, tz: 'Mars/Base' } })).status === 400);
  const saved = await call('PUT', '/api/push/reminders', {
    token: alice.token,
    body: { enabled: true, tz: 'Asia/Jerusalem', lang: 'en', water: { enabled: true, intervalMinutes: 120, start: '09:00', end: '20:00' }, quietHours: { start: '22:00', end: '08:00' } }
  });
  check('settings save', saved.status === 200 && saved.body?.enabled === true && saved.body?.tz === 'Asia/Jerusalem' && saved.body?.lang === 'en', JSON.stringify(saved.body));
  check('unsent sections keep their defaults', saved.body?.meal?.time === '13:00' && saved.body?.streak?.time === '20:00');
  const reread = await call('GET', '/api/push/reminders', { token: alice.token });
  check('settings persist', reread.body?.enabled === true && reread.body?.lang === 'en');

  return { alice, bob };
}

// ── the scheduler, end to end on the memory store ────────────────────────────
async function runTick({ alice, bob }) {
  console.log('\npush — scheduler tick\n');
  check('the cron job is not armed under NODE_ENV=test', push.scheduleReminders({ schedule: () => { throw new Error('armed'); } }) === null);

  // Bob has reminders on but no device: nothing sent, slots left open.
  await db.savePushReminderSettings(bob.id, { enabled: true, tz: 'Asia/Jerusalem', lang: 'he', settings: push.DEFAULT_REMINDER_SETTINGS });

  const tagged = (tag) => sent.filter((s) => s.payload.tag === `yahealthy-${tag}`);

  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T06:30:00Z') }); // 09:30 Jerusalem
  check('09:30 local: one water reminder, opening /hydration', tagged('water').length === 1 && tagged('water')[0].payload.url === '/hydration', JSON.stringify(sent.map((s) => s.payload.tag)));
  check('in the user\'s chosen language', tagged('water')[0]?.payload.lang === 'en');
  check('a user without a device is skipped and keeps open slots', !((await db.getPushReminderSettings(bob.id)).state || {}).waterSlot);

  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T06:35:00Z') });
  check('the next tick in the same slot sends nothing', sent.length === 0);

  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T04:00:00Z') }); // 07:00 local, quiet
  check('nothing during quiet hours', sent.length === 0);

  // Water goal met → the 11:00 slot is skipped.
  await db.createHydrationLog(alice.id, { date: '2026-09-27', liters_consumed: 3 });
  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T08:05:00Z') }); // 11:05 local
  check('water goal met → no water reminder', tagged('water').length === 0);
  check('…and the slot is recorded as decided', (await db.getPushReminderSettings(alice.id)).state.waterSlot === '2026-09-27#1');

  // Meal: nothing logged by 13:00.
  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T10:10:00Z') }); // 13:10 local
  check('13:10 with no meal logged → meal reminder to /food-log', tagged('meal').length === 1 && tagged('meal')[0].payload.url === '/food-log');
  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T10:20:00Z') });
  check('the meal reminder goes out once', tagged('meal').length === 0);

  // Streak: yesterday logged, today (so far) only water — which counts as a log.
  await db.createFoodLog(alice.id, { date: '2026-09-26', name: 'Salad', calories: 300, meal_type: 'lunch' });
  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-27T17:10:00Z') }); // 20:10 local
  check('a streak already extended today is not "at risk"', tagged('streak').length === 0);

  // Next day: logged the 26th and 27th, nothing yet on the 28th → at risk.
  sent.length = 0;
  await push.runReminderTick({ now: new Date('2026-09-28T17:10:00Z') });
  const streak = tagged('streak');
  check('next evening with nothing logged → streak-at-risk reminder', streak.length === 1, JSON.stringify(sent.map((s) => s.payload)));
  check('the streak reminder names the run', /2 days/.test(streak[0]?.payload.body || ''), streak[0]?.payload.body);

  // Account deletion takes the push rows with it (memory cascade on user_id).
  await db.deleteUser(alice.id);
  check('deleting the account removes its subscriptions and settings',
    (await db.getPushSubscriptions(alice.id)).length === 0 && !(await db.getPushReminderSettings(alice.id)));
}

(async () => {
  let code = 1;
  let server;
  try {
    runDecisions();
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;
    const users = await runApi();
    await runTick(users);
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
