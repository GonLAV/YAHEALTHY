const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('YAHEALTHY API is running...');
});

// Sample Recipes Data (In-memory for now, can be moved to DB later)
const recipes = [
    {
        id: "1",
        name: "סלט קינואה עם ירקות צלויים",
        nutritionist: "ד״ר שרה כהן",
        difficulty: "קל",
        time: "30 דקות",
        calories: "320 קלוריות",
        category: "צהריים",
        rating: 4.8,
        image: "🥗",
        ingredients: [
            { item: "קינואה", amount: "1 כוס", category: "דגנים" },
            { item: "בטטה", amount: "1 בינונית", category: "ירקות" },
            { item: "גזר", amount: "2 יחידות", category: "ירקות" },
            { item: "זוקיני", amount: "1 יחידה", category: "ירקות" },
            { item: "שמן זית", amount: "2 כפות", category: "שמנים" },
            { item: "לימון", amount: "1 יחידה", category: "פירות" }
        ],
        steps: [
            { step: 1, text: "הדליקו תנור ל-200 מעלות", video: "prep" },
            { step: 2, text: "חתכו את הירקות לקוביות בגודל אחיד", video: "chop" },
            { step: 3, text: "ערבבו ירקות עם שמן זית ותבלינים", video: "mix" },
            { step: 4, text: "אפו 25 דקות עד שהירקות מקבלים צבע זהוב", video: "bake" },
            { step: 5, text: "בשלו קינואה לפי ההוראות על האריזה", video: "cook" },
            { step: 6, text: "ערבבו הכל יחד והוסיפו מיץ לימון", video: "combine" }
        ],
        tips: "אפשר להוסיף גבינת פטה או אגוזים לחלבון נוסף",
        nutritionistNote: "מנה מאוזנת עם פחמימות מורכבות וסיבים תזונתיים"
    },
    {
        id: "2",
        name: "עוף בגריל עם ירקות על הפלנצ׳ה",
        nutritionist: "דני לוי",
        difficulty: "בינוני",
        time: "45 דקות",
        calories: "410 קלוריות",
        category: "ערב",
        rating: 4.9,
        image: "🍗",
        ingredients: [
            { item: "חזה עוף", amount: "400 גרם", category: "חלבונים" },
            { item: "פלפל צבעוני", amount: "3 יחידות", category: "ירקות" },
            { item: "בצל", amount: "2 יחידות", category: "ירקות" },
            { item: "שום", amount: "4 שיניים", category: "תבלינים" },
            { item: "פפריקה מעושנת", amount: "1 כפית", category: "תבלינים" },
            { item: "שמן זית", amount: "3 כפות", category: "שמנים" }
        ],
        steps: [
            { step: 1, text: "חתכו עוף לרצועות דקות", video: "cut" },
            { step: 2, text: "מרינדה: שמן, שום, פפריקה - 20 דקות", video: "marinate" },
            { step: 3, text: "חתכו ירקות לרצועות", video: "slice" },
            { step: 4, text: "חממו מחבת על אש גבוהה", video: "heat" },
            { step: 5, text: "טגנו עוף 4 דקות כל צד", video: "cook" },
            { step: 6, text: "הוסיפו ירקות וטגנו 5 דקות נוספות", video: "finish" }
        ],
        tips: "מוגש עם אורז מלא או לחם פיתה מחיטה מלאה",
        nutritionistNote: "עשיר בחלבון איכותי ונמוך בשומן רווי"
    },
    {
        id: "3",
        name: "שייק פירות וגרנולה",
        nutritionist: "ד״ר מיכל רוזן",
        difficulty: "קל מאוד",
        time: "10 דקות",
        calories: "280 קלוריות",
        category: "בוקר",
        rating: 4.7,
        image: "🥤",
        ingredients: [
            { item: "בננה קפואה", amount: "1 יחידה", category: "פירות" },
            { item: "תותים", amount: "1 כוס", category: "פירות" },
            { item: "יוגורט יווני", amount: "150 גרם", category: "חלבונים" },
            { item: "חלב שקדים", amount: "1 כוס", category: "משקאות" },
            { item: "גרנולה", amount: "3 כפות", category: "דגנים" },
            { item: "דבש", amount: "1 כפית", category: "ממתיקים" }
        ],
        steps: [
            { step: 1, text: "שימו את הפירות הקפואים בבלנדר", video: "add" },
            { step: 2, text: "הוסיפו יוגורט וחלב שקדים", video: "pour" },
            { step: 3, text: "טחנו עד לקבלת מרקם חלק", video: "blend" },
            { step: 4, text: "טעמו והוסיפו דבש לפי הצורך", video: "taste" },
            { step: 5, text: "מזגו לכוס והוסיפו גרנולה מלמעלה", video: "serve" }
        ],
        tips: "אפשר להוסיף זרעי צ׳יה או פשתן לאומגה 3",
        nutritionistNote: "ארוחת בוקר מאוזנת עם חלבון ופחמימות מורכבות"
    }
];

