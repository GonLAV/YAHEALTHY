# YAHEALTHY API Documentation

## Overview
YAHEALTHY is a comprehensive health and nutrition management system built with Node.js + Express. It provides survey-driven metrics, weight tracking, meal planning, and AI-powered wellness features.

**Base URL:** `http://localhost:5000/api`

---

## 🏥 Health Check

### Get API Status
```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "YAHEALTHY API is running...",
  "features": [
    "surveys", "weight-goals", "weight-logs", ...
  ]
}
```

---

## 📋 Survey & Metrics

### Create Health Survey
Capture user metrics (gender, age, height, weight) and compute personalized health targets.

```
POST /api/surveys
```

**Request Body:**
```json
{
  "gender": "male|female|non-binary",
  "age": 32,
  "heightCm": 180,
  "weightKg": 85,
  "targetWeightKg": 75,
  "targetDays": 120,
  "lifestyle": "moderate|sedentary|light|active|very_active"
}
```

**Response:**
```json
{
  "id": "survey_abc123_xyz",
  "gender": "male",
  "age": 32,
  "heightCm": 180,
  "weightKg": 85,
  "targetWeightKg": 75,
  "targetDays": 120,
  "lifestyle": "moderate",
  "createdAt": "2025-12-27T...",
  "metrics": {
    "bmi": 26.2,
    "bodyFatPercentage": 24.5,
    "bmr": 1750,
    "tdee": 2625,
    "dailyCalories": 2125,
    "dailyDeficit": 500,
    "waterTargetLiters": 2.8,
    "sleepTargetHours": 7.5,
    "estimatedDaysToGoal": 154,
    "estimatedWeeksToGoal": "22.0",
    "weightLossPace": "moderate"
  }
}
```

### Get All Surveys
```
GET /api/surveys
```

### Get Survey by ID
```
GET /api/surveys/{surveyId}
```

---

## ⚖️ Weight Goals & Tracking

### Create Weight Goal
```
POST /api/weight-goals
```

**Request Body:**
```json
{
  "startWeightKg": 90,
  "targetWeightKg": 80,
  "weighInDays": ["Mon", "Fri"]
}
```

**Response:**
```json
{
  "id": "wgoal_abc123",
  "startWeightKg": 90,
  "targetWeightKg": 80,
  "currentWeightKg": 90,
  "weighInDays": ["Mon", "Fri"],
  "createdAt": "2025-12-27T...",
  "logsCount": 0
}
```

### Record Weight Log
```
POST /api/weight-logs
```

**Request Body:**
```json
{
  "goalId": "wgoal_abc123",
  "weightKg": 88.5,
  "waterLiters": 2.4,
  "sleepHours": 7.5,
  "notes": "Feeling great!"
}
```

**Response:**
```json
{
  "log": {
    "id": "wlog_abc123",
    "goalId": "wgoal_abc123",
    "weightKg": 88.5,
    "waterLiters": 2.4,
    "sleepHours": 7.5,
    "isWeightLoss": true,
    "progress": {
      "progress": 15,
      "lostKg": 1.5,
      "remainingKg": 8.5,
      "status": "yellow"
    },
    "hydrationStatus": {
      "percentage": 80,
      "status": "yellow"
    },
    "sleepStatus": {
      "percentage": 94,
      "status": "green"
    }
  },
  "celebration": {
    "message": "Great job! Lost 1.5kg",
    "remaining": 8.5
  }
}
```

### Get Weight Logs
```
GET /api/weight-logs?goalId={goalId}
```

### Get Weight Goal with Progress
```
GET /api/weight-goals/{goalId}
```

---

## 💧 Hydration Tracking

### Log Hydration
```
POST /api/hydration-logs
```

**Request Body:**
```json
{
  "waterLiters": 2.5,
  "date": "2025-12-27T..."
}
```

**Response:**
```json
{
  "id": "hydro_abc123",
  "waterLiters": 2.5,
  "status": "yellow",
  "percentage": 83,
  "date": "2025-12-27T...",
  "createdAt": "2025-12-27T..."
}
```

### Get All Hydration Logs
```
GET /api/hydration-logs
```

---

## 😴 Sleep Tracking

### Log Sleep
```
POST /api/sleep-logs
```

