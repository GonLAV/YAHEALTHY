/**
 * Lifecycle messaging — the decisions. Who gets which message, when, on which
 * channel, and when to stop.
 *
 * Pure functions only: no database, no clock (every function takes `now`), no
 * network. utils/lifecycle-runner.js does the I/O and hands the data in; the
 * rules below are covered by tests/lifecycle.test.js.
 *
 * Campaigns
 *   lead_nurture  marketing  landing-page leads: welcome, day 2, day 5.
 *                            Stops when the address signs up or unsubscribes.
 *   onboarding    service    new users: day 0 welcome, day 1 "log your first
 *                            meal" (only if nothing is logged), day 3 tips,
 *                            day 7 first-week recap.
 *   streak_risk   service    evening nudge when a 3+ day logging streak is at
 *                            risk (yesterday logged, today not yet).
 *   win_back      marketing  7 and 21 days without any log. Only with explicit
 *                            marketing consent.
 *
 * "marketing" is a דבר פרסומת under the Communications Law (section 30A): it
 * goes only to people who agreed to it, and its subject starts with "פרסומת".
 * "service" messages are about the account the person opened; they still
 * carry a one-click unsubscribe.
 *
 * Guard rails every send passes:
 *   - Shabbat: nothing from Friday 16:00 to Saturday 20:00 Israel time.
 *   - Quiet hours: no WhatsApp 22:00–08:00 in the recipient's time zone
 *     (email too, by default — nobody needs a nudge at 3am).
 *   - At most one lifecycle message per recipient per local day.
 *   - Each (recipient, campaign, period) is sent at most once; the runner
 *     enforces that with a unique key in the database, and these functions
 *     never propose a period that is already in the log.
 */

const crypto = require('crypto');
const { localDate, addDays, isValidTimeZone } = require('./engagement');
const plans = require('./plans');

const ISRAEL_TZ = 'Asia/Jerusalem';

const CAMPAIGNS = Object.freeze({
  lead_nurture: {
    id: 'lead_nurture',
    audience: 'lead',
    marketing: true,
    steps: ['welcome', 'day2', 'day5']
  },
  onboarding: {
    id: 'onboarding',
    audience: 'user',
    marketing: false,
    steps: ['day0', 'day1', 'day3', 'day7'],
    whatsappSteps: ['day1']
  },
  streak_risk: {
    id: 'streak_risk',
    audience: 'user',
    marketing: false,
    steps: ['evening'],
    whatsappSteps: ['evening']
  },
  win_back: {
    id: 'win_back',
    audience: 'user',
    marketing: true,
    steps: ['d7', 'd21']
  },
  // Recurring billing without a stored card: a periodic plan ends on its
  // ends_at, and a week before that the customer gets a link to renew
  // (/upgrade). Service, not marketing — it is about what they bought. Only
  // while checkout is enabled, or the link would lead nowhere.
  renewal: {
    id: 'renewal',
    audience: 'user',
    marketing: false,
    steps: ['before_end']
  }
});

/**
 * Timing. Windows are [minDays, maxDays) in calendar days, in the recipient's
 * time zone. The upper bound matters: when this ships, a user who signed up
 * a month ago must not suddenly get "welcome, day 1".
 */
const DEFAULT_CONFIG = Object.freeze({
  defaultTz: ISRAEL_TZ,
  quietHours: { start: 22, end: 8 },
  quietHoursForEmail: true,
  shabbat: { enabled: true, tz: ISRAEL_TZ, startHour: 16, endHour: 20 },
  dailyCap: 1,
  leadNurture: [
    { step: 'welcome', minDays: 0, maxDays: 2 },
    { step: 'day2', minDays: 2, maxDays: 4 },
    { step: 'day5', minDays: 5, maxDays: 8 }
  ],
  onboarding: [
    { step: 'day0', minDays: 0, maxDays: 2 },
    { step: 'day1', minDays: 1, maxDays: 3, onlyIfNoFoodLogs: true },
    { step: 'day3', minDays: 3, maxDays: 5 },
    { step: 'day7', minDays: 7, maxDays: 10 }
  ],
  streakRisk: { minStreak: 3, fromHour: 19, toHour: 22 },
  winBack: [
    { step: 'd7', minDays: 7, maxDays: 14 },
    { step: 'd21', minDays: 21, maxDays: 35 }
  ],
  // Onboarding owns the first week and a half; win-back does not talk over it.
  winBackMinAccountDays: 10,
  // Off unless the runner finds checkout enabled (utils/checkout.js).
  renewal: { enabled: false, daysBefore: 7 }
});

