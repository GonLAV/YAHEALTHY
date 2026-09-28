/**
 * Engagement layer — streaks, a daily Health Score and achievements.
 *
 * Pure functions only: everything here takes the raw rows the app already
 * stores (food / hydration / sleep / weight logs, weight goals) plus the
 * user's targets, and returns plain data. No database, no clock reads unless
 * the caller leaves `now` out, so every rule below is unit-testable
 * (tests/engagement.test.js) and the route (routes/engagement.js) stays thin.
 *
 * 🩺 The Health Score is a habit/consistency score for motivation. It says
 * how close the day's LOGGED numbers came to the user's own targets. It is
 * not a medical assessment, a diagnosis or advice, and the copy that
 * surfaces it must not present it as one.
 *
 * Dates: everything is keyed by the user's LOCAL calendar date (YYYY-MM-DD).
 *  - Rows that carry an explicit `date` (food, hydration, sleep) are trusted
 *    as-is — that is the day the user logged it for (and may be backdated).
 *  - Rows with only a timestamp (weight logs) are converted to the local date
 *    in the caller's IANA time zone.
 *  - "Today" is `now` in that time zone, so a user in Jerusalem at 01:30 is
 *    already on the next day even though UTC is not.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fallback targets when the user has no survey / preferences yet. */
const DEFAULT_GOALS = Object.freeze({
  calorieTarget: null,    // no default: without a target we only reward logging
  waterTargetLiters: 2.5, // same default the Hydration page shows
  sleepTargetHours: 8     // same default the Dashboard sleep bar shows
});

/**
 * Health Score weights (sum = 100). Each component is scored 0–100 and the
 * day's score is the weighted average, so the breakdown the UI shows adds up
 * exactly to the headline number (points = score × weight / 100).
 */
const SCORE_WEIGHTS = Object.freeze({
  nutrition: 35,   // food logged, and how close calories are to the target
  hydration: 25,   // liters vs. water goal (capped at 100%)
  sleep: 25,       // hours vs. sleep target (capped at 100%, extra sleep not rewarded or penalised)
  consistency: 15  // share of the last 7 days (incl. this one) with any log
});

/**
 * Nutrition scoring:
 *  - nothing logged → 0
 *  - calorie target known → 100 within ±10 % of it, then linear down to 0 at
 *    ±50 % (so both far-under and far-over lose points equally)
 *  - no calorie target → reward the logging habit: 1 meal slot = 50,
 *    2 = 80, 3+ = 100
 */
const NUTRITION_BAND = Object.freeze({ full: 0.10, zero: 0.50 });
const NUTRITION_NO_TARGET = [0, 50, 80, 100];

/** A "perfect day": food logged + water goal hit + sleep target hit. */

// ─── date helpers ──────────────────────────────────────────────────────────

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD) of an instant in `tz` (falls back to UTC). */
function localDate(instant, tz = 'UTC') {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAY_MS);
}

