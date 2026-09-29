/**
 * Reminders ("nudges"): water, breakfast, today's menu, and a "well done".
 *
 * Opt-in only (users.preferences.nudges.enabled — off by default), and never
 * a nag: each reminder is sent only when it is still needed. Breakfast is
 * skipped once breakfast is logged; water is skipped when the day is on track;
 * the morning menu goes out only when meals are planned for today; "well done"
 * only when a goal was really met.
 *
 * Health first: a person with an unhandled health-flagged WhatsApp message
 * (pregnancy, diabetes, an eating disorder…) gets no automatic reminders at
 * all until a person has dealt with it. Telling someone who wrote about an
 * eating disorder to eat is the harm the health boundary exists to prevent.
 *
 * Delivery: WhatsApp (Adi's number) when the person has a phone on file and
 * WHAPI is configured, and always the in-app feed — the nudges table is both
 * the dedupe record and the notification bell.
 *
 * Timing is Israel time. The job (routes/cron.js, /api/cron/nudges) is meant
 * to run hourly; each run sends what is due in that hour, once.
 */
const db = require('./database');
const whapi = require('./whapi');
const recipes = require('../data/recipes.json');

const TZ = 'Asia/Jerusalem';

// Hour of the day (Israel) → what is due. Water three times, spread across the
// day, each with the share of the daily target a person would reasonably be at.
const SCHEDULE = [
  { hour: 8, kind: 'menu' },
  { hour: 10, kind: 'breakfast' },
  { hour: 11, kind: 'water', share: 0.35 },
  { hour: 14, kind: 'water', share: 0.6 },
  { hour: 17, kind: 'water', share: 0.8 },
  { hour: 20, kind: 'praise' }
];

const KINDS = ['water', 'breakfast', 'menu', 'praise'];
const MEAL_LABEL = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', snack: 'חטיף' };

function israelClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** The person's settings, with every reminder on once the master switch is. */
function settingsOf(user) {
  const n = user?.preferences?.nudges || {};
  return {
    enabled: n.enabled === true,
    ...Object.fromEntries(KINDS.map((k) => [k, n[k] !== false]))
  };
}

const fmt = (x) => (Math.round(x * 10) / 10).toString();

/** Everything the reminders look at, for one person, for today. */
async function dayContext(user, day) {
  const [survey, hydration, food, plans] = await Promise.all([
    db.getLatestSurvey(user.id).catch(() => null),
    db.getHydrationLogs(user.id, day).catch(() => []),
    db.getFoodLogs(user.id, { date: day }).catch(() => []),
    db.getMealPlans(user.id, { start: day, end: day }).catch(() => [])
  ]);
  const target = Number(survey?.water_target_liters) || 2;
  const liters = hydration.reduce((sum, r) => sum + (Number(r.liters_consumed) || 0), 0);
  const planned = plans
    .map((p) => ({ meal: p.meal_type, name: recipes.find((r) => r.id === p.recipe_id)?.name }))
    .filter((p) => p.name);
  return { target, liters, food, planned };
}

/**
 * The words for one reminder, or null when it is not needed right now.
 * `force` (the "send me a test" button) always produces something.
 */
