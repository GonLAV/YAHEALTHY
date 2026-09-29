/**
 * Log-from-WhatsApp — the steps routes/whapi.js runs around the bot.
 *
 *   1. handleLinkCode      "YH-XXXXXX" from the phone → verified link to the
 *                          account that issued the code. Never by number alone.
 *   2. checkEscalation     stop flags (docs/product-truth.md §5 / utils/health-flags)
 *                          → the conversation is escalated for good: no
 *                          pending entry, no invite, the message goes to the
 *                          human queue (whatsapp_messages status 'escalated').
 *   3. handlePendingReply  "כן" / "לא" / a quick correction to the server's
 *                          own question. Only an explicit yes writes.
 *   4. afterModelReply     Adi's turn ran calculate_meal_nutrition → a pending
 *                          entry and the "לרשום ביומן?" question (linked), or
 *                          a throttled invite to link (unlinked).
 *
 * The model proposes (its tool call produced numbers); the server writes.
 * Pure rules and copy: utils/whatsapp-logging.js. Storage: utils/whatsapp-link-store.js.
 */

const db = require('./database');
const store = require('./whatsapp-link-store');
const rules = require('./whatsapp-logging');
const onboarding = require('./onboarding');
const { flagsIn } = require('./health-flags');
const { normalizePhone } = require('./phone');
const { isValidTimeZone, addDays, localDate, buildEngagementSummary } = require('./engagement');
const logger = require('./logger').child({ module: 'whatsapp-food-log' });

const PENDING_TTL_MS = 30 * 60 * 1000;
const INVITE_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TZ = 'Asia/Jerusalem';

/**
 * One key per person across every table here: E.164 without the plus
 * (utils/phone), so "972501234567@s.whatsapp.net" and a later delivery shape
 * of the same number meet. A number utils/phone cannot place keeps its digits.
 */
function phoneKey(raw) {
  return normalizePhone(raw) || String(raw || '').split('@')[0];
}

function settingsUrl() {
  const base = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/settings#whatsapp`;
}

/** lang, time zone and the minor rule for a linked account. */
async function userContext(userId, now = new Date()) {
  const user = await db.getUser(userId);
  if (!user) return null;
  const [prefs, push, preferences] = await Promise.all([
    db.getNotificationPrefs(userId).catch(() => null),
    db.getPushReminderSettings(userId).catch(() => null),
    db.getUserPreferences(userId).catch(() => null)
  ]);
  const tz = [prefs?.timezone, push?.tz].find((z) => isValidTimeZone(z)) || DEFAULT_TZ;
  const lang = prefs?.lang === 'en' ? 'en' : 'he';
  const profile = preferences?.onboarding?.profile;
  let minor = false;
  if (profile && typeof profile === 'object') {
    const age = onboarding.resolveAge(
      {
        age: Number.isFinite(Number(profile.age)) && profile.age !== null ? Number(profile.age) : undefined,
        birthYear: Number.isFinite(Number(profile.birthYear)) && profile.birthYear !== null ? Number(profile.birthYear) : undefined
      },
      now
    );
    minor = age !== null && age < onboarding.ADULT_AGE;
  }
  return { user, tz, lang, minor };
}

/** The verified link for this phone, dropping one whose account no longer exists. */
async function activeLink(phone) {
  const link = await store.getLinkByPhone(phone);
  if (!link) return null;
  if (!(await db.getUser(link.user_id))) {
    await store.deleteLink(link.user_id);
    return null;
  }
  return link;
}

// ─── 1. linking ─────────────────────────────────────────────────────────────

/**
 * @returns {Promise<string>} the reply to send
 */
async function handleLinkCode({ phone: rawPhone, code, now = new Date() }) {
  const phone = phoneKey(rawPhone);
  const since = new Date(now.getTime() - rules.ATTEMPT_WINDOW_MS);
  // Checked before the code is even looked at: past the limit, a correct
  // guess and a wrong one get the same answer.
  if ((await store.countFailedAttemptsSince(phone, since)) >= rules.MAX_FAILED_ATTEMPTS) {
    logger.warn('link code attempts over limit', { event: 'whatsapp.link.rate_limited' });
    return rules.copy('he').tooMany;
  }

  const row = await store.consumeLinkCode(rules.hashLinkCode(code), now);
  const ctx = row ? await userContext(row.user_id, now) : null;
  if (!row || !ctx) {
    await store.recordFailedAttempt(phone, now);
    return rules.copy('he').badCode;
  }
  const t = rules.copy(ctx.lang);

  const existing = await store.getLinkByPhone(phone);
  if (existing && existing.user_id === row.user_id) {
    await store.revokeCodesForUser(row.user_id, now);
    return t.alreadyLinked;
  }

  try {
    await store.createLink(row.user_id, phone, now);
  } catch (err) {
    if (err.code === 'PHONE_TAKEN') {
      // Nobody is linked by this; the code stays usable once the number is freed.
      await store.releaseLinkCode(row.id);
      return t.phoneTaken;
    }
    throw err;
  }
  // A previous number's unanswered question must not be answerable any more.
  await store.closePendingForUser(row.user_id, 'cancelled', now);
  await store.revokeCodesForUser(row.user_id, now);
  logger.info('whatsapp linked', { event: 'whatsapp.link.linked', userId: row.user_id });
  return t.linked;
}

