/**
 * Marketing analytics — the arithmetic behind the staff dashboard.
 *
 * Pure functions only. They take raw rows (users, activity days,
 * subscriptions, leads, referrals, rewards) plus `now`, and return plain data.
 * No database and no clock reads unless `now` is left out, so every rule here
 * is unit-tested in tests/analytics.test.js and routes/analytics.js stays a
 * thin loader.
 *
 * Definitions (the dashboard's copy repeats these, so keep them in step):
 *   lead       a row in marketing_leads first captured in the range
 *   signup     an account created in the range (staff accounts excluded)
 *   activated  logged anything (food, water, sleep, weigh-in) on the signup
 *              day or the 6 days after it — "≥1 log within 7 days"
 *   engaged    active on ≥ 3 distinct days of the first 14
 *   paying     holds an active subscription right now (status 'active' and
 *              no end date, or one in the future)
 *
 * Days are UTC calendar days (YYYY-MM-DD). A signup too recent for its
 * window to have closed is counted as "pending", not as a failure, so a
 * range that ends today does not make the latest cohort look like it churned.
 *
 * 🔒 Privacy: nothing returned here carries a full email, a phone number or a
 * user id. The referral leaderboard shows a first name (only when the person
 * typed one — the default name is the email's local part, which is not shown)
 * and a masked email such as d***@g***.com.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const ACTIVATION_WINDOW_DAYS = 7;
const ENGAGEMENT_WINDOW_DAYS = 14;
const ENGAGEMENT_MIN_ACTIVE_DAYS = 3;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const DEFAULT_RETENTION_WEEKS = 8;
const MAX_RETENTION_WEEKS = 12;

const CHANNELS = Object.freeze({ REFERRAL: 'referral', CAMPAIGN: 'campaign', ORGANIC: 'organic' });

// ─── dates ──────────────────────────────────────────────────────────────────

function toDay(value) {
  if (!value) return null;
  if (typeof value === 'string' && ISO_DAY.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function isValidDay(day) {
  if (typeof day !== 'string' || !ISO_DAY.test(day)) return false;
  return toDay(new Date(`${day}T00:00:00.000Z`)) === day;
}

/** Monday (UTC) of the week `day` falls in. */
function weekStart(day) {
  const dow = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/**
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD`, both inclusive. Defaults to the last 30
 * days ending today. Returns { ok: false, error } for anything malformed.
 */
function parseRange(query = {}, now = new Date()) {
  const today = toDay(now);
  const rawFrom = typeof query.from === 'string' && query.from ? query.from : null;
  const rawTo = typeof query.to === 'string' && query.to ? query.to : null;

  if (rawFrom && !isValidDay(rawFrom)) return { ok: false, error: 'from must be a date in YYYY-MM-DD form' };
  if (rawTo && !isValidDay(rawTo)) return { ok: false, error: 'to must be a date in YYYY-MM-DD form' };

  const to = rawTo || today;
  const from = rawFrom || addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) return { ok: false, error: 'from must not be after to' };

  const days = daysBetween(from, to) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `The range may cover at most ${MAX_RANGE_DAYS} days` };

  return {
    ok: true,
    from,
    to,
    days,
    fromIso: `${from}T00:00:00.000Z`,
    // Exclusive upper bound: the whole of `to` is inside the range.
    toIso: `${addDays(to, 1)}T00:00:00.000Z`
  };
}

// ─── small helpers ──────────────────────────────────────────────────────────

/** A share rounded to 4 places, or null when there is nothing to divide by. */
function rate(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 10000) / 10000;
}

function cleanTag(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase().slice(0, 100);
  return text || null;
}

function isPayingNow(subscription, nowIso) {
  return (
    !!subscription &&
    subscription.status === 'active' &&
    (!subscription.ends_at || new Date(subscription.ends_at).toISOString() > nowIso)
  );
}

function payingUserIds(subscriptions = [], now = new Date()) {
  const nowIso = new Date(now).toISOString();
  const ids = new Set();
  for (const s of subscriptions) if (isPayingNow(s, nowIso)) ids.add(s.user_id);
  return ids;
}

/** Map<userId, Set<YYYY-MM-DD>> from { user_id, day } rows. */
function buildActivityIndex(activity = []) {
  const index = new Map();
  for (const row of activity) {
    const day = toDay(row && row.day);
    if (!row || !row.user_id || !day) continue;
    if (!index.has(row.user_id)) index.set(row.user_id, new Set());
    index.get(row.user_id).add(day);
  }
  return index;
}

