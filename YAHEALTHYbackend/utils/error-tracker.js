/**
 * Optional error reporting to Sentry (or anything that speaks its envelope
 * protocol: self-hosted Sentry, GlitchTip). OFF unless SENTRY_DSN is set.
 *
 * Why a ~150-line fetch instead of @sentry/node:
 *   - Default-off means most deploys would carry the SDK and never use it. It
 *     is a sizeable dependency tree and instruments/patches http, fetch,
 *     console and the process handlers on import — behaviour we would have to
 *     audit against every route that handles health data.
 *   - We need exactly one thing: "this server error happened, with this
 *     request id". The envelope endpoint is a stable, documented HTTP API,
 *     and Node 18+ has fetch built in, so this adds no dependency at all.
 *   - Everything sent goes through the same redaction as the logs
 *     (utils/logger.js `redact`): no emails, phones, tokens or bodies. No
 *     request body, headers, cookies or user identity are ever attached.
 * If richer features are wanted later (tracing, breadcrumbs), swap this
 * module for the SDK; callers only use captureException/flush/isEnabled.
 *
 * Sending is fire-and-forget with a short timeout, capped per minute, and
 * backs off when Sentry answers 429. It never throws into the caller.
 */

const { randomUUID } = require('crypto');
const { redact, redactString } = require('./logger');
const version = require('./version');

const MAX_EVENTS_PER_MINUTE = 30;
const TIMEOUT_MS = 3000;

let parsed; // undefined: not read · null: disabled · object
const pending = new Set();
let windowStart = 0;
let windowCount = 0;
let blockedUntil = 0;

/** https://<key>@<host>[/<path>]/<projectId> → endpoint + key, or null. */
function parseDsn(dsn) {
  if (typeof dsn !== 'string' || !dsn.trim()) return null;
  try {
    const url = new URL(dsn.trim());
    const key = decodeURIComponent(url.username);
    const parts = url.pathname.split('/').filter(Boolean);
    const projectId = parts.pop();
    if (!key || !projectId || !/^\d+$/.test(projectId)) return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const prefix = parts.length ? `/${parts.join('/')}` : '';
    return {
      key,
      projectId,
      endpoint: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`
    };
  } catch {
    return null;
  }
}

function config() {
  if (parsed === undefined) parsed = parseDsn(process.env.SENTRY_DSN);
  return parsed;
}

function isEnabled() {
  return Boolean(config());
}

/** Node stack text → Sentry frames (oldest call first, as Sentry expects). */
function framesFrom(stack) {
  const frames = [];
  for (const line of String(stack || '').split('\n').slice(1, 40)) {
    const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    const filename = m[2];
    frames.push({
      function: m[1] || '<anonymous>',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:')
    });
  }
  return frames.reverse();
}

function allowed(now) {
  if (now < blockedUntil) return false;
  if (now - windowStart > 60000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount <= MAX_EVENTS_PER_MINUTE;
}

/**
 * Report an error. `context` may carry { requestId, route, method, kind,
 * level, extra } — all redacted before sending. Returns a promise that
 * resolves to true when Sentry accepted it (false when disabled/dropped).
 */
function captureException(error, context = {}, { fetchImpl = globalThis.fetch } = {}) {
  const cfg = config();
  if (!cfg || typeof fetchImpl !== 'function') return Promise.resolve(false);
  const now = Date.now();
  if (!allowed(now)) return Promise.resolve(false);

  const err = error instanceof Error ? error : new Error(String(error));
  const eventId = randomUUID().replace(/-/g, '');
  const tags = {};
  for (const k of ['requestId', 'route', 'method', 'kind']) {
    if (context[k]) tags[k] = redactString(String(context[k])).slice(0, 200);
  }

  const event = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: 'node',
    level: context.level || 'error',
    logger: 'yahealthy',
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: version.commit || version.app,
    tags,
    extra: context.extra ? redact(context.extra) : undefined,
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: redactString(String(err.message || '')).slice(0, 1000),
          stacktrace: { frames: framesFrom(redactString(String(err.stack || ''))) }
        }
      ]
    }
  };

  const body = [
    JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event)
  ].join('\n') + '\n';

  const request = fetchImpl(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${cfg.key}, sentry_client=yahealthy-min/1.0`
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
    .then((res) => {
      if (res.status === 429) {
        const retry = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 60;
        blockedUntil = Date.now() + retry * 1000;
      }
      return res.ok;
    })
    .catch(() => false)
    .finally(() => pending.delete(request));
  pending.add(request);
  return request;
}

/** Wait (up to timeoutMs) for reports still in flight — before process exit. */
async function flush(timeoutMs = 2000) {
  if (!pending.size) return true;
  const all = Promise.allSettled([...pending]).then(() => true);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs).unref());
  return Promise.race([all, timeout]);
}

/** Tests only: re-read SENTRY_DSN and clear the rate window. */
function reset() {
  parsed = undefined;
  windowStart = 0;
  windowCount = 0;
  blockedUntil = 0;
}

module.exports = { captureException, flush, isEnabled, parseDsn, reset };