let userMealPlans = [];
let userSurveys = [];
let weightGoals = [];
let weightLogs = [];
let fastingWindows = [];
let readinessLogs = [];
let travelModes = [];
let offlineLogs = [];
let streakLogs = [];

/**
 * Health calculation constants (simplified, non-medical guidance):
 * - CALORIES_PER_KG: estimated deficit needed to lose ~1kg of body fat
 * - MIN_DAILY_CALORIES: conservative floor; can be overridden by caller if guided by a clinician
 * - BODY_FAT_*: coefficients from the Deurenberg body-fat estimate formula
 */
const CALORIES_PER_KG = 7700;
const MIN_DAILY_CALORIES = 1200;
const BASE_KCAL_PER_KG = 22;
const DEFAULT_DAILY_DEFICIT = 500;
const PROTEIN_MIN_G_PER_KG = 1.2; // general guideline
const FIBER_MIN_GRAMS = 25;
const WATER_ACTIVITY_L_PER_MIN = 0.012; // rough add-on per active minute
const STREAK_DAY_TOLERANCE = 1.1; // days
const READINESS_HRV_WEIGHT = 50;
const READINESS_SLEEP_WEIGHT = 50;
const READINESS_SLEEP_REF = 8;
const DEFAULT_WATER_REMINDER_TIMES = ["08:00", "11:00", "14:00", "17:00", "20:00"];
const MAX_OFFLINE_ENTRIES = 100;
const BODY_FAT_BMI_COEF = 1.2;
const BODY_FAT_AGE_COEF = 0.23;
const BODY_FAT_SEX_COEF = 10.8;
const BODY_FAT_BASE = 5.4;
const activityMultipliers = {
    athlete: 1.75,
    nonathlete: 1.3,
    senior: 1.15,
    recovery: 1.1,
    pregnant: 1.4,
    default: 1.3
};

function buildWeeklyGroceryPlan(dailyCalories) {
    if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) return null;
    const weeklyCalories = dailyCalories * 7;
    const splits = {
        produce: 0.35,
        protein: 0.25,
        carbs: 0.25,
        fats: 0.15
    };
    const grams = {
        produce: Math.round((weeklyCalories * splits.produce) / 0.6), // assume ~0.6 kcal per gram mixed produce
        protein: Math.round((weeklyCalories * splits.protein) / 4), // 4 kcal/g
        carbs: Math.round((weeklyCalories * splits.carbs) / 4), // 4 kcal/g
        fats: Math.round((weeklyCalories * splits.fats) / 9) // 9 kcal/g
    };

    const bundle = [
        { category: "vegetables", amount: `${Math.round(grams.produce * 0.6)} g`, suggestion: "leafy greens, peppers, broccoli" },
        { category: "fruits", amount: `${Math.round(grams.produce * 0.4)} g`, suggestion: "berries, apples, citrus" },
        { category: "protein", amount: `${grams.protein} g`, suggestion: "chicken, fish, tofu, legumes" },
        { category: "carbs", amount: `${grams.carbs} g`, suggestion: "whole grains, quinoa, sweet potatoes" },
        { category: "fats", amount: `${grams.fats} g`, suggestion: "olive oil, nuts, seeds, avocado" }
    ];

    return {
        dailyCalories,
        weeklyCalories,
        grams,
        bundle
    };
}

function suggestSwaps(ingredients = [], allergies = [], preference = "") {
    const allergySet = new Set(allergies.map(a => a.toLowerCase()));
    const swaps = ingredients.map(item => {
        const name = (item.item || item.name || "").toLowerCase();
        if (allergySet.has(name) || name.includes(preference.toLowerCase())) {
            return { original: item, substitute: "tofu" };
        }
        if (name.includes("chicken")) return { original: item, substitute: "turkey" };
        if (name.includes("fish")) return { original: item, substitute: "salmon" };
        if (name.includes("beef")) return { original: item, substitute: "lentils" };
        return { original: item, substitute: "beans" };
    });
    return swaps;
}

