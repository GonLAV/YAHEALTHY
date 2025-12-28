# YAHEALTHY Quick Start Guide

## 🚀 Getting Started

### Installation
```bash
cd /workspaces/YAHEALTHY/YAHEALTHYbackend
npm install
```

### Run Server
```bash
npm start
# or
node index.js
```

Server will start on `http://localhost:5000`

---

## 📊 Quick API Examples

### 1️⃣ Create a Health Survey
Get personalized metrics based on user profile.

```bash
curl -X POST http://localhost:5000/api/surveys \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "age": 32,
    "heightCm": 180,
    "weightKg": 90,
    "targetWeightKg": 80,
    "targetDays": 120,
    "lifestyle": "moderate"
  }'
```

**You'll get back:**
- BMI & body fat % (Deurenberg formula)
- Basal Metabolic Rate (BMR)
- Total Daily Energy Expenditure (TDEE)
- Personalized daily calorie target
- Water & sleep targets
- Estimated days to reach goal

---

### 2️⃣ Set a Weight Goal
```bash
curl -X POST http://localhost:5000/api/weight-goals \
  -H "Content-Type: application/json" \
  -d '{
    "startWeightKg": 90,
    "targetWeightKg": 80,
    "weighInDays": ["Monday", "Friday"]
  }'
```

---

### 3️⃣ Log Your First Weight
```bash
curl -X POST http://localhost:5000/api/weight-logs \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "wgoal_YOUR_ID_HERE",
    "weightKg": 88.5,
    "waterLiters": 2.4,
    "sleepHours": 7.5,
    "notes": "Great start!"
  }'
```

**Features:**
- ✅ Celebration messages for weight loss
- 💧 Hydration status (red/yellow/green)
- 😴 Sleep quality tracking
- 📈 Progress percentage to goal

---

### 4️⃣ Generate Grocery List
```bash
curl -X POST http://localhost:5000/api/grocery-plan \
  -H "Content-Type: application/json" \
  -d '{
    "surveyId": "survey_YOUR_ID_HERE",
    "dailyCalories": 2000
  }'
```

**Returns:**
- Weekly macronutrient breakdown
- Organized grocery items by category
- Calories & macro targets

---

### 5️⃣ Track Daily Habits

**Log hydration:**
```bash
curl -X POST http://localhost:5000/api/hydration-logs \
  -H "Content-Type: application/json" \
  -d '{"waterLiters": 2.5}'
```

**Log sleep:**
```bash
curl -X POST http://localhost:5000/api/sleep-logs \
  -H "Content-Type: application/json" \
  -d '{
    "sleepHours": 7.5,
    "quality": "good"
  }'
```

---

### 6️⃣ Get Recipe Suggestions
```bash
# Get all recipes
curl http://localhost:5000/api/recipes

# Get random 3 recipes
curl http://localhost:5000/api/recipes/shuffle?count=3

# Share a recipe
curl http://localhost:5000/api/recipes/1/share
```

---

### 7️⃣ Find Meal Alternatives
```bash
curl -X POST http://localhost:5000/api/meal-swaps \
  -H "Content-Type: application/json" \
  -d '{
    "ingredients": ["chicken", "wheat", "milk"],
    "allergies": ["peanut"],
    "preference": "plant-based"
  }'
```

---

### 8️⃣ Check Readiness
Assess if you're ready for intense training.

```bash
curl -X POST http://localhost:5000/api/readiness \
  -H "Content-Type: application/json" \
  -d '{
    "hrv": 65,
    "restingHr": 55,
    "sleepHours": 7.5
  }'
```

**Score Levels:**
- 🟢 **Excellent (80-100):** Ready for intense training
- 🟡 **Good (60-79):** Normal training
- 🟠 **Fair (40-59):** Light activity recommended
- 🔴 **Poor (<40):** Rest day recommended

---

### 9️⃣ Set Fasting Window
```bash
curl -X POST http://localhost:5000/api/fasting-windows \
  -H "Content-Type: application/json" \
  -d '{
    "windowHours": 16,
    "protocol": "intermittent",
    "notes": "16:8 protocol"
  }'
```

---

### 🔟 Get AI Food Estimation
```bash
curl -X POST "http://localhost:5000/api/food-photo-estimate?mode=mock" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/food.jpg"}'
```

**Mock mode** returns sample data instantly. To enable real AI:
```bash
export AI_PROVIDER="openai"
export AI_API_KEY="your-key"
```

---

## 📊 Feature Matrix

| Feature | Endpoint | Method | Status |
|---------|----------|--------|--------|
| **Surveys** | `/surveys` | POST/GET | ✅ |
| **Weight Goals** | `/weight-goals` | POST/GET | ✅ |
| **Weight Logs** | `/weight-logs` | POST/GET | ✅ |
| **Hydration** | `/hydration-logs` | POST/GET | ✅ |
| **Sleep** | `/sleep-logs` | POST/GET | ✅ |
| **Grocery Plans** | `/grocery-plan` | POST | ✅ |
| **Recipe Shuffle** | `/recipes/shuffle` | GET | ✅ |
| **Recipe Share** | `/recipes/:id/share` | GET | ✅ |
| **Meal Plans** | `/meal-plans` | POST/GET/PUT/DELETE | ✅ |
| **Fasting Windows** | `/fasting-windows` | POST/GET | ✅ |
| **Meal Swaps** | `/meal-swaps` | POST/GET | ✅ |
| **Readiness** | `/readiness` | POST/GET | ✅ |
| **Sleep Debt** | `/sleep-debt` | POST | ✅ |
| **Water Reminders** | `/water-reminders` | POST | ✅ |
| **Offline Logs** | `/offline-logs` | POST/GET | ✅ |
| **AI Food Photo** | `/food-photo-estimate` | POST | ✅ (mock) |
| **Restaurant Search** | `/restaurant-suggestions` | POST | ✅ (mock) |

