/**
 * Web Push delivery and the reminder scheduler.
 *
 * Two halves:
 *
 *   sendPush(userId, payload)  — deliver one notification to every browser the
 *     user subscribed. Dead subscriptions (the push service answers 404/410)
 *     are deleted on the spot. This is the whole public delivery API: any
 *     other messaging layer (e.g. the email/WhatsApp lifecycle work in
 *     utils/lifecycle*.js) can call it to add a push channel without knowing
 *     about VAPID, subscriptions or cleanup.
 *
 *   Reminders — water (every N minutes inside active hours), a meal-log nudge
 *     when nothing was logged by a chosen time, and an evening "your streak is
 *     at risk" nudge. The decision is split into pure functions
 *     (timeDueReminders → applyFacts) so the time-zone and quiet-hours rules
 *     are testable without a clock or a database; runReminderTick() is the thin
 *     I/O loop that node-cron calls every five minutes.
 *
 * VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 * Outside production, missing keys are replaced by a throwaway pair for this
 * process (like JWT_SECRET) — browsers subscribed against it stop receiving
 * pushes on restart and the frontend resubscribes. In production, missing keys
 * switch push off (the endpoints answer 503) rather than stopping the server:
 * reminders are optional, logins are not.
 */

const webpush = require('web-push');
const db = require('./database');
const {
  localDate,
  addDays,
  isValidTimeZone,
  buildDays,
  computeStreak,
  resolveGoals
} = require('./engagement');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── VAPID ───────────────────────────────────────────────────────────────────

let vapidCache; // undefined: not resolved yet · null: push disabled · object: keys

function resolveSubject() {
  const configured = (process.env.VAPID_SUBJECT || '').trim();
  if (/^(mailto:|https:\/\/)/.test(configured)) return configured;
  if (configured) console.warn(`[push] VAPID_SUBJECT must start with mailto: or https:// — ignoring "${configured}".`);
  const appUrl = (process.env.APP_URL || '').trim();
  if (appUrl.startsWith('https://')) return appUrl;
  if (IS_PRODUCTION) console.warn('[push] VAPID_SUBJECT is not set. Some push services (Apple) reject pushes without a real contact.');
  return 'mailto:push@yahealthy.invalid';
}

/** The VAPID details in use, or null when push is switched off. */
function getVapid() {
  if (vapidCache !== undefined) return vapidCache;

  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = resolveSubject();

  if (publicKey && privateKey) {
    vapidCache = { publicKey, privateKey, subject, ephemeral: false };
    return vapidCache;
  }

  if (IS_PRODUCTION) {
    console.error(
      '[push] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set. Web Push is DISABLED: ' +
      '/api/push/* answers 503 and no reminders are sent. Generate a pair once with ' +
      '`npx web-push generate-vapid-keys` and set both.'
    );
    vapidCache = null;
    return vapidCache;
  }

  const generated = webpush.generateVAPIDKeys();
  console.warn(
    '\n[push] ⚠️  VAPID keys are not set. Generated a throwaway pair for this process only — ' +
    'every browser subscription is invalidated on restart. Set VAPID_PUBLIC_KEY, ' +
    'VAPID_PRIVATE_KEY and VAPID_SUBJECT for stable push.\n'
  );
  vapidCache = { publicKey: generated.publicKey, privateKey: generated.privateKey, subject, ephemeral: true };
  return vapidCache;
}

function isPushEnabled() {
  return getVapid() !== null;
}

// ─── subscriptions ───────────────────────────────────────────────────────────

/**
 * Hosts browsers actually hand out as push endpoints. Anything else is
 * refused at subscribe time: the server POSTs to whatever endpoint it is
 * given, so an open list would let a user point it at internal addresses.
 * PUSH_ALLOWED_HOSTS (comma separated) adds more, e.g. for a self-hosted
 * push service.
 */
const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com'
];

function allowedPushHosts() {
  const extra = (process.env.PUSH_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_PUSH_HOSTS, ...extra];
}

function isAllowedEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowedPushHosts().some((h) => host === h || host.endsWith(`.${h}`));
}

// ─── delivery ────────────────────────────────────────────────────────────────

/** Consecutive non-404/410 failures after which a subscription is dropped anyway. */
const MAX_FAILURES = 10;
const DEFAULT_TTL_SECONDS = 4 * 60 * 60;

/** Only same-origin paths may be opened from a notification. */
function safeUrl(url) {
  return typeof url === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(url) ? url : '/dashboard';
}

function normalizePayload(payload = {}) {
  const lang = payload.lang === 'en' ? 'en' : 'he';
  const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
  return {
    title: clip(payload.title, 120) || 'YAHealthy',
    body: clip(payload.body, 300),
    url: safeUrl(payload.url),
    tag: clip(payload.tag, 64) || undefined,
    lang,
    dir: lang === 'he' ? 'rtl' : 'ltr',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png'
  };
}