function optimizeGroceries(plan, pricePerGram = {}) {
    if (!plan?.grams) return null;
    const defaults = { produce: 0.005, protein: 0.01, carbs: 0.004, fats: 0.02 };
    const calc = key => Number(((plan.grams[key] || 0) * (pricePerGram[key] || defaults[key])).toFixed(2));
    const cost = {
        produce: calc("produce"),
        protein: calc("protein"),
        carbs: calc("carbs"),
        fats: calc("fats")
    };
    const total = Object.values(cost).reduce((a, b) => a + b, 0);
    return { cost, total: Number(total.toFixed(2)), deliveryEtaMinutes: 90 };
}

function fastingGuidance(windowHours) {
    if (!Number.isFinite(windowHours) || windowHours <= 0) return null;
    const type = windowHours >= 16 ? "16:8" : windowHours >= 14 ? "14:10" : "12:12";
    const tips = [
        "Hydrate during fasting window",
        "Prioritize protein and fiber at first meal",
        "Avoid heavy sugar during eating window"
    ];
    return { protocol: type, tips, windowHours };
}

function scoreNutrition(weightKg, calories, proteinG, fiberG) {
    if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(calories) || calories <= 0) return null;
    const proteinMin = Math.round(weightKg * PROTEIN_MIN_G_PER_KG);
    const proteinScore = Math.min(1, proteinG / proteinMin || 0);
    const fiberScore = Math.min(1, fiberG / FIBER_MIN_GRAMS || 0);
    const score = Number(((proteinScore * 0.6 + fiberScore * 0.4) * 100).toFixed(1));
    return { proteinMin, fiberMin: FIBER_MIN_GRAMS, proteinScore, fiberScore, score };
}

function planLeftovers(servings, days) {
    if (!Number.isFinite(servings) || servings <= 0) return null;
    const keepDays = Number.isFinite(days) && days > 0 ? days : 3;
    return {
        servings,
        keepDays,
        schedule: [
            { day: 1, action: "Fresh cook & portion" },
            { day: Math.min(keepDays, 3), action: "Reheat half" },
            { day: keepDays, action: "Freeze remaining and label" }
        ]
    };
}

function readinessScore(hrv, restingHr, sleepHours) {
    if (!Number.isFinite(hrv) || !Number.isFinite(restingHr) || !Number.isFinite(sleepHours)) return null;
    // Simple blended readiness: HRV/resting HR plus sleep vs reference
    const totalWeight = READINESS_HRV_WEIGHT + READINESS_SLEEP_WEIGHT;
    const blended = ((hrv / restingHr) * READINESS_HRV_WEIGHT + (sleepHours / READINESS_SLEEP_REF) * READINESS_SLEEP_WEIGHT) / totalWeight;
    const normalized = Math.max(0, Math.min(100, blended * 100));
    const status = normalized >= 75 ? "green" : normalized >= 55 ? "yellow" : "red";
    return { score: Number(normalized.toFixed(1)), status };
}

function waterReminderPlan(weightKg, activityMinutes) {
    if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
    const base = Math.max(2, weightKg * 0.033);
    const extra = Math.max(0, activityMinutes || 0) * WATER_ACTIVITY_L_PER_MIN;
    const targetLiters = Number((base + extra).toFixed(2));
    const times = Array.isArray(DEFAULT_WATER_REMINDER_TIMES) && DEFAULT_WATER_REMINDER_TIMES.length ? DEFAULT_WATER_REMINDER_TIMES : ["09:00", "12:00", "15:00", "18:00"];
    const reminders = times.map(time => ({ time, amountLiters: Number((targetLiters / times.length).toFixed(2)) }));
    return { targetLiters, reminders };
}

function sleepDebt(targetHours, sleepHoursList = []) {
    if (!Number.isFinite(targetHours) || targetHours <= 0 || !Array.isArray(sleepHoursList) || sleepHoursList.length === 0) return null;
    const filtered = sleepHoursList.filter(Number.isFinite);
    if (!filtered.length) return null;
    const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    const debt = Number((targetHours - avg).toFixed(2));
    return { targetHours, averageSleep: Number(avg.toFixed(2)), debt };
}

