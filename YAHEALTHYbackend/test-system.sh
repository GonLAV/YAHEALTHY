#!/bin/bash

# YAHEALTHY 2.0 - Complete System Test
# Tests all endpoints with authentication

set -e  # Exit on error

command -v jq >/dev/null 2>&1 || {
  echo "jq is required to run this test script. Install it and retry." >&2
  exit 1
}

BASE_URL="http://localhost:5000"
API_URL="$BASE_URL/api"

echo "════════════════════════════════════════════════════════════"
echo "🧪 YAHEALTHY 2.0 - Complete System Test"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counter
PASSED=0
FAILED=0

test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local token=$4
  local description=$5
  local jq_check=$6

  echo -n "Testing: $description... "

  if [ -z "$token" ]; then
    # No token required
    response=$(curl -s -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    # With token
    response=$(curl -s -X "$method" "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$data")
  fi

  if echo "$response" | jq . >/dev/null 2>&1; then
    if echo "$response" | jq -e 'type=="object" and has("error")' >/dev/null 2>&1; then
      echo -e "${RED}✗${NC}"
      echo "Response: $response" | sed 's/^/  /'
      FAILED=$((FAILED + 1))
      echo ""
      return
    fi

    if [ -n "$jq_check" ]; then
      if ! echo "$response" | jq -e "$jq_check" >/dev/null 2>&1; then
        echo -e "${RED}✗${NC}"
        echo "Response: $response" | sed 's/^/  /'
        echo "Check failed: $jq_check" | sed 's/^/  /'
        FAILED=$((FAILED + 1))
        echo ""
        return
      fi
    fi
    echo -e "${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
    echo "$response" | jq '.' | sed 's/^/  /'
    echo ""
  else
    echo -e "${RED}✗${NC}"
    echo "Response: $response"
    FAILED=$((FAILED + 1))
    echo ""
  fi
}

# ============ START SERVER ============
echo -e "${YELLOW}1. Starting server in background...${NC}"
rm -f /tmp/yahealthy_server.log /tmp/yahealthy_server.pid

cd "$(dirname "${BASH_SOURCE[0]}")"
node index.js > /tmp/yahealthy_server.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > /tmp/yahealthy_server.pid

sleep 2

if ! ps -p $SERVER_PID > /dev/null; then
  echo -e "${RED}✗ Server failed to start${NC}"
  cat /tmp/yahealthy_server.log
  exit 1
fi

echo -e "${GREEN}✓ Server started (PID: $SERVER_PID)${NC}\n"

# ============ TEST HEALTH ENDPOINT ============
echo -e "${YELLOW}2. Health Check${NC}"
test_endpoint "GET" "/health" "" "" "GET /api/health"

# ============ TEST AUTHENTICATION ============
echo -e "${YELLOW}3. Authentication Tests${NC}"

# Signup
SIGNUP_DATA='{"email":"test@yahealthy.com","password":"test123456","name":"Test User"}'
SIGNUP_RESPONSE=$(curl -s -X POST "$API_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d "$SIGNUP_DATA")

TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.token' 2>/dev/null || echo "")
USER_ID=$(echo "$SIGNUP_RESPONSE" | jq -r '.id' 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  # User might already exist, try login
  LOGIN_DATA='{"email":"test@yahealthy.com","password":"test123456"}'
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "$LOGIN_DATA")
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
fi

echo -e "${GREEN}✓${NC} Signup/Login complete"
echo "Token: ${TOKEN:0:20}..."
echo ""

# Get user profile
test_endpoint "GET" "/auth/me" "" "$TOKEN" "GET /api/auth/me (Get user profile)"

# Set preferences (macro targets)
PREF_DATA='{"preferences":{"macroTargets":{"proteinGrams":150,"carbsGrams":200,"fatGrams":60}}}'
test_endpoint "PUT" "/users/me/preferences" "$PREF_DATA" "$TOKEN" "PUT /api/users/me/preferences (Set macro targets)" '.preferences.macroTargets.protein_grams==150 and .preferences.macroTargets.carbs_grams==200 and .preferences.macroTargets.fat_grams==60'

# ============ TEST SURVEY ENDPOINTS ============
echo -e "${YELLOW}4. Survey Endpoints${NC}"

SURVEY_DATA='{
  "gender":"male",
  "age":32,
  "heightCm":180,
  "weightKg":90,
  "targetWeightKg":80,
  "targetDays":120,
  "lifestyle":"moderate"
}'

