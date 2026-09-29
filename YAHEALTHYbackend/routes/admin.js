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

router.get('/health', async (req, res) => {
  const database = await pingDb();
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
    jobs: jobList,
    errors: errorSummary
  });
});

module.exports = router;