/** The local date a row belongs to: its `date` field if valid, else its timestamp in tz. */
function rowDate(row, tz) {
  const explicit = String(row?.date || '').slice(0, 10);
  if (ISO_DATE.test(explicit)) return explicit;
  const ts = row?.logged_at || row?.created_at;
  return ts ? localDate(ts, tz) : null;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ─── per-day aggregation ───────────────────────────────────────────────────

/**
 * Fold every log into one record per local date (dates after `today` are
 * dropped — a future-dated row must not extend a streak).
 */
function buildDays({ foodLogs = [], hydrationLogs = [], sleepLogs = [], weightLogs = [] }, tz, today) {
  const days = new Map();
  const day = (d) => {
    if (!days.has(d)) {
      days.set(d, { date: d, foodEntries: 0, calories: 0, mealTypes: new Set(), liters: 0, hydrationEntries: 0, sleepHours: 0, sleepEntries: 0, weighIns: 0 });
    }
    return days.get(d);
  };
  const keep = (d) => d && d <= today;

  for (const r of foodLogs || []) {
    const d = rowDate(r, tz);
    if (!keep(d)) continue;
    const rec = day(d);
    rec.foodEntries++;
    rec.calories += num(r.calories);
    rec.mealTypes.add(r.meal_type || r.mealType || `entry-${rec.foodEntries}`);
  }
  for (const r of hydrationLogs || []) {
    const d = rowDate(r, tz);
    if (!keep(d)) continue;
    const rec = day(d);
    rec.hydrationEntries++;
    rec.liters += num(r.liters_consumed);
  }
  for (const r of sleepLogs || []) {
    const d = rowDate(r, tz);
    if (!keep(d)) continue;
    const rec = day(d);
    rec.sleepEntries++;
    rec.sleepHours += num(r.sleep_hours);
  }
  for (const r of weightLogs || []) {
    const d = rowDate(r, tz);
    if (!keep(d)) continue;
    day(d).weighIns++;
  }
  return days;
}

const habitChecks = (goals) => ({
  food: (r) => r.foodEntries > 0,
  hydration: (r) => r.liters >= goals.waterTargetLiters,
  sleep: (r) => r.sleepEntries > 0 && r.sleepHours >= goals.sleepTargetHours,
  anyLog: (r) => r.foodEntries + r.hydrationEntries + r.sleepEntries + r.weighIns > 0
});

const isPerfectDay = (r, goals) =>
  r.foodEntries > 0 && r.liters >= goals.waterTargetLiters && r.sleepEntries > 0 && r.sleepHours >= goals.sleepTargetHours;

// ─── streaks ───────────────────────────────────────────────────────────────

/**
 * Current and best run of consecutive dates in `dates` (a Set of YYYY-MM-DD).
 *
 * Today not being logged yet does NOT break the streak: if today is missing
 * but yesterday is present, the current streak is the run ending yesterday
 * and `atRisk` is true (the "don't break your streak" nudge). A gap of a full
 * day before yesterday resets it to 0.
 */
function computeStreak(dates, today) {
  const sorted = Array.from(dates).filter((d) => d <= today).sort();
  let best = 0;
  let run = 0;
  let bestEnd = null;
  let prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > best) {
      best = run;
      bestEnd = d;
    }
    prev = d;
  }

  const todayDone = dates.has(today);
  let anchor = todayDone ? today : addDays(today, -1);
  let current = 0;
  while (dates.has(anchor)) {
    current++;
    anchor = addDays(anchor, -1);
  }

  return {
    current,
    best,
    bestEndedOn: bestEnd,
    todayDone,
    atRisk: current > 0 && !todayDone,
    lastDate: sorted.length ? sorted[sorted.length - 1] : null
  };
}

function computeStreaks(days, goals, today) {
  const checks = habitChecks(goals);
  const out = {};
  for (const [habit, test] of Object.entries(checks)) {
    const set = new Set();
    for (const rec of days.values()) if (test(rec)) set.add(rec.date);
    out[habit] = computeStreak(set, today);
  }
  return out;
}

// ─── Health Score ──────────────────────────────────────────────────────────

function nutritionScore(rec, calorieTarget) {
  if (!rec || rec.foodEntries === 0) return 0;
  if (calorieTarget && calorieTarget > 0) {
    const dev = Math.abs(rec.calories - calorieTarget) / calorieTarget;
    if (dev <= NUTRITION_BAND.full) return 100;
    if (dev >= NUTRITION_BAND.zero) return 0;
    return Math.round(100 * (1 - (dev - NUTRITION_BAND.full) / (NUTRITION_BAND.zero - NUTRITION_BAND.full)));
  }
  return NUTRITION_NO_TARGET[Math.min(3, rec.mealTypes.size)];
}

/**
 * Score one local date. Returns the 0–100 headline plus the component
 * breakdown (each with its 0–100 score, weight, and points contributed).
 */