const intEnv = (value, fallback, lo, hi) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

/** DEFAULT_CONFIG with the env overrides the runner honours. */
function configFromEnv(env = {}) {
  return {
    ...DEFAULT_CONFIG,
    defaultTz: isValidTimeZone(env.LIFECYCLE_DEFAULT_TZ) ? env.LIFECYCLE_DEFAULT_TZ : DEFAULT_CONFIG.defaultTz,
    quietHours: {
      start: intEnv(env.LIFECYCLE_QUIET_START, DEFAULT_CONFIG.quietHours.start, 0, 23),
      end: intEnv(env.LIFECYCLE_QUIET_END, DEFAULT_CONFIG.quietHours.end, 0, 23)
    },
    quietHoursForEmail: env.LIFECYCLE_QUIET_HOURS_EMAIL !== 'false',
    shabbat: {
      ...DEFAULT_CONFIG.shabbat,
      enabled: env.LIFECYCLE_SHABBAT_GUARD !== 'false',
      startHour: intEnv(env.LIFECYCLE_SHABBAT_START_HOUR, DEFAULT_CONFIG.shabbat.startHour, 0, 23),
      endHour: intEnv(env.LIFECYCLE_SHABBAT_END_HOUR, DEFAULT_CONFIG.shabbat.endHour, 0, 23)
    }
  };
}

// ─── time ───────────────────────────────────────────────────────────────────

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** { date: 'YYYY-MM-DD', hour: 0–23, weekday: 0 (Sun)–6 (Sat) } of `now` in tz. */
function localParts(now, tz) {
  const zone = isValidTimeZone(tz) ? tz : ISRAEL_TZ;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      weekday: 'short',
      hour: '2-digit'
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: localDate(now, zone), hour: Number(parts.hour) % 24, weekday: WEEKDAYS[parts.weekday] };
}

/** Friday from startHour to Saturday endHour, Israel time. */
function isShabbat(now, config = DEFAULT_CONFIG) {
  const s = config.shabbat || DEFAULT_CONFIG.shabbat;
  if (!s.enabled) return false;
  const { weekday, hour } = localParts(now, s.tz || ISRAEL_TZ);
  return (weekday === 5 && hour >= s.startHour) || (weekday === 6 && hour < s.endHour);
}

function isQuietHours(now, tz, config = DEFAULT_CONFIG) {
  const { start, end } = config.quietHours;
  if (start === end) return false;
  const { hour } = localParts(now, tz);
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

function resolveTz(prefs, config) {
  return isValidTimeZone(prefs && prefs.timezone) ? prefs.timezone : config.defaultTz;
}

const inWindow = (days, w) => days >= w.minDays && days < w.maxDays;

// ─── unsubscribe tokens ────────────────────────────────────────────────────

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function deriveKey(secret) {
  if (!secret) throw new Error('Unsubscribe token secret is missing');
  // Domain-separated from whatever else the secret signs (JWTs).
  return crypto.createHmac('sha256', String(secret)).update('yahealthy:lifecycle-unsubscribe:v1').digest();
}

/**
 * Signed, non-expiring token naming one recipient. It never expires on
 * purpose: an unsubscribe link in a two-year-old email still has to work.
 * It grants exactly two things — unsubscribing that recipient and, for a
 * lead, deleting that lead — so a leaked one cannot do more than that.
 */
function signToken({ kind, id, email }, secret) {
  if (kind !== 'user' && kind !== 'lead') throw new Error('kind must be user or lead');
  const payload = b64url(JSON.stringify({ k: kind, i: String(id), e: email ? String(email).toLowerCase() : undefined }));
  const sig = b64url(crypto.createHmac('sha256', deriveKey(secret)).update(payload).digest());
  return `${payload}.${sig}`;
}

/** { kind, id, email } or null for anything malformed, forged or tampered with. */
function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  let expected;
  try {
    expected = crypto.createHmac('sha256', deriveKey(secret)).update(payload).digest();
  } catch {
    return null;
  }
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if ((data.k !== 'user' && data.k !== 'lead') || typeof data.i !== 'string' || !data.i) return null;
    return { kind: data.k, id: data.i, email: data.e || null };
  } catch {
    return null;
  }
}