/**
 * Deliver `payload` ({ title, body, url, tag, lang }) to every browser `userId`
 * subscribed. Never throws for a delivery failure; returns counts instead.
 *
 * @returns {Promise<{ sent: number, removed: number, failed: number, disabled?: true }>}
 */
async function sendPush(userId, payload, { ttl = DEFAULT_TTL_SECONDS, urgency = 'normal' } = {}) {
  const vapid = getVapid();
  if (!vapid) return { sent: 0, removed: 0, failed: 0, disabled: true };

  const subscriptions = await db.getPushSubscriptions(userId);
  const body = JSON.stringify(normalizePayload(payload));
  const result = { sent: 0, removed: 0, failed: 0 };

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          {
            TTL: ttl,
            urgency,
            vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }
          }
        );
        result.sent++;
        await db.markPushSubscriptionResult(sub.endpoint, true).catch(() => {});
      } catch (error) {
        const status = error && error.statusCode;
        // 404/410: the browser unsubscribed or the subscription expired. It
        // will never work again, so it goes now rather than on every send.
        if (status === 404 || status === 410) {
          await db.deletePushSubscriptionByEndpoint(sub.endpoint).catch(() => {});
          result.removed++;
          return;
        }
        result.failed++;
        console.warn(`[push] delivery failed (${status || 'network'}): ${error && error.message}`);
        if ((sub.failure_count || 0) + 1 >= MAX_FAILURES) {
          await db.deletePushSubscriptionByEndpoint(sub.endpoint).catch(() => {});
          result.removed++;
        } else {
          await db.markPushSubscriptionResult(sub.endpoint, false).catch(() => {});
        }
      }
    })
  );

  return result;
}

// ─── reminder settings ───────────────────────────────────────────────────────

const DEFAULT_REMINDER_SETTINGS = Object.freeze({
  quietHours: { start: '22:00', end: '08:00' },
  water: { enabled: true, intervalMinutes: 120, start: '09:00', end: '20:00' },
  meal: { enabled: true, time: '13:00' },
  streak: { enabled: true, time: '20:00' }
});