function scoreDay(days, date, goals) {
  const rec = days.get(date) || null;
  const water = rec ? rec.liters : 0;
  const sleep = rec && rec.sleepEntries > 0 ? rec.sleepHours : 0;

  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const r = days.get(addDays(date, -i));
    if (r && r.foodEntries + r.hydrationEntries + r.sleepEntries + r.weighIns > 0) activeDays++;
  }

  const raw = {
    nutrition: {
      score: nutritionScore(rec, goals.calorieTarget),
      value: rec ? Math.round(rec.calories) : 0,
      target: goals.calorieTarget || null,
      unit: 'kcal'
    },
    hydration: {
      score: Math.round(100 * clamp(water / goals.waterTargetLiters, 0, 1)),
      value: Math.round(water * 100) / 100,
      target: goals.waterTargetLiters,
      unit: 'L'
    },
    sleep: {
      score: Math.round(100 * clamp(sleep / goals.sleepTargetHours, 0, 1)),
      value: Math.round(sleep * 10) / 10,
      target: goals.sleepTargetHours,
      unit: 'h'
    },
    consistency: {
      score: Math.round((100 * activeDays) / 7),
      value: activeDays,
      target: 7,
      unit: 'days'
    }
  };

  const components = Object.entries(SCORE_WEIGHTS).map(([key, weight]) => ({
    key,
    weight,
    ...raw[key],
    points: Math.round((raw[key].score * weight) / 10) / 10
  }));
  const total = components.reduce((s, c) => s + (c.score * c.weight) / 100, 0);
  return { date, score: clamp(Math.round(total), 0, 100), components };
}

// ─── achievements ──────────────────────────────────────────────────────────

/**
 * Catalogue. `kind` decides how progress/unlock date are derived:
 *  - count:   number of qualifying days (or entries) — unlocked on the Nth
 *  - streak:  longest run of the anyLog habit — unlocked the day the run hit N
 *  - weight:  kg below the goal's starting weight (needs a weight goal)
 */
const ACHIEVEMENTS = [
  { id: 'first-log', icon: 'sparkles', kind: 'count', source: 'logDays', target: 1 },
  { id: 'streak-3', icon: 'flame', kind: 'streak', target: 3 },
  { id: 'streak-7', icon: 'flame', kind: 'streak', target: 7 },
  { id: 'streak-30', icon: 'trophy', kind: 'streak', target: 30 },
  { id: 'meals-25', icon: 'utensils', kind: 'count', source: 'foodEntries', target: 25 },
  { id: 'century', icon: 'medal', kind: 'count', source: 'foodEntries', target: 100 },
  { id: 'hydration-hero', icon: 'droplets', kind: 'count', source: 'hydrationDays', target: 7 },
  { id: 'sleep-champion', icon: 'moon', kind: 'count', source: 'sleepDays', target: 7 },
  { id: 'perfect-day', icon: 'star', kind: 'count', source: 'perfectDays', target: 1 },
  { id: 'perfect-5', icon: 'crown', kind: 'count', source: 'perfectDays', target: 5 },
  { id: 'weigh-in-4', icon: 'scale', kind: 'count', source: 'weighInDays', target: 4 },
  { id: 'first-kg-down', icon: 'trending-down', kind: 'weight', target: 1 }
];