function compose(kind, ctx, { share = 1, force = false } = {}) {
  switch (kind) {
    case 'menu': {
      if (!ctx.planned.length) return force ? 'בוקר טוב! כשתתכננו ארוחות באפליקציה, נזכיר לכם כאן בבוקר מה בתפריט של היום.' : null;
      const list = ctx.planned.map((p) => `${MEAL_LABEL[p.meal] || p.meal}: ${p.name}`).join('\n');
      return `בוקר טוב! לא לשכוח, היום בתפריט:\n${list}\nבהצלחה!`;
    }
    case 'breakfast': {
      const hadBreakfast = ctx.food.some((f) => f.meal_type === 'breakfast');
      if (hadBreakfast && !force) return null;
      return 'בוקר טוב! אכלתם ארוחת בוקר? אם כן, רשמו אותה באפליקציה. ואם עוד לא, זה הזמן.';
    }
    case 'water': {
      const expected = ctx.target * share;
      if (ctx.liters >= expected && !force) return null;
      return ctx.liters > 0
        ? `הגיע הזמן לכוס מים. עד עכשיו היום: ${fmt(ctx.liters)} מתוך ${fmt(ctx.target)} ליטר.`
        : 'שתיתם מים בשעות האחרונות? כוס מים עכשיו, ולא לשכוח לרשום באפליקציה.';
    }
    case 'praise': {
      if (ctx.liters >= ctx.target) return `כל הכבוד! היום הגעתם ליעד המים: ${fmt(ctx.liters)} ליטר.`;
      const meals = new Set(ctx.food.map((f) => f.meal_type).filter(Boolean)).size;
      if (meals >= 3) return `כל הכבוד! רשמתם היום ${meals} ארוחות. ככה בונים הרגל.`;
      return force ? 'כל הכבוד על היום! כל כוס מים וכל ארוחה שנרשמת נחשבות.' : null;
    }
    default:
      return null;
  }
}

function whatsappReady() {
  return Boolean(process.env.WHAPI_TOKEN);
}

/** Record in the feed, and send on WhatsApp when possible. Returns what happened. */
async function deliver(user, kind, dedupeKey, body) {
  const channel = user.phone && whatsappReady() ? 'whatsapp' : 'app';
  const { created, nudge } = await db.recordNudge({ user_id: user.id, kind, dedupe_key: dedupeKey, channel, body });
  if (!created) return { sent: false, duplicate: true };
  if (channel === 'whatsapp') {
    try {
      await whapi.sendText(`${user.phone}@s.whatsapp.net`, body);
    } catch (err) {
      // Still in the app feed. A failed WhatsApp send must not stop the run.
      console.error(`[nudges] WhatsApp send failed for ${user.id}:`, err && err.message);
    }
  }
  return { sent: true, channel, nudge };
}

/** Why this person gets nothing right now, or null if they can be reminded. */
async function pausedReason(user) {
  if (!settingsOf(user).enabled) return 'off';
  if (await db.hasOpenHealthEscalation(user.phone)) return 'health';
  return null;
}

/**
 * One run of the reminder job: everything due in this Israel hour, for
 * everyone who opted in. Safe to run more than once in an hour.
 */
async function runNudges({ now = new Date() } = {}) {
  const { day, hour } = israelClock(now);
  const due = SCHEDULE.filter((s) => s.hour === hour);
  const summary = { day, hour, due: due.map((d) => d.kind), users: 0, sent: 0, skipped: 0, paused: 0 };
  if (!due.length) return summary;

  for (const user of await db.listUsersWithNudges()) {
    summary.users++;
    if (await pausedReason(user)) {
      summary.paused++;
      continue;
    }
    const settings = settingsOf(user);
    const ctx = await dayContext(user, day);
    for (const slot of due) {
      if (!settings[slot.kind]) continue;
      const body = compose(slot.kind, ctx, { share: slot.share });
      if (!body) {
        summary.skipped++;
        continue;
      }
      const result = await deliver(user, slot.kind, `${slot.kind}:${day}:${hour}`, body);
      if (result.sent) summary.sent++;
    }
  }
  return summary;
}

/** "Send me a test reminder": shows the person what reminders look like, now. */
async function sendTestNudge(user, kind = 'water', now = new Date()) {
  const reason = await pausedReason({ ...user, preferences: { ...user.preferences, nudges: { ...(user.preferences?.nudges || {}), enabled: true } } });
  if (reason === 'health') return { sent: false, reason: 'health' };
  const { day } = israelClock(now);
  const ctx = await dayContext(user, day);
  const body = compose(KINDS.includes(kind) ? kind : 'water', ctx, { force: true });
  return deliver(user, 'test', `test:${now.getTime()}`, body);
}

module.exports = { SCHEDULE, KINDS, israelClock, settingsOf, compose, runNudges, sendTestNudge, pausedReason };