function streakFromDates(dates = []) {
    const days = dates.map(d => new Date(d)).filter(d => !isNaN(d)).sort((a, b) => a - b);
    if (!days.length) return { current: 0, longest: 0 };
    let current = 1, longest = 1;
    for (let i = 1; i < days.length; i++) {
        const diff = (days[i] - days[i - 1]) / (1000 * 60 * 60 * 24);
        if (diff >= 1 && diff <= STREAK_DAY_TOLERANCE) {
            current += 1;
        } else {
            longest = Math.max(longest, current);
            current = 1;
        }
    }
    longest = Math.max(longest, current);
    return { current, longest };
}

function travelSuggestions(location, cuisine) {
    return {
        location: location || "unspecified",
        cuisine: cuisine || "balanced",
        suggestions: [
            { meal: "Breakfast", idea: "Greek yogurt, berries, nuts" },
            { meal: "Lunch", idea: "Grilled protein, mixed greens, olive oil" },
            { meal: "Dinner", idea: "Fish, roasted veggies, quinoa" }
        ]
    };
}

function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSexFactor(genderText) {
    switch (genderText) {
        case 'men':
        case 'male':
            return 1;
        case 'women':
        case 'female':
            return 0;
        default:
            return 0.5;
    }
}

function normalizeLifestyle(value) {
    return (value || '').toLowerCase().replace(/\s+/g, '');
}

function calculateBodyFatPercentage(bmi, age, sexFactor) {
    if (bmi === null) return null;
    return Number((BODY_FAT_BMI_COEF * bmi + BODY_FAT_AGE_COEF * (age || 0) - BODY_FAT_SEX_COEF * sexFactor - BODY_FAT_BASE).toFixed(1));
}

function isRealisticNumber(value, min, max) {
    const num = Number(value);
    return Number.isFinite(num) && num >= min && num <= max;
}

function calculateSurveyMetrics(data) {
    const weightKg = Number(data.weightKg);
    const hasWeight = Number.isFinite(weightKg) && weightKg > 0;
    const targetWeightKg = data.targetWeightKg ? Number(data.targetWeightKg) : null;
    const heightM = data.heightCm ? data.heightCm / 100 : 0;
    const hasHeight = Number.isFinite(heightM) && heightM > 0;
    const bmi = hasHeight && hasWeight ? Number((weightKg / (heightM * heightM)).toFixed(1)) : null;
    const genderText = (data.gender || '').toLowerCase();
    const sexFactor = getSexFactor(genderText);
    const bodyFatPercentage = calculateBodyFatPercentage(bmi, data.age, sexFactor);
    const activityKey = normalizeLifestyle(data.lifestyle);
    const activity = activityMultipliers[activityKey] || activityMultipliers.default;
    // Rough maintenance estimate: kcal baseline per kg with activity multiplier
    const maintenanceCalories = weightKg ? Math.round(weightKg * activity * BASE_KCAL_PER_KG) : null;
    const calorieFloor = data.calorieFloor && Number(data.calorieFloor) > 0 ? Number(data.calorieFloor) : MIN_DAILY_CALORIES;

    let recommendedDailyCalories = maintenanceCalories ? maintenanceCalories - DEFAULT_DAILY_DEFICIT : null;
    if (maintenanceCalories && targetWeightKg !== null) {
        const totalLossKg = Math.max(0, weightKg - targetWeightKg);
        const targetDays = data.targetDays && data.targetDays > 0 ? data.targetDays : 90;
        const totalDeficit = totalLossKg * CALORIES_PER_KG;
        const perDayDeficit = totalDeficit / targetDays;
        recommendedDailyCalories = Math.max(calorieFloor, Math.round(maintenanceCalories - perDayDeficit));
    }

    const waterLitersTarget = hasWeight ? Number((Math.max(2, weightKg * 0.033)).toFixed(2)) : null;
    const sleepHoursTarget = Number.isFinite(data.age)
        ? (data.age < 18 ? 9 : data.age < 65 ? 8 : 7.5)
        : 8;

    return {
        bmi,
        bodyFatPercentage,
        maintenanceCalories,
        recommendedDailyCalories,
        activityMultiplierUsed: activity,
        lifestyleAccepted: Boolean(activityMultipliers[activityKey]),
        calorieFloorUsed: calorieFloor,
        waterLitersTarget,
        sleepHoursTarget
    };
}