// ─── shared gates ──────────────────────────────────────────────────────────

const skip = (reason, extra = {}) => ({ action: 'skip', reason, ...extra });

/** Sends that count against the daily cap: sent or in flight, today, in tz. */
function sentToday(sends, now, tz) {
  const today = localDate(now, tz);
  return (sends || []).filter(
    (s) => s.status !== 'failed' && localDate(s.sent_at || s.created_at, tz) === today
  ).length;
}

const hasPeriod = (sends, campaign, periodKey) =>
  (sends || []).some((s) => s.campaign === campaign && s.period_key === periodKey);

// ─── leads ─────────────────────────────────────────────────────────────────

/**
 * What to do with one landing-page lead right now.
 *
 * @param {object} p
 * @param {object} p.lead          marketing_leads row
 * @param {boolean} p.isUser       an account exists with this email
 * @param {Array}  p.sends         this lead's lifecycle_sends rows
 * @param {Date}   p.now
 * @param {object} [p.config]
 */
function decideLead({ lead, isUser, sends = [], now, config = DEFAULT_CONFIG }) {
  if (isUser) return skip('converted', { convert: true });
  if (lead.unsubscribed_at) return skip('unsubscribed');
  if (!lead.consent_at) return skip('no_consent');
  if (!lead.email) return skip('no_email');
  if (isShabbat(now, config)) return skip('shabbat');

  const tz = config.defaultTz;
  if (config.quietHoursForEmail && isQuietHours(now, tz, config)) return skip('quiet_hours');
  if (sentToday(sends, now, tz) >= config.dailyCap) return skip('daily_cap');

  const days = daysBetween(localDate(lead.created_at, tz), localDate(now, tz));
  for (const w of config.leadNurture) {
    if (!inWindow(days, w) || hasPeriod(sends, 'lead_nurture', w.step)) continue;
    return {
      action: 'send',
      recipientType: 'lead',
      recipientId: lead.id,
      campaign: 'lead_nurture',
      step: w.step,
      periodKey: w.step,
      channel: 'email',
      marketing: true,
      lang: lead.lang === 'en' ? 'en' : 'he',
      tz
    };
  }
  return skip(days >= config.leadNurture[config.leadNurture.length - 1].maxDays ? 'series_done' : 'nothing_due');
}

// ─── users ─────────────────────────────────────────────────────────────────

/**
 * Pick a channel for a message, or say why there is none.
 *
 * WhatsApp only for a person who opted in, has a number, the campaign step
 * has WhatsApp copy, and it is not quiet hours where they are. Otherwise
 * email, if they still accept that kind of email.
 */
function pickChannel({ campaign, step, user, prefs, now, tz, config }) {
  const meta = CAMPAIGNS[campaign];
  const quiet = isQuietHours(now, tz, config);

  const whatsappAllowed =
    prefs.whatsapp === true &&
    Boolean(user.phone) &&
    (meta.whatsappSteps || []).includes(step) &&
    // A marketing message on WhatsApp would need its own consent; none of
    // the marketing campaigns has WhatsApp copy, and this keeps it that way.
    !meta.marketing;
  if (whatsappAllowed && !quiet) return { channel: 'whatsapp' };

  const emailAllowed = Boolean(user.email) && (meta.marketing ? prefs.marketing_email === true : prefs.email_lifecycle !== false);
  if (!emailAllowed) return { none: meta.marketing ? 'no_marketing_consent' : 'email_off' };
  if (config.quietHoursForEmail && quiet) return { none: 'quiet_hours' };
  return { channel: 'email' };
}

