/**
 * AI Coach — rule-based coaching grounded in the user's real data.
 *
 * No LLM calls. Every sentence the coach says is built from the user's own
 * rows (food / water / sleep / weight logs), their confirmed targets
 * (preferences.macroTargets, waterTargetLiters, sleepTargetHours, onboarding
 * goal + profile, dietary preferences and allergies) and the engagement layer
 * (streaks, Health Score, achievements). Bilingual (he/en); default English.
 *
 * Layout:
 *   loadCoachData(userId, { today, tz })   I/O — reads through utils/database.js
 *   buildCoachContext(raw, opts)           pure — everything the rules need
 *   buildInsights(ctx)                     pure — ≤ 4 prioritized insight cards
 *   answerQuestion(ctx, message)           pure — /ask intent matching
 *   suggestMeals(ctx, meal)                pure — allergy/diet-safe meal ideas
 *   generateInsights / answer              what index.js mounts
 *
 * Safety (mirrors the onboarding wizard, utils/onboarding.js):
 *   - no diagnoses, no medical claims; medical questions get a referral
 *   - minors (onboarding profile age < 18) never get calorie-cut / weight-loss
 *     advice or calorie numbers
 *   - targets under the calculator's safe floor (nutrition-calculator
 *     MIN_SAFE_CALORIES) or onboarding safety flags → suggest a professional
 *   - a meal idea never contains anything matching a stated allergy
 *
 * Replaces the unintegrated CRM prototype (crm-routes.js + OpenAI + Postgres
 * pool); do not wire that one.
 */

const db = require('./database');
const {
  buildEngagementSummary,
  buildDays,
  scoreDay,
  addDays,
  localDate,
  isValidTimeZone,
  resolveGoals,
  SCORE_WEIGHTS
} = require('./engagement');
const onboarding = require('./onboarding');
const {
  ALLERGEN_WORDS,
  DIET_EXCLUDES,
  HEB_PREFIX,
  normalizeText,
  parseAllergies,
  termMatchesWord
} = require('./allergens');
const { MIN_SAFE_CALORIES } = require('./nutrition-calculator');
const { summarizeWeekRows } = require('./weekly-summary');

const MAX_INSIGHTS = 4;
const HISTORY_DAYS = 120; // enough for streaks/badges the coach talks about
const WINDOW_DAYS = 7; // "the last 7 days" = the 7 complete days before today
const LATE_NIGHT_WINDOW = 14;
const WEIGHT_WINDOW = 28;
const PROTEIN_LOW_SHARE = 0.8;
const EXTREME_WATER_L = 5;
const EXTREME_SLEEP_H = 6;
const PROFESSIONAL_FLAGS = ['minor', 'below-safe-floor', 'bmi-high', 'bmi-low', 'lose-while-underweight', 'target-bmi-low'];

const todayUtc = () => new Date().toISOString().slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pos = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(r0(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ─── I/O ───────────────────────────────────────────────────────────────────

const safe = (p) => Promise.resolve(p).then((v) => v || []).catch(() => []);

async function loadCoachData(userId, { today = todayUtc() } = {}) {
  const start = addDays(today, -HISTORY_DAYS);
  const [foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals, survey, preferences] = await Promise.all([
    safe(db.getFoodLogs(userId, { start })),
    safe(db.getHydrationLogs(userId)),
    safe(db.getSleepLogs(userId)),
    safe(db.getWeightLogs(userId)),
    safe(db.getWeightGoals(userId)),
    Promise.resolve(db.getLatestSurvey(userId)).catch(() => null),
    Promise.resolve(db.getUserPreferences(userId)).catch(() => null)
  ]);
  return { foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals, survey, preferences };
}

// ─── context ───────────────────────────────────────────────────────────────

/** Local hour (0–23) of an instant in tz. */
function localHour(instant, tz) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d);
  return Number(h) % 24;
}

function resolveSafety({ profile, mainGoal, calorieTarget, waterTargetLiters, sleepTargetHours, now }) {
  const flags = [];
  let age = null;
  let sex = null;
  if (profile && typeof profile === 'object') {
    age = onboarding.resolveAge(
      { age: Number.isFinite(Number(profile.age)) && profile.age !== null ? Number(profile.age) : undefined,
        birthYear: Number.isFinite(Number(profile.birthYear)) && profile.birthYear !== null ? Number(profile.birthYear) : undefined },
      now
    );
    sex = profile.sex === 'male' || profile.sex === 'female' ? profile.sex : null;
    // Recompute the wizard's own safety flags from what it saved.
    try {
      if (age !== null && sex && pos(profile.heightCm) && pos(profile.weightKg)) {
        const preview = onboarding.previewTargets({
          goal: onboarding.MAIN_GOALS[mainGoal] ? mainGoal : 'maintain_weight',
          sex,
          age,
          heightCm: Number(profile.heightCm),
          weightKg: Number(profile.weightKg),
          targetWeightKg: pos(profile.targetWeightKg),
          activityLevel: onboarding.ACTIVITY_LEVELS.includes(profile.activityLevel) ? profile.activityLevel : 'sedentary'
        });
        flags.push(...preview.safety.flags);
      }
    } catch {
      /* incomplete profile — fall back to the age check below */
    }
  }
  const minor = age !== null && age < onboarding.ADULT_AGE;
  if (minor && !flags.includes('minor')) flags.push('minor');

  const floor = sex ? MIN_SAFE_CALORIES[sex] : Math.min(MIN_SAFE_CALORIES.male, MIN_SAFE_CALORIES.female);
  const extreme = [];
  if (calorieTarget && calorieTarget < floor) extreme.push('calories-below-floor');
  if (minor && calorieTarget) extreme.push('minor-calorie-target');
  if (waterTargetLiters && waterTargetLiters > EXTREME_WATER_L) extreme.push('water-high');
  if (sleepTargetHours && sleepTargetHours < EXTREME_SLEEP_H) extreme.push('sleep-low');

  return {
    age,
    sex,
    minor,
    flags,
    floor,
    extreme,
    needsProfessional: extreme.length > 0 || flags.some((f) => PROFESSIONAL_FLAGS.includes(f)),
    // Weight-loss / calorie-cut advice is off for minors and anyone the
    // wizard would not have given a deficit to.
    noCalorieCut: minor || flags.some((f) => ['bmi-low', 'lose-while-underweight', 'target-bmi-low', 'below-safe-floor'].includes(f))
  };
}

/**
 * Everything the rules need, from raw rows. Pure.
 * @param {object} raw   loadCoachData() output
 * @param {object} opts  { today: 'YYYY-MM-DD', tz?, lang?, now? }
 */
