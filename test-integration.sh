#!/bin/bash

# YAHealthy Integration Test Script

echo "🧪 Testing YAHealthy Full Stack Integration"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test Backend Health
echo "📋 Testing Backend API..."
BACKEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health)
if [ $BACKEND_HEALTH -eq 200 ]; then
    echo -e "${GREEN}✓${NC} Backend Health Check: OK"
else
    echo -e "${RED}✗${NC} Backend Health Check: FAILED (HTTP $BACKEND_HEALTH)"
    exit 1
fi

# Test Backend Ready
echo "📋 Testing Backend Ready Status..."
BACKEND_READY=$(curl -s http://localhost:5000/api/ready | jq -r '.status')
if [ "$BACKEND_READY" == "ready" ]; then
    echo -e "${GREEN}✓${NC} Backend Ready: Yes"
else
    echo -e "${RED}✗${NC} Backend Ready: No"
fi

# Test Authentication Signup
echo ""
echo "🔐 Testing Authentication..."
TEST_EMAIL="integrationtest-$(date +%s)@example.com"
TEST_PASSWORD="testpass123"

SIGNUP_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

TOKEN=$(echo $SIGNUP_RESPONSE | jq -r '.token')
if [ ! -z "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo -e "${GREEN}✓${NC} Signup: Success (User: $TEST_EMAIL)"
else
    echo -e "${RED}✗${NC} Signup: Failed"
    exit 1
fi

# Test Authentication Login
echo "🔐 Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

LOGIN_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
if [ ! -z "$LOGIN_TOKEN" ] && [ "$LOGIN_TOKEN" != "null" ]; then
    echo -e "${GREEN}✓${NC} Login: Success"
else
    echo -e "${RED}✗${NC} Login: Failed"
fi

# Test Get Current User
echo "🔐 Testing Get Current User..."
ME_RESPONSE=$(curl -s -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN")

USER_ID=$(echo $ME_RESPONSE | jq -r '.id')
if [ ! -z "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
    echo -e "${GREEN}✓${NC} Get Current User: Success (User ID: $USER_ID)"
else
    echo -e "${RED}✗${NC} Get Current User: Failed"
fi

# Test Food Logging
echo ""
echo "🍽️  Testing Food Logging..."
FOOD_LOG_RESPONSE=$(curl -s -X POST http://localhost:5000/api/food-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"food_name":"Test Meal","calories":500,"protein":25,"carbs":60,"fat":15,"meal_type":"lunch"}')

FOOD_ID=$(echo $FOOD_LOG_RESPONSE | jq -r '.id')
if [ ! -z "$FOOD_ID" ] && [ "$FOOD_ID" != "null" ]; then
    echo -e "${GREEN}✓${NC} Log Food: Success (Food ID: $FOOD_ID)"
else
    echo -e "${RED}✗${NC} Log Food: Failed"
fi

# Test Get Food Logs
echo "🍽️  Testing Get Food Logs..."
FOOD_LOGS=$(curl -s -X GET http://localhost:5000/api/food-logs \
  -H "Authorization: Bearer $TOKEN")

LOG_COUNT=$(echo $FOOD_LOGS | jq '.length')
if [ $LOG_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Get Food Logs: Success (Found: $LOG_COUNT logs)"
else
    echo -e "${YELLOW}⚠${NC} Get Food Logs: No logs found"
fi

# Test Frontend Dev Server
echo ""
echo "🌐 Testing Frontend Dev Server..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/)
if [ $FRONTEND_STATUS -eq 200 ]; then
    echo -e "${GREEN}✓${NC} Frontend Dev Server: Running (http://localhost:5173/)"
else
    echo -e "${RED}✗${NC} Frontend Dev Server: Not responding (HTTP $FRONTEND_STATUS)"
fi

# Summary
echo ""
echo "==========================================="
echo -e "${GREEN}✓ Integration tests completed!${NC}"
echo ""
echo "📊 Summary:"
echo "  - Backend API:     Running on http://localhost:5000"
echo "  - Frontend Dev:    Running on http://localhost:5173"
echo "  - API Docs:        http://localhost:5000/api/docs"
echo ""
echo "🚀 Next Steps:"
echo "  1. Open http://localhost:5173 in your browser"
echo "  2. Sign up with a new email"
echo "  3. Log some food items"
echo "  4. Check the dashboard for nutrition stats"
echo ""