// ─── 2. escalation ──────────────────────────────────────────────────────────

/**
 * True when this conversation must not be logged or invited from: the message
 * carries a stop flag now, or the conversation was escalated before.
 */
async function checkEscalation({ phone: rawPhone, message, text, now = new Date() }) {
  const phone = phoneKey(rawPhone);
  const flags = flagsIn(text);
  if (flags.length) {
    await store.markEscalated(phone, now);
    await store.closePendingForPhone(phone, 'cancelled', now);
    if (message && message.id) {
      try {
        // Into the same human queue routes/whatsapp.js feeds (upsert on id).
        await db.saveWhatsappMessage({
          id: message.id,
          chat_id: message.chat_id || rawPhone,
          from_number: message.from || null,
          from_name: message.from_name ?? null,
          from_me: false,
          type: message.type,
          body: text || null,
          sent_at: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : null,
          status: 'escalated',
          raw: message
        });
      } catch (err) {
        logger.error('could not queue escalated message', { err, messageId: message.id });
      }
    }
    // No body and no flag in the log: an inbound message can hold health information.
    logger.warn('health flag: conversation escalated, diary logging off', {
      event: 'whatsapp.escalated',
      messageId: message?.id || null
    });
    return true;
  }
  const state = await store.getConversationState(phone);
  return Boolean(state && state.escalated_at);
}

// ─── 3. the answer to "לרשום ביומן?" ────────────────────────────────────────

async function dayReceipt({ userId, logDate, ctx, now }) {
  const logs = await db.getFoodLogs(userId, { date: logDate });
  const dayCalories = logs.reduce((sum, l) => sum + (Number(l.calories) || 0), 0);
  let streak = null;
  try {
    const { loadInputs } = require('../routes/engagement');
    const inputs = await loadInputs(userId, ctx.tz);
    streak = buildEngagementSummary({ ...inputs, tz: ctx.tz, lang: ctx.lang, now }).streaks.food;
  } catch (err) {
    logger.warn('streak lookup failed after whatsapp log', { err });
  }
  return rules.loggedReceipt({
    dayCalories,
    dayEntries: logs.length,
    streak,
    lang: ctx.lang,
    minor: ctx.minor,
    logDate,
    today: localDate(now, ctx.tz)
  });
}

async function confirmPending(pending, ctx, now) {
  // Exactly one caller wins this transition; a second "yes" (or a redelivered
  // one under a new id) finds nothing to confirm.
  const claimed = await store.transitionPending(pending.id, 'pending', 'confirmed', {}, now);
  if (!claimed) return { handled: true, reply: null };

  const ids = [];
  try {
    for (const row of rules.foodLogRowsFor(claimed, ctx.lang)) {
      const { row: written } = await store.insertFoodLogOnce(claimed.user_id, row);
      if (written?.id) ids.push(written.id);
    }
  } catch (err) {
    // Back to pending so "כן" again works; rows already written are keyed by
    // source_ref and will not be written twice on the retry.
    await store.transitionPending(claimed.id, 'confirmed', 'pending', {}, now).catch(() => null);
    logger.error('whatsapp food log write failed', { err, pendingId: claimed.id });
    return { handled: true, reply: rules.copy(ctx.lang).failed };
  }
  await store.transitionPending(claimed.id, 'confirmed', 'confirmed', { food_log_ids: ids }, now).catch(() => null);
  logger.info('whatsapp meal logged', { event: 'whatsapp.log.confirmed', userId: claimed.user_id, items: ids.length });
  return { handled: true, reply: await dayReceipt({ userId: claimed.user_id, logDate: claimed.log_date, ctx, now }) };
}

/**
 * @returns {Promise<{handled: true, reply: string|null}|null>} null = not an
 *   answer to a live question; the message goes to Adi as usual.
 */