function buildCoachContext(raw = {}, { today = todayUtc(), tz = 'UTC', lang = 'en', now } = {}) {
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  const L = lang === 'he' ? 'he' : 'en';
  const nowDate = now instanceof Date ? now : new Date(`${today}T12:00:00Z`);
  const prefs = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {};
  const survey = raw.survey || null;
  const macro = prefs.macroTargets && typeof prefs.macroTargets === 'object' ? prefs.macroTargets : {};
  const onb = prefs.onboarding && typeof prefs.onboarding === 'object' ? prefs.onboarding : {};
  const dietaryRaw = prefs.dietary && typeof prefs.dietary === 'object' ? prefs.dietary : {};

  const foodLogs = raw.foodLogs || [];
  const hydrationLogs = raw.hydrationLogs || [];
  const sleepLogs = raw.sleepLogs || [];
  const weightLogs = raw.weightLogs || [];
  const weightGoals = raw.weightGoals || [];

  const calorieTargetRaw = pos(macro.calorieOverride) ?? pos(survey?.daily_calories?.targetDailyCalories);
  const goals = resolveGoals({
    calorieTarget: calorieTargetRaw,
    waterTargetLiters: pos(prefs.waterTargetLiters) ?? pos(survey?.water_target_liters),
    sleepTargetHours: pos(prefs.sleepTargetHours) ?? pos(survey?.sleep_target_hours)
  });
  const mainGoal = typeof onb.goal === 'string' ? onb.goal : null;
  const safety = resolveSafety({
    profile: onb.profile,
    mainGoal,
    calorieTarget: goals.calorieTarget,
    waterTargetLiters: goals.waterTargetLiters,
    sleepTargetHours: goals.sleepTargetHours,
    now: nowDate
  });
  // Minors get no calorie or macro numbers (same rule as the wizard).
  const proteinTarget = safety.minor ? null : (pos(macro.protein_grams) ?? pos(survey?.protein_target_g));
  safety.rawCalorieTarget = goals.calorieTarget;
  if (safety.minor) goals.calorieTarget = null;

  const diets = onboarding.DIETARY_OPTIONS.filter((d) => dietaryRaw[d] === true);
  const allergyText = typeof dietaryRaw.allergies === 'string' ? dietaryRaw.allergies.trim() : '';

  // Engagement: anchor "today" to the resolved local date.
  const engNow = isValidTimeZone(tz) && localDate(nowDate, zone) === today ? nowDate : new Date(`${today}T12:00:00Z`);
  const engTz = engNow === nowDate ? zone : 'UTC';
  const eng = buildEngagementSummary({
    foodLogs, hydrationLogs, sleepLogs, weightLogs, weightGoals, goals, tz: engTz, lang: L, now: engNow
  });
  const days = buildDays({ foodLogs, hydrationLogs, sleepLogs, weightLogs }, engTz, today);

  // Per-day protein (buildDays tracks calories only).
  const proteinByDay = new Map();
  for (const r of foodLogs) {
    const d = String(r.date || '').slice(0, 10);
    proteinByDay.set(d, (proteinByDay.get(d) || 0) + num(r.protein_grams));
  }

  const todayRec = days.get(today);
  const todayFood = foodLogs.filter((r) => String(r.date || '').slice(0, 10) === today);
  const todayTotals = {
    entries: todayFood.length,
    calories: todayFood.reduce((s, r) => s + num(r.calories), 0),
    protein: todayFood.reduce((s, r) => s + num(r.protein_grams), 0),
    carbs: todayFood.reduce((s, r) => s + num(r.carbs_grams), 0),
    fat: todayFood.reduce((s, r) => s + num(r.fat_grams), 0),
    water: todayRec ? todayRec.liters : 0,
    sleep: todayRec && todayRec.sleepEntries > 0 ? todayRec.sleepHours : 0,
    sleepLogged: !!(todayRec && todayRec.sleepEntries > 0)
  };

  // The last 7 complete days (today is still in progress).
  const windowDates = [];
  for (let i = WINDOW_DAYS; i >= 1; i--) windowDates.push(addDays(today, -i));
  const windowDays = windowDates.map((d) => {
    const rec = days.get(d);
    const active = !!rec && rec.foodEntries + rec.hydrationEntries + rec.sleepEntries + rec.weighIns > 0;
    return {
      date: d,
      active,
      foodEntries: rec ? rec.foodEntries : 0,
      calories: rec ? rec.calories : 0,
      protein: proteinByDay.get(d) || 0,
      liters: rec ? rec.liters : 0,
      sleepLogged: !!(rec && rec.sleepEntries > 0),
      sleepHours: rec && rec.sleepEntries > 0 ? rec.sleepHours : 0,
      score: active ? scoreDay(days, d, goals) : null
    };
  });
  const week = {
    start: windowDates[0],
    end: windowDates[windowDates.length - 1],
    days: windowDays,
    activeDays: windowDays.filter((d) => d.active).length,
    summary: summarizeWeekRows({ foodLogs, hydrationLogs, sleepLogs, weightLogs, start: windowDates[0], end: windowDates[windowDates.length - 1] })
  };

  // Late-night eating: entries created 22:00–03:59 local, for that same
  // evening (not back-filled for another day), dinner/snack/unspecified only.
  const lateStart = addDays(today, -(LATE_NIGHT_WINDOW - 1));
  const lateDays = new Set();
  let lateEntries = 0;
  for (const r of foodLogs) {
    const date = String(r.date || '').slice(0, 10);
    if (!date || date < lateStart || date > today) continue;
    if (r.meal_type && !['dinner', 'snack'].includes(r.meal_type)) continue;
    const ts = r.created_at || r.logged_at;
    if (!ts) continue;
    const hour = localHour(ts, zone);
    if (hour === null) continue;
    const tsDate = localDate(ts, zone);
    const late = (hour >= 22 && tsDate === date) || (hour < 4 && (tsDate === date || addDays(tsDate, -1) === date));
    if (late) {
      lateEntries++;
      lateDays.add(date);
    }
  }

  // Weight trend vs the latest weight goal.
  const goal = weightGoals[0] || null;
  const weightStart = addDays(today, -(WEIGHT_WINDOW - 1));
  const weighIns = weightLogs
    .map((w) => ({ date: String(w.date || '').slice(0, 10) || localDate(w.created_at, zone), kg: Number(w.weight_kg), at: String(w.created_at || w.date || '') }))
    .filter((w) => w.date && Number.isFinite(w.kg) && w.date >= weightStart && w.date <= today)
    .sort((a, b) => a.at.localeCompare(b.at));
  let weight = null;
  if (weighIns.length >= 2) {
    const first = weighIns[0];
    const last = weighIns[weighIns.length - 1];
    const spanDays = Math.round((Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / 86400000);
    const startKg = goal && pos(goal.start_weight_kg) ? Number(goal.start_weight_kg) : null;
    const targetKg = goal && pos(goal.target_weight_kg) ? Number(goal.target_weight_kg) : null;
    weight = {
      firstKg: first.kg,
      lastKg: last.kg,
      change: r1(last.kg - first.kg),
      spanDays,
      count: weighIns.length,
      startKg,
      targetKg,
      direction: targetKg !== null && startKg !== null ? Math.sign(targetKg - startKg) : 0
    };
  }

  return {
    lang: L,
    today,
    tz: zone,
    now: nowDate,
    goals: { ...goals, proteinTarget },
    mainGoal,
    safety,
    dietary: { diets, allergyText, allergy: parseAllergies(allergyText) },
    eng,
    todayTotals,
    week,
    lateNight: { days: lateDays.size, entries: lateEntries, windowDays: LATE_NIGHT_WINDOW },
    weight,
    hasAnyLogs: foodLogs.length + hydrationLogs.length + sleepLogs.length + weightLogs.length > 0
  };
}

// ─── allergies, diets and meal ideas ───────────────────────────────────────

// Allergen/diet parsing is shared with the meal planner: utils/allergens.js.

/**
 * Meal ideas. `contains` lists allergen/diet categories; `words` are the
 * ingredient names (en + he, incl. plural) used for free-text allergy matching.
 * Numbers are rough per-portion estimates and are presented as such.
 */
const MEALS = [
  { id: 'chicken-quinoa', meal: 'main', kcal: 520, protein: 42, contains: ['poultry'],
    en: 'Grilled chicken with quinoa and roasted vegetables', he: 'חזה עוף בגריל עם קינואה וירקות קלויים',
    words: ['chicken', 'quinoa', 'zucchini', 'pepper', 'olive oil', 'עוף', 'קינואה', 'קישוא', 'קישואים', 'פלפל', 'שמן זית'] },
  { id: 'salmon-potato', meal: 'main', kcal: 560, protein: 36, contains: ['fish'],
    en: 'Baked salmon with sweet potato and a green salad', he: 'סלמון אפוי עם בטטה וסלט ירוק',
    words: ['salmon', 'sweet potato', 'lettuce', 'cucumber', 'lemon', 'olive oil', 'סלמון', 'בטטה', 'חסה', 'מלפפון', 'לימון', 'שמן זית'] },
  { id: 'cod-greenbeans', meal: 'main', kcal: 420, protein: 34, contains: ['fish'],
    en: 'Oven-baked cod with potatoes and green beans', he: 'בקלה בתנור עם תפוחי אדמה ושעועית ירוקה',
    words: ['cod', 'potato', 'potatoes', 'green beans', 'garlic', 'בקלה', 'תפוחי אדמה', 'תפוח אדמה', 'שעועית ירוקה', 'שום'] },
  { id: 'lentil-stew', meal: 'main', kcal: 500, protein: 22, contains: ['legume'],
    en: 'Lentil and vegetable stew with brown rice', he: 'תבשיל עדשים וירקות עם אורז מלא',
    words: ['lentil', 'lentils', 'carrot', 'onion', 'tomato', 'tomatoes', 'brown rice', 'rice', 'עדשים', 'גזר', 'בצל', 'עגבנייה', 'עגבניות', 'אורז מלא', 'אורז'] },
  { id: 'tofu-stirfry', meal: 'main', kcal: 480, protein: 26, contains: ['soy', 'sesame', 'gluten'],
    en: 'Tofu and vegetable stir-fry with rice (soy sauce, sesame oil)', he: 'מוקפץ טופו וירקות עם אורז (רוטב סויה, שמן שומשום)',
    words: ['tofu', 'soy sauce', 'sesame oil', 'broccoli', 'rice', 'טופו', 'רוטב סויה', 'שמן שומשום', 'ברוקולי', 'אורז'] },
  { id: 'shakshuka', meal: 'main', kcal: 450, protein: 22, contains: ['egg', 'gluten'],
    en: 'Shakshuka with a slice of whole-wheat bread and salad', he: 'שקשוקה עם פרוסת לחם מלא וסלט',
    words: ['egg', 'eggs', 'tomato', 'tomatoes', 'pepper', 'bread', 'whole wheat', 'ביצה', 'ביצים', 'עגבנייה', 'עגבניות', 'פלפל', 'לחם', 'לחם מלא'] },
  { id: 'turkey-chili', meal: 'main', kcal: 480, protein: 40, contains: ['poultry', 'legume'],
    en: 'Turkey and bean chili', he: "צ'ילי הודו ושעועית",
    words: ['turkey', 'kidney beans', 'beans', 'tomato', 'tomatoes', 'onion', 'הודו', 'שעועית', 'עגבנייה', 'עגבניות', 'בצל'] },
  { id: 'chickpea-salad', meal: 'main', kcal: 450, protein: 18, contains: ['legume', 'sesame'],
    en: 'Chickpea and vegetable salad with tahini', he: 'סלט גרגרי חומוס וירקות עם טחינה',
    words: ['chickpea', 'chickpeas', 'cucumber', 'tomato', 'tomatoes', 'parsley', 'tahini', 'גרגרי חומוס', 'חומוס', 'מלפפון', 'עגבנייה', 'עגבניות', 'פטרוזיליה', 'טחינה'] },
  { id: 'beef-bulgur', meal: 'main', kcal: 550, protein: 38, contains: ['meat', 'gluten'],
    en: 'Lean beef and vegetable skewers with bulgur', he: 'שיפודי בקר רזה וירקות עם בורגול',
    words: ['beef', 'onion', 'pepper', 'bulgur', 'בקר', 'בשר', 'בצל', 'פלפל', 'בורגול'] },
  { id: 'shrimp-noodles', meal: 'main', kcal: 420, protein: 32, contains: ['shellfish'],
    en: 'Garlic shrimp with rice noodles and zucchini', he: 'שרימפס בשום עם אטריות אורז וקישוא',
    words: ['shrimp', 'garlic', 'zucchini', 'rice noodles', 'שרימפס', 'שום', 'קישוא', 'אטריות אורז'] },
  { id: 'tuna-wrap', meal: 'main', kcal: 430, protein: 32, contains: ['fish', 'gluten', 'egg'],
    en: 'Tuna salad in a whole-wheat wrap (light mayo)', he: 'סלט טונה בטורטייה מקמח מלא (מיונז לייט)',
    words: ['tuna', 'tortilla', 'wrap', 'lettuce', 'tomato', 'mayo', 'mayonnaise', 'טונה', 'טורטייה', 'חסה', 'עגבנייה', 'מיונז'] },
  { id: 'peanut-tofu-noodles', meal: 'main', kcal: 560, protein: 25, contains: ['soy', 'peanut', 'gluten'],
    en: 'Baked tofu with peanut sauce and wheat noodles', he: 'טופו אפוי ברוטב בוטנים עם אטריות חיטה',
    words: ['tofu', 'peanut butter', 'peanut', 'noodles', 'wheat', 'טופו', 'בוטנים', 'חמאת בוטנים', 'אטריות', 'חיטה'] },
  { id: 'quinoa-almond-bowl', meal: 'main', kcal: 470, protein: 15, contains: ['tree_nut'],
    en: 'Roasted vegetable and quinoa bowl with toasted almonds', he: 'קערת קינואה וירקות קלויים עם שקדים קלויים',
    words: ['quinoa', 'almond', 'almonds', 'eggplant', 'lemon', 'קינואה', 'שקדים', 'חציל', 'לימון'] },
  { id: 'bean-peppers', meal: 'main', kcal: 460, protein: 20, contains: ['legume', 'dairy'],
    en: 'Peppers stuffed with black beans, corn and cheese', he: 'פלפלים ממולאים בשעועית שחורה, תירס וגבינה',
    words: ['black beans', 'beans', 'corn', 'pepper', 'cheese', 'שעועית', 'תירס', 'פלפל', 'פלפלים', 'גבינה'] },
  { id: 'chicken-soup', meal: 'main', kcal: 380, protein: 30, contains: ['poultry'],
    en: 'Chicken and vegetable soup with rice', he: 'מרק עוף וירקות עם אורז',
    words: ['chicken', 'carrot', 'celery', 'rice', 'עוף', 'גזר', 'סלרי', 'אורז'] },
  { id: 'oats-berries', meal: 'breakfast', kcal: 380, protein: 14, contains: ['gluten', 'tree_nut'],
    en: 'Oatmeal with berries and walnuts', he: 'דייסת שיבולת שועל עם פירות יער ואגוזי מלך',
    words: ['oats', 'oatmeal', 'berries', 'walnut', 'walnuts', 'שיבולת שועל', 'פירות יער', 'אגוזי מלך'] },
  { id: 'yogurt-fruit', meal: 'breakfast', kcal: 300, protein: 20, contains: ['dairy'],
    en: 'Greek yogurt with fruit', he: 'יוגורט יווני עם פרי',
    words: ['yogurt', 'fruit', 'banana', 'יוגורט', 'פרי', 'בננה'] },
  { id: 'eggs-toast', meal: 'breakfast', kcal: 360, protein: 20, contains: ['egg', 'gluten'],
    en: 'Two eggs on whole-wheat toast with vegetables', he: 'שתי ביצים על טוסט מלא עם ירקות',
    words: ['egg', 'eggs', 'toast', 'bread', 'tomato', 'cucumber', 'ביצים', 'ביצה', 'טוסט', 'לחם', 'עגבנייה', 'מלפפון'] },
  { id: 'tofu-scramble', meal: 'breakfast', kcal: 320, protein: 22, contains: ['soy'],
    en: 'Tofu scramble with spinach and tomatoes', he: 'טופו מקושקש עם תרד ועגבניות',
    words: ['tofu', 'spinach', 'tomato', 'tomatoes', 'טופו', 'תרד', 'עגבניות', 'עגבנייה'] },
  { id: 'veg-hummus', meal: 'snack', kcal: 200, protein: 7, contains: ['legume', 'sesame'],
    en: 'Cut vegetables with hummus', he: 'ירקות חתוכים עם חומוס',
    words: ['carrot', 'cucumber', 'hummus', 'chickpeas', 'tahini', 'גזר', 'מלפפון', 'חומוס', 'טחינה'] },
  { id: 'apple-pb', meal: 'snack', kcal: 250, protein: 7, contains: ['peanut'],
    en: 'Apple slices with peanut butter', he: 'פרוסות תפוח עם חמאת בוטנים',
    words: ['apple', 'peanut butter', 'peanut', 'תפוח', 'חמאת בוטנים', 'בוטנים'] },
  { id: 'cottage-cucumber', meal: 'snack', kcal: 180, protein: 18, contains: ['dairy'],
    en: 'Cottage cheese with cucumber', he: "קוטג' עם מלפפון",
    words: ['cottage cheese', 'cheese', 'cucumber', 'קוטג', 'גבינה', 'מלפפון'] },
  { id: 'fruit-bowl', meal: 'snack', kcal: 120, protein: 2, contains: [],
    en: 'A piece of fruit and a glass of water', he: 'פרי וכוס מים',
    words: ['fruit', 'orange', 'פרי', 'תפוז'] }
];

/** Why a meal is excluded for this user, or null when it is safe. */
function mealConflict(meal, { diets = [], allergy = { categories: new Set(), terms: [] } } = {}) {
  for (const cat of meal.contains) if (allergy.categories.has(cat)) return `allergy:${cat}`;
  for (const term of allergy.terms) {
    if (meal.words.some((w) => termMatchesWord(term, w))) return `allergy-term:${term}`;
    if (normalizeText(meal.en).split(' ').some((w) => termMatchesWord(term, w))) return `allergy-term:${term}`;
    if (normalizeText(meal.he).split(' ').some((w) => termMatchesWord(term, w))) return `allergy-term:${term}`;
  }
  for (const d of diets) {
    for (const cat of DIET_EXCLUDES[d] || []) if (meal.contains.includes(cat)) return `diet:${d}`;
  }
  return null;
}

/**
 * Up to `limit` meal ideas for `meal` ('main' | 'breakfast' | 'snack') that
 * fit the user's diets and never match a stated allergy. Deterministic.
 */
function suggestMeals(ctx, meal = 'main', limit = 3) {
  const pool = MEALS.filter((m) => m.meal === meal && !mealConflict(m, ctx.dietary));
  const { calorieTarget, proteinTarget } = ctx.goals;
  const remainingKcal = calorieTarget ? calorieTarget - ctx.todayTotals.calories : null;
  const remainingProtein = proteinTarget ? proteinTarget - ctx.todayTotals.protein : null;
  const proteinFirst = remainingProtein !== null && remainingProtein >= 25;

  const scored = pool.map((m) => {
    let score = 0;
    if (remainingKcal !== null && !ctx.safety.minor) {
      if (remainingKcal <= 0) score -= m.kcal / 10; // already at target → lighter first
      else if (m.kcal > remainingKcal + 100) score -= (m.kcal - remainingKcal) / 5;
    }
    if (proteinFirst) score += m.protein;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
  return {
    ideas: scored.slice(0, limit).map((s) => s.m),
    remainingKcal,
    remainingProtein,
    excluded: MEALS.filter((m) => m.meal === meal).length - pool.length
  };
}

// ─── copy helpers ──────────────────────────────────────────────────────────

const CTA = {
  '/food-log': { en: 'Open food log', he: 'ליומן המזון' },
  '/hydration': { en: 'Log water', he: 'לרישום מים' },
  '/sleep': { en: 'Open sleep log', he: 'ליומן השינה' },
  '/weight': { en: 'Open weight', he: 'למעקב המשקל' },
  '/achievements': { en: 'See achievements', he: 'להישגים' },
  '/progress': { en: 'See progress', he: 'להתקדמות' },
  '/settings': { en: 'Open settings', he: 'להגדרות' },
  '/dashboard': { en: 'Open dashboard', he: 'ללוח הבקרה' }
};

const COMPONENT_NAME = {
  en: { nutrition: 'nutrition', hydration: 'hydration', sleep: 'sleep', consistency: 'consistency' },
  he: { nutrition: 'תזונה', hydration: 'שתייה', sleep: 'שינה', consistency: 'עקביות' }
};

const PROFESSIONAL_NOTE = {
  en: 'This is general guidance, not medical advice — a doctor or registered dietitian can give advice that fits you.',
  he: 'זו הכוונה כללית ולא ייעוץ רפואי — רופא או דיאטנית קלינית יכולים לתת המלצה שמתאימה לכם.'
};

// Same wording as the onboarding wizard's safety notes (onb.safety.*).
const SAFETY_COPY = {
  en: {
    minor: 'You are under 18. We do not set calorie or macro targets for teens — please plan any diet changes with a parent and a doctor or dietitian.',
    'below-safe-floor': 'Your goal would put you under a safe minimum calorie intake, so we are not suggesting a number. A dietitian can help you set a plan.',
    'bmi-low': 'Your weight is below the typical healthy range for your height. Consider checking in with a doctor.',
    'bmi-high': 'At your current weight, a doctor or dietitian can help make a plan that fits you best.',
    'target-bmi-low': 'Your target weight is below the typical healthy range for your height.',
    'lose-while-underweight': 'We set your calories to maintenance instead of a deficit.',
    'calories-below-floor': (target, floor) => `Your calorie target (${fmt(target)} kcal) is below ${fmt(floor)} kcal, a commonly used safe minimum. We recommend professional guidance for targets this low.`,
    'minor-calorie-target': () => 'A calorie target is set on an under-18 account. We do not coach teens on calorie targets — please plan with a parent and a doctor or dietitian.',
    'water-high': (l) => `Your water target (${r1(l)} L) is unusually high. More is not always better — check with a doctor before drinking this much every day.`,
    'sleep-low': (h) => `Your sleep target (${r1(h)} h) is below what most adults need. A doctor can help if short sleep is a regular struggle.`
  },
  he: {
    minor: 'אתם מתחת לגיל 18. איננו קובעים יעדי קלוריות או מאקרו לבני נוער — כדאי לתכנן שינויים בתזונה עם הורה ועם רופא או דיאטנית.',
    'below-safe-floor': 'המטרה שלכם הייתה מורידה אתכם מתחת לצריכת קלוריות מינימלית בטוחה, ולכן איננו מציעים מספר. דיאטנית יכולה לעזור לבנות תוכנית.',
    'bmi-low': 'המשקל שלכם נמוך מהטווח התקין המקובל לגובה שלכם. כדאי להתייעץ עם רופא.',
    'bmi-high': 'במשקל הנוכחי, רופא או דיאטנית יכולים לעזור לבנות תוכנית שמתאימה לכם בדיוק.',
    'target-bmi-low': 'משקל היעד שלכם נמוך מהטווח התקין המקובל לגובה שלכם.',
    'lose-while-underweight': 'קבענו את הקלוריות לשמירה על המשקל במקום גירעון.',
    'calories-below-floor': (target, floor) => `יעד הקלוריות שלכם (${fmt(target)} קק"ל) נמוך מ-${fmt(floor)} קק"ל, מינימום בטוח מקובל. ליעדים נמוכים כאלה מומלץ ליווי מקצועי.`,
    'minor-calorie-target': () => 'בחשבון של מתחת לגיל 18 מוגדר יעד קלוריות. איננו מלווים בני נוער ביעדי קלוריות — כדאי לתכנן עם הורה ועם רופא או דיאטנית.',
    'water-high': (l) => `יעד המים שלכם (${r1(l)} ליטר) גבוה במיוחד. יותר זה לא תמיד טוב יותר — כדאי להתייעץ עם רופא לפני שותים כמות כזו כל יום.`,
    'sleep-low': (h) => `יעד השינה שלכם (${r1(h)} שעות) נמוך ממה שרוב המבוגרים צריכים. רופא יכול לעזור אם שינה קצרה היא קושי קבוע.`
  }
};

function safetyLines(ctx) {
  const S = SAFETY_COPY[ctx.lang];
  const lines = [];
  for (const f of ctx.safety.flags) if (typeof S[f] === 'string') lines.push(S[f]);
  for (const e of ctx.safety.extreme) {
    if (e === 'calories-below-floor') lines.push(S[e](ctx.safety.rawCalorieTarget ?? ctx.goals.calorieTarget, ctx.safety.floor));
    else if (e === 'minor-calorie-target') lines.push(S[e]());
    else if (e === 'water-high') lines.push(S[e](ctx.goals.waterTargetLiters));
    else if (e === 'sleep-low') lines.push(S[e](ctx.goals.sleepTargetHours));
  }
  return lines;
}

// ─── insight rules ─────────────────────────────────────────────────────────

/**
 * Each rule returns a card or null. `rank` orders them (lower = first);
 * `covers` lets a specific rule suppress a generic one about the same thing.
 */
const RULES = [
  function safetyRule(ctx) {
    if (!ctx.safety.needsProfessional) return null;
    const lines = safetyLines(ctx);
    if (!lines.length) return null;
    const he = ctx.lang === 'he';
    return {
      id: 'safety-professional', type: 'safety', kind: 'safety', priority: 'high', rank: 0, covers: ['calories', 'weight'],
      title: he ? 'כדאי להתייעץ עם איש מקצוע' : 'Worth checking with a professional',
      reason: lines.join(' '),
      action: he ? 'אפשר לעדכן את היעדים בהגדרות, ולהיעזר ברופא או בדיאטנית לתוכנית אישית.' : 'You can review your targets in Settings, and a doctor or dietitian can help with a personal plan.',
      href: '/settings'
    };
  },

  function streakAtRiskRule(ctx) {
    const s = ctx.eng.streaks.anyLog;
    if (!s.atRisk || s.current < 2) return null;
    const he = ctx.lang === 'he';
    return {
      id: 'streak-at-risk', type: 'streak', kind: 'alert', priority: 'high', rank: 10, covers: ['streak'],
      title: he ? 'הרצף שלכם בסכנה היום' : 'Your streak is at risk today',
      reason: he
        ? `רשמתם משהו ${s.current} ימים ברצף, אבל היום עוד לא נרשם כלום.`
        : `You've logged something ${s.current} days in a row, but nothing is logged yet today.`,
      action: he
        ? 'רישום אחד מספיק כדי לשמור עליו — אפילו כוס מים.'
        : 'One entry keeps it going — even a glass of water counts.',
      href: '/hydration'
    };
  },

  function gettingStartedRule(ctx) {
    if (ctx.hasAnyLogs) return null;
    const he = ctx.lang === 'he';
    return {
      id: 'getting-started', type: 'logging', kind: 'tip', priority: 'high', rank: 12, covers: ['logging'],
      title: he ? 'בואו נתחיל' : "Let's get started",
      reason: he ? 'עדיין אין רישומים בחשבון, אז אין לי נתונים לתת עליהם תובנות.' : "There are no logs on your account yet, so I don't have data to coach on.",
      action: he ? 'רשמו את הארוחה הבאה שלכם — מחר כבר אוכל להראות לכם מגמות.' : "Log your next meal — by tomorrow I can start showing you patterns.",
      href: '/food-log'
    };
  },

  function newBadgeRule(ctx) {
    const yesterday = addDays(ctx.today, -1);
    const fresh = ctx.eng.achievements
      .filter((a) => a.unlocked && (a.unlockedAt === ctx.today || a.unlockedAt === yesterday))
      .sort((a, b) => b.progress.target - a.progress.target || a.id.localeCompare(b.id));
    if (!fresh.length) return null;
    const a = fresh[0];
    const he = ctx.lang === 'he';
    const when = a.unlockedAt === ctx.today ? (he ? 'היום' : 'today') : (he ? 'אתמול' : 'yesterday');
    return {
      id: 'new-badge', type: 'achievement', kind: 'celebrate', priority: 'medium', rank: 20, covers: ['achievement'],
      title: he ? `הישג חדש: ${a.title}` : `New badge: ${a.title}`,
      reason: he ? `פתחתם ${when} את „${a.title}” — ${a.description}.` : `You unlocked “${a.title}” ${when} — ${a.description.charAt(0).toLowerCase()}${a.description.slice(1)}.`,
      action: ctx.eng.nextMilestone?.id
        ? (he ? `היעד הבא: ${ctx.eng.nextMilestone.message}.` : `Next up: ${ctx.eng.nextMilestone.message}.`)
        : (he ? 'המשיכו כך!' : 'Keep it up!'),
      href: '/achievements'
    };
  },

  function sleepBelowTargetRule(ctx) {
    const target = ctx.goals.sleepTargetHours;
    const nights = ctx.week.days.filter((d) => d.sleepLogged);
    const short = nights.filter((d) => d.sleepHours < target);
    if (short.length < 3) return null;
    const avg = r1(nights.reduce((s, d) => s + d.sleepHours, 0) / nights.length);
    const he = ctx.lang === 'he';
    return {
      id: 'sleep-below-target', type: 'sleep', kind: 'tip', priority: 'medium', rank: 30, covers: ['sleep'],
      title: he ? 'השינה מתחת ליעד' : 'Sleep is below your target',
      reason: he
        ? `ישנתם פחות מיעד ה-${r1(target)} שעות ב-${short.length} מתוך ${nights.length} הלילות שרשמתם ב-7 הימים האחרונים (ממוצע ${avg} שעות).`
        : `You slept under your ${r1(target)} h target on ${short.length} of the ${nights.length} nights you logged in the last 7 days (average ${avg} h).`,
      action: he
        ? 'נסו ללכת לישון 20 דקות מוקדם יותר הלילה ולהרחיק מסכים בשעה שלפני השינה.'
        : 'Try going to bed 20 minutes earlier tonight and keep screens away for the last hour.',
      href: '/sleep'
    };
  },

  function weakestComponentRule(ctx) {
    const active = ctx.week.days.filter((d) => d.score);
    if (active.length < 3) return null;
    const keys = Object.keys(SCORE_WEIGHTS);
    const avg = {};
    for (const k of keys) {
      avg[k] = r0(active.reduce((s, d) => s + d.score.components.find((c) => c.key === k).score, 0) / active.length);
    }
    // Consistency is itself a trailing-7-day measure; averaging it would count
    // days before the window. Use the window's own share of active days.
    avg.consistency = r0((100 * active.length) / WINDOW_DAYS);
    const weakest = keys
      .slice()
      .sort((a, b) => avg[a] - avg[b] || SCORE_WEIGHTS[b] - SCORE_WEIGHTS[a] || a.localeCompare(b))[0];
    if (avg[weakest] >= 70) return null;
    const he = ctx.lang === 'he';
    const n = active.length;
    const g = ctx.goals;
    const lostPoints = r1(((100 - avg[weakest]) * SCORE_WEIGHTS[weakest]) / 100);
    let reason;
    let action;
    let href;
    if (weakest === 'hydration') {
      const hits = active.filter((d) => d.liters >= g.waterTargetLiters).length;
      const avgL = r1(active.reduce((s, d) => s + d.liters, 0) / n);
      reason = he
        ? `עמדתם ביעד המים (${r1(g.waterTargetLiters)} ליטר) ב-${hits} מתוך ${n} הימים שרשמתם השבוע (ממוצע ${avgL} ליטר).`
        : `You hit your water goal (${r1(g.waterTargetLiters)} L) on ${hits} of the ${n} days you logged this week (average ${avgL} L).`;
      action = he ? 'שתו כוס מים לפני כל ארוחה — שלוש כוסות כאלה הן כבר כ-0.75 ליטר.' : 'Drink a glass of water before each meal — three of those is already about 0.75 L.';
      href = '/hydration';
    } else if (weakest === 'sleep') {
      const logged = active.filter((d) => d.sleepLogged).length;
      const hits = active.filter((d) => d.sleepLogged && d.sleepHours >= g.sleepTargetHours).length;
      reason = he
        ? `הגעתם ליעד השינה (${r1(g.sleepTargetHours)} שעות) ב-${hits} מתוך ${n} הימים שרשמתם השבוע${logged < n ? `, ורשמתם שינה רק ב-${logged} מהם` : ''}.`
        : `You reached your sleep target (${r1(g.sleepTargetHours)} h) on ${hits} of the ${n} days you logged this week${logged < n ? `, and logged sleep on only ${logged} of them` : ''}.`;
      action = logged < n
        ? (he ? 'רשמו את השינה כל בוקר — בלי רישום הרכיב נספר כאפס.' : 'Log your sleep each morning — an unlogged night counts as zero.')
        : (he ? 'קבעו שעת שינה קבועה והתחילו להתארגן לשינה 30 דקות לפניה.' : 'Pick a fixed bedtime and start winding down 30 minutes before it.');
      href = '/sleep';
    } else if (weakest === 'nutrition') {
      const foodDays = active.filter((d) => d.foodEntries > 0).length;
      if (g.calorieTarget && foodDays > 0) {
        const within = active.filter((d) => d.foodEntries > 0 && Math.abs(d.calories - g.calorieTarget) / g.calorieTarget <= 0.1).length;
        reason = he
          ? `רשמתם אוכל ב-${foodDays} מתוך ${n} ימים, ורק ב-${within} מהם הקלוריות היו בטווח של 10% מהיעד (${fmt(g.calorieTarget)} קק"ל).`
          : `You logged food on ${foodDays} of ${n} days, and calories were within 10% of your ${fmt(g.calorieTarget)} kcal target on ${within} of them.`;
        action = he ? 'רשמו כל ארוחה בזמן אמת, כולל נשנושים — כך קל יותר לראות איפה הפער.' : 'Log each meal as you eat it, snacks included — it makes the gap easier to see.';
      } else {
        reason = he
          ? `רשמתם אוכל ב-${foodDays} מתוך ${n} הימים הפעילים השבוע.`
          : `You logged food on ${foodDays} of your ${n} active days this week.`;
        action = he ? 'נסו לרשום לפחות שתי ארוחות ביום.' : 'Aim to log at least two meals a day.';
      }
      href = '/food-log';
    } else {
      reason = he
        ? `הייתם פעילים ב-${n} מתוך 7 הימים האחרונים.`
        : `You were active on ${n} of the last 7 days.`;
      action = he ? 'הפעילו תזכורת יומית בהגדרות כדי לא לפספס יום.' : 'Turn on a daily reminder in Settings so a day does not slip by.';
      href = '/settings';
    }
    return {
      id: `weakest-${weakest}`, type: 'health-score', kind: 'tip', priority: 'medium', rank: 35, covers: [weakest],
      title: he ? `הנקודה החלשה בציון השבוע: ${COMPONENT_NAME.he[weakest]}` : `Weakest Health Score area this week: ${COMPONENT_NAME.en[weakest]}`,
      reason: `${reason} ${he ? `זה עולה לכם כ-${lostPoints} נקודות ביום.` : `That costs you about ${lostPoints} points a day.`}`,
      action,
      href
    };
  },

  function proteinLowRule(ctx) {
    const target = ctx.goals.proteinTarget;
    if (!target) return null;
    const foodDays = ctx.week.days.filter((d) => d.foodEntries > 0);
    if (foodDays.length < 3) return null;
    const low = foodDays.filter((d) => d.protein < target * PROTEIN_LOW_SHARE);
    if (low.length < 3 || low.length / foodDays.length < 0.5) return null;
    const avg = r0(foodDays.reduce((s, d) => s + d.protein, 0) / foodDays.length);
    const he = ctx.lang === 'he';
    const sources = proteinSources(ctx);
    return {
      id: 'protein-low', type: 'protein', kind: 'tip', priority: 'medium', rank: 40, covers: ['protein'],
      title: he ? 'חלבון מתחת ליעד באופן עקבי' : 'Protein is consistently below target',
      reason: he
        ? `ב-${low.length} מתוך ${foodDays.length} הימים שרשמתם, החלבון היה מתחת ל-80% מהיעד (${r0(target)} גרם; ממוצע ${avg} גרם).`
        : `On ${low.length} of the ${foodDays.length} days you logged, protein was under 80% of your ${r0(target)} g target (average ${avg} g).`,
      action: sources.length
        ? (he ? `הוסיפו מקור חלבון לכל ארוחה, למשל: ${sources.join(', ')}.` : `Add a protein source to each meal, for example: ${sources.join(', ')}.`)
        : (he ? 'הוסיפו מקור חלבון שמתאים לכם לכל ארוחה.' : 'Add a protein source that suits you to each meal.'),
      href: '/food-log'
    };
  },

  function lateNightRule(ctx) {
    if (ctx.lateNight.days < 3) return null;
    const he = ctx.lang === 'he';
    return {
      id: 'late-night-eating', type: 'pattern', kind: 'tip', priority: 'low', rank: 50, covers: ['late-night'],
      title: he ? 'דפוס של אכילה מאוחרת' : 'A late-night eating pattern',
      reason: he
        ? `ב-${ctx.lateNight.days} מתוך ${ctx.lateNight.windowDays} הימים האחרונים נרשמו ארוחות ערב או נשנושים אחרי 22:00.`
        : `On ${ctx.lateNight.days} of the last ${ctx.lateNight.windowDays} days, dinner or snacks were logged after 22:00.`,
      action: he
        ? 'אם זה אכן הזמן שבו אתם אוכלים, נסו להקדים את ארוחת הערב ולהכין נשנוש קליל מראש לשעות המאוחרות.'
        : "If that's when you're actually eating, try having dinner a little earlier and plan a light snack for later in the evening.",
      href: '/food-log'
    };
  },

  function weightTrendRule(ctx) {
    const w = ctx.weight;
    if (!w || ctx.safety.minor || ctx.safety.noCalorieCut || w.spanDays < 7) return null;
    const he = ctx.lang === 'he';
    const toward = w.direction !== 0 && w.change * w.direction > 0.2;
    const target = w.targetKg !== null ? (he ? ` (יעד: ${w.targetKg} ק"ג)` : ` (goal: ${w.targetKg} kg)`) : '';
    return {
      id: 'weight-trend', type: 'weight', kind: toward ? 'celebrate' : 'tip', priority: 'low', rank: 55, covers: ['weight'],
      title: he ? 'מגמת המשקל' : 'Your weight trend',
      reason: he
        ? `בשקילות שלכם ב-${w.spanDays} הימים האחרונים המשקל עבר מ-${w.firstKg} ל-${w.lastKg} ק"ג${target}.`
        : `Across your weigh-ins over the last ${w.spanDays} days, your weight went from ${w.firstKg} to ${w.lastKg} kg${target}.`,
      action: toward
        ? (he ? 'זה בכיוון של היעד — המשיכו בהרגלים שעובדים. המגמה לאורך כמה שבועות חשובה יותר משקילה בודדת.' : "That's in the direction of your goal — keep the habits that are working. The trend over several weeks matters more than any single weigh-in.")
        : (he ? 'תנודות של יום ליום הן רגילות (מים, מלח, תזמון). הסתכלו על המגמה לאורך כמה שבועות והמשיכו לשקול באותה שעה.' : 'Day-to-day swings are normal (water, salt, timing). Look at the trend over a few weeks and keep weighing at the same time of day.'),
      href: '/weight'
    };
  },

  function nextMilestoneRule(ctx) {
    const m = ctx.eng.nextMilestone;
    if (!m || !m.id || !(m.remaining > 0) || m.remaining > 2) return null;
    const he = ctx.lang === 'he';
    return {
      id: 'milestone-near', type: 'achievement', kind: 'celebrate', priority: 'low', rank: 60, covers: ['achievement'],
      title: he ? `כמעט שם: ${m.title}` : `Almost there: ${m.title}`,
      reason: he ? `${m.current} מתוך ${m.target} — ${m.message}.` : `${m.current} of ${m.target} — ${m.message}.`,
      action: he ? `${m.description}.` : `${m.description}.`,
      href: '/achievements'
    };
  },

  function caloriesTodayRule(ctx) {
    const target = ctx.goals.calorieTarget;
    const t = ctx.todayTotals;
    if (!target || ctx.safety.minor || t.entries === 0) return null;
    const he = ctx.lang === 'he';
    const remaining = target - t.calories;
    const over = remaining < -target * 0.1;
    return {
      id: 'calories-today', type: 'calories', kind: 'tip', priority: 'low', rank: 70, covers: ['calories'],
      title: he ? 'קלוריות היום' : 'Calories today',
      reason: he
        ? `רשמתם היום ${fmt(t.calories)} מתוך ${fmt(target)} קק"ל${remaining > 0 ? ` — נותרו כ-${fmt(remaining)}` : ''}.`
        : `You've logged ${fmt(t.calories)} of your ${fmt(target)} kcal today${remaining > 0 ? ` — about ${fmt(remaining)} left` : ''}.`,
      action: over
        ? (he ? 'אין צורך "לפצות" מחר — פשוט חזרו לשגרה בארוחה הבאה.' : 'No need to "make up for it" tomorrow — just get back to your usual pattern at the next meal.')
        : remaining > 0
          ? (he ? 'שאלו אותי "מה לאכול לארוחת ערב?" ואציע רעיונות שמתאימים למה שנשאר.' : 'Ask me "what should I eat for dinner?" for ideas that fit what is left.')
          : (he ? 'הגעתם ליעד — אם אתם רעבים, בחרו בירקות ובחלבון.' : "You've reached your target — if you're hungry, go for vegetables and protein."),
      href: '/food-log'
    };
  },

  function hydrationTodayRule(ctx) {
    const target = ctx.goals.waterTargetLiters;
    const water = ctx.todayTotals.water;
    if (water >= target) return null;
    const he = ctx.lang === 'he';
    return {
      id: 'hydration-today', type: 'hydration', kind: 'tip', priority: 'low', rank: 75, covers: ['hydration'],
      title: he ? 'מים היום' : 'Water today',
      reason: he
        ? `שתיתם היום ${r1(water)} מתוך ${r1(target)} ליטר.`
        : `You've had ${r1(water)} of your ${r1(target)} L today.`,
      action: he ? 'השאירו בקבוק מים בהישג יד ורשמו כל כוס.' : 'Keep a bottle within reach and log each glass.',
      href: '/hydration'
    };
  }
];

function proteinSources(ctx) {
  // Single-ingredient sources, filtered with the same allergy/diet rules as meals.
  const SOURCES = [
    { en: 'chicken or turkey', he: 'עוף או הודו', contains: ['poultry'], words: ['chicken', 'turkey', 'עוף', 'הודו'] },
    { en: 'fish', he: 'דגים', contains: ['fish'], words: ['fish', 'דג', 'דגים'] },
    { en: 'eggs', he: 'ביצים', contains: ['egg'], words: ['egg', 'eggs', 'ביצה', 'ביצים'] },
    { en: 'Greek yogurt or cottage cheese', he: "יוגורט יווני או קוטג'", contains: ['dairy'], words: ['yogurt', 'cottage cheese', 'cheese', 'יוגורט', 'קוטג', 'גבינה'] },
    { en: 'lentils or chickpeas', he: 'עדשים או גרגרי חומוס', contains: ['legume'], words: ['lentils', 'chickpeas', 'עדשים', 'חומוס', 'גרגרי חומוס'] },
    { en: 'tofu', he: 'טופו', contains: ['soy'], words: ['tofu', 'טופו'] }
  ];
  return SOURCES.filter((s) => !mealConflict({ ...s, meal: 'x' }, ctx.dietary)).slice(0, 3).map((s) => s[ctx.lang]);
}

/** ≤ 4 prioritized cards. Deterministic for a given context. */
function buildInsights(ctx) {
  const candidates = RULES.map((rule) => rule(ctx)).filter(Boolean);
  candidates.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const picked = [];
  const covered = new Set();
  for (const c of candidates) {
    if (picked.length >= MAX_INSIGHTS) break;
    if (c.covers.some((k) => covered.has(k))) continue;
    c.covers.forEach((k) => covered.add(k));
    picked.push(c);
  }
  const createdAt = ctx.now.toISOString();
  return picked.map((c, i) => ({
    id: c.id,
    insight_type: c.type,
    kind: c.kind,
    priority: c.priority,
    rank: i + 1,
    title: c.title,
    reason: c.reason,
    action: c.action,
    content: `${c.reason} ${c.action}`,
    cta: { href: c.href, label: (CTA[c.href] || CTA['/dashboard'])[ctx.lang] },
    created_at: createdAt
  }));
}

/**
 * What stands in for the insight cards when they are a locked Premium feature
 * (ENTITLEMENTS_ENFORCED=true and no coach_insights entitlement). Safety cards
 * are never replaced by this — the route keeps them.
 */
function lockedInsightCard(lang = 'en', now = new Date()) {
  const he = lang === 'he';
  const reason = he
    ? 'תובנות אישיות מהרישומים שלכם הן חלק מפרימיום.'
    : 'Personal insights from your logs are part of Premium.';
  const action = he
    ? 'הרישום, הרצפים והצ׳אט עם המאמן נשארים פתוחים.'
    : 'Logging, streaks and the coach chat stay open.';
  return {
    id: 'premium-locked',
    insight_type: 'premium',
    kind: 'premium',
    priority: 'low',
    rank: 99,
    title: he ? 'תובנות פרימיום' : 'Premium insights',
    reason,
    action,
    content: `${reason} ${action}`,
    cta: { href: '/upgrade', label: he ? 'לשדרוג' : 'See plans' },
    created_at: now.toISOString()
  };
}

// ─── /ask ──────────────────────────────────────────────────────────────────

/** Optimal-string-alignment distance, capped (we only care about ≤ 2). */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Real words one typo away from a keyword; never treat them as that keyword.
const FUZZY_STOPLIST = new Set([
  'store', 'scone', 'snore', 'scare', 'shore', 'sheep', 'steep', 'sleet', 'sleek', 'steak', 'height',
  'wafer', 'wager', 'waver', 'snake', 'smack', 'stack', 'shack', 'slack', 'hungary', 'meats', 'summery', 'dinar'
]);

/**
 * Intents in match order (first wins). `phrases` match as substrings of the
 * normalized message; `words` match whole tokens, with one typo allowed for
 * words of 5+ letters (same first letter), and Hebrew prefixes (ו/ה/ב/ל/מ/ש/כ)
 * stripped.
 */
const INTENTS = [
  { id: 'medical',
    phrases: ['blood pressure', 'eating disorder', 'stop eating', 'not eating', 'skip all meals', 'לחץ דם', 'הפרעת אכילה', 'לא לאכול', 'להפסיק לאכול', 'בלוטת התריס', 'צום ממושך'],
    words: ['diagnose', 'diagnosis', 'disease', 'diabetes', 'diabetic', 'cholesterol', 'medication', 'medicine', 'medications', 'pills', 'pregnant', 'pregnancy', 'breastfeeding', 'anorexia', 'bulimia', 'purge', 'purging', 'laxative', 'laxatives', 'starve', 'starving', 'insulin', 'thyroid', 'symptom', 'symptoms', 'cancer', 'ozempic', 'wegovy', 'mounjaro',
      'אבחנה', 'אבחון', 'מחלה', 'סוכרת', 'כולסטרול', 'תרופה', 'תרופות', 'כדורים', 'הריון', 'בהריון', 'מניקה', 'אנורקסיה', 'בולימיה', 'להרעיב', 'הרעבה', 'משלשלים', 'אינסולין', 'תסמין', 'תסמינים', 'סרטן', 'אוזמפיק'] },
  { id: 'streak',
    phrases: ['in a row', 'ברצף'],
    words: ['streak', 'streaks', 'רצף', 'רצפים'] },
  { id: 'score',
    phrases: ['health score', 'my score', 'ציון בריאות'],
    words: ['score', 'scores', 'points', 'ציון', 'ציונים', 'נקודות'] },
  { id: 'meal',
    phrases: ['what should i eat', 'what to eat', 'what can i eat', 'what do i eat', 'what shall i eat', 'something to eat', 'eat tonight', 'meal idea', 'ארוחת ערב', 'ארוחת בוקר', 'ארוחת צהריים', 'מה לאכול', 'מה אוכל', 'מה כדאי לאכול', 'מה אפשר לאכול', 'מה אני יכול לאכול', 'מה אני יכולה לאכול', 'מה נאכל'],
    words: ['dinner', 'supper', 'lunch', 'breakfast', 'snack', 'snacks', 'hungry', 'recipe', 'נשנוש', 'נשנושים', 'רעב', 'רעבה', 'מתכון'] },
  { id: 'week',
    phrases: ['how am i doing', 'how im doing', 'how am i', 'how is it going', 'hows it going', 'how did i do', 'my week', 'this week', 'last week', 'my progress', 'איך אני', 'מה המצב', 'איך הולך', 'איך היה', 'השבוע', 'שבוע שעבר'],
    words: ['week', 'weekly', 'progress', 'summary', 'recap', 'overview', 'wk', 'שבוע', 'שבועי', 'סיכום', 'התקדמות', 'מצב'] },
  { id: 'water', phrases: ['hydrat'], words: ['water', 'drink', 'drinking', 'thirsty', 'מים', 'שתייה', 'לשתות', 'שתיתי', 'צמא', 'צמאה'] },
  { id: 'sleep', phrases: [], words: ['sleep', 'slept', 'sleeping', 'tired', 'insomnia', 'bedtime', 'שינה', 'לישון', 'ישנתי', 'עייף', 'עייפה', 'נדודי'] },
  { id: 'protein', phrases: [], words: ['protein', 'proteins', 'חלבון', 'חלבונים'] },
  { id: 'weight', phrases: ['lose weight', 'weight loss', 'לרדת במשקל'], words: ['weight', 'weigh', 'kilo', 'kilos', 'kg', 'diet', 'fat', 'משקל', 'לרדת', 'דיאטה', 'קילו', 'שומן', 'להרזות'] },
  { id: 'calories', phrases: [], words: ['calorie', 'calories', 'kcal', 'cal', 'קלוריות', 'קלוריה', 'קקל'] },
  { id: 'meal', phrases: [], words: ['meal', 'meals', 'food', 'eat', 'eating', 'ארוחה', 'ארוחות', 'אוכל', 'לאכול'] },
  { id: 'help', phrases: ['what can you do', 'good morning', 'good evening', 'מה אתה יכול', 'מה את יכולה', 'בוקר טוב', 'ערב טוב', 'צהריים טובים'], words: ['help', 'hi', 'hello', 'hey', 'עזרה', 'שלום', 'היי', 'הי'] },
  { id: 'thanks', phrases: ['thank you', 'תודה רבה'], words: ['thanks', 'thx', 'ty', 'תודה', 'תודות'] }
];

function tokenVariants(token) {
  const out = [token];
  if (HEB_PREFIX.test(token) && token.length > 3) {
    out.push(token.slice(1));
    if (HEB_PREFIX.test(token.slice(1)) && token.length > 4) out.push(token.slice(2));
  }
  return out;
}

function matchIntent(message) {
  const clean = normalizeText(message).replace(/(.)\1{2,}/g, '$1$1'); // "sooo" → "soo"
  const padded = ` ${clean} `;
  const tokens = clean.split(' ').filter(Boolean);
  const hit = (intent) => {
    if (intent.phrases.some((p) => padded.includes(p))) return true;
    for (const t of tokens) {
      for (const v of tokenVariants(t)) {
        if (intent.words.includes(v)) return true;
        // Typo tolerance for Latin words only: Hebrew prefixes make one-letter
        // neighbours collide (הציון / הריון).
        if (v.length >= 4 && /^[a-z]+$/.test(v) && !FUZZY_STOPLIST.has(v)) {
          for (const w of intent.words) {
            if (w.length >= 5 && w[0] === v[0] && editDistance(v, w) <= 1) return true;
          }
        }
      }
    }
    return false;
  };
  // A per-day calorie number under the safe floor is a safety question.
  const kcalAsk = clean.match(/(\d{3,4})\s*(k?cals?|calories|kcal|קלוריות|קקל)/);
  if (kcalAsk && Number(kcalAsk[1]) < Math.min(MIN_SAFE_CALORIES.male, MIN_SAFE_CALORIES.female)) {
    return { id: 'low-calorie', kcal: Number(kcalAsk[1]) };
  }
  for (const intent of INTENTS) if (hit(intent)) return { id: intent.id };
  return { id: 'fallback' };
}

function mealFromMessage(message) {
  const m = normalizeText(message);
  if (/breakfast|brekfast|morning|בוקר/.test(m)) return 'breakfast';
  if (/snack|נשנוש|between meals/.test(m)) return 'snack';
  return 'main';
}

function todayLine(ctx) {
  const t = ctx.todayTotals;
  const he = ctx.lang === 'he';
  const parts = [];
  if (!ctx.safety.minor) {
    parts.push(he
      ? `${fmt(t.calories)} קק"ל${ctx.goals.calorieTarget ? ` מתוך ${fmt(ctx.goals.calorieTarget)}` : ''}`
      : `${fmt(t.calories)} kcal${ctx.goals.calorieTarget ? ` of ${fmt(ctx.goals.calorieTarget)}` : ''}`);
    parts.push(he
      ? `${r0(t.protein)} גרם חלבון${ctx.goals.proteinTarget ? ` מתוך ${r0(ctx.goals.proteinTarget)}` : ''}`
      : `${r0(t.protein)} g protein${ctx.goals.proteinTarget ? ` of ${r0(ctx.goals.proteinTarget)}` : ''}`);
  } else {
    parts.push(he ? `${t.entries} רישומי מזון` : `${t.entries} food entries`);
  }
  parts.push(he ? `${r1(t.water)} מתוך ${r1(ctx.goals.waterTargetLiters)} ליטר מים` : `${r1(t.water)} of ${r1(ctx.goals.waterTargetLiters)} L water`);
  parts.push(t.sleepLogged
    ? (he ? `${r1(t.sleep)} שעות שינה` : `${r1(t.sleep)} h sleep`)
    : (he ? 'שינה עוד לא נרשמה' : 'sleep not logged yet'));
  return he ? `היום עד עכשיו: ${parts.join(', ')}.` : `Today so far: ${parts.join(', ')}.`;
}

function answerWeek(ctx) {
  const he = ctx.lang === 'he';
  const w = ctx.week;
  const s = w.summary;
  const g = ctx.goals;
  if (w.activeDays === 0) {
    return he
      ? `עדיין אין לי רישומים מ-7 הימים האחרונים (${w.start} – ${w.end}), אז אין לי על מה לסכם. ${todayLine(ctx)} רשמו כמה ימים ואוכל להראות מגמות.`
      : `I don't have any logs from the last 7 days (${w.start} – ${w.end}) yet, so there's nothing to sum up. ${todayLine(ctx)} Log for a few days and I'll show you trends.`;
  }
  const waterHits = w.days.filter((d) => d.liters >= g.waterTargetLiters).length;
  const lines = [];
  lines.push(he
    ? `ב-7 הימים האחרונים (${w.start} – ${w.end}) הייתם פעילים ב-${w.activeDays} ימים ורשמתם אוכל ב-${s.loggedDays}.`
    : `In the last 7 days (${w.start} – ${w.end}) you were active on ${w.activeDays} days and logged food on ${s.loggedDays}.`);
  if (s.loggedDays > 0 && !ctx.safety.minor) {
    lines.push(he
      ? `ממוצע ביום רישום: ${fmt(s.avgCalories)} קק"ל${g.calorieTarget ? ` (יעד ${fmt(g.calorieTarget)})` : ''} ו-${s.avgProtein} גרם חלבון${g.proteinTarget ? ` (יעד ${r0(g.proteinTarget)})` : ''}.`
      : `Average per logged day: ${fmt(s.avgCalories)} kcal${g.calorieTarget ? ` (target ${fmt(g.calorieTarget)})` : ''} and ${s.avgProtein} g protein${g.proteinTarget ? ` (target ${r0(g.proteinTarget)})` : ''}.`);
  }
  lines.push(he
    ? `מים: עמדתם ביעד (${r1(g.waterTargetLiters)} ליטר) ב-${waterHits} מתוך 7 ימים, ממוצע ${s.avgLiters} ליטר ליום.`
    : `Water: you hit your ${r1(g.waterTargetLiters)} L goal on ${waterHits} of 7 days, averaging ${s.avgLiters} L a day.`);
  lines.push(s.nightsLogged
    ? (he ? `שינה: ממוצע ${s.avgSleep} שעות ב-${s.nightsLogged} לילות שנרשמו (יעד ${r1(g.sleepTargetHours)}).` : `Sleep: ${s.avgSleep} h on average over ${s.nightsLogged} logged nights (target ${r1(g.sleepTargetHours)} h).`)
    : (he ? 'שינה: לא נרשמו לילות.' : 'Sleep: no nights logged.'));
  const scores = w.days.filter((d) => d.score).map((d) => d.score.score);
  if (scores.length) {
    const avg = r0(scores.reduce((a, b) => a + b, 0) / scores.length);
    lines.push(he ? `ציון הבריאות הממוצע בימים הפעילים: ${avg}.` : `Your average Health Score on active days: ${avg}.`);
  }
  if (s.weightChange !== null && !ctx.safety.minor) {
    lines.push(he
      ? `משקל: ${s.weightChange > 0 ? '+' : ''}${s.weightChange} ק"ג בין השקילה הראשונה לאחרונה בשבוע (תנודות יומיות הן רגילות).`
      : `Weight: ${s.weightChange > 0 ? '+' : ''}${s.weightChange} kg between your first and last weigh-in this week (daily swings are normal).`);
  }
  const focus = buildInsights(ctx).find((i) => i.kind === 'tip' || i.kind === 'alert');
  if (focus) lines.push(he ? `מה הכי כדאי עכשיו: ${focus.action}` : `Best next step: ${focus.action}`);
  lines.push(todayLine(ctx));
  return lines.join('\n');
}

function answerScore(ctx) {
  const he = ctx.lang === 'he';
  const hs = ctx.eng.healthScore;
  const comps = hs.components
    .map((c) => ({ ...c, gap: r1(c.weight - c.points) }))
    .sort((a, b) => b.gap - a.gap || a.key.localeCompare(b.key));
  const describe = (c) => {
    const name = COMPONENT_NAME[ctx.lang][c.key];
    if (c.key === 'consistency') return he ? `${name}: פעילים ${c.value} מתוך 7 ימים → ${c.points} מתוך ${c.weight} נקודות` : `${name}: active ${c.value} of 7 days → ${c.points} of ${c.weight} points`;
    if (c.key === 'nutrition') {
      if (c.value === 0 && c.score === 0) return he ? `${name}: לא נרשם אוכל היום → 0 מתוך ${c.weight} נקודות` : `${name}: no food logged today → 0 of ${c.weight} points`;
      return he
        ? `${name}: ${c.target ? `${fmt(c.value)} מתוך ${fmt(c.target)} קק"ל` : 'לפי מספר הארוחות שנרשמו'} → ${c.points} מתוך ${c.weight} נקודות`
        : `${name}: ${c.target ? `${fmt(c.value)} of ${fmt(c.target)} kcal` : 'based on meals logged'} → ${c.points} of ${c.weight} points`;
    }
    const unit = c.key === 'hydration' ? (he ? 'ליטר' : 'L') : (he ? 'שעות' : 'h');
    return he ? `${name}: ${c.value} מתוך ${c.target} ${unit} → ${c.points} מתוך ${c.weight} נקודות` : `${name}: ${c.value} of ${c.target} ${unit} → ${c.points} of ${c.weight} points`;
  };
  const TIPS = {
    en: {
      nutrition: 'log your meals today (and, with a calorie target, land within 10% of it)',
      hydration: 'log each glass of water — every litre moves this component',
      sleep: 'log last night’s sleep; an unlogged night counts as zero',
      consistency: 'log something every day — even one entry counts'
    },
    he: {
      nutrition: 'רשמו את הארוחות של היום (ועם יעד קלוריות — היו בטווח של 10% ממנו)',
      hydration: 'רשמו כל כוס מים — כל ליטר מזיז את הרכיב הזה',
      sleep: 'רשמו את השינה של הלילה; לילה שלא נרשם נספר כאפס',
      consistency: 'רשמו משהו כל יום — גם רישום אחד נחשב'
    }
  };
  const top = comps.filter((c) => c.gap > 0).slice(0, 2);
  const trend = hs.trend7d.map((d) => d.score);
  const lines = [];
  lines.push(he
    ? `ציון הבריאות שלכם היום הוא ${hs.today} מתוך 100. הוא מודד עד כמה הנתונים שרשמתם קרובים ליעדים שלכם — זה ציון הרגלים, לא הערכה רפואית.`
    : `Your Health Score today is ${hs.today}/100. It measures how close your logged numbers are to your own targets — it's a habit score, not a medical assessment.`);
  if (!top.length) {
    lines.push(he ? 'כל הרכיבים בשיא — יום מצוין!' : 'Every component is maxed out — a great day!');
  } else {
    lines.push(he ? 'איפה הלכו הנקודות:' : 'Where the points went:');
    for (const c of top) lines.push(`• ${describe(c)}`);
    lines.push(he ? `הצעד הכי משתלם: ${TIPS.he[top[0].key]}.` : `Biggest win: ${TIPS.en[top[0].key]}.`);
  }
  lines.push(he ? `7 הימים האחרונים: ${trend.join(', ')}.` : `Last 7 days: ${trend.join(', ')}.`);
  return lines.join('\n');
}

function answerStreak(ctx) {
  const he = ctx.lang === 'he';
  const s = ctx.eng.streaks.anyLog;
  const streakBadges = ctx.eng.achievements.filter((a) => a.id.startsWith('streak-') && !a.unlocked).sort((a, b) => a.progress.target - b.progress.target);
  const next = streakBadges[0];
  const lines = [];
  if (s.current === 0) {
    lines.push(he
      ? `אין לכם רצף פעיל כרגע${s.best ? ` (השיא שלכם: ${s.best} ימים)` : ''}. רצף מתחיל מרישום אחד היום.`
      : `You don't have an active streak right now${s.best ? ` (your best: ${s.best} days)` : ''}. A streak starts with one entry today.`);
  } else if (s.todayDone) {
    lines.push(he
      ? `אתם ברצף של ${s.current} ימים וכבר רשמתם היום — הרצף בטוח עד סוף מחר.`
      : `You're on a ${s.current}-day streak and you've already logged today — it's safe until the end of tomorrow.`);
  } else {
    lines.push(he
      ? `אתם ברצף של ${s.current} ימים, אבל היום עוד לא נרשם כלום. רשמו משהו לפני חצות (לפי השעון שלכם) כדי לשמור עליו.`
      : `You're on a ${s.current}-day streak, but nothing is logged yet today. Log something before midnight (your time) to keep it.`);
  }
  lines.push(he
    ? 'כל רישום נחשב: ארוחה, כוס מים, שינה או שקילה.'
    : 'Any entry counts: a meal, a glass of water, sleep or a weigh-in.');
  if (next) {
    const remaining = next.progress.target - Math.max(s.current, 0);
    if (remaining > 0) lines.push(he ? `עוד ${remaining === 1 ? 'יום אחד' : `${remaining} ימים`} ברצף כדי לפתוח את „${next.title}”.` : `${remaining} more ${remaining === 1 ? 'day' : 'days'} in a row unlocks “${next.title}”.`);
  }
  lines.push(he ? 'טיפ: הפעילו תזכורת יומית בהגדרות.' : 'Tip: turn on a daily reminder in Settings.');
  return lines.join('\n');
}

const MEAL_PLAN_LINK = {
  he: 'תפריט לכל השבוע, עם רשימת קניות: המתכנן השבועי',
  en: 'A whole week planned, with a shopping list: the weekly meal planner'
};

function answerMeal(ctx, message) {
  const he = ctx.lang === 'he';
  const meal = mealFromMessage(message);
  const { ideas, remainingKcal, remainingProtein } = suggestMeals(ctx, meal);
  const lines = [];
  const mealName = { main: he ? 'ארוחה' : 'a meal', breakfast: he ? 'ארוחת בוקר' : 'breakfast', snack: he ? 'נשנוש' : 'a snack' }[meal];

  if (ctx.safety.minor) {
    lines.push(he
      ? `הנה רעיונות מאוזנים ל${mealName}. אכלו עד שאתם שבעים בנוחות — גוף שגדל צריך מספיק אנרגיה.`
      : `Here are balanced ideas for ${mealName}. Eat until you're comfortably full — a growing body needs enough energy.`);
  } else if (remainingKcal !== null) {
    if (remainingKcal > 0) {
      lines.push(he
        ? `נשארו לכם היום כ-${fmt(remainingKcal)} קק"ל${remainingProtein !== null && remainingProtein > 0 ? ` וכ-${r0(remainingProtein)} גרם חלבון` : ''} (רשמתם ${fmt(ctx.todayTotals.calories)} מתוך ${fmt(ctx.goals.calorieTarget)}).`
        : `You have about ${fmt(remainingKcal)} kcal${remainingProtein !== null && remainingProtein > 0 ? ` and ${r0(remainingProtein)} g protein` : ''} left today (${fmt(ctx.todayTotals.calories)} of ${fmt(ctx.goals.calorieTarget)} logged).`);
    } else {
      lines.push(he
        ? `כבר הגעתם ליעד הקלוריות היום (${fmt(ctx.todayTotals.calories)} מתוך ${fmt(ctx.goals.calorieTarget)}), אז העדפתי אפשרויות קלות יותר. אין צורך לדלג על ארוחה.`
        : `You've already reached today's calorie target (${fmt(ctx.todayTotals.calories)} of ${fmt(ctx.goals.calorieTarget)}), so I put lighter options first. No need to skip the meal.`);
    }
  } else {
    lines.push(he
      ? 'אין לי עדיין יעד קלוריות עבורכם (אפשר לקבוע בהגדרות), אז הנה רעיונות מאוזנים.'
      : "I don't have a calorie target for you yet (you can set one in Settings), so here are balanced ideas.");
  }

  const prefs = [];
  if (ctx.dietary.diets.length) {
    const DIET = {
      en: { vegetarian: 'vegetarian', vegan: 'vegan', kosher: 'kosher', gluten_free: 'gluten-free', lactose_free: 'lactose-free' },
      he: { vegetarian: 'צמחוני', vegan: 'טבעוני', kosher: 'כשר', gluten_free: 'ללא גלוטן', lactose_free: 'ללא לקטוז' }
    };
    prefs.push(ctx.dietary.diets.map((d) => DIET[ctx.lang][d]).join(', '));
  }
  if (!ideas.length) {
    lines.push(he
      ? 'לא מצאתי ברשימה הקצרה שלי רעיון שמתאים להעדפות ולאלרגיות שלכם, ואני לא רוצה לנחש. דיאטנית יכולה לבנות איתכם תפריט בטוח.'
      : "I couldn't find an idea on my short list that fits your preferences and allergies, and I don't want to guess. A dietitian can build a safe menu with you.");
  } else {
    const intro = he
      ? `רעיונות${prefs.length ? ` (${prefs.join('; ')})` : ''}:`
      : `Ideas${prefs.length ? ` (${prefs.join('; ')})` : ''}:`;
    lines.push(intro);
    for (const m of ideas) {
      lines.push(ctx.safety.minor
        ? `• ${m[ctx.lang]}`
        : (he ? `• ${m.he} — כ-${m.kcal} קק"ל, ${m.protein} גרם חלבון` : `• ${m.en} — about ${m.kcal} kcal, ${m.protein} g protein`));
    }
  }
  if (ctx.dietary.allergy.text) {
    lines.push(he
      ? `השמטתי כל מה שמתאים לאלרגיות שציינתם („${ctx.dietary.allergy.text}”). תמיד בדקו את רשימת הרכיבים על האריזה.`
      : `I left out anything matching the allergies you listed (“${ctx.dietary.allergy.text}”). Always check ingredient labels.`);
  }
  if (ctx.safety.extreme.includes('calories-below-floor')) {
    lines.push(...safetyLines(ctx).filter((l) => /kcal|קק"ל/.test(l)));
  }
  if (!ctx.safety.minor && ideas.length) lines.push(he ? 'הכמויות משוערות — התאימו לרעב שלכם.' : 'Portions are estimates — adjust to your hunger.');
  // The chat renders a trailing " → /path" line as a link (CoachingPage).
  if (ideas.length) lines.push(he ? `${MEAL_PLAN_LINK.he} → /meal-plan` : `${MEAL_PLAN_LINK.en} → /meal-plan`);
  return lines.join('\n');
}

function answerWeight(ctx) {
  const he = ctx.lang === 'he';
  const lines = [];
  if (ctx.safety.minor) {
    return he
      ? 'מכיוון שאתם מתחת לגיל 18, אני לא נותן עצות לירידה במשקל או להפחתת קלוריות. גוף שגדל צריך מספיק אנרגיה — כדאי לדבר על זה עם הורה ועם רופא או דיאטנית. אני כן יכול לעזור עם מים, שינה והרגלי רישום.'
      : "Because you're under 18, I don't give weight-loss or calorie-cutting advice. A growing body needs enough energy — please talk about this with a parent and a doctor or dietitian. I'm happy to help with water, sleep and logging habits.";
  }
  if (ctx.weight) {
    const w = ctx.weight;
    lines.push(he
      ? `בשקילות שלכם ב-${w.spanDays} הימים האחרונים המשקל עבר מ-${w.firstKg} ל-${w.lastKg} ק"ג${w.targetKg !== null ? ` (יעד: ${w.targetKg} ק"ג)` : ''}.`
      : `Across your weigh-ins over the last ${w.spanDays} days your weight went from ${w.firstKg} to ${w.lastKg} kg${w.targetKg !== null ? ` (goal: ${w.targetKg} kg)` : ''}.`);
  } else {
    lines.push(he ? 'אין לי מספיק שקילות מהחודש האחרון כדי לראות מגמה — שקילה אחת בשבוע באותה שעה מספיקה.' : "I don't have enough weigh-ins from the last month to see a trend — once a week at the same time of day is plenty.");
  }
  if (ctx.safety.noCalorieCut) {
    lines.push(...safetyLines(ctx));
    lines.push(he ? 'לכן אני לא מציע גירעון קלורי — רופא יכול לעזור לתכנן את הצעד הבא.' : "So I won't suggest a calorie deficit — a doctor can help plan your next step.");
  } else if (ctx.mainGoal === 'lose_weight' || (ctx.weight && ctx.weight.direction < 0)) {
    lines.push(he
      ? 'לירידה הדרגתית, העדיפו גירעון קטן וקבוע על פני דיאטות קיצוניות, חלבון בכל ארוחה, ותנועה יומית. אין הבטחות לקצב — כל גוף שונה.'
      : 'For gradual loss, a small steady deficit beats crash diets; add protein at each meal and daily movement. No promises on pace — every body is different.');
  } else {
    lines.push(he ? 'שימרו על שגרה של אוכל מאוזן, שינה ותנועה, והסתכלו על המגמה לאורך כמה שבועות.' : 'Keep a steady routine of balanced food, sleep and movement, and look at the trend over several weeks.');
  }
  if (ctx.safety.flags.includes('bmi-high')) lines.push(SAFETY_COPY[ctx.lang]['bmi-high']);
  return lines.join('\n');
}

function answerCalories(ctx) {
  const he = ctx.lang === 'he';
  if (ctx.safety.minor) {
    return he
      ? `${SAFETY_COPY.he.minor} ${todayLine(ctx)}`
      : `${SAFETY_COPY.en.minor} ${todayLine(ctx)}`;
  }
  const t = ctx.todayTotals;
  const target = ctx.goals.calorieTarget;
  const lines = [];
  if (target) {
    const remaining = target - t.calories;
    lines.push(he
      ? `רשמתם היום ${fmt(t.calories)} מתוך ${fmt(target)} קק"ל${remaining > 0 ? ` — נותרו כ-${fmt(remaining)}` : ''}.`
      : `You've logged ${fmt(t.calories)} of your ${fmt(target)} kcal today${remaining > 0 ? ` — about ${fmt(remaining)} left` : ''}.`);
  } else {
    lines.push(he ? `רשמתם היום ${fmt(t.calories)} קק"ל. אין לכם עדיין יעד קלוריות — אפשר לקבוע בהגדרות.` : `You've logged ${fmt(t.calories)} kcal today. You don't have a calorie target yet — you can set one in Settings.`);
  }
  const lines2 = safetyLines(ctx).filter((l) => /kcal|קק"ל|calorie|קלור/.test(l));
  lines.push(...lines2);
  lines.push(he ? 'התמקדו במזון מלא, ירקות וחלבון בכל ארוחה.' : 'Focus on whole foods, with vegetables and protein at each meal.');
  return lines.join('\n');
}

function answerWater(ctx) {
  const he = ctx.lang === 'he';
  const g = ctx.goals.waterTargetLiters;
  const hits = ctx.week.days.filter((d) => d.liters >= g).length;
  const left = Math.max(0, g - ctx.todayTotals.water);
  return he
    ? `היום שתיתם ${r1(ctx.todayTotals.water)} מתוך ${r1(g)} ליטר${left > 0 ? ` — נותרו כ-${r1(left)} ליטר` : ' — עמדתם ביעד!'}. ב-7 הימים האחרונים עמדתם ביעד ב-${hits} ימים. טיפ: כוס מים לפני כל ארוחה, ובקבוק על השולחן.`
    : `Today you've had ${r1(ctx.todayTotals.water)} of ${r1(g)} L${left > 0 ? ` — about ${r1(left)} L to go` : ' — goal reached!'}. In the last 7 days you hit your goal on ${hits} days. Tip: a glass before each meal, and a bottle on your desk.`;
}

function answerSleep(ctx) {
  const he = ctx.lang === 'he';
  const g = ctx.goals.sleepTargetHours;
  const nights = ctx.week.days.filter((d) => d.sleepLogged);
  const avg = nights.length ? r1(nights.reduce((s, d) => s + d.sleepHours, 0) / nights.length) : null;
  const hits = nights.filter((d) => d.sleepHours >= g).length;
  const data = nights.length
    ? (he ? `ב-7 הימים האחרונים רשמתם ${nights.length} לילות, ממוצע ${avg} שעות, והגעתם ליעד (${r1(g)} שעות) ב-${hits} מהם.` : `In the last 7 days you logged ${nights.length} nights, averaging ${avg} h, and reached your ${r1(g)} h target on ${hits}.`)
    : (he ? 'לא רשמתם שינה ב-7 הימים האחרונים.' : "You haven't logged sleep in the last 7 days.");
  return he
    ? `${data} טיפים: שעת שינה קבועה, חדר חשוך, ובלי מסכים בשעה שלפני השינה. אם קשיי שינה נמשכים, כדאי להתייעץ עם רופא.`
    : `${data} Tips: a consistent bedtime, a dark room, and no screens in the last hour. If poor sleep keeps going, it's worth talking to a doctor.`;
}

function answerProtein(ctx) {
  const he = ctx.lang === 'he';
  const target = ctx.goals.proteinTarget;
  const t = ctx.todayTotals;
  const foodDays = ctx.week.days.filter((d) => d.foodEntries > 0);
  const avg = foodDays.length ? r0(foodDays.reduce((s, d) => s + d.protein, 0) / foodDays.length) : null;
  const sources = proteinSources(ctx);
  const lines = [];
  if (ctx.safety.minor) {
    lines.push(he ? 'חלבון עוזר לשובע ולבניית השריר. איננו קובעים יעדי מאקרו לבני נוער.' : "Protein helps with fullness and building muscle. We don't set macro targets for teens.");
  } else {
    lines.push(he
      ? `היום: ${r0(t.protein)} גרם חלבון${target ? ` מתוך ${r0(target)}` : ''}.${avg !== null ? ` ממוצע ב-${foodDays.length} ימי רישום אחרונים: ${avg} גרם.` : ''}`
      : `Today: ${r0(t.protein)} g protein${target ? ` of ${r0(target)} g` : ''}.${avg !== null ? ` Average over your last ${foodDays.length} logged days: ${avg} g.` : ''}`);
  }
  if (sources.length) lines.push(he ? `מקורות שמתאימים להעדפות שלכם: ${sources.join(', ')}.` : `Sources that fit your preferences: ${sources.join(', ')}.`);
  return lines.join(' ');
}

function answerMedical(ctx) {
  const he = ctx.lang === 'he';
  return he
    ? 'זו שאלה רפואית, ואני לא יכול לאבחן או לתת ייעוץ רפואי. כדאי לפנות לרופא או לדיאטנית קלינית. אם קשה לכם סביב אוכל או אכילה, אתם לא לבד — רופא המשפחה הוא מקום טוב להתחיל בו. אני כאן לעזור עם הרגלים יומיומיים: מים, שינה, רישום וארוחות מאוזנות.'
    : "That's a medical question, and I can't diagnose or give medical advice. Please talk to a doctor or a registered dietitian. If things feel hard around food or eating, you're not alone — your family doctor is a good place to start. I'm here to help with everyday habits: water, sleep, logging and balanced meals.";
}

function answerLowCalorie(ctx, kcal) {
  const he = ctx.lang === 'he';
  const floor = ctx.safety.floor;
  return he
    ? `${fmt(kcal)} קק"ל ביום נמוך מ-${fmt(floor)} קק"ל, מינימום בטוח מקובל. ליעדים נמוכים כאלה מומלץ ליווי של רופא או דיאטנית, ולכן אני לא בונה תפריט כזה. ${PROFESSIONAL_NOTE.he}`
    : `${fmt(kcal)} kcal a day is below ${fmt(floor)} kcal, a commonly used safe minimum. Targets that low need a doctor or dietitian, so I won't plan one. ${PROFESSIONAL_NOTE.en}`;
}

function answerHelp(ctx) {
  const he = ctx.lang === 'he';
  return he
    ? `אני המאמן של YAHEALTHY, ואני עונה רק לפי הנתונים שלכם. אפשר לשאול למשל: "איך הלך לי השבוע?", "מה לאכול לארוחת ערב?", "למה הציון שלי נמוך?", "איך שומרים על הרצף?", או על מים, שינה, חלבון ומשקל. ${todayLine(ctx)}`
    : `I'm your YAHEALTHY coach, and I answer only from your own data. Try: "How am I doing this week?", "What should I eat for dinner?", "Why is my score low?", "How do I keep my streak?", or ask about water, sleep, protein or weight. ${todayLine(ctx)}`;
}

function answerFallback(ctx) {
  const he = ctx.lang === 'he';
  return he
    ? `לא בטוח שהבנתי, ואני מעדיף לא לנחש. אני יכול לעזור עם: סיכום השבוע, רעיונות לארוחה שמתאימים ליעדים ולאלרגיות שלכם, הסבר על ציון הבריאות, שמירה על הרצף, מים, שינה, חלבון ומשקל. ${todayLine(ctx)}`
    : `I'm not sure I understood, and I'd rather not guess. I can help with: your week in review, meal ideas that fit your targets and allergies, what's behind your Health Score, keeping your streak, water, sleep, protein and weight. ${todayLine(ctx)}`;
}

/** Pure: an answer string for `message`, grounded in `ctx`. */
function answerQuestion(ctx, message) {
  const intent = matchIntent(message);
  switch (intent.id) {
    case 'medical': return answerMedical(ctx);
    case 'low-calorie': return answerLowCalorie(ctx, intent.kcal);
    case 'streak': return answerStreak(ctx);
    case 'score': return answerScore(ctx);
    case 'week': return answerWeek(ctx);
    case 'meal': return answerMeal(ctx, message);
    case 'water': return answerWater(ctx);
    case 'sleep': return answerSleep(ctx);
    case 'protein': return answerProtein(ctx);
    case 'weight': return answerWeight(ctx);
    case 'calories': return answerCalories(ctx);
    case 'help': return answerHelp(ctx);
    case 'thanks': return ctx.lang === 'he' ? 'בשמחה! אני כאן בכל פעם שתרצו לבדוק איך הולך.' : "You're welcome! I'm here whenever you want to check in.";
    default: return answerFallback(ctx);
  }
}

// ─── mounted API ───────────────────────────────────────────────────────────

async function contextFor(userId, lang, { today, tz } = {}) {
  const day = today || todayUtc();
  const raw = await loadCoachData(userId, { today: day });
  return buildCoachContext(raw, { today: day, tz: tz || 'UTC', lang, now: new Date() });
}

/** GET /api/crm/users/:userId/insights → up to 4 prioritized cards. */
async function generateInsights(userId, lang = 'en', opts = {}) {
  return buildInsights(await contextFor(userId, lang, opts));
}

/** POST /api/crm/users/:userId/ask → answer string. */
async function answer(userId, message, lang = 'en', opts = {}) {
  return answerQuestion(await contextFor(userId, lang, opts), message);
}

module.exports = {
  generateInsights,
  answer,
  lockedInsightCard,
  // pure layer (tests)
  loadCoachData,
  buildCoachContext,
  buildInsights,
  answerQuestion,
  matchIntent,
  suggestMeals,
  resolveSafety,
  parseAllergies,
  mealConflict,
  MEALS,
  ALLERGEN_WORDS,
  MAX_INSIGHTS
};
