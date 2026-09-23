/**
 * Weekly health-progress summary emails.
 *
 * Scheduled from index.js for Sunday 08:00 (Asia/Jerusalem): every user gets a
 * plain-text digest of the week that just ended — logging days, calories,
 * protein, hydration, sleep, weight change and streak. The same send path is
 * exposed through POST /api/summary/weekly/test for the logged-in user, so
 * the flow can be verified without waiting for Sunday.
 */

const db = require('./database');
const mailer = require('./mailer');
const { calculateStreak } = require('./health-calculations');

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(date) {
  return date.toISOString().split('T')[0];
}

/** The seven days before `now` — on Sunday morning that is the full past week. */
function weekRange(now = new Date()) {
  return {
    start: isoDate(new Date(now.getTime() - 7 * DAY_MS)),
    end: isoDate(new Date(now.getTime() - DAY_MS))
  };
}

function inRange(date, start, end) {
  const d = String(date || '').slice(0, 10);
  return d >= start && d <= end;
}

const round1 = (n) => Math.round(n * 10) / 10;

async function buildWeeklySummary(userId, now = new Date()) {
  const { start, end } = weekRange(now);

  const weekFoodLogs = (await db.getFoodLogs(userId, { start, end })) || [];
  const allFoodLogs = (await db.getFoodLogs(userId)) || [];
  const hydrationLogs = ((await db.getHydrationLogs(userId)) || [])
    .filter((r) => inRange(r.date, start, end));
  const sleepLogs = ((await db.getSleepLogs(userId)) || [])
    .filter((r) => inRange(r.date, start, end));
  const weightLogs = ((await db.getWeightLogs(userId)) || [])
    .filter((r) => inRange(r.date || r.created_at, start, end))
    .sort((a, b) =>
      String(a.date || a.created_at).localeCompare(String(b.date || b.created_at)));

  const survey = await db.getLatestSurvey(userId);
  const calorieTarget = survey?.daily_calories?.targetDailyCalories || null;
  const proteinTarget = survey?.protein_target_g || null;

  const loggedDates = new Set(weekFoodLogs.map((l) => l.date));
  const loggedDays = loggedDates.size;
  const totalCalories = weekFoodLogs.reduce((sum, l) => sum + (l.calories || 0), 0);
  const totalProtein = weekFoodLogs.reduce((sum, l) => sum + (l.protein_grams || 0), 0);

  const totalLiters = hydrationLogs.reduce((sum, l) => sum + (l.liters_consumed || 0), 0);
  const sleepTotal = sleepLogs.reduce((sum, l) => sum + (l.sleep_hours || 0), 0);

  const weightChange = weightLogs.length >= 2
    ? round1(weightLogs[weightLogs.length - 1].weight_kg - weightLogs[0].weight_kg)
    : null;

  return {
    range: { start, end },
    loggedDays,
    totalCalories,
    avgCalories: loggedDays ? Math.round(totalCalories / loggedDays) : 0,
    avgProtein: loggedDays ? Math.round(totalProtein / loggedDays) : 0,
    calorieTarget,
    proteinTarget,
    totalLiters: round1(totalLiters),
    avgLiters: round1(totalLiters / 7),
    nightsLogged: sleepLogs.length,
    avgSleep: sleepLogs.length ? round1(sleepTotal / sleepLogs.length) : 0,
    weightChange,
    streak: calculateStreak(allFoodLogs)
  };
}

function renderWeeklySummaryEmail(user, s) {
  const calorieTarget = s.calorieTarget ? ` (יעד: ${s.calorieTarget})` : '';
  const proteinTarget = s.proteinTarget ? ` (יעד: ${s.proteinTarget} גרם)` : '';

  const lines = [
    `שלום ${user.name || ''}`.trim() + ',',
    '',
    `הנה הסיכום השבועי שלך ב-YAHEALTHY לתאריכים ${s.range.start} עד ${s.range.end}:`,
    '',
    `🍽️ תזונה: תיעדת ${s.loggedDays} מתוך 7 ימים.`
  ];

  if (s.loggedDays > 0) {
    lines.push(`   ממוצע קלוריות ביום תיעוד: ${s.avgCalories}${calorieTarget}`);
    lines.push(`   ממוצע חלבון ביום: ${s.avgProtein} גרם${proteinTarget}`);
  } else {
    lines.push('   לא תועדו יומנים השבוע — השבוע החדש הזדמנות מצוינת להתחיל!');
  }

  lines.push('');
  lines.push(`💧 מים: סה"כ ${s.totalLiters} ליטרים (ממוצע ${s.avgLiters} ליטר ליום).`);
  lines.push(s.nightsLogged
    ? `😴 שינה: ממוצע ${s.avgSleep} שעות לילה (${s.nightsLogged} לילות מתועדים).`
    : '😴 שינה: לא תועדו לילות השבוע.');

  if (s.weightChange !== null) {
    const direction = s.weightChange < 0 ? 'ירידה' : s.weightChange > 0 ? 'עלייה' : 'ללא שינוי';
    lines.push(`⚖️ משקל: ${direction} של ${Math.abs(s.weightChange)} ק"ג השבוע.`);
  }

  lines.push('');
  lines.push(`🔥 רצף תיעוד נוכחי: ${s.streak} ימים.`);
  lines.push('');
  lines.push('שבוע מדהים בהמשך!');
  lines.push('');
  lines.push('— צוות YAHEALTHY');

  return lines.join('\n');
}

/** Build and send the weekly summary for one user. */
async function sendWeeklySummaryEmail(user) {
  const summary = await buildWeeklySummary(user.id);
  const text = renderWeeklySummaryEmail(user, summary);
  const result = await mailer.deliver({
    to: user.email,
    subject: `הסיכום השבועי שלך ב-YAHEALTHY (${summary.range.start} – ${summary.range.end})`,
    text
  });
  return { summary, email: text, ...result };
}

/** Sunday-morning job: mail every user, skipping failures per user. */
async function runWeeklySummaryJob() {
  const users = await db.getAllUsers();
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await sendWeeklySummaryEmail(user);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`📧 Weekly summary failed for ${user.email}: ${err.message}`);
    }
  }

  console.log(`📧 Weekly summary job done: ${sent} sent, ${failed} failed, ${users.length} total`);
  return { total: users.length, sent, failed };
}

// The subject line uses an en dash between the dates; keep it as one helper so
// tests and callers format the range the same way.
function s(start, end) {
  return `${start} – ${end}`;
}

module.exports = {
  buildWeeklySummary,
  renderWeeklySummaryEmail,
  sendWeeklySummaryEmail,
  runWeeklySummaryJob
};