function calculateGoalProgress(goal) {
    const relatedLogs = weightLogs.filter(log => log.goalId === goal.id).sort((a, b) => new Date(a.date) - new Date(b.date));
    const latestLog = relatedLogs[relatedLogs.length - 1];
    const totalLossKg = Math.max(0, goal.startWeightKg - goal.targetWeightKg);
    const lostSoFarKg = latestLog ? goal.startWeightKg - latestLog.weightKg : 0;
    const remainingKg = Math.max(0, totalLossKg - lostSoFarKg);
    const startDate = goal.startDate ? new Date(goal.startDate) : new Date();
    const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
    const today = new Date();
    const totalDays = targetDate ? Math.max(1, Math.round((targetDate - startDate) / (1000 * 60 * 60 * 24))) : null;
    const lastProgressDate = latestLog ? new Date(latestLog.date) : today;
    const daysElapsed = Math.max(0, Math.round((lastProgressDate - startDate) / (1000 * 60 * 60 * 24)));
    const expectedLossByNow = totalDays ? Math.min(totalLossKg, (totalLossKg / totalDays) * daysElapsed) : 0;
    const celebration = totalLossKg > 0 && lostSoFarKg >= expectedLossByNow && lostSoFarKg > 0;
    const progressColor = lostSoFarKg / (totalLossKg || 1);
    const progressStatus = progressColor >= 0.8 ? 'green' : progressColor >= 0.4 ? 'yellow' : 'red';

    const waterTarget = goal.waterLitersTarget || (goal.startWeightKg ? Number((Math.max(2, goal.startWeightKg * 0.033)).toFixed(2)) : null);
    const sleepTarget = goal.sleepHoursTarget || 8;
    const hydrationStatus = latestLog?.waterLiters && waterTarget ? (latestLog.waterLiters >= waterTarget ? 'green' : 'red') : 'yellow';
    const sleepStatus = latestLog?.sleepHours && sleepTarget ? (latestLog.sleepHours >= sleepTarget ? 'green' : 'red') : 'yellow';

    return {
        goal,
        latestWeightKg: latestLog ? latestLog.weightKg : goal.startWeightKg,
        totalLossKg: Number(totalLossKg.toFixed(1)),
        lostSoFarKg: Number(lostSoFarKg.toFixed(1)),
        remainingKg: Number(remainingKg.toFixed(1)),
        progressPercent: totalLossKg ? Number(((lostSoFarKg / totalLossKg) * 100).toFixed(1)) : 0,
        expectedLossByNow: Number(expectedLossByNow.toFixed(2)),
        celebration,
        logs: relatedLogs,
        statusColors: {
            weight: progressStatus,
            water: hydrationStatus,
            sleep: sleepStatus
        }
    };
}

app.get('/api/recipes', (req, res) => {
    res.json(recipes.map(r => ({ ...r, shareUrl: `/share/recipes/${r.id}` })));
});

app.get('/api/recipes/shuffle', (req, res) => {
    const limit = Number(req.query.limit) || recipes.length;
    const shuffled = [...recipes].sort(() => Math.random() - 0.5).slice(0, limit);
    res.json(shuffled);
});

app.get('/api/meal-plans', (req, res) => {
    res.json(userMealPlans);
});

app.post('/api/meal-plans', (req, res) => {
    const newPlan = { ...req.body, id: generateId() };
    userMealPlans.push(newPlan);
    res.status(201).json(newPlan);
});

app.put('/api/meal-plans/:id', (req, res) => {
    const { id } = req.params;
    const index = userMealPlans.findIndex(p => p.id === id);
    if (index !== -1) {
        userMealPlans[index] = { ...userMealPlans[index], ...req.body };
        res.json(userMealPlans[index]);
    } else {
        res.status(404).json({ message: "Plan not found" });
    }
});

app.delete('/api/meal-plans/:id', (req, res) => {
    const { id } = req.params;
    userMealPlans = userMealPlans.filter(p => p.id !== id);
    res.status(204).send();
});

app.get('/api/surveys', (req, res) => {
    res.json(userSurveys);
});

