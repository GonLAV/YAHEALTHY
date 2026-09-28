/**
 * Lifecycle messaging — the I/O half. Reads recipients and their activity,
 * asks utils/lifecycle.js what to do, and sends.
 *
 * Scheduled from index.js hourly (Asia/Jerusalem), the same way the weekly
 * summary is: not on Vercel (no long-lived process to hold a scheduler), not
 * under NODE_ENV=test, and not when LIFECYCLE_ENABLED=false. Staff can also
 * trigger a run, dry or real, through POST /api/marketing/campaigns/run.
 *
 * Double sends are prevented by the send log, not by memory: every message is
 * claimed in lifecycle_sends — unique on (recipient, campaign, period) — before
 * it goes out, and only the caller whose insert won sends it. A restart, an
 * overlapping run or a second instance cannot send the same message twice.
 * A claim whose delivery fails is marked 'failed' and is not retried
 * automatically: a message that arrives twice is worse than one that did not.
 */

const db = require('./database');
const mailer = require('./mailer');
const whapi = require('./whapi');
const auth = require('./auth');
const lifecycle = require('./lifecycle');
const { renderMessage } = require('./lifecycle-templates');
const { buildEngagementSummary, buildDays, addDays, localDate, isValidTimeZone } = require('./engagement');

const HISTORY_DAYS = 60;

const safe = (p) => Promise.resolve(p).then((v) => v || []).catch(() => []);

function tokenSecret() {
  return process.env.LIFECYCLE_TOKEN_SECRET || auth.JWT_SECRET;
}

/** Where links in messages point. The unsubscribe link must reach the API. */
function urls() {
  const app = (mailer.APP_URL || '').replace(/\/+$/, '');
  const api = (process.env.PUBLIC_API_URL || app).replace(/\/+$/, '');
  return { app, api };
}