/** A daily reminder (meal, streak) may go out this long after its time, then it is skipped for the day. */
const DAILY_SEND_WINDOW_MINUTES = 180;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(hhmm) {
  const m = HHMM.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function normalizeSettings(raw = {}) {
  const d = DEFAULT_REMINDER_SETTINGS;
  const r = raw || {};
  const pick = (v, fallback) => (minutesOf(v) === null ? fallback : v);
  const interval = Number(r.water?.intervalMinutes);
  return {
    quietHours: {
      start: pick(r.quietHours?.start, d.quietHours.start),
      end: pick(r.quietHours?.end, d.quietHours.end)
    },
    water: {
      enabled: typeof r.water?.enabled === 'boolean' ? r.water.enabled : d.water.enabled,
      intervalMinutes: Number.isInteger(interval) && interval >= 30 && interval <= 360 ? interval : d.water.intervalMinutes,
      start: pick(r.water?.start, d.water.start),
      end: pick(r.water?.end, d.water.end)
    },
    meal: {
      enabled: typeof r.meal?.enabled === 'boolean' ? r.meal.enabled : d.meal.enabled,
      time: pick(r.meal?.time, d.meal.time)
    },
    streak: {
      enabled: typeof r.streak?.enabled === 'boolean' ? r.streak.enabled : d.streak.enabled,
      time: pick(r.streak?.time, d.streak.time)
    }
  };
}

/** Local date and minute-of-day of `now` in `tz` (UTC when the zone is invalid). */
function localClock(now, tz) {
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { date: localDate(now, zone), minutes: get('hour') * 60 + get('minute') };
}

/** Quiet hours run [start, end) and may wrap midnight. start === end means none. */
function inQuietHours(minutes, quiet) {
  const start = minutesOf(quiet?.start);
  const end = minutesOf(quiet?.end);
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Which reminders are due by the clock alone — before looking at any logs.
 * Also returns the slot identifiers the caller records once a decision is made,
 * so each slot is decided (sent or skipped) exactly once.
 *
 * @returns {{ date: string, minutes: number, quiet: boolean, due: Array<{kind: string, slot: string}> }}
 */
function timeDueReminders({ settings, state = {}, now = new Date(), tz = 'UTC' }) {
  const s = normalizeSettings(settings);
  const { date, minutes } = localClock(now, tz);
  if (inQuietHours(minutes, s.quietHours)) return { date, minutes, quiet: true, due: [] };

  const due = [];

  // Water: fixed slots from the window start, every intervalMinutes — 09:00,
  // 11:00, 13:00… — so a five-minute scheduler never drifts and a restart
  // never double-sends a slot.
  const wStart = minutesOf(s.water.start);
  const wEnd = minutesOf(s.water.end);
  if (s.water.enabled && wStart < wEnd && minutes >= wStart && minutes < wEnd) {
    const slot = `${date}#${Math.floor((minutes - wStart) / s.water.intervalMinutes)}`;
    if (state.waterSlot !== slot) due.push({ kind: 'water', slot });
  }

  for (const kind of ['meal', 'streak']) {
    const cfg = s[kind];
    const at = minutesOf(cfg.time);
    const stateKey = `${kind}Date`;
    if (cfg.enabled && minutes >= at && minutes < at + DAILY_SEND_WINDOW_MINUTES && state[stateKey] !== date) {
      due.push({ kind, slot: date });
    }
  }

  return { date, minutes, quiet: false, due };
}

/**
 * Drop the clock-due reminders the user's day makes pointless.
 *
 * @param {Array<{kind, slot}>} due
 * @param {{ foodLoggedToday?: boolean, waterGoalMet?: boolean, streakAtRisk?: boolean }} facts
 */
function applyFacts(due, facts = {}) {
  const send = [];
  const skipped = [];
  for (const item of due) {
    if (item.kind === 'water' && facts.waterGoalMet) skipped.push({ ...item, reason: 'water-goal-met' });
    else if (item.kind === 'meal' && facts.foodLoggedToday) skipped.push({ ...item, reason: 'food-logged' });
    else if (item.kind === 'streak' && !facts.streakAtRisk) skipped.push({ ...item, reason: 'streak-safe' });
    else send.push(item);
  }
  return { send, skipped };
}

/** The whole decision, pure: what goes out now, what is skipped and why. */
function decideReminders({ settings, state, now, tz, facts }) {
  const clock = timeDueReminders({ settings, state, now, tz });
  const { send, skipped } = applyFacts(clock.due, facts);
  return { ...clock, send, skipped };
}

/** State after deciding `items` (sent or skipped): each slot is marked handled. */
function nextState(state = {}, items = []) {
  const out = { ...state };
  for (const item of items) {
    if (item.kind === 'water') out.waterSlot = item.slot;
    else out[`${item.kind}Date`] = item.slot;
  }
  return out;
}

// ─── reminder copy ───────────────────────────────────────────────────────────

const round1 = (n) => Math.round(n * 10) / 10;

const COPY = {
  water: {
    he: (f) => ({
      title: 'הגיע הזמן לשתות מים',
      body: f.waterTarget
        ? `כוס מים עכשיו תקרב אותך ליעד — ${round1(f.waterLiters || 0)} מתוך ${round1(f.waterTarget)} ליטר היום.`
        : 'כוס מים עכשיו תשמור עליך במסלול.'
    }),
    en: (f) => ({
      title: 'Time for some water',
      body: f.waterTarget
        ? `A glass now keeps you on track — ${round1(f.waterLiters || 0)} of ${round1(f.waterTarget)} L today.`
        : 'A glass now keeps you on track.'
    }),
    url: '/hydration'
  },
  meal: {
    he: () => ({ title: 'עוד לא רשמת ארוחה היום', body: 'רישום קצר עכשיו שומר על תמונה מלאה של היום.' }),
    en: () => ({ title: "You haven't logged a meal today", body: 'A quick entry now keeps your day complete.' }),
    url: '/food-log'
  },
  streak: {
    he: (f) => ({
      title: 'הרצף שלך בסכנה',
      body: f.streakCurrent > 1
        ? `רצף של ${f.streakCurrent} ימים — רישום אחד היום שומר עליו.`
        : 'רישום אחד היום שומר על הרצף.'
    }),
    en: (f) => ({
      title: 'Your streak is at risk',
      body: f.streakCurrent > 1
        ? `${f.streakCurrent} days in a row — one log today keeps it alive.`
        : 'One log today keeps your streak alive.'
    }),
    url: '/food-log'
  },
  test: {
    he: () => ({ title: 'ההתראות פועלות', body: 'כך ייראו התזכורות שלך מ-YAHealthy.' }),
    en: () => ({ title: 'Notifications are on', body: 'This is how your YAHealthy reminders will look.' }),
    url: '/settings#reminders'
  }
};

function buildReminderPayload(kind, lang = 'he', facts = {}) {
  const copy = COPY[kind];
  if (!copy) throw new Error(`Unknown reminder kind: ${kind}`);
  const l = lang === 'en' ? 'en' : 'he';
  return { ...copy[l](facts), url: copy.url, tag: `yahealthy-${kind}`, lang: l };
}

// ─── the scheduler loop ──────────────────────────────────────────────────────

const safe = (p) => Promise.resolve(p).then((v) => v || []).catch(() => []);

/** Only the logs the due reminders need. Streak needs history; water and meal need today. */
async function loadReminderFacts(userId, { tz, now, kinds }) {
  const today = localDate(now, tz);
  const facts = {};
  const needStreak = kinds.includes('streak');

  const [foodLogs, hydrationLogs, sleepLogs, weightLogs, prefs, survey] = await Promise.all([
    safe(db.getFoodLogs(userId, { start: needStreak ? addDays(today, -60) : today })),
    safe(needStreak ? db.getHydrationLogs(userId) : db.getHydrationLogs(userId, today)),
    needStreak ? safe(db.getSleepLogs(userId)) : [],
    needStreak ? safe(db.getWeightLogs(userId)) : [],
    db.getUserPreferences(userId).catch(() => null),
    db.getLatestSurvey(userId).catch(() => null)
  ]);

  const goals = resolveGoals({
    waterTargetLiters: prefs?.waterTargetLiters ?? survey?.water_target_liters ?? null,
    sleepTargetHours: prefs?.sleepTargetHours ?? survey?.sleep_target_hours ?? null
  });
  const days = buildDays({ foodLogs, hydrationLogs, sleepLogs, weightLogs }, tz, today);
  const todayRec = days.get(today);

  facts.foodLoggedToday = Boolean(todayRec && todayRec.foodEntries > 0);
  facts.waterLiters = todayRec ? todayRec.liters : 0;
  facts.waterTarget = goals.waterTargetLiters;
  facts.waterGoalMet = facts.waterLiters >= goals.waterTargetLiters;

  if (needStreak) {
    const logged = new Set();
    for (const rec of days.values()) {
      if (rec.foodEntries + rec.hydrationEntries + rec.sleepEntries + rec.weighIns > 0) logged.add(rec.date);
    }
    const streak = computeStreak(logged, today);
    facts.streakAtRisk = streak.atRisk;
    facts.streakCurrent = streak.current;
  }
  return facts;
}

let tickRunning = false;

/**
 * One pass over every user with reminders on. Safe to call at any cadence:
 * slots already decided are never sent twice, and an overlapping call returns
 * immediately.
 */
async function runReminderTick({ now = new Date() } = {}) {
  if (tickRunning) return { skipped: true };
  tickRunning = true;
  const summary = { users: 0, sent: 0, skipped: 0 };
  try {
    if (!isPushEnabled()) return summary;
    const rows = await db.listEnabledPushReminderSettings();
    for (const row of rows) {
      summary.users++;
      try {
        const tz = isValidTimeZone(row.tz) ? row.tz : 'UTC';
        const state = row.state || {};
        const clock = timeDueReminders({ settings: row.settings, state, now, tz });
        if (!clock.due.length) continue;

        // No browser to deliver to: leave the slots open for when one appears.
        const subs = await db.getPushSubscriptions(row.user_id);
        if (!subs.length) continue;

        const facts = await loadReminderFacts(row.user_id, { tz, now, kinds: clock.due.map((d) => d.kind) });
        const { send, skipped } = applyFacts(clock.due, facts);
        for (const item of send) {
          await sendPush(row.user_id, buildReminderPayload(item.kind, row.lang, facts));
          summary.sent++;
        }
        summary.skipped += skipped.length;
        await db.updatePushReminderState(row.user_id, nextState(state, [...send, ...skipped]));
      } catch (error) {
        console.error(`[push] reminder tick failed for a user: ${error && error.message}`);
      }
    }
    return summary;
  } finally {
    tickRunning = false;
  }
}

/**
 * Arm the five-minute reminder tick on node-cron. Off in tests
 * (NODE_ENV=test), on Vercel (no long-lived process) and with
 * PUSH_REMINDERS_DISABLED=true.
 */
function scheduleReminders(cron) {
  if (process.env.NODE_ENV === 'test' || process.env.VERCEL || process.env.PUSH_REMINDERS_DISABLED === 'true') {
    return null;
  }
  const task = cron.schedule('*/5 * * * *', () => {
    runReminderTick().catch((err) => console.error(`[push] reminder tick crashed: ${err.message}`));
  });
  console.log('🔔 Push reminders scheduled: every 5 minutes (per-user time zone and quiet hours)');
  return task;
}

module.exports = {
  // Delivery — the API other messaging layers should reuse.
  sendPush,
  isPushEnabled,
  getVapid,
  isAllowedEndpoint,
  normalizePayload,
  // Reminders
  DEFAULT_REMINDER_SETTINGS,
  normalizeSettings,
  localClock,
  inQuietHours,
  timeDueReminders,
  applyFacts,
  decideReminders,
  nextState,
  buildReminderPayload,
  loadReminderFacts,
  runReminderTick,
  scheduleReminders
};
