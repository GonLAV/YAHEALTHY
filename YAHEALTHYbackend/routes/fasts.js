/**
 * Fasts — a timer for intermittent fasting.
 *
 * /api/fasting-windows (index.js) stores the protocol someone prefers; this is
 * the thing they actually do: start a fast, end it, and see how it went. A user
 * has at most one open fast at a time.
 *
 *   POST   /api/fasts/start      { targetHours: 8–72, startedAt?: ISO }  → 201
 *   POST   /api/fasts/:id/end    { endedAt?: ISO }                       → 200
 *   GET    /api/fasts?limit=     newest first
 *   GET    /api/fasts/active     the open fast, or null
 *   GET    /api/fasts/stats      ?tz= (IANA zone) or ?tzOffsetMinutes= (as Date#getTimezoneOffset)
 *   DELETE /api/fasts/:id
 *
 * 🩺 This records time. It does not tell anyone whether or how long to fast.
 */

const express = require('express');
const { z } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');

const router = express.Router();

const MIN_TARGET_HOURS = 8;
const MAX_TARGET_HOURS = 72;
// A fast logged after the fact is ordinary ("I forgot to press start"), but a
// week back is a typo, and it would sit open forever blocking the next start.
const MAX_BACKDATE_MS = 7 * 24 * 3600 * 1000;
// Client clocks drift; a minute ahead is not "in the future".
const CLOCK_SKEW_MS = 60 * 1000;
const STATS_WINDOW_DAYS = 30;
const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;

// Mirrors safeErrorDetails in index.js: internal messages stay out of
// production responses.
function safeErrorDetails(error) {
  if (process.env.NODE_ENV === 'production') return undefined;
  return error && error.message;
}

function fail(res, req, message, error) {
  return res.status(500).json({ error: message, details: safeErrorDetails(error), requestId: req.id });
}

function badInput(res, req, issues) {
  return res.status(400).json({ error: 'Invalid input', details: issues, requestId: req.id });
}

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const startSchema = z
  .object({
    targetHours: z.number().finite().min(MIN_TARGET_HOURS).max(MAX_TARGET_HOURS),
    startedAt: isoDate.optional()
  })
  .strict();

const endSchema = z.object({ endedAt: isoDate.optional() }).strict();

const idSchema = z.string().uuid();

function round2(n) {
  return Math.round(n * 100) / 100;
}

function present(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    started_at: new Date(row.started_at).toISOString(),
    ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    target_hours: Number(row.target_hours),
    duration_hours: row.duration_hours === null || row.duration_hours === undefined ? null : Number(row.duration_hours),
    completed: Boolean(row.completed),
    created_at: row.created_at
  };
}

/**
 * YYYY-MM-DD of `date` on the caller's calendar. `zone` is either an IANA
 * time-zone name (preferred: right across DST changes) or a fixed offset in
 * minutes as returned by Date#getTimezoneOffset (legacy clients).
 */
function localDay(date, zone) {
  if (typeof zone === 'string') {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }
  return new Date(date.getTime() - zone * 60000).toISOString().slice(0, 10);
}

/** The calendar day before a YYYY-MM-DD string. */
function previousDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function computeStats(fasts, now, zone) {
  const ended = fasts.filter((f) => f.ended_at && f.duration_hours !== null);
  const completed = ended.filter((f) => f.completed);

  const since = now.getTime() - STATS_WINDOW_DAYS * 24 * 3600 * 1000;
  const recent = ended.filter((f) => new Date(f.ended_at).getTime() >= since);

  // A streak counts local days on which a completed fast ended. Today not
  // having one yet does not break it — the day is not over.
  // Walk calendar dates, not 24h steps, so a 23h/25h DST day can't skip or
  // repeat a day.
  const days = new Set(completed.map((f) => localDay(new Date(f.ended_at), zone)));
  let streak = 0;
  let day = localDay(now, zone);
  if (!days.has(day)) day = previousDay(day);
  while (days.has(day)) {
    streak += 1;
    day = previousDay(day);
  }

  return {
    totalCompleted: completed.length,
    currentStreakDays: streak,
    longestHours: ended.length ? round2(Math.max(...ended.map((f) => f.duration_hours))) : 0,
    averageHours: recent.length
      ? round2(recent.reduce((sum, f) => sum + f.duration_hours, 0) / recent.length)
      : null
  };
}