app.post('/api/surveys', (req, res) => {
    const heightCm = Number(req.body.heightCm);
    const weightKg = Number(req.body.weightKg);
    const age = Number(req.body.age);
    if (!isRealisticNumber(heightCm, 1, 300) || !isRealisticNumber(weightKg, 1, 500) || !isRealisticNumber(age, 1, 150)) {
        return res.status(400).json({ message: "heightCm, weightKg, and age must be within realistic positive ranges for survey insights" });
    }
    const survey = { ...req.body, id: generateId() };
    const metrics = calculateSurveyMetrics(survey);
    const enrichedSurvey = { ...survey, metrics };
    userSurveys.push(enrichedSurvey);
    res.status(201).json(enrichedSurvey);
});

app.post('/api/grocery-plan', (req, res) => {
    let dailyCalories = Number(req.body.dailyCalories);
    if (!dailyCalories && req.body.surveyId) {
        const found = userSurveys.find(s => s.id === req.body.surveyId);
        dailyCalories = found?.metrics?.recommendedDailyCalories || found?.metrics?.maintenanceCalories;
    }
    const plan = buildWeeklyGroceryPlan(dailyCalories);
    if (!plan) {
        return res.status(400).json({ message: "dailyCalories is required or must be derivable from surveyId" });
    }
    res.json(plan);
});

app.post('/api/meal-swaps', (req, res) => {
    const ingredients = req.body.ingredients || [];
    const allergies = req.body.allergies || [];
    const preference = req.body.preference || "";
    res.json({ swaps: suggestSwaps(ingredients, allergies, preference) });
});

app.post('/api/grocery-optimize', (req, res) => {
    let plan = req.body.plan;
    if (!plan && req.body.surveyId) {
        const found = userSurveys.find(s => s.id === req.body.surveyId);
        plan = buildWeeklyGroceryPlan(found?.metrics?.recommendedDailyCalories || found?.metrics?.maintenanceCalories);
    }
    const optimized = optimizeGroceries(plan, req.body.pricePerGram || {});
    if (!optimized) return res.status(400).json({ message: "Valid plan is required" });
    res.json({ plan, optimized });
});

app.post('/api/fasting-windows', (req, res) => {
    const userId = req.body.userId || 'anonymous';
    const windowHours = Number(req.body.windowHours);
    const guidance = fastingGuidance(windowHours);
    if (!guidance) return res.status(400).json({ message: "windowHours must be positive" });
    const entry = { id: generateId(), userId, windowHours, startTime: req.body.startTime || "20:00", guidance };
    fastingWindows.push(entry);
    res.status(201).json(entry);
});

app.get('/api/fasting-windows', (req, res) => {
    res.json(fastingWindows);
});

app.post('/api/nutrition-score', (req, res) => {
    const weightKg = Number(req.body.weightKg);
    const calories = Number(req.body.calories);
    const proteinG = Number(req.body.proteinG || 0);
    const fiberG = Number(req.body.fiberG || 0);
    const result = scoreNutrition(weightKg, calories, proteinG, fiberG);
    if (!result) return res.status(400).json({ message: "weightKg and calories must be positive" });
    res.json(result);
});

app.post('/api/leftovers-plan', (req, res) => {
    const servings = Number(req.body.servings);
    const days = Number(req.body.keepDays);
    const plan = planLeftovers(servings, days);
    if (!plan) return res.status(400).json({ message: "servings must be positive" });
    res.json(plan);
});

app.post('/api/readiness', (req, res) => {
    const hrv = Number(req.body.hrv);
    const restingHr = Number(req.body.restingHr);
    const sleepHours = Number(req.body.sleepHours);
    const result = readinessScore(hrv, restingHr, sleepHours);
    if (!result) return res.status(400).json({ message: "hrv, restingHr, and sleepHours are required numbers" });
    const entry = { id: generateId(), userId: req.body.userId || 'anonymous', hrv, restingHr, sleepHours, ...result, date: req.body.date || new Date().toISOString() };
    readinessLogs.push(entry);
    res.status(201).json(entry);
});

app.get('/api/readiness', (req, res) => {
    res.json(readinessLogs);
});

app.post('/api/water-reminders', (req, res) => {
    const weightKg = Number(req.body.weightKg);
    const activityMinutes = Number(req.body.activityMinutes || 0);
    const plan = waterReminderPlan(weightKg, activityMinutes);
    if (!plan) return res.status(400).json({ message: "weightKg must be positive" });
    res.json(plan);
});

app.post('/api/sleep-debt', (req, res) => {
    const targetHours = Number(req.body.targetHours || 8);
    const sleepHoursList = Array.isArray(req.body.sleepHours) ? req.body.sleepHours.map(Number) : [];
    const result = sleepDebt(targetHours, sleepHoursList);
    if (!result) return res.status(400).json({ message: "Invalid targetHours or sleepHours data" });
    res.json(result);
});