async function handlePendingReply({ phone: rawPhone, text, now = new Date() }) {
  const phone = phoneKey(rawPhone);
  const answer = rules.classifyReply(text);
  if (!answer) return null;

  const link = await activeLink(phone);
  if (!link) return null;
  const pending = await store.getLatestPending(phone);
  if (!pending || pending.status !== 'pending' || pending.user_id !== link.user_id) return null;

  const ctx = await userContext(link.user_id, now);
  if (!ctx) return null;
  const t = rules.copy(ctx.lang);

  if (new Date(pending.expires_at).getTime() <= now.getTime()) {
    await store.transitionPending(pending.id, 'pending', 'expired', {}, now);
    return answer.kind === 'yes' || answer.kind === 'no' ? { handled: true, reply: t.expired } : null;
  }

  const today = localDate(now, ctx.tz);
  const reask = (row) => ({
    handled: true,
    reply: row ? rules.confirmPrompt(row, { lang: ctx.lang, minor: ctx.minor, today }) : null
  });

  switch (answer.kind) {
    case 'yes':
      return confirmPending(pending, ctx, now);
    case 'no': {
      const done = await store.transitionPending(pending.id, 'pending', 'cancelled', {}, now);
      return { handled: true, reply: done ? t.cancelled : null };
    }
    case 'slot':
      return reask(await store.updatePendingFields(pending.id, { meal_type: answer.mealType }));
    case 'scale':
      return reask(await store.updatePendingFields(pending.id, { items: rules.scaleItems(pending.items, answer.factor) }));
    case 'yesterday':
      return reask(await store.updatePendingFields(pending.id, { log_date: addDays(today, -1) }));
    default:
      return null;
  }
}

// ─── 4. after Adi's reply ───────────────────────────────────────────────────

/** The app catalogue's id for a bot food, when the name and cooked/raw state agree. */
async function matchCatalogFood(item) {
  try {
    const rows = await db.searchFoods(item.nameHe, 10);
    const wantCooked = /cooked/i.test(item.nameEn || '');
    const same = rows.filter(
      (r) => r.name_he === item.nameHe || (Array.isArray(r.aliases_he) && r.aliases_he.includes(item.nameHe))
    );
    const hit = same.find((r) => (wantCooked ? r.state === 'cooked' : r.state !== 'cooked'));
    return hit ? hit.id : null;
  } catch {
    return null;
  }
}

/**
 * @param {{phone, activeBot, toolCalls, escalated, messageId, messageAt, now}} p
 * @returns {Promise<string|null>} one extra message to send after Adi's reply
 */
async function afterModelReply({ phone: rawPhone, activeBot, toolCalls, escalated, messageId = null, messageAt = null, now = new Date() }) {
  const phone = phoneKey(rawPhone);
  if (activeBot !== 'adi' || escalated) return null;
  const items = rules.pickMealFromToolCalls(toolCalls);
  if (!items) return null;

  const link = await activeLink(phone);
  if (!link) {
    const state = await store.getConversationState(phone);
    const last = state?.link_invited_at ? new Date(state.link_invited_at).getTime() : 0;
    if (last && now.getTime() - last < INVITE_EVERY_MS) return null;
    await store.markInvited(phone, now);
    return rules.copy('he').invite(settingsUrl());
  }

  const ctx = await userContext(link.user_id, now);
  if (!ctx) return null;
  const when = rules.resolveWhen(messageAt || now, ctx.tz);
  for (const item of items) item.catalogFoodId = await matchCatalogFood(item);

  const pending = await store.createPending({
    phone,
    userId: link.user_id,
    items,
    mealType: when.mealType,
    logDate: when.date,
    tz: when.tz,
    sourceMessageId: messageId,
    ttlMs: PENDING_TTL_MS,
    now
  });
  logger.info('whatsapp meal proposed', { event: 'whatsapp.log.proposed', userId: link.user_id, items: items.length });
  return rules.confirmPrompt(pending, { lang: ctx.lang, minor: ctx.minor, today: localDate(now, ctx.tz), time: when.time });
}

// ─── account side (routes/whatsapp-link.js) ─────────────────────────────────

async function linkStatus(userId) {
  const link = await store.getLinkByUser(userId);
  return link ? { linked: true, phone: link.phone, linkedAt: link.linked_at } : { linked: false };
}

/**
 * @returns {Promise<{code, expiresAt}|{error: 'rate_limited'}>}
 */
async function issueCode(userId, now = new Date()) {
  const since = new Date(now.getTime() - rules.CODE_WINDOW_MS);
  if ((await store.countCodesSince(userId, since)) >= rules.MAX_CODES_PER_WINDOW) {
    return { error: 'rate_limited' };
  }
  const code = rules.generateLinkCode();
  const row = await store.issueLinkCode({
    userId,
    codeHash: rules.hashLinkCode(code),
    ttlMs: rules.LINK_CODE_TTL_MS,
    now
  });
  return { code, expiresAt: row.expires_at };
}

async function unlink(userId, now = new Date()) {
  await store.closePendingForUser(userId, 'cancelled', now);
  await store.revokeCodesForUser(userId, now);
  const removed = await store.deleteLink(userId);
  if (removed) logger.info('whatsapp unlinked', { event: 'whatsapp.link.unlinked', userId });
  return removed;
}

module.exports = {
  handleLinkCode,
  checkEscalation,
  handlePendingReply,
  afterModelReply,
  linkStatus,
  issueCode,
  unlink,
  userContext,
  PENDING_TTL_MS,
  INVITE_EVERY_MS
};