**Request Body:**
```json
{
  "sleepHours": 7.5,
  "quality": "normal|good|poor",
  "date": "2025-12-27T..."
}
```

**Response:**
```json
{
  "id": "sleep_abc123",
  "sleepHours": 7.5,
  "quality": "normal",
  "status": "green",
  "percentage": 94,
  "date": "2025-12-27T...",
  "createdAt": "2025-12-27T..."
}
```

### Get All Sleep Logs
```
GET /api/sleep-logs
```

---

## 🛒 Grocery Planning

### Generate Weekly Grocery Plan
Create a macronutrient-balanced grocery list based on calorie targets.

```
POST /api/grocery-plan
```

**Request Body:**
```json
{
  "surveyId": "survey_abc123",
  "dailyCalories": 2000
}
```

**Response:**
```json
{
  "id": "grocery_abc123",
  "surveyId": "survey_abc123",
  "targetDailyCalories": 2000,
  "weeklyCalories": 14000,
  "weeklyMacros": {
    "carbsGrams": 1400,
    "proteinGrams": 1050,
    "fatGrams": 467
  },
  "items": {
    "vegetables": [
      { "name": "Broccoli", "amount": "700g", "category": "cruciferous" },
      ...
    ],
    "fruits": [...],
    "proteins": [...],
    "grainsAndDairy": [...]
  },
  "createdAt": "2025-12-27T..."
}
```

### Optimize Grocery Plan
Get cost-saving tips and allergy-safe substitutions.

```
POST /api/grocery-optimize
```

**Request Body:**
```json
{
  "surveyId": "survey_abc123",
  "priceMode": "budget|premium",
  "deliveryDays": 3
}
```

**Response:**
```json
{
  "id": "grocery-opt_abc123",
  "surveyId": "survey_abc123",
  "priceMode": "budget",
  "deliveryDays": 3,
  "estimatedCost": "45-55 USD",
  "savingsTips": [
    "Buy seasonal produce for better prices",
    ...
  ],
  "substitutions": [
    {
      "original": "Salmon",
      "alternative": "Mackerel",
      "reason": "Similar omega-3s, lower cost"
    }
  ],
  "createdAt": "2025-12-27T..."
}
```

---

## 🍽️ Recipes & Meal Planning

### Get All Recipes
```
GET /api/recipes
```

### Get Recipe by ID
```
GET /api/recipes/{recipeId}
```

### Shuffle Recipes
Get random recipe suggestions.

```
GET /api/recipes/shuffle?count=3
```

### Get Shareable Recipe
```
GET /api/recipes/{recipeId}/share
```

**Response:**
```json
{
  "url": "http://localhost:5000/api/recipes/1/shared",
  "text": "סלט קינואה עם ירקות צלויים...",
  "shareMethods": {
    "whatsapp": "https://wa.me/?text=...",
    "email": "mailto:?subject=...&body=...",
    "copy": "..."
  }
}
```

### Create Meal Plan
```
POST /api/meal-plans
```

**Request Body:**
```json
{
  "name": "Weekly Plan",
  "recipes": ["1", "2", "3"],
  "startDate": "2025-12-27"
}
```

### Get Meal Plans
```
GET /api/meal-plans
```

### Update Meal Plan
```
PUT /api/meal-plans/{planId}
```

### Delete Meal Plan
```
DELETE /api/meal-plans/{planId}
```

---

## ⏱️ Fasting Windows

### Create Fasting Window
```
POST /api/fasting-windows
```

**Request Body:**
```json
{
  "windowHours": 16,
  "protocol": "intermittent",
  "notes": "16:8 protocol"
}
```

**Response:**
```json
{
  "id": "fasting_abc123",
  "windowHours": 16,
  "protocol": "intermittent",
  "tips": [
    "Stay hydrated during fasting periods",
    "Start with a gentle 12-hour fast if new",
    ...
  ],
  "notes": "16:8 protocol",
  "createdAt": "2025-12-27T..."
}
```

### Get All Fasting Windows
```
GET /api/fasting-windows
```

---

## 🔄 Meal Swaps & Alternatives

### Get Meal Swap Suggestions
Find allergy-safe alternatives for ingredients.

```
POST /api/meal-swaps
```

**Request Body:**
```json
{
  "ingredients": ["chicken", "wheat", "milk"],
  "allergies": ["peanut", "shellfish"],
  "preference": "plant-based"
}
```

