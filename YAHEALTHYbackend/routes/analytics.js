/**
 * Staff marketing analytics — "what is working".
 *
 *   GET /api/analytics/funnel         leads → signups → activated → engaged → paying
 *   GET /api/analytics/acquisition    the same, grouped by UTM tags / referral / organic
 *   GET /api/analytics/referrals      top referrers (first name + masked email only)
 *   GET /api/analytics/retention      weekly signup cohorts × week-N active rate
 *   GET /api/analytics/leads/summary  leads per day and per source, lead → signup rate
 *
 * Every endpoint takes `?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive, UTC days;
 * default: the last 30 days) and is staff-only: authMiddleware says who the
 * caller is, requireStaff reads is_staff from the database and answers
 * anyone else with the same 404 an unknown route gives.
 *
 * This file only loads rows (in bulk, through utils/database.js) and hands
 * them to the pure functions in utils/analytics.js. Nothing it returns
 * contains a full email, a phone number or a user id.
 */

const { forRequest: reqLog } = require('../utils/logger');
const express = require('express');
const auth = require('../utils/auth');
const db = require('../utils/database');
const requireStaff = require('../middleware/requireStaff');
const analytics = require('../utils/analytics');

const router = express.Router();

router.use(auth.authMiddleware, requireStaff);

// Aggregates about real people: never cached by a browser or a proxy.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * Parses the range, runs `build(range, now)`, and answers with
 * { range, generatedAt, ...result }. A malformed range is a 400.
 */
function handler(name, build) {
  return async (req, res) => {
    const now = new Date();
    const range = analytics.parseRange(req.query, now);
    if (!range.ok) {
      return res.status(400).json({ error: 'Invalid date range', details: range.error, requestId: req.id });
    }
    try {
      const result = await build(range, now, req);
      return res.json({
        range: { from: range.from, to: range.to, days: range.days },
        generatedAt: now.toISOString(),
        ...result
      });
    } catch (error) {
      reqLog(req).error('[analytics] query failed', { query: name, err: error });
      return res.status(500).json({ error: 'Could not build analytics', requestId: req.id });
    }
  };
}

/** Signups in the range plus their activity since the range began and their subscriptions. */
async function loadSignupCohort(range) {
  const signups = await db.listSignupsBetween(range.fromIso, range.toIso);
  const ids = signups.map((u) => u.id);
  const [activity, subscriptions] = await Promise.all([
    db.listActivityDays(ids, range.from),
    db.listSubscriptionsForUsers(ids)
  ]);
  return { signups, activity, subscriptions };
}

router.get(
  '/funnel',
  handler('funnel', async (range, now) => {
    const [cohort, leads] = await Promise.all([
      loadSignupCohort(range),
      db.listLeadsBetween(range.fromIso, range.toIso)
    ]);
    return analytics.computeFunnel({ ...cohort, leads, now });
  })
);

router.get(
  '/acquisition',
  handler('acquisition', async (range, now) => {
    const [cohort, referrals] = await Promise.all([
      loadSignupCohort(range),
      db.listReferralsBetween(range.fromIso, range.toIso)
    ]);
    return analytics.computeAcquisition({ ...cohort, referrals, now });
  })
);

router.get(
  '/referrals',
  handler('referrals', async (range, now, req) => {
    const referrals = await db.listReferralsBetween(range.fromIso, range.toIso);
    const refereeIds = referrals.map((r) => r.referee_id);
    const [referrers, refereeUsers, subscriptions, activity, rewards] = await Promise.all([
      db.getUsersByIds(referrals.map((r) => r.referrer_id)),
      db.getUsersByIds(refereeIds),
      db.listSubscriptionsForUsers(refereeIds),
      db.listActivityDays(refereeIds, range.from),
      db.listRewardsForReferrals(referrals.map((r) => r.id))
    ]);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    return analytics.computeReferrals({
      referrals,
      referrers,
      refereeUsers,
      subscriptions,
      activity,
      rewards,
      now,
      limit
    });
  })
);

router.get(
  '/retention',
  handler('retention', async (range, now, req) => {
    const signups = await db.listSignupsBetween(range.fromIso, range.toIso);
    const activity = await db.listActivityDays(signups.map((u) => u.id), range.from);
    return analytics.computeRetention({ signups, activity, now, weeks: req.query.weeks });
  })
);

router.get(
  '/leads/summary',
  handler('leads summary', async (range) => {
    const leads = await db.listLeadsBetween(range.fromIso, range.toIso);
    const accounts = await db.findUsersByEmails(leads.map((l) => l.email));
    return analytics.computeLeadsSummary({
      leads,
      signedUpEmails: accounts.map((u) => u.email),
      range
    });
  })
);

module.exports = router;