function countDaysIn(days, first, last) {
  if (!days) return 0;
  let n = 0;
  for (const d of days) if (d >= first && d <= last) n++;
  return n;
}

/**
 * Where one user stands on the activation/engagement ladder.
 * `pending` means the window is still open and the answer is not in yet.
 */
function userMilestones(user, activityIndex, today) {
  const signupDay = toDay(user.created_at);
  const days = activityIndex.get(user.id);
  const activationEnd = addDays(signupDay, ACTIVATION_WINDOW_DAYS - 1);
  const engagementEnd = addDays(signupDay, ENGAGEMENT_WINDOW_DAYS - 1);

  const activated = countDaysIn(days, signupDay, activationEnd) > 0;
  const engaged = countDaysIn(days, signupDay, engagementEnd) >= ENGAGEMENT_MIN_ACTIVE_DAYS;

  return {
    signupDay,
    activated,
    engaged,
    activationPending: !activated && today <= activationEnd,
    engagementPending: !engaged && today <= engagementEnd
  };
}

// ─── privacy ────────────────────────────────────────────────────────────────

/** dana.cohen@gmail.com → d***@g***.com. Never returns the address itself. */
function maskEmail(email) {
  const text = String(email || '').trim();
  const at = text.lastIndexOf('@');
  if (at < 1 || at === text.length - 1) return '***';
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local[0]}***@${host[0]}***${tld}`;
}

/**
 * A first name the person chose to give, or null. Signup without a name
 * stores the email's local part as the name, and showing that would be
 * showing most of the email — so a name equal to it is treated as no name.
 */
function firstNameOf(user) {
  const name = String((user && user.name) || '').trim();
  if (!name || name.includes('@')) return null;
  const local = String((user && user.email) || '').split('@')[0].toLowerCase();
  if (local && name.toLowerCase() === local) return null;
  const first = name.split(/\s+/)[0];
  if (/\d{4,}/.test(first)) return null; // looks like a phone number or an id
  return first.slice(0, 30);
}

// ─── funnel ─────────────────────────────────────────────────────────────────

/**
 * leads → signups → activated → engaged → paying.
 *
 * Leads and signups in the range are different populations (most people who
 * sign up never left an email first), so "leads → signups" is a ratio of two
 * counts, not a tracked conversion; leadsSummary has the tracked one.
 */
function computeFunnel({ leads = [], signups = [], activity = [], subscriptions = [], now = new Date() }) {
  const today = toDay(now);
  const index = buildActivityIndex(activity);
  const paying = payingUserIds(subscriptions, now);

  let activated = 0;
  let engaged = 0;
  let payingCount = 0;
  let activationPending = 0;
  let engagementPending = 0;

  for (const user of signups) {
    const m = userMilestones(user, index, today);
    if (m.activated) activated++;
    if (m.engaged) engaged++;
    if (m.activationPending) activationPending++;
    if (m.engagementPending) engagementPending++;
    if (paying.has(user.id)) payingCount++;
  }

  const counts = [
    ['leads', leads.length],
    ['signups', signups.length],
    ['activated', activated],
    ['engaged', engaged],
    ['paying', payingCount]
  ];

  const stages = counts.map(([key, count], i) => ({
    key,
    count,
    rateFromPrevious: i === 0 ? null : rate(count, counts[i - 1][1]),
    rateFromSignups: i < 2 ? null : rate(count, signups.length)
  }));

  return {
    stages,
    pending: { activation: activationPending, engagement: engagementPending },
    definitions: {
      activationWindowDays: ACTIVATION_WINDOW_DAYS,
      engagementWindowDays: ENGAGEMENT_WINDOW_DAYS,
      engagementMinActiveDays: ENGAGEMENT_MIN_ACTIVE_DAYS
    }
  };
}

// ─── acquisition ────────────────────────────────────────────────────────────

/**
 * Which door someone came in through. A referral wins over UTM tags (the
 * invite is why they came, whatever link it travelled on); UTM tags win over
 * nothing; nothing is organic/direct.
 */
function channelOf(user, referredIds = new Set()) {
  if (user.referred_by || referredIds.has(user.id)) {
    return { channel: CHANNELS.REFERRAL, utm_source: null, utm_medium: null, utm_campaign: null };
  }
  const a = user.attribution && typeof user.attribution === 'object' ? user.attribution : {};
  const source = cleanTag(a.utm_source);
  const medium = cleanTag(a.utm_medium);
  const campaign = cleanTag(a.utm_campaign);
  if (source || medium || campaign) {
    return { channel: CHANNELS.CAMPAIGN, utm_source: source, utm_medium: medium, utm_campaign: campaign };
  }
  return { channel: CHANNELS.ORGANIC, utm_source: null, utm_medium: null, utm_campaign: null };
}

function tally() {
  return { signups: 0, activated: 0, engaged: 0, paying: 0 };
}

function withRates(t) {
  return {
    ...t,
    activationRate: rate(t.activated, t.signups),
    engagementRate: rate(t.engaged, t.signups),
    payingRate: rate(t.paying, t.signups)
  };
}

function computeAcquisition({ signups = [], activity = [], subscriptions = [], referrals = [], now = new Date() }) {
  const today = toDay(now);
  const index = buildActivityIndex(activity);
  const paying = payingUserIds(subscriptions, now);
  const referredIds = new Set(referrals.map((r) => r.referee_id));

  const rows = new Map();
  const channels = new Map(Object.values(CHANNELS).map((c) => [c, tally()]));
  const total = tally();

  for (const user of signups) {
    const where = channelOf(user, referredIds);
    const key = JSON.stringify([where.channel, where.utm_source, where.utm_medium, where.utm_campaign]);
    if (!rows.has(key)) rows.set(key, { ...where, ...tally() });

    const m = userMilestones(user, index, today);
    for (const t of [rows.get(key), channels.get(where.channel), total]) {
      t.signups++;
      if (m.activated) t.activated++;
      if (m.engaged) t.engaged++;
      if (paying.has(user.id)) t.paying++;
    }
  }

  return {
    rows: Array.from(rows.values())
      .map(withRates)
      .sort((a, b) => b.signups - a.signups || b.paying - a.paying),
    byChannel: Array.from(channels.entries()).map(([channel, t]) => ({ channel, ...withRates(t) })),
    total: withRates(total)
  };
}

// ─── referrals ──────────────────────────────────────────────────────────────

/**
 * Top referrers by invites that signed up in the range. "Invites" are
 * sign-ups through the person's code — the product does not record invites
 * that went unanswered. Conversions are invitees paying now; rewards are what
 * those referrals earned the referrer (revoked rewards excluded).
 */
function computeReferrals({
  referrals = [],
  referrers = [],
  subscriptions = [],
  activity = [],
  rewards = [],
  refereeUsers = [],
  now = new Date(),
  limit = 10
}) {
  const today = toDay(now);
  const paying = payingUserIds(subscriptions, now);
  const index = buildActivityIndex(activity);
  const byId = new Map(referrers.map((u) => [u.id, u]));
  const refereeById = new Map(refereeUsers.map((u) => [u.id, u]));

  const board = new Map();
  for (const r of referrals) {
    if (!board.has(r.referrer_id)) {
      board.set(r.referrer_id, { invites: 0, activated: 0, conversions: 0, rewardsEarned: 0, rewardCount: 0 });
    }
    const row = board.get(r.referrer_id);
    row.invites++;
    if (paying.has(r.referee_id)) row.conversions++;
    const referee = refereeById.get(r.referee_id) || { id: r.referee_id, created_at: r.created_at };
    if (userMilestones(referee, index, today).activated) row.activated++;
  }

  const referralIds = new Set(referrals.map((r) => r.id));
  for (const reward of rewards) {
    if (!referralIds.has(reward.referral_id) || reward.status === 'revoked') continue;
    const row = board.get(reward.user_id);
    if (!row) continue; // rewards to the referee side are not the referrer's
    row.rewardsEarned += Number(reward.amount) || 0;
    row.rewardCount++;
  }

  const ranked = Array.from(board.entries())
    .map(([referrerId, row]) => {
      const user = byId.get(referrerId) || {};
      return {
        firstName: firstNameOf(user),
        maskedEmail: maskEmail(user.email),
        ...row,
        conversionRate: rate(row.conversions, row.invites)
      };
    })
    .sort((a, b) => b.conversions - a.conversions || b.invites - a.invites || b.rewardsEarned - a.rewardsEarned)
    .map((row, i) => ({ rank: i + 1, ...row }));

  const totals = ranked.reduce(
    (t, r) => ({
      referrers: t.referrers + 1,
      invites: t.invites + r.invites,
      activated: t.activated + r.activated,
      conversions: t.conversions + r.conversions,
      rewardsEarned: t.rewardsEarned + r.rewardsEarned
    }),
    { referrers: 0, invites: 0, activated: 0, conversions: 0, rewardsEarned: 0 }
  );

  return {
    leaderboard: ranked.slice(0, Math.max(1, limit)),
    totals: { ...totals, conversionRate: rate(totals.conversions, totals.invites) }
  };
}

// ─── retention ──────────────────────────────────────────────────────────────

/**
 * Weekly signup cohorts (Monday-start, UTC) × week-N active rate.
 *
 * Week N for a user is days [7N, 7N+6] after their own signup day, and they
 * count as active if they logged anything in it. A user only enters week N's
 * denominator once that week is over, so the newest cells are empty rather
 * than falsely low.
 */
function computeRetention({ signups = [], activity = [], now = new Date(), weeks = DEFAULT_RETENTION_WEEKS }) {
  const today = toDay(now);
  const span = Math.min(MAX_RETENTION_WEEKS, Math.max(1, Math.floor(Number(weeks)) || DEFAULT_RETENTION_WEEKS));
  const index = buildActivityIndex(activity);

  const cohorts = new Map();
  const overall = Array.from({ length: span }, () => ({ eligible: 0, active: 0 }));

  for (const user of signups) {
    const signupDay = toDay(user.created_at);
    if (!signupDay) continue;
    const key = weekStart(signupDay);
    if (!cohorts.has(key)) {
      cohorts.set(key, { size: 0, cells: Array.from({ length: span }, () => ({ eligible: 0, active: 0 })) });
    }
    const cohort = cohorts.get(key);
    cohort.size++;

    const days = index.get(user.id);
    for (let n = 0; n < span; n++) {
      const first = addDays(signupDay, 7 * n);
      const last = addDays(first, 6);
      if (last >= today) break; // this week is not over yet
      const active = countDaysIn(days, first, last) > 0;
      for (const cell of [cohort.cells[n], overall[n]]) {
        cell.eligible++;
        if (active) cell.active++;
      }
    }
  }

  const shape = (cells) =>
    cells.map((c, week) => ({ week, eligible: c.eligible, active: c.active, rate: rate(c.active, c.eligible) }));

  return {
    weeks: span,
    cohorts: Array.from(cohorts.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([cohortStart, c]) => ({ cohortStart, size: c.size, cells: shape(c.cells) })),
    overall: shape(overall)
  };
}

// ─── leads ──────────────────────────────────────────────────────────────────

function leadSourceOf(lead) {
  return cleanTag(lead.utm_source) || cleanTag(lead.source) || '(direct)';
}

/**
 * Leads per day (every day of the range, zeros included) and per source,
 * plus how many of those addresses now belong to an account. `signedUpEmails`
 * is only used for matching; no address leaves this function.
 */
function computeLeadsSummary({ leads = [], signedUpEmails = [], range }) {
  const signedUp = new Set(signedUpEmails.map((e) => String(e || '').trim().toLowerCase()));
  const perDay = new Map();
  if (range && range.from && range.to) {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) perDay.set(d, 0);
  }
  const perSource = new Map();
  let converted = 0;

  for (const lead of leads) {
    const day = toDay(lead.created_at);
    if (day) perDay.set(day, (perDay.get(day) || 0) + 1);

    const source = leadSourceOf(lead);
    if (!perSource.has(source)) perSource.set(source, { source, leads: 0, signups: 0 });
    const row = perSource.get(source);
    row.leads++;

    if (signedUp.has(String(lead.email || '').trim().toLowerCase())) {
      row.signups++;
      converted++;
    }
  }

  return {
    total: leads.length,
    signups: converted,
    leadToSignupRate: rate(converted, leads.length),
    perDay: Array.from(perDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count })),
    perSource: Array.from(perSource.values())
      .map((r) => ({ ...r, rate: rate(r.signups, r.leads) }))
      .sort((a, b) => b.leads - a.leads)
  };
}

module.exports = {
  ACTIVATION_WINDOW_DAYS,
  ENGAGEMENT_WINDOW_DAYS,
  ENGAGEMENT_MIN_ACTIVE_DAYS,
  MAX_RANGE_DAYS,
  CHANNELS,
  parseRange,
  addDays,
  weekStart,
  rate,
  maskEmail,
  firstNameOf,
  channelOf,
  payingUserIds,
  buildActivityIndex,
  userMilestones,
  computeFunnel,
  computeAcquisition,
  computeReferrals,
  computeRetention,
  computeLeadsSummary
};