/**
 * What to do with one registered user right now.
 *
 * @param {object} p
 * @param {object} p.user       { id, email, name, phone, created_at }
 * @param {object} p.prefs      notification_preferences (with defaults)
 * @param {object} p.activity   { hasFoodLogs, lastActiveDate, streak: { current, atRisk, todayDone }, recap }
 * @param {Array}  p.sends      this user's lifecycle_sends rows
 * @param {Date}   p.now
 * @param {object} [p.config]
 * @returns decision: { action: 'send', campaign, step, periodKey, channel, ... }
 *                    or { action: 'skip', reason, considered }
 */
function decideUser({ user, prefs = {}, activity = {}, sends = [], now, config = DEFAULT_CONFIG }) {
  const tz = resolveTz(prefs, config);
  const lang = prefs.lang === 'en' ? 'en' : 'he';

  if (prefs.unsubscribed_at && prefs.email_lifecycle === false && prefs.marketing_email !== true && prefs.whatsapp !== true) {
    return skip('unsubscribed');
  }
  if (isShabbat(now, config)) return skip('shabbat');
  if (sentToday(sends, now, tz) >= config.dailyCap) return skip('daily_cap');

  const { date: today, hour } = localParts(now, tz);
  const accountDays = daysBetween(localDate(user.created_at, tz), today);
  const considered = [];

  const tryCandidate = (campaign, step, periodKey, extra = {}) => {
    if (hasPeriod(sends, campaign, periodKey)) {
      considered.push({ campaign, step, reason: 'already_sent' });
      return null;
    }
    const ch = pickChannel({ campaign, step, user, prefs, now, tz, config });
    if (ch.none) {
      considered.push({ campaign, step, reason: ch.none });
      return null;
    }
    return {
      action: 'send',
      recipientType: 'user',
      recipientId: user.id,
      campaign,
      step,
      periodKey,
      channel: ch.channel,
      marketing: CAMPAIGNS[campaign].marketing,
      lang,
      tz,
      ...extra
    };
  };

  // 1. Streak at risk — time-critical, so it goes first.
  const streak = activity.streak || {};
  const sr = config.streakRisk;
  if (streak.atRisk && !streak.todayDone && streak.current >= sr.minStreak) {
    if (hour >= sr.fromHour && hour < sr.toHour) {
      const d = tryCandidate('streak_risk', 'evening', today, { streakDays: streak.current });
      if (d) return d;
    } else {
      considered.push({ campaign: 'streak_risk', step: 'evening', reason: 'not_evening' });
    }
  }

  // 2. Renewal — a paid period ending within the week. One per period: the
  //    key carries the plan and the end day, so a renewal (which moves the
  //    end date) gets its own reminder next time.
  const renewal = activity.renewal;
  const rc = config.renewal || DEFAULT_CONFIG.renewal;
  if (rc.enabled && renewal && renewal.endsAt && renewal.plan) {
    const endDay = localDate(renewal.endsAt, tz);
    const daysLeft = daysBetween(today, endDay);
    if (daysLeft >= 0 && daysLeft < rc.daysBefore) {
      const d = tryCandidate('renewal', 'before_end', `${renewal.plan}:${endDay}`, {
        plan: renewal.plan,
        endsAt: renewal.endsAt
      });
      if (d) return d;
    }
  }

  // 3. Onboarding.
  for (const w of config.onboarding) {
    if (!inWindow(accountDays, w)) continue;
    if (w.onlyIfNoFoodLogs && activity.hasFoodLogs) {
      considered.push({ campaign: 'onboarding', step: w.step, reason: 'already_logged' });
      continue;
    }
    const d = tryCandidate('onboarding', w.step, w.step);
    if (d) return d;
  }

  // 4. Win-back. Inactive since the last log of any kind, or since signup for
  //    someone who never logged. The period key carries that date, so a person
  //    who comes back and drifts off again can be welcomed back again later —
  //    but never twice for the same lapse.
  if (accountDays >= config.winBackMinAccountDays) {
    const since = activity.lastActiveDate || localDate(user.created_at, tz);
    const inactive = daysBetween(since, today);
    for (const w of config.winBack) {
      if (!inWindow(inactive, w)) continue;
      const d = tryCandidate('win_back', w.step, `${w.step}:${since}`, { inactiveDays: inactive });
      if (d) return d;
    }
  }

  return skip('nothing_due', { considered });
}

