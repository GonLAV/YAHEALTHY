/**
 * AI Coach — rule-based coaching grounded in the user's real data.
 * Bilingual (he/en): callers pass ?lang=; default is English.
 * Replaces the unintegrated CRM prototype (crm-routes.js + OpenAI + Postgres pool)
 * with a coach that works against the app's own store (Supabase / in-memory).
 */

const db = require('./database');
const { calculateStreak } = require('./health-calculations');

const todayStr = () => new Date().toISOString().split('T')[0];

async function collectUserData(userId) {
  const today = todayStr();
  const [foodLogs, hydrationLogs, sleepLogs] = await Promise.all([
    db.getFoodLogs(userId, { date: today }).catch(() => []),
    db.getHydrationLogs(userId, today).catch(() => []),
    db.getSleepLogs(userId, today).catch(() => []),
  ]);

  const dayLogs = foodLogs || [];
  const totals = dayLogs.reduce(
    (acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein: acc.protein + (log.protein_grams || 0),
      carbs: acc.carbs + (log.carbs_grams || 0),
      fat: acc.fat + (log.fat_grams || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const waterLiters = (hydrationLogs || []).reduce((s, l) => s + (l.liters_consumed || 0), 0);
  const sleepHours = (sleepLogs || []).reduce((s, l) => s + (l.sleep_hours || 0), 0);
  const streak = calculateStreak(await db.getFoodLogs(userId).catch(() => []));

  const survey = await db.getLatestSurvey(userId);
  const calorieTarget = survey?.daily_calories?.targetDailyCalories || null;
  const proteinTarget = survey?.protein_target_g || null;

  return { today, dayLogs, totals, waterLiters, sleepHours, streak, calorieTarget, proteinTarget };
}

/**
 * GET /api/crm/users/:userId/insights
 * Generates up to 5 insight cards from today's data.
 */
async function generateInsights(userId, lang = 'en') {
  const data = await collectUserData(userId);
  const L = lang === 'he';
  const insights = [];
  let i = 0;
  const push = (type, title, content) => {
    insights.push({ id: `insight-${i++}`, insight_type: type, title, content, created_at: new Date().toISOString() });
  };

  // Calories
  if (data.dayLogs.length > 0 && data.calorieTarget) {
    const remaining = data.calorieTarget - data.totals.calories;
    if (remaining > 0) {
      push(
        'calories',
        L ? 'מצב קלוריות' : 'Calorie Status',
        L
          ? `נצרכו ${Math.round(data.totals.calories)} קלוריות מתוך יעד של ${data.calorieTarget}. נותרו ${Math.round(remaining)} קלוריות להיום.`
          : `You've consumed ${Math.round(data.totals.calories)} of your ${data.calorieTarget} calorie target. ${Math.round(remaining)} calories remaining today.`
      );
    } else {
      push(
        'calories',
        L ? 'מצב קלוריות' : 'Calorie Status',
        L
          ? `השגת את יעד הקלוריות שלך (${data.calorieTarget})! שקול לסיים את היום בארוחה קלה.`
          : `You've reached your calorie target (${data.calorieTarget})! Consider finishing the day with a light meal.`
      );
    }
  } else if (data.dayLogs.length === 0) {
    push(
      'logging',
      L ? 'התחל לרשום' : 'Start Logging',
      L
        ? 'עדיין לא רשמת ארוחות היום. רישום עקבי הוא הבסיס לשיפור הרגלי התזונה!'
        : "You haven't logged any meals today. Consistent logging is the foundation of better nutrition habits!"
    );
  }

  // Protein
  if (data.proteinTarget && data.totals.protein < data.proteinTarget * 0.8) {
    push(
      'protein',
      L ? 'חלבון' : 'Protein Check',
      L
        ? `צריכת החלבון שלך נמוכה — ${Math.round(data.totals.protein)} גרם מתוך יעד של ${data.proteinTarget} גרם. שקול להוסיף עוף, דגים, ביצים או קטניות.`
        : `Your protein intake is low — ${Math.round(data.totals.protein)}g of your ${data.proteinTarget}g target. Consider adding chicken, fish, eggs, or legumes.`
    );
  }

  // Hydration
  if (data.waterLiters < 1.5) {
    push(
      'hydration',
      L ? 'הידרציה' : 'Hydration',
      L
        ? `שתית ${data.waterLiters.toFixed(2)} ליטרים עד כה. היעד היומי המומלץ הוא 2-2.5 ליטרים.`
        : `You've had ${data.waterLiters.toFixed(2)}L so far. The recommended daily goal is 2-2.5L.`
    );
  } else {
    push(
      'hydration',
      L ? 'הידרציה' : 'Hydration',
      L
        ? `מעולה! שתית ${data.waterLiters.toFixed(2)} ליטרים היום. המשך כך!`
        : `Great! You've had ${data.waterLiters.toFixed(2)}L today. Keep it up!`
    );
  }

  // Sleep
  if (data.sleepHours === 0) {
    push(
      'sleep',
      L ? 'שינה' : 'Sleep',
      L
        ? 'עדיין לא רשמת שינה להיום. שינה של 7-9 שעות חיונית להתאוששות ולבריאות המטבולית.'
        : "You haven't logged sleep today. 7-9 hours of sleep is essential for recovery and metabolic health."
    );
  } else if (data.sleepHours < 7) {
    push(
      'sleep',
      L ? 'שינה' : 'Sleep',
      L
        ? `ישנת ${data.sleepHours.toFixed(1)} שעות בלבד. שקול ללכת לישון מוקדם יותר הלילה.`
        : `You slept only ${data.sleepHours.toFixed(1)} hours. Consider going to bed earlier tonight.`
    );
  }

  // Streak
  if (data.streak >= 2) {
    push(
      'streak',
      L ? 'רצף' : 'Streak',
      L
        ? `אתה ברצף של ${data.streak} ימים ברישום מזון! התמדה היא המפתח להצלחה.`
        : `You're on a ${data.streak}-day logging streak! Consistency is the key to success.`
    );
  }

  return insights.slice(0, 5);
}

/**
 * POST /api/crm/users/:userId/ask
 * Rule-based coach answers grounded in the user's data.
 */
async function answer(userId, message, lang = 'en') {
  const data = await collectUserData(userId);
  const L = lang === 'he';
  const msg = (message || '').toLowerCase();
  const has = (...words) => words.some((w) => msg.includes(w));

  const dataSummary = L
    ? `הנתונים שלך להיום: ${Math.round(data.totals.calories)} קלוריות, ${Math.round(data.totals.protein)} גרם חלבון, ${data.waterLiters.toFixed(2)} ליטר מים, ${data.sleepHours.toFixed(1)} שעות שינה.`
    : `Your data today: ${Math.round(data.totals.calories)} calories, ${Math.round(data.totals.protein)}g protein, ${data.waterLiters.toFixed(2)}L water, ${data.sleepHours.toFixed(1)}h sleep.`;

  if (has('water', 'hydrat', 'מים', 'שתי')) {
    return L
      ? `הרבה לשתות חשוב לבריאותך הכללית ולתפקוד המטבולי. ${dataSummary} נסה להוסיף כוס מים לפני כל ארוחה, ולהחזיק בקבוק מים על השולחן.`
      : `Staying hydrated is important for overall health and metabolic function. ${dataSummary} Try adding a glass of water before each meal and keeping a bottle on your desk.`;
  }

  if (has('sleep', 'שינה', 'לישון')) {
    return L
      ? `שינה איכותית תומכת בשריפת שומן, בשרירים וברעב. ${dataSummary} טיפים: שעה לפני השינה הרחק ממסכים, חושך מלא בחדר, וזמן שינה קבוע.`
      : `Quality sleep supports fat loss, muscle recovery, and appetite control. ${dataSummary} Tips: avoid screens an hour before bed, keep the room dark, and stick to a consistent bedtime.`;
  }

  if (has('protein', 'חלבון')) {
    return L
      ? `חלבון שומר על מסת שריר ומגביר שובע. ${dataSummary} מקורות טובים: עוף, הודו, דגים, ביצים, יוגורט יווני, קטניות וטופו.`
      : `Protein preserves muscle mass and increases satiety. ${dataSummary} Good sources: chicken, turkey, fish, eggs, Greek yogurt, legumes, and tofu.`;
  }

  if (has('weight', 'משקל', 'לרדת', 'diet', 'דיאטה')) {
    return L
      ? `לירידה בריאה במשקל, כוון לגירעון קלורי קטן וקבוע (300-500 קלוריות) ולא לדיאטות קיצוניות. ${dataSummary} שלב אימוני כוח 2-3 פעמים בשבוע וצעדים יומיים.`
      : `For healthy weight loss, aim for a small consistent calorie deficit (300-500 calories) rather than crash diets. ${dataSummary} Add strength training 2-3 times a week and daily walks.`;
  }

  if (has('calorie', 'קלורי')) {
    return L
      ? `מעקב קלוריות עוזר להבין את צריכת האנרגיה שלך. ${dataSummary} מומלץ להתמקד במזונות שלמים, ירקות בכל ארוחה וחלבון בכל ארוחה.`
      : `Calorie tracking helps you understand your energy intake. ${dataSummary} Focus on whole foods, vegetables at every meal, and protein at each meal.`;
  }

  if (has('meal', 'ארוחה', 'eat', 'אוכל', 'food')) {
    return L
      ? `ארוחה מאוזנת כוללת חלבון רזה, ירקות, פחמימות מורכבות ושומן בריא. ${dataSummary} דוגמה: עוף עם קינואה, סלט ירוק עם שמן זית ואבוקדו.`
      : `A balanced meal includes lean protein, vegetables, complex carbs, and healthy fat. ${dataSummary} Example: chicken with quinoa, green salad with olive oil and avocado.`;
  }

  // Default — general advice with data summary
  return L
    ? `אני כאן כדי לעזור לך לשפר את הרגלי התזונה. אפשר לשאול אותי על קלוריות, חלבון, מים, שינה, משקל או ארוחות. ${dataSummary}`
    : `I'm here to help you improve your nutrition habits. You can ask me about calories, protein, water, sleep, weight, or meals. ${dataSummary}`;
}

module.exports = { generateInsights, answer };