const STRINGS = {
  en: {
    'first-log': ['First Step', 'Log anything for the first time'],
    'streak-3': ['Warming Up', 'Log something 3 days in a row'],
    'streak-7': ['Week Warrior', 'Log something 7 days in a row'],
    'streak-30': ['Month Master', 'Log something 30 days in a row'],
    'meals-25': ['Getting the Habit', 'Log 25 foods'],
    century: ['Century Club', 'Log 100 foods'],
    'hydration-hero': ['Hydration Hero', 'Hit your water goal on 7 days'],
    'sleep-champion': ['Sleep Champion', 'Reach your sleep target on 7 nights'],
    'perfect-day': ['Perfect Day', 'Food logged, water goal and sleep target — all in one day'],
    'perfect-5': ['Five Perfect Days', 'Have 5 perfect days'],
    'weigh-in-4': ['Regular Weigh-ins', 'Log your weight on 4 different days'],
    'first-kg-down': ['First Kilo Down', 'Be 1 kg below your weight-goal starting point'],
    next: (title, remaining) => `${remaining} more to unlock “${title}”`,
    allDone: 'Every achievement unlocked — amazing consistency!'
  },
  he: {
    'first-log': ['צעד ראשון', 'רשמו משהו בפעם הראשונה'],
    'streak-3': ['מתחממים', 'רשמו משהו 3 ימים ברצף'],
    'streak-7': ['לוחם שבועי', 'רשמו משהו 7 ימים ברצף'],
    'streak-30': ['אלוף החודש', 'רשמו משהו 30 ימים ברצף'],
    'meals-25': ['נכנסים להרגל', 'רשמו 25 מאכלים'],
    century: ['מועדון המאה', 'רשמו 100 מאכלים'],
    'hydration-hero': ['גיבור השתייה', 'עמדו ביעד המים ב-7 ימים'],
    'sleep-champion': ['אלוף השינה', 'הגיעו ליעד השינה ב-7 לילות'],
    'perfect-day': ['יום מושלם', 'רישום מזון, יעד מים ויעד שינה — הכול באותו יום'],
    'perfect-5': ['חמישה ימים מושלמים', 'צברו 5 ימים מושלמים'],
    'weigh-in-4': ['שקילות קבועות', 'רשמו משקל ב-4 ימים שונים'],
    'first-kg-down': ['הקילו הראשון ירד', 'היו קילו אחד מתחת למשקל ההתחלתי של היעד'],
    next: (title, remaining) => `עוד ${remaining} כדי לפתוח את „${title}”`,
    allDone: 'פתחתם את כל ההישגים — התמדה מדהימה!'
  }
};

/** Date the Nth element of an ascending date list was reached, or null. */
const nthDate = (sortedDates, n) => (sortedDates.length >= n ? sortedDates[n - 1] : null);

/** First date a consecutive run reached `n` days, or null. */
function streakReachedOn(sortedDates, n) {
  let run = 0;
  let prev = null;
  for (const d of sortedDates) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run >= n) return d;
    prev = d;
  }
  return null;
}

function computeAchievements({ days, goals, streaks, weightLogs, weightGoals, tz, lang }) {
  const S = STRINGS[lang] || STRINGS.en;
  const sortedDays = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
  const datesWhere = (fn) => sortedDays.filter(fn).map((r) => r.date);

  const foodEntryDates = [];
  for (const r of sortedDays) for (let i = 0; i < r.foodEntries; i++) foodEntryDates.push(r.date);

  const checks = habitChecks(goals);
  const sources = {
    logDays: datesWhere(checks.anyLog),
    foodEntries: foodEntryDates,
    hydrationDays: datesWhere(checks.hydration),
    sleepDays: datesWhere(checks.sleep),
    perfectDays: datesWhere((r) => isPerfectDay(r, goals)),
    weighInDays: datesWhere((r) => r.weighIns > 0)
  };

  // Weight: goal's starting weight (else the earliest weigh-in) minus each later log.
  const goal = (weightGoals || [])[0] || null;
  const weights = (weightLogs || [])
    .map((w) => ({ date: rowDate(w, tz), kg: Number(w.weight_kg), at: String(w.created_at || w.date || '') }))
    .filter((w) => w.date && Number.isFinite(w.kg))
    .sort((a, b) => a.at.localeCompare(b.at));
  const startKg = goal && Number.isFinite(Number(goal.start_weight_kg))
    ? Number(goal.start_weight_kg)
    : (weights[0]?.kg ?? null);

  return ACHIEVEMENTS.map((a) => {
    let current = 0;
    let unlockedAt = null;
    let available = true;

    if (a.kind === 'count') {
      const list = sources[a.source];
      current = list.length;
      unlockedAt = nthDate(list, a.target);
    } else if (a.kind === 'streak') {
      current = streaks.anyLog.best;
      unlockedAt = streakReachedOn(sources.logDays, a.target);
    } else if (a.kind === 'weight') {
      available = !!goal;
      if (available && startKg != null && weights.length) {
        const bestLoss = Math.max(0, ...weights.map((w) => startKg - w.kg));
        current = Math.round(bestLoss * 10) / 10;
        const hit = weights.find((w) => startKg - w.kg >= a.target);
        unlockedAt = hit ? hit.date : null;
      }
    }

    const [title, description] = S[a.id];
    return {
      id: a.id,
      icon: a.icon,
      title,
      description,
      available,
      unlocked: !!unlockedAt,
      unlockedAt,
      progress: { current: Math.min(current, a.target), target: a.target }
    };
  });
}