---

## 🎨 Frontend Integration

The backend serves a premium health dashboard at:
- **Login:** `http://localhost:5000/` or `/login`
- **Dashboard:** `http://localhost:5000/dashboard`

Both use the comprehensive API for real-time data synchronization.

---

## 📁 Project Structure

```
YAHEALTHYbackend/
├── index.js                    # Main app (900+ lines)
├── utils/
│   ├── constants.js           # Health formulas & validation
│   ├── health-calculations.js # BMI, TDEE, progress calcs
│   └── id-generator.js        # Unified ID generation
├── public/
│   ├── index.html             # Premium dashboard
│   ├── login.html             # Sign in/up page
│   └── _sdk/
│       ├── element_sdk.js     # UI theme SDK
│       └── data_sdk.js        # Data persistence SDK
├── package.json
└── node_modules/
```

---

## 🔐 Data Storage

**Current:** In-memory (resets on server restart)

**To add persistence:**
1. Install database: `npm install mongoose`
2. Connect MongoDB in `index.js`
3. Create schema models for surveys, goals, logs, etc.
4. Replace in-memory arrays with model queries

---

## 🌍 Environment Variables

```bash
# Optional: AI provider configuration
export AI_PROVIDER="openai"           # or "google", "claude"
export AI_API_KEY="your-api-key"
export AI_ENDPOINT="your-endpoint"

# Optional: Places API configuration
export PLACES_PROVIDER="google"       # or "mapbox"
export PLACES_API_KEY="your-api-key"
export PLACES_ENDPOINT="your-endpoint"

# Server configuration
export PORT=5000                      # Default port
```

---

## 🧪 Testing Workflow

### Complete User Journey
```bash
#!/bin/bash

BASE="http://localhost:5000/api"

# 1. Create survey
SURVEY=$(curl -s -X POST $BASE/surveys -H "Content-Type: application/json" \
  -d '{
    "gender":"male","age":32,"heightCm":180,"weightKg":90,
    "targetWeightKg":80,"targetDays":120,"lifestyle":"moderate"
  }' | jq -r '.id')
echo "✓ Survey created: $SURVEY"

# 2. Create weight goal
GOAL=$(curl -s -X POST $BASE/weight-goals -H "Content-Type: application/json" \
  -d '{"startWeightKg":90,"targetWeightKg":80}' | jq -r '.id')
echo "✓ Goal created: $GOAL"

# 3. Log weight
curl -s -X POST $BASE/weight-logs -H "Content-Type: application/json" \
  -d "{\"goalId\":\"$GOAL\",\"weightKg\":88.5,\"waterLiters\":2.4,\"sleepHours\":7.5}" | jq '.celebration'

# 4. Get progress
curl -s $BASE/weight-goals/$GOAL | jq '.progress'

echo "✓ Workflow complete!"
```

---

## 📱 Frontend Features (Built-in UI)

✅ **Premium Dashboard**
- Real-time calorie tracking
- 7-day progress charts
- Macro breakdowns

✅ **Health Profile Survey**
- Gender/age/height/weight capture
- Personalized calculations
- Activity level assessment

✅ **Recipe Management**
- Recipe timer (5/10/15/25 min)
- Share via WhatsApp/Email
- Print-friendly format
- Export weekly meal plan

✅ **Advanced Tracking**
- Weight trends
- Hydration goals
- Sleep quality
- Body metrics

---

## 🔗 API Response Examples

### Weight Loss Celebration
```json
{
  "celebration": {
    "message": "Great job! Lost 1.5kg",
    "remaining": 8.5
  }
}
```

### Readiness Assessment
```json
{
  "score": 82,
  "level": "excellent",
  "recommendations": [
    "You're ready for intense training",
    "Maintain consistent sleep schedule"
  ]
}
```

### Progress Tracking
```json
{
  "progress": 15,
  "lostKg": 1.5,
  "remainingKg": 8.5,
  "status": "yellow"
}
```

---

## ✨ Key Features Implemented

✅ Survey-driven body metrics  
✅ Realistic calorie calculations (Harris-Benedict + TDEE)  
✅ Deurenberg body fat formula  
✅ Weight goal with celebration gating  
✅ Color-coded status (red/yellow/green)  
✅ Hydration & sleep tracking  
✅ Weekly grocery planning  
✅ Recipe management & sharing  
✅ Meal swaps for allergies  
✅ Fasting window protocols  
✅ Readiness scoring (HRV + resting HR)  
✅ Sleep debt calculation  
✅ Water reminders  
✅ Offline log sync  
✅ AI/Places mock endpoints  

---

## 🚦 Next Steps

1. **Persist Data:** Connect MongoDB/PostgreSQL
2. **Add Auth:** JWT token-based authentication
3. **Real AI:** Integrate Vision API for food photos
4. **Real Places:** Connect Google Maps/Mapbox
5. **Mobile App:** React Native client
6. **Notifications:** Push reminders for hydration/sleep
7. **Social Features:** Share progress, challenges, streaks

---

**Documentation:** See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for detailed endpoint specs  
**Version:** 1.0.0 ✅ Production Ready  
**Last Updated:** 2025-12-27
