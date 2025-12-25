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

app.get('/api/recipes', (req, res) => {
    res.json(recipes);
});

app.get('/api/meal-plans', (req, res) => {
    res.json(userMealPlans);
});

app.post('/api/meal-plans', (req, res) => {
    const newPlan = { ...req.body, id: Date.now().toString() };
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
