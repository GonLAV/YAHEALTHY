/**
 * In-process health registry: background jobs and recent errors.
 *
 * IN MEMORY ONLY, by design. Each Node process keeps its own copy, and it
 * starts empty on every boot. That is enough for the question it answers —
 * "is this server's scheduler running, and is anything failing right now?" —
 * and it needs no migration. What it cannot tell you:
 *   - history across restarts (the lifecycle_sends table and the logs keep that);
 *   - anything on Vercel, where no scheduler runs and every request may hit a
 *     different instance (jobs show there as "not scheduled").
 *
 *   jobs.register('lifecycle', { schedule: '7 * * * *', enabled: true })
 *   const run = jobs.start('lifecycle');   ...   run.finish({ sent, failed, skipped })
 *                                                run.fail(error)
 *   errors.record('GET /api/foo/:id', 500)          // from the access log
 *   errors.recordClient()                           // from POST /api/client-errors
 */

const { redactString } = require('./logger');

const WINDOW_MS = 60 * 60 * 1000; // "recent" = the last hour
const MAX_ROUTES = 100; // cap distinct route keys so a scan cannot grow memory
const MAX_STAMPS_PER_ROUTE = 500;

const jobs = new Map();

function blankJob(name) {
  return {
    name,
    schedule: null,
    enabled: false,
    disabledReason: null,
    running: false,
    runs: 0,
    failures: 0,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastDurationMs: null,
    lastStatus: null, // 'ok' | 'error'
    lastCounts: null, // { sent, failed, skipped }
    lastError: null, // { message, at }
    lastSuccessAt: null
  };
}

function ensure(name) {
  if (!jobs.has(name)) jobs.set(name, blankJob(name));
  return jobs.get(name);
}

/** Declare a job and whether this process schedules it. */
function register(name, { schedule = null, enabled = true, disabledReason = null } = {}) {
  const job = ensure(name);
  job.schedule = schedule;
  job.enabled = Boolean(enabled);
  job.disabledReason = enabled ? null : disabledReason;
  return job;
}

const errorText = (error) => redactString(String((error && error.message) || error || 'unknown error')).slice(0, 300);

/** Mark one run as started. Returns handles to finish or fail it (each once). */
function start(name, now = Date.now) {
  const job = ensure(name);
  const startedAt = now();
  job.running = true;
  job.lastStartedAt = new Date(startedAt).toISOString();
  let done = false;

  const close = (status) => {
    if (done) return false;
    done = true;
    const endedAt = now();
    job.running = false;
    job.runs += 1;
    job.lastFinishedAt = new Date(endedAt).toISOString();
    job.lastDurationMs = Math.max(0, endedAt - startedAt);
    job.lastStatus = status;
    return true;
  };

  return {
    finish(counts = {}) {
      if (!close('ok')) return;
      job.lastSuccessAt = job.lastFinishedAt;
      job.lastCounts = {
        sent: Number(counts.sent) || 0,
        failed: Number(counts.failed) || 0,
        skipped: Number(counts.skipped) || 0
      };
      // A run that finished but failed some sends still says why, once.
      if (counts.error) job.lastError = { message: errorText(counts.error), at: job.lastFinishedAt };
    },
    fail(error, counts) {
      if (!close('error')) return;
      job.failures += 1;
      if (counts) {
        job.lastCounts = {
          sent: Number(counts.sent) || 0,
          failed: Number(counts.failed) || 0,
          skipped: Number(counts.skipped) || 0
        };
      }
      job.lastError = { message: errorText(error), at: job.lastFinishedAt };
    }
  };
}

/** Record a per-item failure inside a run without failing the run. */
function noteError(name, error) {
  const job = ensure(name);
  job.lastError = { message: errorText(error), at: new Date().toISOString() };
}

function listJobs() {
  return [...jobs.values()].map((job) => ({ ...job })).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── recent errors ─────────────────────────────────────────────────────────

const routeErrors = new Map(); // key -> { route, stamps: number[], lastStatus, lastAt }
let clientStamps = [];
let droppedRoutes = 0;

const prune = (stamps, now) => {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < stamps.length && stamps[i] < cutoff) i++;
  return i ? stamps.slice(i) : stamps;
};

/** A server error answered on `route` (method + pattern, never a raw URL). */
function recordRouteError(route, status, now = Date.now()) {
  let entry = routeErrors.get(route);
  if (!entry) {
    if (routeErrors.size >= MAX_ROUTES) {
      // Evict whatever has gone quiet; if nothing has, count the drop.
      for (const [key, value] of routeErrors) {
        value.stamps = prune(value.stamps, now);
        if (!value.stamps.length) routeErrors.delete(key);
      }
      if (routeErrors.size >= MAX_ROUTES) {
        droppedRoutes += 1;
        return;
      }
    }
    entry = { route, stamps: [], lastStatus: null, lastAt: null };
    routeErrors.set(route, entry);
  }
  entry.stamps.push(now);
  if (entry.stamps.length > MAX_STAMPS_PER_ROUTE) entry.stamps.shift();
  entry.lastStatus = status;
  entry.lastAt = new Date(now).toISOString();
}

function recordClientError(now = Date.now()) {
  clientStamps = prune(clientStamps, now);
  clientStamps.push(now);
  if (clientStamps.length > 5000) clientStamps.shift();
}

function errorSummary(now = Date.now()) {
  const routes = [];
  for (const [key, entry] of routeErrors) {
    entry.stamps = prune(entry.stamps, now);
    if (!entry.stamps.length) {
      routeErrors.delete(key);
      continue;
    }
    routes.push({ route: entry.route, count: entry.stamps.length, lastStatus: entry.lastStatus, lastAt: entry.lastAt });
  }
  routes.sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
  clientStamps = prune(clientStamps, now);
  return {
    windowMinutes: WINDOW_MS / 60000,
    serverErrors: routes.reduce((sum, r) => sum + r.count, 0),
    clientErrors: clientStamps.length,
    routes,
    droppedRoutes
  };
}

/** Tests only. */
function reset() {
  jobs.clear();
  routeErrors.clear();
  clientStamps = [];
  droppedRoutes = 0;
}

module.exports = {
  jobs: { register, start, noteError, list: listJobs },
  errors: { record: recordRouteError, recordClient: recordClientError, summary: errorSummary },
  reset
};
