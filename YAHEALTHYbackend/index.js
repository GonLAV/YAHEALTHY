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

/**
 * Health calculation constants (simplified, non-medical guidance):
 * - CALORIES_PER_KG: widely used estimate for calories in 1kg of body fat
 * - MIN_DAILY_CALORIES: conservative floor; can be overridden by caller if guided by a clinician
 * - BODY_FAT_*: coefficients from the Deurenberg body-fat estimate formula
 */
const CALORIES_PER_KG = 7700;
const MIN_DAILY_CALORIES = 1200;
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

function calculateBodyFatPercentage(bmi, age, sexFactor) {
    if (bmi === null) return null;
    return Number((BODY_FAT_BMI_COEF * bmi + BODY_FAT_AGE_COEF * (age || 0) - BODY_FAT_SEX_COEF * sexFactor - BODY_FAT_BASE).toFixed(1));
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
    const activityKey = (data.lifestyle || '').toLowerCase().replace(/\s+/g, '');
    const activity = activityMultipliers[activityKey] || activityMultipliers.default;
    const maintenanceCalories = weightKg ? Math.round(weightKg * activity * 22) : null;
    const calorieFloor = data.calorieFloor && Number(data.calorieFloor) > 0 ? Number(data.calorieFloor) : MIN_DAILY_CALORIES;

    let recommendedDailyCalories = maintenanceCalories ? maintenanceCalories - 500 : null;
    if (maintenanceCalories && targetWeightKg !== null) {
        const totalLossKg = Math.max(0, weightKg - targetWeightKg);
        const targetDays = data.targetDays && data.targetDays > 0 ? data.targetDays : 90;
        const totalDeficit = totalLossKg * CALORIES_PER_KG;
        const perDayDeficit = totalDeficit / targetDays;
        recommendedDailyCalories = Math.max(calorieFloor, Math.round(maintenanceCalories - perDayDeficit));
    }

    return {
        bmi,
        bodyFatPercentage,
        maintenanceCalories,
        recommendedDailyCalories,
        activityMultiplierUsed: activity,
        lifestyleAccepted: Boolean(activityMultipliers[activityKey]),
        calorieFloorUsed: calorieFloor
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
    const celebration = totalLossKg > 0 && lostSoFarKg >= expectedLossByNow;

    return {
        goal,
        latestWeightKg: latestLog ? latestLog.weightKg : goal.startWeightKg,
        totalLossKg: Number(totalLossKg.toFixed(1)),
        lostSoFarKg: Number(lostSoFarKg.toFixed(1)),
        remainingKg: Number(remainingKg.toFixed(1)),
        progressPercent: totalLossKg ? Number(((lostSoFarKg / totalLossKg) * 100).toFixed(1)) : 0,
        expectedLossByNow: Number(expectedLossByNow.toFixed(2)),
        celebration,
        logs: relatedLogs
    };
}

app.get('/api/recipes', (req, res) => {
    res.json(recipes);
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
    if (!Number.isFinite(heightCm) || heightCm <= 0 || heightCm > 300 || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500 || !Number.isFinite(age) || age <= 0 || age > 150) {
        return res.status(400).json({ message: "heightCm, weightKg, and age must be within realistic positive ranges for survey insights" });
    }
    const survey = { ...req.body, id: generateId() };
    const metrics = calculateSurveyMetrics(survey);
    const enrichedSurvey = { ...survey, metrics };
    userSurveys.push(enrichedSurvey);
    res.status(201).json(enrichedSurvey);
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
        notes: req.body.notes || ''
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
        weightKg
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