SURVEY_RESPONSE=$(curl -s -X POST "$API_URL/surveys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$SURVEY_DATA")

SURVEY_ID=$(echo "$SURVEY_RESPONSE" | jq -r '.id' 2>/dev/null || echo "")
echo -e "${GREEN}✓${NC} POST /api/surveys"
echo "$SURVEY_RESPONSE" | jq '.' | sed 's/^/  /'
echo ""

test_endpoint "GET" "/surveys" "" "$TOKEN" "GET /api/surveys"

if [ ! -z "$SURVEY_ID" ]; then
  test_endpoint "GET" "/surveys/$SURVEY_ID" "" "$TOKEN" "GET /api/surveys/:id"
fi

# ============ TEST WEIGHT ENDPOINTS ============
echo -e "${YELLOW}5. Weight Tracking Endpoints${NC}"

GOAL_DATA='{
  "startWeightKg":90,
  "targetWeightKg":80,
  "weighInDays":["Mon","Wed","Fri"]
}'

GOAL_RESPONSE=$(curl -s -X POST "$API_URL/weight-goals" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$GOAL_DATA")

GOAL_ID=$(echo "$GOAL_RESPONSE" | jq -r '.id' 2>/dev/null || echo "")
echo -e "${GREEN}✓${NC} POST /api/weight-goals"
echo "$GOAL_RESPONSE" | jq '.' | sed 's/^/  /'
echo ""

test_endpoint "GET" "/weight-goals" "" "$TOKEN" "GET /api/weight-goals"

if [ ! -z "$GOAL_ID" ]; then
  test_endpoint "GET" "/weight-goals/$GOAL_ID" "" "$TOKEN" "GET /api/weight-goals/:id"
  
  # Log weight
  LOG_DATA="{\"goalId\":\"$GOAL_ID\",\"weightKg\":88.5,\"waterLiters\":2.4,\"sleepHours\":7.5}"
  test_endpoint "POST" "/weight-logs" "$LOG_DATA" "$TOKEN" "POST /api/weight-logs"
  
  test_endpoint "GET" "/weight-logs?goalId=$GOAL_ID" "" "$TOKEN" "GET /api/weight-logs"
fi

# ============ TEST HYDRATION & SLEEP ============
echo -e "${YELLOW}6. Hydration & Sleep Endpoints${NC}"

HYDRATION_DATA='{"date":"2025-12-27","litersConsumed":2.5}'
test_endpoint "POST" "/hydration-logs" "$HYDRATION_DATA" "$TOKEN" "POST /api/hydration-logs"

test_endpoint "GET" "/hydration-logs" "" "$TOKEN" "GET /api/hydration-logs"

SLEEP_DATA='{"date":"2025-12-27","sleepHours":7.5,"sleepQuality":"good"}'
test_endpoint "POST" "/sleep-logs" "$SLEEP_DATA" "$TOKEN" "POST /api/sleep-logs"

test_endpoint "GET" "/sleep-logs" "" "$TOKEN" "GET /api/sleep-logs"

# ============ TEST ADVANCED ENDPOINTS ============
echo -e "${YELLOW}7. Advanced Health Endpoints${NC}"

FASTING_DATA='{"windowHours":16}'
test_endpoint "POST" "/fasting-windows" "$FASTING_DATA" "$TOKEN" "POST /api/fasting-windows"

test_endpoint "GET" "/fasting-windows" "" "$TOKEN" "GET /api/fasting-windows"

SWAP_DATA='{"ingredients":["chicken","milk"],"allergies":["peanut"]}'
test_endpoint "POST" "/meal-swaps" "$SWAP_DATA" "$TOKEN" "POST /api/meal-swaps"

READINESS_DATA='{"hrv":65,"restingHr":55,"sleepHours":7.5}'
test_endpoint "POST" "/readiness" "$READINESS_DATA" "$TOKEN" "POST /api/readiness"

WATER_DATA='{"weightKg":85,"activityMinutes":45}'
test_endpoint "POST" "/water-reminders" "$WATER_DATA" "$TOKEN" "POST /api/water-reminders"

# ============ TEST RECIPE ENDPOINTS ============
echo -e "${YELLOW}8. Recipe Endpoints${NC}"

test_endpoint "GET" "/recipes" "" "$TOKEN" "GET /api/recipes"

test_endpoint "GET" "/recipes/recipe_1" "" "$TOKEN" "GET /api/recipes/:id"

test_endpoint "GET" "/recipes/shuffle?count=2" "" "$TOKEN" "GET /api/recipes/shuffle"

test_endpoint "GET" "/recipes/recipe_1/share" "" "$TOKEN" "GET /api/recipes/:id/share"

# ============ TEST MEAL PLANS ============
echo -e "${YELLOW}9. Meal Plan Endpoints${NC}"

test_endpoint "GET" "/meal-plans" "" "$TOKEN" "GET /api/meal-plans"

MEAL_PLAN_DATA='{"recipeId":"recipe_1","date":"2025-12-28","mealType":"breakfast"}'
test_endpoint "POST" "/meal-plans" "$MEAL_PLAN_DATA" "$TOKEN" "POST /api/meal-plans"

test_endpoint "GET" "/grocery-list?start=2025-12-27&end=2025-12-30" "" "$TOKEN" "GET /api/grocery-list (from meal plans)"

GEN_DATA='{"startDate":"2025-12-29","endDate":"2025-12-30","mealTypes":["lunch"],"overwrite":false}'
test_endpoint "POST" "/meal-plans/generate" "$GEN_DATA" "$TOKEN" "POST /api/meal-plans/generate"

# ============ TEST FOOD LOGGING ==========
echo -e "${YELLOW}10. Food Logging Endpoints${NC}"

FOOD_LOG_DATA='{"date":"2025-12-27","name":"Greek yogurt","mealType":"breakfast","calories":180,"proteinGrams":20,"carbsGrams":10,"fatGrams":6}'
SINGLE_FOOD_RESPONSE=$(curl -s -X POST "$API_URL/food-logs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$FOOD_LOG_DATA")

if echo "$SINGLE_FOOD_RESPONSE" | jq . >/dev/null 2>&1 && echo "$SINGLE_FOOD_RESPONSE" | jq -e '.id and .date=="2025-12-27" and .calories==180' >/dev/null 2>&1; then
  echo -e "Testing: POST /api/food-logs... ${GREEN}✓${NC}"
  PASSED=$((PASSED + 1))
  echo "$SINGLE_FOOD_RESPONSE" | jq '.' | sed 's/^/  /'
  echo ""
else
  echo -e "Testing: POST /api/food-logs... ${RED}✗${NC}"
  echo "$SINGLE_FOOD_RESPONSE" | sed 's/^/  /'
  FAILED=$((FAILED + 1))
  echo ""
fi

SINGLE_LOG_ID=$(echo "$SINGLE_FOOD_RESPONSE" | jq -r '.id // empty')

INVALID_MEALTYPE_DATA='{"date":"2025-12-27","name":"Bad meal type","mealType":"brunch","calories":10}'
INVALID_MEALTYPE_RESPONSE=$(curl -s -X POST "$API_URL/food-logs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$INVALID_MEALTYPE_DATA")

if echo "$INVALID_MEALTYPE_RESPONSE" | jq . >/dev/null 2>&1 && echo "$INVALID_MEALTYPE_RESPONSE" | jq -e '.error and .error=="Invalid input"' >/dev/null 2>&1; then
  echo -e "Testing: POST /api/food-logs (invalid mealType)... ${GREEN}✓${NC}"
  PASSED=$((PASSED + 1))
  echo "$INVALID_MEALTYPE_RESPONSE" | jq '.' | sed 's/^/  /'
  echo ""
else
  echo -e "Testing: POST /api/food-logs (invalid mealType)... ${RED}✗${NC}"
  echo "$INVALID_MEALTYPE_RESPONSE" | sed 's/^/  /'
  FAILED=$((FAILED + 1))
  echo ""
fi

MINIMAL_FOOD_LOG_DATA='{"date":"2025-12-25","name":"Espresso","mealType":"breakfast","calories":5}'
MINIMAL_FOOD_LOG_RESPONSE=$(curl -s -X POST "$API_URL/food-logs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$MINIMAL_FOOD_LOG_DATA")

if echo "$MINIMAL_FOOD_LOG_RESPONSE" | jq . >/dev/null 2>&1 && echo "$MINIMAL_FOOD_LOG_RESPONSE" | jq -e '.id and .date=="2025-12-25" and .protein_grams==null and .carbs_grams==null and .fat_grams==null and .notes==null' >/dev/null 2>&1; then
  echo -e "Testing: POST /api/food-logs (macros omitted)... ${GREEN}✓${NC}"
  PASSED=$((PASSED + 1))
  echo "$MINIMAL_FOOD_LOG_RESPONSE" | jq '.' | sed 's/^/  /'
  echo ""
else
  echo -e "Testing: POST /api/food-logs (macros omitted)... ${RED}✗${NC}"
  echo "$MINIMAL_FOOD_LOG_RESPONSE" | sed 's/^/  /'
  FAILED=$((FAILED + 1))
  echo ""
fi

if [ -n "$SINGLE_LOG_ID" ]; then
  test_endpoint "GET" "/food-logs/$SINGLE_LOG_ID" "" "$TOKEN" "GET /api/food-logs/:id" '.id=="'"$SINGLE_LOG_ID"'" and .date=="2025-12-27" and .calories==180'
fi

BULK_FOOD_LOG_DATA='{"logs":[{"date":"2025-12-28","name":"Oatmeal","mealType":"breakfast","calories":300,"proteinGrams":10,"carbsGrams":54,"fatGrams":5},{"date":"2025-12-28","name":"Chicken salad","mealType":"lunch","calories":450,"proteinGrams":40,"carbsGrams":12,"fatGrams":25}]}'
BULK_RESPONSE=$(curl -s -X POST "$API_URL/food-logs/bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$BULK_FOOD_LOG_DATA")

if echo "$BULK_RESPONSE" | jq . >/dev/null 2>&1 && echo "$BULK_RESPONSE" | jq -e '.createdCount==2 and (.logs|length)==2' >/dev/null 2>&1; then
  echo -e "Testing: POST /api/food-logs/bulk... ${GREEN}✓${NC}"
  PASSED=$((PASSED + 1))
  echo "$BULK_RESPONSE" | jq '.' | sed 's/^/  /'
  echo ""
else
  echo -e "Testing: POST /api/food-logs/bulk... ${RED}✗${NC}"
  echo "$BULK_RESPONSE" | sed 's/^/  /'
  FAILED=$((FAILED + 1))
  echo ""
fi

DELETE_LOG_ID=$(echo "$BULK_RESPONSE" | jq -r '.logs[0].id // empty')
UPDATE_LOG_ID=$(echo "$BULK_RESPONSE" | jq -r '.logs[1].id // empty')

test_endpoint "GET" "/food-logs?date=2025-12-27" "" "$TOKEN" "GET /api/food-logs (by date)"

test_endpoint "GET" "/food-summary?date=2025-12-28" "" "$TOKEN" "GET /api/food-summary (bulk date)" '.count==2 and .totals.calories==750 and .totals.protein_grams==50 and .totals.carbs_grams==66 and .totals.fat_grams==30'

if [ -n "$DELETE_LOG_ID" ]; then
  test_endpoint "DELETE" "/food-logs/$DELETE_LOG_ID" "" "$TOKEN" "DELETE /api/food-logs/:id" '.status=="ok"'
  test_endpoint "GET" "/food-summary?date=2025-12-28" "" "$TOKEN" "GET /api/food-summary (after delete)" '.count==1 and .totals.calories==450 and .totals.protein_grams==40 and .totals.carbs_grams==12 and .totals.fat_grams==25'
fi

if [ -n "$UPDATE_LOG_ID" ]; then
  UPDATE_DATA='{"calories":500,"proteinGrams":45}'
  test_endpoint "PUT" "/food-logs/$UPDATE_LOG_ID" "$UPDATE_DATA" "$TOKEN" "PUT /api/food-logs/:id" '.calories==500 and .protein_grams==45'

  PATCH_DATA='{"notes":"tasty"}'
  test_endpoint "PATCH" "/food-logs/$UPDATE_LOG_ID" "$PATCH_DATA" "$TOKEN" "PATCH /api/food-logs/:id" '.notes=="tasty" and .calories==500 and .protein_grams==45'

  IMPORT_DATA='{"rows":[{"date":"2025-12-26","name":"Imported bar","mealType":"snack","calories":"123","proteinGrams":"10","carbsGrams":"20","fatGrams":"3","notes":""}]}'
  IMPORT_RESPONSE=$(curl -s -X POST "$API_URL/food-logs/import" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$IMPORT_DATA")

  if echo "$IMPORT_RESPONSE" | jq . >/dev/null 2>&1 && echo "$IMPORT_RESPONSE" | jq -e '.createdCount==1 and (.logs|length)==1 and .logs[0].date=="2025-12-26" and .logs[0].calories==123 and .logs[0].protein_grams==10 and .logs[0].carbs_grams==20 and .logs[0].fat_grams==3 and .logs[0].notes==null' >/dev/null 2>&1; then
    echo -e "Testing: POST /api/food-logs/import... ${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
    echo "$IMPORT_RESPONSE" | jq '.' | sed 's/^/  /'
    echo ""
  else
    echo -e "Testing: POST /api/food-logs/import... ${RED}✗${NC}"
    echo "$IMPORT_RESPONSE" | sed 's/^/  /'
    FAILED=$((FAILED + 1))
    echo ""
  fi

  IMPORT_LOG_ID=$(echo "$IMPORT_RESPONSE" | jq -r '.logs[0].id // empty')
  if [ -n "$IMPORT_LOG_ID" ]; then
    test_endpoint "DELETE" "/food-logs/$IMPORT_LOG_ID" "" "$TOKEN" "DELETE /api/food-logs/:id (cleanup import)" '.status=="ok"'
  fi

  COPY_DATA='{"fromDate":"2025-12-27","toDate":"2025-12-20"}'
  COPY_RESPONSE=$(curl -s -X POST "$API_URL/food-logs/copy" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$COPY_DATA")

  if echo "$COPY_RESPONSE" | jq . >/dev/null 2>&1 && echo "$COPY_RESPONSE" | jq -e '.fromDate=="2025-12-27" and .toDate=="2025-12-20" and .copiedCount==1 and (.logs|length)==1 and .logs[0].date=="2025-12-20" and .logs[0].calories==180' >/dev/null 2>&1; then
    echo -e "Testing: POST /api/food-logs/copy... ${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
    echo "$COPY_RESPONSE" | jq '.' | sed 's/^/  /'
    echo ""
  else
    echo -e "Testing: POST /api/food-logs/copy... ${RED}✗${NC}"
    echo "$COPY_RESPONSE" | sed 's/^/  /'
    FAILED=$((FAILED + 1))
    echo ""
  fi

  COPY_LOG_ID=$(echo "$COPY_RESPONSE" | jq -r '.logs[0].id // empty')
  if [ -n "$COPY_LOG_ID" ]; then
    test_endpoint "DELETE" "/food-logs/$COPY_LOG_ID" "" "$TOKEN" "DELETE /api/food-logs/:id (cleanup copy)" '.status=="ok"'
  fi

  TEMPLATE_DATA='{"name":"Greek yogurt (template)","mealType":"breakfast","calories":180,"proteinGrams":20,"carbsGrams":10,"fatGrams":6,"notes":""}'
  TEMPLATE_RESPONSE=$(curl -s -X POST "$API_URL/food-logs/template" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$TEMPLATE_DATA")

  if echo "$TEMPLATE_RESPONSE" | jq . >/dev/null 2>&1 && echo "$TEMPLATE_RESPONSE" | jq -e '.id and .name=="Greek yogurt (template)" and .meal_type=="breakfast" and .calories==180 and .protein_grams==20 and .carbs_grams==10 and .fat_grams==6 and .notes==null' >/dev/null 2>&1; then
    echo -e "Testing: POST /api/food-logs/template... ${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
    echo "$TEMPLATE_RESPONSE" | jq '.' | sed 's/^/  /'
    echo ""
  else
    echo -e "Testing: POST /api/food-logs/template... ${RED}✗${NC}"
    echo "$TEMPLATE_RESPONSE" | sed 's/^/  /'
    FAILED=$((FAILED + 1))
    echo ""
  fi

  TEMPLATE_ID=$(echo "$TEMPLATE_RESPONSE" | jq -r '.id // empty')
  TEMPLATES_LIST_RESPONSE=$(curl -s -X GET "$API_URL/food-logs/templates?limit=50" \
    -H "Authorization: Bearer $TOKEN")

  if echo "$TEMPLATES_LIST_RESPONSE" | jq . >/dev/null 2>&1 && [ -n "$TEMPLATE_ID" ] && echo "$TEMPLATES_LIST_RESPONSE" | jq -e '(. | type)=="array" and any(.[]; .id=="'"$TEMPLATE_ID"'" and .name=="Greek yogurt (template)" and .calories==180)' >/dev/null 2>&1; then
    echo -e "Testing: GET /api/food-logs/templates... ${GREEN}✓${NC}"
    PASSED=$((PASSED + 1))
    echo "$TEMPLATES_LIST_RESPONSE" | jq '.' | sed 's/^/  /'
    echo ""
  else
    echo -e "Testing: GET /api/food-logs/templates... ${RED}✗${NC}"
    echo "$TEMPLATES_LIST_RESPONSE" | sed 's/^/  /'
    FAILED=$((FAILED + 1))
    echo ""
  fi

  if [ -n "$TEMPLATE_ID" ]; then
    TEMPLATE_DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/food-logs/templates/$TEMPLATE_ID" \
      -H "Authorization: Bearer $TOKEN")

    if echo "$TEMPLATE_DELETE_RESPONSE" | jq . >/dev/null 2>&1 && echo "$TEMPLATE_DELETE_RESPONSE" | jq -e '.status=="ok" and .deleted.id=="'"$TEMPLATE_ID"'"' >/dev/null 2>&1; then
      echo -e "Testing: DELETE /api/food-logs/templates/:id... ${GREEN}✓${NC}"
      PASSED=$((PASSED + 1))
      echo "$TEMPLATE_DELETE_RESPONSE" | jq '.' | sed 's/^/  /'
      echo ""
    else
      echo -e "Testing: DELETE /api/food-logs/templates/:id... ${RED}✗${NC}"
      echo "$TEMPLATE_DELETE_RESPONSE" | sed 's/^/  /'
      FAILED=$((FAILED + 1))
      echo ""
    fi

    TEMPLATES_LIST_AFTER_DELETE=$(curl -s -X GET "$API_URL/food-logs/templates?limit=50" \
      -H "Authorization: Bearer $TOKEN")
    if echo "$TEMPLATES_LIST_AFTER_DELETE" | jq . >/dev/null 2>&1 && echo "$TEMPLATES_LIST_AFTER_DELETE" | jq -e 'any(.[]; .id=="'"$TEMPLATE_ID"'") | not' >/dev/null 2>&1; then
      echo -e "Testing: GET /api/food-logs/templates (after delete)... ${GREEN}✓${NC}"
      PASSED=$((PASSED + 1))
      echo "$TEMPLATES_LIST_AFTER_DELETE" | jq '.' | sed 's/^/  /'
      echo ""
    else
      echo -e "Testing: GET /api/food-logs/templates (after delete)... ${RED}✗${NC}"
      echo "$TEMPLATES_LIST_AFTER_DELETE" | sed 's/^/  /'
      FAILED=$((FAILED + 1))
      echo ""
    fi
  fi

  test_endpoint "GET" "/food-logs?start=2025-12-27&end=2025-12-28&limit=1&offset=0" "" "$TOKEN" "GET /api/food-logs (paginated)" 'length==1 and .[0].date=="2025-12-28"'

  test_endpoint "GET" "/food-days?start=2025-12-25&end=2025-12-28" "" "$TOKEN" "GET /api/food-days" '.daysCount==3 and .days[0]=="2025-12-25" and .days[1]=="2025-12-27" and .days[2]=="2025-12-28"'

  test_endpoint "GET" "/food-summary/range?start=2025-12-27&end=2025-12-28" "" "$TOKEN" "GET /api/food-summary/range" '.start=="2025-12-27" and .end=="2025-12-28" and .daysCount==2 and (.days|length)==2 and .days[0].date=="2025-12-27" and .days[0].count==1 and .days[0].totals.calories==180 and .days[0].totals.protein_grams==20 and .days[1].date=="2025-12-28" and .days[1].count==1 and .days[1].totals.calories==500 and .days[1].totals.protein_grams==45 and .totals.calories==680 and .totals.protein_grams==65'

  test_endpoint "GET" "/food-summary/week?weekStart=2025-12-22" "" "$TOKEN" "GET /api/food-summary/week" '.weekStart=="2025-12-22" and .start=="2025-12-22" and .end=="2025-12-28" and .daysCount==7 and (.days|length)==7 and .days[0].date=="2025-12-22" and .days[1].count==0 and .days[3].date=="2025-12-25" and .days[3].count==1 and .days[3].totals.calories==5 and .days[5].date=="2025-12-27" and .days[5].count==1 and .days[5].totals.calories==180 and .days[6].date=="2025-12-28" and .days[6].count==1 and .days[6].totals.calories==500 and .totals.calories==685 and .totals.protein_grams==65'

  test_endpoint "GET" "/food-summary/month?month=2025-12" "" "$TOKEN" "GET /api/food-summary/month" '.month=="2025-12" and .start=="2025-12-01" and .end=="2025-12-31" and .daysCount==31 and (.days|length)==31 and .days[24].date=="2025-12-25" and .days[24].count==1 and .days[24].totals.calories==5 and .days[26].date=="2025-12-27" and .days[26].count==1 and .days[26].totals.calories==180 and .days[27].date=="2025-12-28" and .days[27].count==1 and .days[27].totals.calories==500 and .totals.calories==685'

  test_endpoint "GET" "/food-summary?date=2025-12-28" "" "$TOKEN" "GET /api/food-summary (after update)" '.count==1 and .totals.calories==500 and .totals.protein_grams==45 and .totals.carbs_grams==12 and .totals.fat_grams==25'
fi

test_endpoint "GET" "/food-summary?date=2025-12-27" "" "$TOKEN" "GET /api/food-summary"

test_endpoint "GET" "/calorie-balance?date=2025-12-27" "" "$TOKEN" "GET /api/calorie-balance"

test_endpoint "GET" "/weekly-calorie-balance?start=2025-12-27&end=2025-12-28" "" "$TOKEN" "GET /api/weekly-calorie-balance" '.daysCount==2 and .targetCalories!=null and .totals.consumedCalories==680'

test_endpoint "GET" "/streaks?asOf=2025-12-28" "" "$TOKEN" "GET /api/streaks" '.streakType=="food-logs" and .activeOnAsOfDate==true and .currentStreak==2 and .longestStreak==2 and .lastActiveDate=="2025-12-28"'

test_endpoint "GET" "/macro-balance?date=2025-12-27" "" "$TOKEN" "GET /api/macro-balance" '.targets.protein_grams==150 and .targets.carbs_grams==200 and .targets.fat_grams==60 and .consumed.protein_grams==20 and .consumed.carbs_grams==10 and .consumed.fat_grams==6'

test_endpoint "GET" "/macro-balance/range?start=2025-12-27&end=2025-12-28" "" "$TOKEN" "GET /api/macro-balance/range" '.daysCount==2 and .targets.protein_grams==150 and .totals.consumed.protein_grams==65 and .totals.consumed.carbs_grams==22 and .totals.consumed.fat_grams==31 and .totals.targets.protein_grams==300 and .totals.remaining.protein_grams==235 and .days[0].date=="2025-12-27" and .days[1].date=="2025-12-28"'

test_endpoint "GET" "/nutrition-score?date=2025-12-27" "" "$TOKEN" "GET /api/nutrition-score" '.score==100 and .targets.calories!=null and .hasTargets==true'

test_endpoint "GET" "/nutrition-score/range?start=2025-12-27&end=2025-12-28" "" "$TOKEN" "GET /api/nutrition-score/range" '.daysCount==2 and .averageScore==100 and .days[0].date=="2025-12-27" and .days[1].date=="2025-12-28" and .days[0].score==100 and .days[1].score==100'

test_endpoint "GET" "/weekly-nutrition?start=2025-12-27&end=2025-12-27" "" "$TOKEN" "GET /api/weekly-nutrition" '.daysCount==1 and .averageScore==100 and .totals.calories==180 and .totals.protein_grams==20 and .days[0].score==100'

# ============ TEST GROCERY ENDPOINTS ============
echo -e "${YELLOW}11. Grocery Planning Endpoints${NC}"

GROCERY_DATA='{"dailyCalories":2000}'
test_endpoint "POST" "/grocery-plan" "$GROCERY_DATA" "$TOKEN" "POST /api/grocery-plan"

OPTIMIZE_DATA='{"budget":"400 NIS","allergies":["nuts"]}'
test_endpoint "POST" "/grocery-optimize" "$OPTIMIZE_DATA" "$TOKEN" "POST /api/grocery-optimize"

# ============ CLEANUP ============
echo -e "${YELLOW}Cleanup...${NC}"
kill $SERVER_PID 2>/dev/null || true
sleep 1

# ============ RESULTS ============
echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 Test Results"
echo "════════════════════════════════════════════════════════════"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