**Response:**
```json
{
  "id": "swap_abc123",
  "originalIngredients": ["chicken", "wheat", "milk"],
  "allergies": ["peanut", "shellfish"],
  "preference": "plant-based",
  "swaps": [
    {
      "ingredient": "chicken",
      "category": "proteins",
      "alternatives": ["turkey", "tofu", "tempeh", "seitan"]
    },
    ...
  ],
  "createdAt": "2025-12-27T..."
}
```

### Get All Meal Swaps
```
GET /api/meal-swaps
```

---

## 💪 Readiness & Wellness

### Calculate Readiness Score
Assess readiness for training based on HRV and resting heart rate.

```
POST /api/readiness
```

**Request Body:**
```json
{
  "hrv": 65,
  "restingHr": 55,
  "sleepHours": 7.5
}
```

**Response:**
```json
{
  "id": "readiness_abc123",
  "score": 82,
  "level": "excellent",
  "hrv": { "value": 65, "status": "good" },
  "restingHr": { "value": 55, "status": "good" },
  "sleepHours": { "value": 7.5, "status": "adequate" },
  "recommendations": [
    "You're ready for intense training",
    "Maintain consistent sleep schedule",
    "Your nervous system is balanced"
  ],
  "createdAt": "2025-12-27T..."
}
```

### Get Readiness Scores
```
GET /api/readiness
```

### Calculate Sleep Debt
Track accumulated sleep deficit.

```
POST /api/sleep-debt
```

**Request Body:**
```json
{
  "targetHours": 8,
  "sleepHours": [7, 7.5, 8, 6.5, 7, 7.5, 8]
}
```

**Response:**
```json
{
  "targetHours": 8,
  "debt": 3.5,
  "daysTracked": 7,
  "averageSleep": 7.36,
  "daysToRecover": 1,
  "recoveryTips": [
    "Go to bed 30 minutes earlier",
    ...
  ]
}
```

### Get Water Reminders
```
POST /api/water-reminders
```

**Request Body:**
```json
{
  "weightKg": 78,
  "activityMinutes": 45
}
```

**Response:**
```json
{
  "id": "reminder_abc123",
  "targetLiters": 3.1,
  "frequency": "Drink 4 cups (250ml each) throughout the day",
  "times": [
    "7:00 AM - Morning hydration",
    "10:00 AM - Mid-morning top-up",
    ...
  ],
  "adjustments": [
    "Bonus: Drink extra 0.2L due to 45min activity"
  ],
  "createdAt": "2025-12-27T..."
}
```

---

## 📱 Offline Logs

### Submit Offline Entries
Sync data captured offline (weight, hydration, sleep).

```
POST /api/offline-logs
```

**Request Body:**
```json
{
  "entries": [
    {
      "type": "weighin",
      "data": { "weightKg": 87.5 }
    },
    {
      "type": "hydration",
      "data": { "waterLiters": 2.5 }
    },
    {
      "type": "sleep",
      "data": { "sleepHours": 7.5 }
    }
  ]
}
```

**Response:**
```json
{
  "processed": 3,
  "entries": [
    {
      "id": "offline_abc123",
      "type": "weighin",
      "data": { "weightKg": 87.5 },
      "processedAt": "2025-12-27T..."
    },
    ...
  ]
}
```

### Get Offline Logs
```
GET /api/offline-logs
```

---

## 🤖 AI & Places (Stubs)

### Food Photo Estimation
Estimate calories and nutrients from food image.

```
POST /api/food-photo-estimate?mode=mock|real
```

**Request Body:**
```json
{
  "imageUrl": "https://example.com/food.jpg"
}
```

**Mock Response:**
```json
{
  "status": "mock",
  "imageUrl": "https://example.com/food.jpg",
  "estimatedCalories": 385,
  "nutrients": {
    "protein": "22g",
    "carbs": "38g",
    "fat": "14g"
  },
  "foodItems": ["Chicken breast", "Brown rice", "Broccoli"],
  "confidence": 0.84,
  "message": "Mock AI estimation - add real provider via env vars"
}
```

**Enable Real AI:**
```bash
export AI_PROVIDER="your-provider"
export AI_API_KEY="your-key"
export AI_ENDPOINT="your-endpoint"
```

### Restaurant Suggestions
Find healthy restaurants near you.

