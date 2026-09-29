/**
 * POST /api/client-errors — crash reports from the browser app.
 *
 * The frontend's error boundary and its window.onerror / unhandledrejection
 * hooks (YAHEALTHYFrontend/src/utils/errorReporting.ts) send a small JSON
 * report here; this logs it server-side (logger `warn`, "client error") and
 * counts it for GET /api/admin/health.
 *
 * Public on purpose (a crash can happen before sign-in), so it is defended:
 *   - rate-limited per IP (CLIENT_ERROR_RATE_LIMIT_MAX per 15 min, default 30);
 *   - the body is capped at 8 KB before parsing (413 above that) and every
 *     field is truncated;
 *   - no identity is attached: no user id, no IP, no user agent, and the
 *     text goes through the logger's redaction (emails, phones, tokens);
 *     paths are reduced to their route shape (no query, no /s/ tokens).
 * Mounted in index.js BEFORE the global JSON parser so its own limit applies.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { sanitizePath } = require('../middleware/accessLog');
const { errors } = require('../utils/health-registry');

const MAX_BODY = '8kb';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CLIENT_ERROR_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many error reports' }
});

const text = (max) =>
  z
    .string()
    .transform((s) => s.slice(0, max))
    .optional();

const reportSchema = z.object({
  kind: z.enum(['error', 'unhandledrejection', 'boundary']),
  message: z.string().min(1).transform((s) => s.slice(0, 500)),
  name: text(100),
  stack: text(4000),
  componentStack: text(2000),
  path: text(300),
  source: text(300),
  line: z.number().int().nonnegative().max(1e7).optional(),
  col: z.number().int().nonnegative().max(1e7).optional(),
  lang: z.enum(['he', 'en']).optional(),
  release: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .optional()
});

/** A script URL reduced to its file path: no origin, query or hash. */
function sourceFile(value) {
  if (!value) return undefined;
  try {
    return sanitizePath(new URL(value, 'http://x').pathname);
  } catch {
    return undefined;
  }
}

const router = express.Router();

router.post(
  '/',
  limiter,
  // sendBeacon posts text/plain; both are parsed as JSON.
  express.json({ limit: MAX_BODY, type: ['application/json', 'text/plain'] }),
  (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid report', requestId: req.id });
    }
    const r = parsed.data;
    errors.recordClient();
    req.log.warn('client error', {
      kind: r.kind,
      name: r.name,
      message: r.message,
      page: r.path ? sanitizePath(r.path) : undefined,
      source: sourceFile(r.source),
      line: r.line,
      col: r.col,
      lang: r.lang,
      release: r.release,
      stack: r.stack,
      componentStack: r.componentStack
    });
    return res.status(204).end();
  }
);

module.exports = router;
module.exports.MAX_BODY = MAX_BODY;