router.post('/start', auth.authMiddleware, async (req, res) => {
  try {
    const parsed = startSchema.safeParse(req.body || {});
    if (!parsed.success) return badInput(res, req, parsed.error.issues);

    const now = Date.now();
    const startedAt = parsed.data.startedAt || new Date(now);
    if (startedAt.getTime() > now + CLOCK_SKEW_MS) {
      return res.status(400).json({ error: 'startedAt cannot be in the future', requestId: req.id });
    }
    if (startedAt.getTime() < now - MAX_BACKDATE_MS) {
      return res.status(400).json({ error: 'startedAt is more than 7 days ago', requestId: req.id });
    }

    const created = await db.createFast(req.user.userId, {
      started_at: startedAt.toISOString(),
      target_hours: round2(parsed.data.targetHours)
    });
    if (!created) {
      const active = await db.getActiveFast(req.user.userId);
      return res
        .status(409)
        .json({ error: 'A fast is already in progress', active: present(active), requestId: req.id });
    }
    return res.status(201).json(present(created));
  } catch (error) {
    return fail(res, req, 'Failed to start fast', error);
  }
});

router.get('/active', auth.authMiddleware, async (req, res) => {
  try {
    return res.json(present(await db.getActiveFast(req.user.userId)));
  } catch (error) {
    return fail(res, req, 'Failed to get active fast', error);
  }
});

router.get('/stats', auth.authMiddleware, async (req, res) => {
  try {
    const { tz } = req.query;
    if (tz !== undefined && (typeof tz !== 'string' || !isValidTimeZone(tz))) {
      return res.status(400).json({ error: 'tz must be an IANA time zone, e.g. Asia/Jerusalem', requestId: req.id });
    }
    const rawOffset = req.query.tzOffsetMinutes;
    const tzOffsetMinutes = rawOffset === undefined ? 0 : Number(rawOffset);
    if (!Number.isInteger(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 14 * 60) {
      return res.status(400).json({ error: 'tzOffsetMinutes must be an integer between -840 and 840', requestId: req.id });
    }
    const fasts = (await db.getFasts(req.user.userId, { limit: 5000 })).map(present);
    return res.json(computeStats(fasts, new Date(), tz ?? tzOffsetMinutes));
  } catch (error) {
    return fail(res, req, 'Failed to get fasting stats', error);
  }
});

router.get('/', auth.authMiddleware, async (req, res) => {
  try {
    let limit = DEFAULT_LIST_LIMIT;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
        return res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_LIST_LIMIT}`, requestId: req.id });
      }
    }
    const fasts = await db.getFasts(req.user.userId, { limit });
    return res.json(fasts.map(present));
  } catch (error) {
    return fail(res, req, 'Failed to get fasts', error);
  }
});

router.post('/:id/end', auth.authMiddleware, async (req, res) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Fast not found', requestId: req.id });
    }
    const parsed = endSchema.safeParse(req.body || {});
    if (!parsed.success) return badInput(res, req, parsed.error.issues);

    const fast = await db.getFastById(req.params.id, req.user.userId);
    if (!fast) return res.status(404).json({ error: 'Fast not found', requestId: req.id });
    if (fast.ended_at) return res.status(409).json({ error: 'This fast has already ended', requestId: req.id });

    const now = Date.now();
    const endedAt = parsed.data.endedAt || new Date(now);
    const startedAt = new Date(fast.started_at);
    if (endedAt.getTime() > now + CLOCK_SKEW_MS) {
      return res.status(400).json({ error: 'endedAt cannot be in the future', requestId: req.id });
    }
    if (endedAt.getTime() < startedAt.getTime()) {
      return res.status(400).json({ error: 'endedAt cannot be before the fast started', requestId: req.id });
    }

    const exactHours = (endedAt.getTime() - startedAt.getTime()) / 3600000;
    const ended = await db.endFast(req.params.id, req.user.userId, {
      ended_at: endedAt.toISOString(),
      duration_hours: round2(exactHours),
      // Judged on the exact time, so 15h59m59s does not round up into a 16h fast.
      completed: exactHours >= Number(fast.target_hours)
    });
    // Someone else (another tab) ended it between the read and the write.
    if (!ended) return res.status(409).json({ error: 'This fast has already ended', requestId: req.id });
    return res.json(present(ended));
  } catch (error) {
    return fail(res, req, 'Failed to end fast', error);
  }
});

router.delete('/:id', auth.authMiddleware, async (req, res) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Fast not found', requestId: req.id });
    }
    const removed = await db.deleteFast(req.params.id, req.user.userId);
    if (!removed) return res.status(404).json({ error: 'Fast not found', requestId: req.id });
    return res.json({ message: 'Fast deleted', id: req.params.id });
  } catch (error) {
    return fail(res, req, 'Failed to delete fast', error);
  }
});

module.exports = router;
module.exports._internal = { computeStats, localDay, previousDay };
