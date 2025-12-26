const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { randomUUID } = require('crypto');

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

const features = [
    { id: "f1", name: "Personalized meal plans", description: "Adaptive weekly plans tuned to user goals" },
    { id: "f2", name: "Macro tracking", description: "Daily targets with remaining macros summary" },
    { id: "f3", name: "Barcode scanner", description: "Scan packaged foods to log nutrients" },
    { id: "f4", name: "Food search", description: "Global database search with filters" },
    { id: "f5", name: "Recipe generator", description: "AI-assisted recipes from pantry items" },
    { id: "f6", name: "Water reminders", description: "Smart hydration nudges based on schedule" },
    { id: "f7", name: "Fasting timer", description: "Intermittent fasting windows with alerts" },
    { id: "f8", name: "Grocery list", description: "Auto-built shopping list from plans" },
    { id: "f9", name: "Allergen alerts", description: "Flag recipes containing selected allergens" },
    { id: "f10", name: "Meal prep mode", description: "Batch cooking steps and timers" },
    { id: "f11", name: "Offline access", description: "Cached plans and logs without internet" },
    { id: "f12", name: "Wearable sync", description: "Import calories burned and steps" },
    { id: "f13", name: "Calorie budget", description: "Adaptive daily calorie budgeting" },
    { id: "f14", name: "Progress charts", description: "Weekly and monthly trend visualizations" },
    { id: "f15", name: "Community challenges", description: "Join group challenges for accountability" },
    { id: "f16", name: "Coach chat", description: "In-app chat with nutrition coaches" },
    { id: "f17", name: "Mood & energy log", description: "Track how meals impact energy levels" },
    { id: "f18", name: "Sleep insights", description: "Correlate sleep quality with nutrition" },
    { id: "f19", name: "Glucose-friendly filter", description: "Highlight low glycemic recipes" },
    { id: "f20", name: "Dietary presets", description: "Keto, vegan, paleo, and Mediterranean presets" },
    { id: "f21", name: "Portion guidance", description: "Hand-measure equivalents and swap suggestions" },
    { id: "f22", name: "Micronutrient tracking", description: "Vitamins and minerals coverage view" },
    { id: "f23", name: "Supplement reminders", description: "Schedule supplement intake" },
    { id: "f24", name: "Restaurant mode", description: "Healthier menu picks nearby" },
    { id: "f25", name: "Budget-friendly filter", description: "Low-cost meal options" },
    { id: "f26", name: "Food mood journal", description: "Link meals to mood entries" },
    { id: "f27", name: "Goal streaks", description: "Daily streak tracking and rewards" },
    { id: "f28", name: "Smart substitutions", description: "Automatic swaps to meet goals" },
    { id: "f29", name: "Voice logging", description: "Hands-free meal logging" },
    { id: "f30", name: "Export & share", description: "Share plans with trainers or friends" }
];

const premiumFeatures = [
    {
        id: "p1",
        name: "Live nutritionist coaching",
        description: "Unlimited chat and weekly video check-ins with licensed dietitians for personalized guidance",
        price: "usd_29.99_month"
    },
    {
        id: "p2",
        name: "Personalized biomarker labs",
        description: "Quarterly bloodwork kit with dietitian review and tailored nutrition targets",
        price: "usd_79.00_quarter"
    },
    {
        id: "p3",
        name: "Concierge meal prep plans",
        description: "Chef-designed weekly prep plans with smart grocery swaps and bulk-cook timers",
        price: "usd_14.99_month"
    }
];

const isValidCaloriesTarget = (caloriesTarget) => {
    if (caloriesTarget === undefined) return true;
    if (typeof caloriesTarget !== "number") return false;
    if (Number.isNaN(caloriesTarget) || !Number.isFinite(caloriesTarget)) return false;
    return caloriesTarget > 0;
};

const allowedPlanFields = ["name", "meals", "caloriesTarget"];

const validateMealPlanPayload = (body, { requireName }) => {
    const payload = body || {};
    const invalidKeys = Object.keys(payload).filter(key => !allowedPlanFields.includes(key));
    if (invalidKeys.length) {
        return { error: `invalid fields: ${invalidKeys.join(", ")}` };
    }

    const result = {};
    if (requireName || "name" in payload) {
        if (typeof payload.name !== "string" || payload.name.trim() === "") {
            return { error: "name is required" };
        }
        result.name = payload.name;
    }

    if ("meals" in payload) {
        if (!Array.isArray(payload.meals)) {
            return { error: "meals must be an array" };
        }
        result.meals = payload.meals;
    }

    if ("caloriesTarget" in payload) {
        if (!isValidCaloriesTarget(payload.caloriesTarget)) {
            return { error: "caloriesTarget must be a positive number when provided" };
        }
        result.caloriesTarget = payload.caloriesTarget;
    }

    return { value: result, hasUpdates: Object.keys(result).length > 0 };
};

app.get('/api/recipes', (req, res) => {
    res.json(recipes);
});

app.get('/api/meal-plans', (req, res) => {
    res.json(userMealPlans);
});

app.post('/api/meal-plans', (req, res) => {
    const validation = validateMealPlanPayload(req.body, { requireName: true });
    if (validation.error) {
        return res.status(400).json({ message: validation.error });
    }
    const newPlan = { id: randomUUID(), ...validation.value };
    userMealPlans.push(newPlan);
    res.status(201).json(newPlan);
});

app.put('/api/meal-plans/:id', (req, res) => {
    const { id } = req.params;
    const index = userMealPlans.findIndex(p => p.id === id);
    if (index !== -1) {
        const validation = validateMealPlanPayload(req.body, { requireName: false });
        if (validation.error) {
            return res.status(400).json({ message: validation.error });
        }
        if (!validation.hasUpdates) {
            return res.json(userMealPlans[index]);
        }
        userMealPlans[index] = { ...userMealPlans[index], ...validation.value };
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

app.get('/api/features', (req, res) => {
    res.json(features);
});

app.get('/api/premium-features', (req, res) => {
    res.json(premiumFeatures);
});

app.get('/api/health', (req, res) => {
    res.json({
        status: "ok",
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
