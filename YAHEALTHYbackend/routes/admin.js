/**
 * GET /api/admin/health — the staff "System health" view.
 *
 * Staff only: authMiddleware, then requireStaff, which answers everyone else
 * with the same 404 an unknown route gives. Nothing here names a user; the
 * config summary lists feature NAMES only, never variables or values.
 *
 * Reflects THIS process (see utils/health-registry.js): jobs and error
 * counts are in memory and start empty on every boot.
 */

const express = require('express');
const auth = require('../utils/auth');
const db = require('../utils/database');
const requireStaff = require('../middleware/requireStaff');
const { checkConfig } = require('../utils/config-check');
const { jobs, errors } = require('../utils/health-registry');
const tracker = require('../utils/error-tracker');
const version = require('../utils/version');
const { redactString } = require('../utils/logger');
const plans = require('../utils/plans');
const entitlements = require('../utils/entitlements');
const { checkoutStatus } = require('../utils/checkout');

const router = express.Router();
const STARTED_AT = new Date();
const PING_TIMEOUT_MS = 3000;

router.use(auth.authMiddleware, requireStaff);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/** db.ping() with a latency figure and a timeout, never throwing. */
async function pingDb() {
  const started = process.hrtime.bigint();
  let timer;
  try {
    const result = await Promise.race([
      db.ping(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), PING_TIMEOUT_MS);
      })
    ]);
    const latencyMs = Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10;
    return {
      mode: db.isMemoryMode() ? 'memory' : 'supabase',
      ok: Boolean(result && result.ok),
      latencyMs,
      ...(result && !result.ok ? { error: redactString(String(result.error || 'unavailable')).slice(0, 200) } : {})
    };
  } catch (error) {
    return {
      mode: db.isMemoryMode() ? 'memory' : 'supabase',
      ok: false,
      latencyMs: null,
      error: redactString(String((error && error.message) || error)).slice(0, 200)
    };
  } finally {
    clearTimeout(timer);
  }
}

function configSummary() {
  const report = checkConfig(process.env);
  return {
    production: report.production,
    requiredMissing: report.errors.length,
    disabledFeatures: [...new Set(report.warnings.map((w) => w.feature))].sort()
  };
}

/**
 * Is money switched on, and what is live? Flags and counts only — no user,
 * no price. Subscriptions are grouped by catalog plan; legacy base/yoni rows
 * are counted under their canonical plan and also reported as `legacy`.
 */
async function monetizationSummary() {
  const status = checkoutStatus();
  const priced = plans.listPlans().filter((p) => p.amount !== null).map((p) => p.id);
  const out = {
    checkoutEnabled: status.enabled,
    checkoutBlockedBy: status.reason,
    entitlementsEnforced: entitlements.isEnforced(),
    installments: status.installments,
    pricedPlans: priced,
    unpricedPlans: plans.CATALOG.map((p) => p.id).filter((id) => !priced.includes(id)),
    subscriptions: null
  };
  try {
    const summary = await db.summarizeActiveSubscriptions(new Date(), 7);
    const byPlan = {};
    let legacy = 0;
    for (const [id, n] of Object.entries(summary.byPlan)) {
      const key = plans.resolvePlanId(id) || 'unknown';
      byPlan[key] = (byPlan[key] || 0) + n;
      if (plans.isLegacyId(id)) legacy += n;
    }
    out.subscriptions = {
      active: summary.active,
      byPlan,
      legacy,
      endingWithinDays: summary.soonDays,
      endingSoon: summary.endingSoon,
      openEnded: summary.openEnded
    };
  } catch (error) {
    out.subscriptions = { error: redactString(String((error && error.message) || error)).slice(0, 200) };
  }
  return out;
}

router.get('/health', async (req, res) => {
  const database = await pingDb();
  const monetization = await monetizationSummary();
  const jobList = jobs.list();
  const errorSummary = errors.summary();
  const degraded =
    !database.ok ||
    jobList.some((j) => j.enabled && j.lastStatus === 'error') ||
    errorSummary.serverErrors > 0;

  res.json({
    status: degraded ? 'degraded' : 'ok',
    generatedAt: new Date().toISOString(),
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    version: {
      app: version.app,
      commit: version.commit,
      node: version.node,
      environment: process.env.NODE_ENV || 'development',
      platform: process.env.VERCEL ? 'vercel' : 'server'
    },
    db: database,
    config: configSummary(),
    errorTracking: { enabled: tracker.isEnabled() },
    monetization,
    jobs: jobList,
    errors: errorSummary
  });
});

module.exports = router;