```
POST /api/restaurant-suggestions?mode=mock|real
```

**Request Body:**
```json
{
  "location": "Downtown",
  "cuisine": "Mediterranean"
}
```

**Mock Response:**
```json
{
  "status": "mock",
  "location": "Downtown",
  "cuisine": "Mediterranean",
  "results": [
    {
      "name": "Mediterranean Kitchen",
      "rating": 4.8,
      "distance": "0.5 km",
      "healthyOptions": true,
      "url": "#"
    },
    ...
  ],
  "message": "Mock restaurant suggestions - add real provider via env vars"
}
```

**Enable Real Places:**
```bash
export PLACES_PROVIDER="your-provider"
export PLACES_API_KEY="your-key"
export PLACES_ENDPOINT="your-endpoint"
```

---

## Constants & Validation

### Health Constants
- **Min Daily Calories:** 1200 kcal
- **Max Daily Calories:** 5000 kcal
- **Min Water:** 1.5 L/day
- **Max Water:** 5.0 L/day
- **Water per kg:** 0.033 L
- **Calorie deficit per kg:** 7700 kcal
- **Protein target:** 1.2-2.2 g/kg
- **Fiber target:** 25-50 g/day

### Validation Rules
- **Weight:** 30-300 kg
- **Height:** 100-250 cm
- **Age:** 10-120 years
- **Gender:** male, female, non-binary, other
- **Lifestyle:** sedentary, light, moderate, active, very_active
- **Fasting window:** 8-23 hours
- **Sleep hours:** 0-16 hours
- **Water liters:** 0-10 L per log entry

---

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": "Error type",
  "details": ["Detail 1", "Detail 2"],
  "message": "Human-readable message"
}
```

### Common Status Codes
- **200:** OK
- **201:** Created
- **204:** No Content
- **400:** Bad Request (validation error)
- **404:** Not Found
- **500:** Internal Server Error

---

## Example Workflows

### Complete Onboarding
```bash
# 1. Create survey
curl -X POST http://localhost:5000/api/surveys \
  -H "Content-Type: application/json" \
  -d '{
    "gender": "male",
    "age": 32,
    "heightCm": 180,
    "weightKg": 85,
    "targetWeightKg": 75,
    "targetDays": 120,
    "lifestyle": "moderate"
  }'

# 2. Create weight goal
curl -X POST http://localhost:5000/api/weight-goals \
  -H "Content-Type: application/json" \
  -d '{
    "startWeightKg": 85,
    "targetWeightKg": 75,
    "weighInDays": ["Mon", "Fri"]
  }'

# 3. Generate grocery plan
curl -X POST http://localhost:5000/api/grocery-plan \
  -H "Content-Type: application/json" \
  -d '{"surveyId": "survey_...", "dailyCalories": 2125}'

# 4. Track first weight log
curl -X POST http://localhost:5000/api/weight-logs \
  -H "Content-Type: application/json" \
  -d '{
    "goalId": "wgoal_...",
    "weightKg": 83.5,
    "waterLiters": 2.4,
    "sleepHours": 7.5
  }'
```

### Daily Tracking
```bash
# Log hydration
curl -X POST http://localhost:5000/api/hydration-logs \
  -d '{"waterLiters": 2.5}'

# Log sleep
curl -X POST http://localhost:5000/api/sleep-logs \
  -d '{"sleepHours": 7.5, "quality": "good"}'

# Calculate readiness
curl -X POST http://localhost:5000/api/readiness \
  -d '{"hrv": 65, "restingHr": 55, "sleepHours": 7.5}'
```

---

## Running the Server

```bash
# Install dependencies
npm install

# Start server
npm start
# or
node index.js

# Server runs on http://localhost:5000
```

---

## Architecture

```
YAHEALTHYbackend/
├── index.js                  # Main Express app
├── utils/
│   ├── constants.js         # Health constants & validation
│   ├── health-calculations.js # BMI, TDEE, progress calcs
│   └── id-generator.js      # Unified ID generation
├── public/
│   ├── index.html           # Dashboard UI
│   ├── login.html           # Login UI
│   └── _sdk/
│       ├── element_sdk.js   # UI element SDK
│       └── data_sdk.js      # Data persistence SDK
└── package.json
```

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-27  
**Status:** ✅ Production Ready