/**
 * The paid period a renewal reminder would be about: of this user's active,
 * dated subscriptions to a periodic catalog plan, the one ending soonest
 * (after `now`). One-time and open-ended purchases never need renewing.
 * → { plan, endsAt } | null
 */
function renewalCandidate(subscriptions = [], now = new Date()) {
  const nowMs = new Date(now).getTime();
  let best = null;
  for (const s of subscriptions) {
    if (!s || s.status !== 'active' || !s.ends_at) continue;
    const endMs = new Date(s.ends_at).getTime();
    if (!(endMs > nowMs)) continue;
    const plan = plans.getPlan(s.plan);
    if (!plan || !plan.months) continue;
    if (!best || endMs < best.ms) best = { ms: endMs, plan: plan.id, endsAt: new Date(endMs).toISOString() };
  }
  return best ? { plan: best.plan, endsAt: best.endsAt } : null;
}

/**
 * Which of a user's sent messages just converted: any activity on or after
 * the local day the message went out. Returns the send ids to stamp.
 */
function conversionsFor({ sends = [], activity = {}, tz = ISRAEL_TZ }) {
  const last = activity.lastActiveDate;
  if (!last) return [];
  return sends
    .filter((s) => s.status === 'sent' && !s.converted_at && s.sent_at)
    .filter((s) => last >= localDate(s.sent_at, tz))
    .map((s) => s.id);
}

// ─── stats ─────────────────────────────────────────────────────────────────

/** Per-campaign counts from the send log. `opened` is null: plain-text mail has no open tracking. */
function summarizeStats(sends = []) {
  const out = {};
  for (const id of Object.keys(CAMPAIGNS)) {
    out[id] = {
      campaign: id,
      marketing: CAMPAIGNS[id].marketing,
      sent: 0,
      failed: 0,
      pending: 0,
      opened: null,
      converted: 0,
      conversionRate: null,
      byStep: {},
      byChannel: { email: 0, whatsapp: 0 }
    };
  }
  for (const s of sends) {
    const c = out[s.campaign];
    if (!c) continue;
    const step = (c.byStep[s.step] = c.byStep[s.step] || { sent: 0, failed: 0, pending: 0, converted: 0 });
    if (s.status === 'sent') {
      c.sent++;
      c.byChannel[s.channel] = (c.byChannel[s.channel] || 0) + 1;
      step.sent++;
      if (s.converted_at) {
        c.converted++;
        step.converted++;
      }
      if (s.opened_at) c.opened = (c.opened || 0) + 1;
    } else if (s.status === 'failed') {
      c.failed++;
      step.failed++;
    } else {
      c.pending++;
      step.pending++;
    }
  }
  for (const c of Object.values(out)) {
    c.conversionRate = c.sent ? Math.round((c.converted / c.sent) * 1000) / 1000 : null;
  }
  return out;
}

module.exports = {
  CAMPAIGNS,
  DEFAULT_CONFIG,
  configFromEnv,
  localParts,
  isShabbat,
  isQuietHours,
  daysBetween,
  signToken,
  verifyToken,
  decideLead,
  decideUser,
  pickChannel,
  renewalCandidate,
  conversionsFor,
  summarizeStats,
  addDays
};