app.post('/api/streaks', (req, res) => {
    const dates = req.body.dates || [];
    const result = streakFromDates(dates);
    const userId = req.body.userId || 'anonymous';
    const entry = { id: generateId(), userId, dates, ...result };
    const idx = streakLogs.findIndex(s => s.userId === userId);
    if (idx >= 0) {
        streakLogs[idx] = entry;
    } else {
        streakLogs.push(entry);
    }
    res.json(entry);
});

app.post('/api/challenges/share', (req, res) => {
    const name = req.body.name || "challenge";
    res.json({ name, shareUrl: `/share/challenges/${encodeURIComponent(name)}` });
});

app.post('/api/travel-mode', (req, res) => {
    const entry = { id: generateId(), userId: req.body.userId || 'anonymous', location: req.body.location, cuisine: req.body.cuisine, plan: travelSuggestions(req.body.location, req.body.cuisine) };
    travelModes.push(entry);
    res.status(201).json(entry);
});

app.get('/api/travel-mode', (req, res) => {
    res.json(travelModes);
});

app.post('/api/offline-logs', (req, res) => {
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    if (!entries.length || entries.length > MAX_OFFLINE_ENTRIES) {
        return res.status(400).json({ message: `entries array required (max ${MAX_OFFLINE_ENTRIES})` });
    }
    const valid = entries
        .filter(e => e && typeof e === 'object' && typeof e.type === 'string' && e.data)
        .filter(e => {
            if (typeof e.data === 'string') return e.data.length <= 1000;
            try {
                return JSON.stringify(e.data).length <= 2000;
            } catch {
                return false;
            }
        })
        .map(e => ({ type: e.type, data: e.data, timestamp: e.timestamp || new Date().toISOString(), id: generateId(), synced: false }));
    if (!valid.length) return res.status(400).json({ message: "entries must include type and data" });
    for (const v of valid) {
        offlineLogs.push(v);
    }
    res.status(201).json({ stored: valid });
});

app.get('/api/weight-goals', (req, res) => {
    res.json(weightGoals.map(goal => calculateGoalProgress(goal)));
});

app.post('/api/weight-goals', (req, res) => {
    const startWeightKg = Number(req.body.startWeightKg);
    const targetWeightKg = Number(req.body.targetWeightKg);
    if (!Number.isFinite(startWeightKg) || startWeightKg <= 0 || !Number.isFinite(targetWeightKg) || targetWeightKg <= 0) {
        return res.status(400).json({ message: "startWeightKg and targetWeightKg must be valid positive numbers" });
    }
    const goal = {
        id: generateId(),
        userId: req.body.userId || 'anonymous',
        startWeightKg,
        targetWeightKg,
        weighInDays: req.body.weighInDays || [],
        startDate: req.body.startDate || new Date().toISOString(),
        targetDate: req.body.targetDate || null,
        notes: req.body.notes || '',
        waterLitersTarget: Number(req.body.waterLitersTarget) || Number((Math.max(2, startWeightKg * 0.033)).toFixed(2)),
        sleepHoursTarget: Number(req.body.sleepHoursTarget) || 8
    };
    weightGoals.push(goal);
    res.status(201).json(calculateGoalProgress(goal));
});

app.post('/api/weight-logs', (req, res) => {
    const goal = weightGoals.find(g => g.id === req.body.goalId);
    if (!goal) {
        return res.status(404).json({ message: "Goal not found" });
    }
    const weightKg = Number(req.body.weightKg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
        return res.status(400).json({ message: "weightKg must be a valid positive number" });
    }
    const newLog = {
        id: generateId(),
        goalId: goal.id,
        date: req.body.date || new Date().toISOString(),
        weightKg,
        waterLiters: Number(req.body.waterLiters) || null,
        sleepHours: Number(req.body.sleepHours) || null
    };
    weightLogs.push(newLog);
    res.status(201).json({ log: newLog, progress: calculateGoalProgress(goal) });
});

app.get('/api/weight-goals/:id/progress', (req, res) => {
    const goal = weightGoals.find(g => g.id === req.params.id);
    if (!goal) {
        return res.status(404).json({ message: "Goal not found" });
    }
    res.json(calculateGoalProgress(goal));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