function pickNextMilestone(achievements, lang) {
  const S = STRINGS[lang] || STRINGS.en;
  const locked = achievements.filter((a) => a.available && !a.unlocked);
  if (!locked.length) return { id: null, message: S.allDone };
  locked.sort((a, b) => {
    const ra = a.progress.current / a.progress.target;
    const rb = b.progress.current / b.progress.target;
    if (rb !== ra) return rb - ra;
    return (a.progress.target - a.progress.current) - (b.progress.target - b.progress.current);
  });
  const n = locked[0];
  const remaining = Math.max(0, n.progress.target - n.progress.current);
  const remainingLabel = Number.isInteger(remaining) ? remaining : Math.round(remaining * 10) / 10;
  return {
    id: n.id,
    icon: n.icon,
    title: n.title,
    description: n.description,
    current: n.progress.current,
    target: n.progress.target,
    remaining: remainingLabel,
    message: S.next(n.title, remainingLabel)
  };
}

// ─── entry point ───────────────────────────────────────────────────────────

function resolveGoals(goals = {}) {
  const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    calorieTarget: pos(goals.calorieTarget) ?? DEFAULT_GOALS.calorieTarget,
    waterTargetLiters: pos(goals.waterTargetLiters) ?? DEFAULT_GOALS.waterTargetLiters,
    sleepTargetHours: pos(goals.sleepTargetHours) ?? DEFAULT_GOALS.sleepTargetHours
  };
}

/**
 * Build the whole engagement summary.
 *
 * @param {object} input
 * @param {Array}  input.foodLogs, input.hydrationLogs, input.sleepLogs, input.weightLogs, input.weightGoals
 * @param {object} input.goals  { calorieTarget, waterTargetLiters, sleepTargetHours }
 * @param {Date}   [input.now]  defaults to the current time
 * @param {string} [input.tz]   IANA time zone; invalid/missing → UTC
 * @param {string} [input.lang] 'he' | 'en'
 */
function buildEngagementSummary(input = {}) {
  const tz = isValidTimeZone(input.tz) ? input.tz : 'UTC';
  const lang = input.lang === 'he' ? 'he' : 'en';
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const today = localDate(now, tz);
  const goals = resolveGoals(input.goals);

  const days = buildDays(input, tz, today);
  const streaks = computeStreaks(days, goals, today);

  const trend7d = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    trend7d.push({ date: d, score: scoreDay(days, d, goals).score });
  }
  const todayScore = scoreDay(days, today, goals);

  const achievements = computeAchievements({
    days, goals, streaks, weightLogs: input.weightLogs, weightGoals: input.weightGoals, tz, lang
  });

  return {
    today,
    tz,
    lang,
    goals,
    healthScore: {
      today: todayScore.score,
      components: todayScore.components,
      trend7d,
      weights: { ...SCORE_WEIGHTS }
    },
    streaks,
    achievements,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    nextMilestone: pickNextMilestone(achievements, lang)
  };
}

module.exports = {
  buildEngagementSummary,
  computeStreak,
  scoreDay,
  buildDays,
  localDate,
  addDays,
  rowDate,
  isValidTimeZone,
  resolveGoals,
  ACHIEVEMENTS,
  SCORE_WEIGHTS,
  DEFAULT_GOALS
};