function buildLinks({ kind, recipient, step }) {
  const { app, api } = urls();
  // No email in the token: it is only base64, and URLs end up in logs.
  const token = lifecycle.signToken({ kind, id: recipient.id }, tokenSecret());
  const unsubscribeUrl = `${api}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
  const utm = (campaign) =>
    `utm_source=email&utm_medium=lifecycle&utm_campaign=${campaign}&utm_content=${encodeURIComponent(step)}`;
  return {
    token,
    unsubscribeUrl,
    // Leads were promised removal on request; the page this opens offers it.
    forgetUrl: kind === 'lead' ? `${unsubscribeUrl}&forget=1` : null,
    signupUrl: `${app}/signup?${utm('lead_nurture')}`,
    appUrl: `${app}/dashboard`,
    foodLogUrl: `${app}/food-log`
  };
}

/** Everything a user's decision needs, from the logs the app already stores. */
async function loadUserActivity(userId, tz, now) {
  const start = addDays(localDate(now, tz), -HISTORY_DAYS);
  const [foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals] = await Promise.all([
    safe(db.getFoodLogs(userId, { start })),
    safe(db.getHydrationLogs(userId)),
    safe(db.getSleepLogs(userId)),
    safe(db.getWeightLogs(userId)),
    safe(db.getWeightGoals(userId))
  ]);

  const input = { foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals };
  const summary = buildEngagementSummary({ ...input, tz, now, lang: 'he' });
  const streak = summary.streaks.anyLog;

  // Days in the last 7 (today included) with any log, for the day-7 recap.
  const days = buildDays(input, summary.tz, summary.today);
  const weekStart = addDays(summary.today, -6);
  let daysLogged = 0;
  for (const rec of days.values()) {
    const any = rec.foodEntries + rec.hydrationEntries + rec.sleepEntries + rec.weighIns > 0;
    if (any && rec.date >= weekStart && rec.date <= summary.today) daysLogged++;
  }

  return {
    hasFoodLogs: foodLogs.length > 0,
    lastActiveDate: streak.lastDate,
    streak: { current: streak.current, atRisk: streak.atRisk, todayDone: streak.todayDone },
    recap: {
      daysLogged,
      currentStreak: streak.current,
      bestStreak: streak.best,
      unlocked: summary.unlockedCount
    }
  };
}

function groupSends(sends) {
  const map = new Map();
  for (const s of sends) {
    const key = `${s.recipient_type}:${s.recipient_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return map;
}

/** Render the message a decision describes, for a user or a lead. */
function renderFor({ decision, recipient, activity }) {
  const kind = decision.recipientType;
  const links = buildLinks({ kind, recipient, step: decision.step });
  const firstName = recipient.name ? String(recipient.name).trim().split(/\s+/)[0] : '';
  const vars = {
    name: firstName,
    ...links,
    streakDays: decision.streakDays || (activity && activity.streak && activity.streak.current) || 0,
    recap: activity ? activity.recap : null
  };
  const msg = renderMessage({
    campaign: decision.campaign,
    step: decision.step,
    lang: decision.lang,
    marketing: decision.marketing,
    vars
  });
  return { ...msg, unsubscribeUrl: links.unsubscribeUrl };
}

async function deliverMessage({ decision, recipient, message, deps }) {
  if (decision.channel === 'whatsapp') {
    if (!message.whatsapp) throw new Error(`No WhatsApp copy for ${decision.campaign}/${decision.step}`);
    return deps.whapi.sendText(recipient.phone, message.whatsapp);
  }
  return deps.mailer.deliver({
    to: recipient.email,
    subject: message.subject,
    text: message.text,
    // RFC 8058 one-click unsubscribe: mail clients show their own button and
    // POST to the same URL, which routes/marketing.js accepts.
    headers: {
      'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  });
}

let running = false;

/**
 * One pass over every lead and user.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]  decide and render, but claim and send nothing
 * @param {Date}    [opts.now]
 * @param {object}  [opts.deps]    { mailer, whapi } — tests pass fakes
 * @param {object}  [opts.config]
 */
async function runLifecycle({ dryRun = false, now = new Date(), deps = {}, config } = {}) {
  const cfg = config || lifecycle.configFromEnv(process.env);
  const io = { mailer: deps.mailer || mailer, whapi: deps.whapi || whapi };

  if (!dryRun && running) return { dryRun, skipped: 'already_running' };
  if (!dryRun) running = true;

  const result = {
    dryRun,
    at: now.toISOString(),
    evaluated: { leads: 0, users: 0 },
    planned: [],
    sent: 0,
    failed: 0,
    alreadyClaimed: 0,
    converted: 0,
    skipped: {}
  };
  const noteSkip = (reason) => {
    result.skipped[reason] = (result.skipped[reason] || 0) + 1;
  };

  try {
    if (lifecycle.isShabbat(now, cfg)) {
      result.shabbat = true;
      return result;
    }

    const [users, leads, prefsMap, sends] = await Promise.all([
      db.getAllUsers(),
      db.listLeads(),
      db.listNotificationPrefs(),
      db.listLifecycleSends()
    ]);
    const sendsBy = groupSends(sends);
    const userEmails = new Set(users.map((u) => String(u.email || '').toLowerCase()));

    const act = async (decision, recipient, activity) => {
      const message = renderFor({ decision, recipient, activity });
      const plan = {
        recipientType: decision.recipientType,
        recipientId: decision.recipientId,
        campaign: decision.campaign,
        step: decision.step,
        periodKey: decision.periodKey,
        channel: decision.channel,
        lang: decision.lang,
        subject: message.subject
      };
      result.planned.push(plan);
      if (dryRun) return;

      const claim = await db.claimLifecycleSend({
        recipient_type: decision.recipientType,
        recipient_id: decision.recipientId,
        campaign: decision.campaign,
        step: decision.step,
        period_key: decision.periodKey,
        channel: decision.channel
      });
      if (!claim.claimed) {
        result.alreadyClaimed++;
        plan.status = 'already_claimed';
        return;
      }
      try {
        await deliverMessage({ decision, recipient, message, deps: io });
        await db.updateLifecycleSend(claim.send.id, { status: 'sent', sent_at: new Date().toISOString() });
        result.sent++;
        plan.status = 'sent';
      } catch (error) {
        await db
          .updateLifecycleSend(claim.send.id, { status: 'failed', error: String(error.message || error).slice(0, 500) })
          .catch(() => {});
        result.failed++;
        plan.status = 'failed';
        console.error(`[lifecycle] ${decision.campaign}/${decision.step} to ${decision.recipientType} ${decision.recipientId} failed: ${error.message}`);
      }
    };

    // Leads.
    for (const lead of leads) {
      result.evaluated.leads++;
      try {
        const leadSends = sendsBy.get(`lead:${lead.id}`) || [];
        const decision = lifecycle.decideLead({
          lead,
          isUser: userEmails.has(String(lead.email || '').toLowerCase()),
          sends: leadSends,
          now,
          config: cfg
        });
        if (decision.convert && !dryRun && leadSends.some((s) => s.status === 'sent' && !s.converted_at)) {
          result.converted += await db.markLifecycleConverted('lead', lead.id, 'lead_nurture');
        }
        if (decision.action === 'send') await act(decision, lead, null);
        else noteSkip(decision.reason);
      } catch (error) {
        noteSkip('error');
        console.error(`[lifecycle] lead ${lead.id} failed: ${error.message}`);
      }
    }

    // Users.
    for (const user of users) {
      result.evaluated.users++;
      try {
        const prefs = { ...db.NOTIFICATION_DEFAULTS, ...(prefsMap.get(user.id) || {}) };
        const tz = isValidTimeZone(prefs.timezone) ? prefs.timezone : cfg.defaultTz;
        const userSends = sendsBy.get(`user:${user.id}`) || [];
        const activity = await loadUserActivity(user.id, tz, now);

        if (!dryRun) {
          for (const id of lifecycle.conversionsFor({ sends: userSends, activity, tz })) {
            await db.updateLifecycleSend(id, { converted_at: now.toISOString() });
            result.converted++;
          }
        }

        const decision = lifecycle.decideUser({ user, prefs, activity, sends: userSends, now, config: cfg });
        if (decision.action === 'send') await act(decision, user, activity);
        else noteSkip(decision.reason);
      } catch (error) {
        noteSkip('error');
        console.error(`[lifecycle] user ${user.id} failed: ${error.message}`);
      }
    }

    return result;
  } finally {
    if (!dryRun) running = false;
  }
}

/**
 * Render one campaign message for one recipient without sending anything.
 *
 * `target` is { userId } | { leadId } | { email } (a user first, then a lead).
 * Without a step, the step the recipient would get now is used when the
 * campaign has one due, else the campaign's first step.
 */
async function previewCampaign(campaignId, target = {}, { step, lang, now = new Date() } = {}) {
  const meta = lifecycle.CAMPAIGNS[campaignId];
  if (!meta) {
    const err = new Error('Unknown campaign');
    err.status = 404;
    throw err;
  }
  if (step && !meta.steps.includes(step)) {
    const err = new Error(`Unknown step for ${campaignId}: use one of ${meta.steps.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const cfg = lifecycle.configFromEnv(process.env);
  let recipient = null;
  const kind = meta.audience;

  if (kind === 'user') {
    if (target.userId) recipient = await db.getUser(target.userId);
    else if (target.email) recipient = await db.getUserByEmail(String(target.email).toLowerCase());
  } else if (target.leadId) {
    recipient = await db.getLeadById(target.leadId);
  } else if (target.email) {
    recipient = await db.getLeadByEmail(target.email);
  }
  if (!recipient) {
    const err = new Error(`No ${kind} matches that target`);
    err.status = 404;
    throw err;
  }

  let decision;
  let activity = null;
  if (kind === 'user') {
    const prefs = await db.getNotificationPrefs(recipient.id);
    const tz = isValidTimeZone(prefs.timezone) ? prefs.timezone : cfg.defaultTz;
    activity = await loadUserActivity(recipient.id, tz, now);
    const sends = await db.listLifecycleSends({ recipientType: 'user', recipientId: recipient.id });
    decision = lifecycle.decideUser({ user: recipient, prefs, activity, sends, now, config: cfg });
    if (decision.action !== 'send' || decision.campaign !== campaignId || (step && decision.step !== step)) {
      const channel = lifecycle.pickChannel({ campaign: campaignId, step: step || meta.steps[0], user: recipient, prefs, now, tz, config: { ...cfg, quietHoursForEmail: false } });
      decision = {
        action: 'preview',
        wouldSendNow: false,
        reason: decision.reason || `next due: ${decision.campaign}/${decision.step}`,
        recipientType: 'user',
        recipientId: recipient.id,
        campaign: campaignId,
        step: step || meta.steps[0],
        channel: channel.channel || 'email',
        marketing: meta.marketing,
        lang: prefs.lang === 'en' ? 'en' : 'he'
      };
    } else {
      decision.wouldSendNow = true;
    }
  } else {
    const sends = await db.listLifecycleSends({ recipientType: 'lead', recipientId: recipient.id });
    const account = await db.getUserByEmail(recipient.email);
    decision = lifecycle.decideLead({ lead: recipient, isUser: Boolean(account), sends, now, config: cfg });
    if (decision.action !== 'send' || (step && decision.step !== step)) {
      decision = {
        action: 'preview',
        wouldSendNow: false,
        reason: decision.reason,
        recipientType: 'lead',
        recipientId: recipient.id,
        campaign: campaignId,
        step: step || meta.steps[0],
        channel: 'email',
        marketing: true,
        lang: recipient.lang === 'en' ? 'en' : 'he'
      };
    } else {
      decision.wouldSendNow = true;
    }
  }

  if (lang === 'he' || lang === 'en') decision.lang = lang;
  const message = renderFor({ decision, recipient, activity });
  return {
    campaign: campaignId,
    step: decision.step,
    lang: decision.lang,
    channel: decision.channel,
    marketing: decision.marketing,
    wouldSendNow: decision.wouldSendNow,
    reason: decision.reason || null,
    subject: message.subject,
    text: message.text,
    whatsapp: message.whatsapp
  };
}

async function getCampaignStats() {
  const sends = await db.listLifecycleSends();
  return lifecycle.summarizeStats(sends);
}

/** Arm the hourly job. Called from index.js. */
function scheduleLifecycle(cron) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'test' || process.env.LIFECYCLE_ENABLED === 'false') {
    return false;
  }
  // Minute 7, not 0: the weekly summary and most other jobs sit on the hour.
  cron.schedule('7 * * * *', () => {
    runLifecycle()
      .then((r) => {
        if (r.sent || r.failed) console.log(`📬 Lifecycle run: ${r.sent} sent, ${r.failed} failed, ${r.converted} conversions`);
      })
      .catch((err) => console.error(`📬 Lifecycle job crashed: ${err.message}`));
  }, { timezone: 'Asia/Jerusalem' });
  console.log('📬 Lifecycle messaging scheduled: hourly at :07 (Asia/Jerusalem)');
  return true;
}

module.exports = {
  runLifecycle,
  previewCampaign,
  getCampaignStats,
  scheduleLifecycle,
  loadUserActivity,
  renderFor,
  buildLinks,
  tokenSecret
};
