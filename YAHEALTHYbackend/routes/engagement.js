/**
 * Engagement API — streaks, daily Health Score, achievements.
 *
 *   GET /api/engagement/summary?lang=he|en&tz=Asia/Jerusalem
 *
 * Thin I/O wrapper: reads the user's logs and targets through
 * utils/database.js (works against Supabase and the ALLOW_MEMORY_DB store
 * alike) and hands them to the pure utils/engagement.js.
 */

const express = require('express');
const auth = require('../utils/auth');
const db = require('../utils/database');
const { buildEngagementSummary, addDays, localDate, isValidTimeZone } = require('../utils/engagement');

const router = express.Router();

// A year of food history is enough for every streak/achievement shown and
// keeps the query bounded for heavy loggers.
const HISTORY_DAYS = 400;

const safe = (p) => Promise.resolve(p).then((v) => v || []).catch(() => []);

async function loadInputs(userId, tz) {
  const start = addDays(localDate(new Date(), tz), -HISTORY_DAYS);
  const [foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals, survey, prefs] = await Promise.all([
    safe(db.getFoodLogs(userId, { start })),
    safe(db.getHydrationLogs(userId)),
    safe(db.getSleepLogs(userId)),
    safe(db.getWeightLogs(userId)),
    safe(db.getWeightGoals(userId)),
    db.getLatestSurvey(userId).catch(() => null),
    db.getUserPreferences(userId).catch(() => null)
  ]);

  const goals = {
    calorieTarget: prefs?.macroTargets?.calorieOverride ?? survey?.daily_calories?.targetDailyCalories ?? null,
    waterTargetLiters: prefs?.waterTargetLiters ?? survey?.water_target_liters ?? null,
    sleepTargetHours: prefs?.sleepTargetHours ?? survey?.sleep_target_hours ?? null
  };

  return { foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals, goals };
}

router.get('/summary', auth.authMiddleware, async (req, res) => {
  const lang = req.query.lang === 'he' ? 'he' : 'en';
  const tzRaw = typeof req.query.tz === 'string' ? req.query.tz : '';
  if (tzRaw && !isValidTimeZone(tzRaw)) {
    return res.status(400).json({ error: 'Invalid time zone', details: 'tz must be an IANA zone such as Asia/Jerusalem', requestId: req.id });
  }
  const tz = tzRaw || 'UTC';

  try {
    const inputs = await loadInputs(req.user.userId, tz);
    const summary = buildEngagementSummary({ ...inputs, tz, lang, now: new Date() });
    return res.json(summary);
  } catch (error) {
    console.error('engagement summary failed:', error && error.message);
    return res.status(500).json({ error: 'Failed to build engagement summary', requestId: req.id });
  }
});

module.exports = router;
