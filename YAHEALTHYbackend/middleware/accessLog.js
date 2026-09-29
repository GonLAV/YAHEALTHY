/**
 * One log line per request: method, route PATTERN, status, duration, request id.
 *
 * The route is the Express pattern that matched (`/s/:token`, not
 * `/s/Ab3...`), so share tokens, ids and emails in URLs never reach the log.
 * Requests that matched no route (404s, static files) fall back to
 * `sanitizePath`, which masks anything id- or token-shaped. The query string
 * is never logged.
 *
 * Server errors (5xx) are also counted per route in utils/health-registry.js
 * for GET /api/admin/health.
 */

const logger = require('../utils/logger');
const { errors } = require('../utils/health-registry');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeSegment(seg, index, all) {
  if (!seg || seg.startsWith(':')) return seg;
  // Whatever directly follows a leading /s/ is a share token, whatever it looks like.
  if (index === 2 && all[0] === '' && all[1] === 's') return ':token';
  let decoded = seg;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    return ':param';
  }
  if (decoded.includes('@')) return ':email';
  if (UUID.test(decoded)) return ':id';
  if (/^\+?\d[\d-]{3,}$/.test(decoded)) return ':id';
  if (decoded.length >= 16 && /^[A-Za-z0-9_.~+=-]+$/.test(decoded)) return ':token';
  if (/[^A-Za-z0-9_.-]/.test(decoded)) return ':param';
  if (decoded.length > 40) return ':param';
  return seg;
}

/** Masks id/token/email-shaped segments of a path; drops the query. */
function sanitizePath(rawPath) {
  const pathOnly = String(rawPath || '/').split(/[?#]/)[0].slice(0, 300);
  const segments = pathOnly.split('/');
  const clean = segments.slice(0, 12).map(sanitizeSegment);
  if (segments.length > 12) clean.push('...');
  return clean.join('/') || '/';
}

/** The matched route pattern, or a sanitized path when nothing matched. */
function routeOf(req) {
  const route = req.route && req.route.path;
  if (typeof route === 'string') {
    const base = req.baseUrl || '';
    const joined = route === '/' && base ? base : `${base}${route}`;
    return sanitizePath(joined || '/');
  }
  return sanitizePath(req.originalUrl || req.url);
}

// Health probes run every few seconds; they are only worth a line at debug.
const QUIET = new Set(['/api/health', '/api/ready']);

function accessLog(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - started) / 1000n) / 1000;
    const route = routeOf(req);
    const status = res.statusCode;
    if (status >= 500) errors.record(`${req.method} ${route}`, status);
    const level = status >= 500 ? 'warn' : QUIET.has(route) ? 'debug' : 'info';
    logger[level]('request', {
      requestId: req.id,
      method: req.method,
      route,
      status,
      durationMs: Math.round(durationMs * 10) / 10
    });
  });
  next();
}

module.exports = { accessLog, sanitizePath, routeOf };
