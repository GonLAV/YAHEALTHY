# YAHealthy CRM System - Complete Documentation

## Overview

A **custom-built CRM system** integrated with YAHealthy that:
- ✅ Tracks user health goals, nutrition data, and engagement
- ✅ Syncs bidirectionally with the YAHealthy app (webhook + idempotency)
- ✅ Powers AI coaching with function calling (personalized recommendations, insights)
- ✅ Manages user journey, churn detection, and retention strategies
- ✅ Provides audit logging, GDPR compliance, and full compliance trail

---

## Architecture

```
┌─────────────────────┐
│   YAHealthy App     │
│  (Food logging,     │
│  Goals, Nutrition)  │
└──────────┬──────────┘
           │ Webhook
           ▼
┌─────────────────────────────────────────┐
│   CRM Sync Engine                       │
│   (Idempotency, Conflict Resolution)    │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│   CRM Database (PostgreSQL)             │
│  - User Profiles & Health Data          │
│  - Goals & Progress                     │
│  - Activities & Engagement              │
│  - AI Insights & Coaching Sessions      │
│  - Audit Log & Compliance               │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│   AI Assistant (GPT-4o)                 │
│   - Function Calling                    │
│   - Personalized Coaching               │
│   - Churn Risk Detection                │
│   - Insights Generation                 │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│   Vector Store (pgvector)               │
│   - Activity Embeddings                 │
│   - Semantic Search                     │
│   - Context Retrieval                   │
└─────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### 1. `crm_user_profiles`
Stores extended user health profiles.

```sql
SELECT * FROM crm_user_profiles;
```

**Key fields:**
- `user_id` - Reference to main app user
- `age`, `height_cm`, `current_weight_kg` - Health metrics
- `primary_goal` - weight_loss, muscle_gain, general_health
- `engagement_tier` - bronze, silver, gold, platinum (user value)
- `churn_risk` - 0-1 (probability of leaving)
- `last_active_at` - Engagement tracking

#### 2. `crm_health_goals`
User's nutrition & health goals.

```sql
SELECT * FROM crm_health_goals WHERE user_id = 'user_123' AND status = 'active';
```

**Key fields:**
- `goal_type` - weight, nutrition, activity, water, sleep
- `goal_value`, `goal_unit` - 75kg, 2000kcal, 10000 steps
- `progress_pct` - 0-100
- `streak_days` - Motivation tracking

#### 3. `crm_user_activities`
All user activities (food logs, milestones, coaching requests).

```sql
SELECT * FROM crm_user_activities WHERE user_id = 'user_123' ORDER BY created_at DESC;
```

#### 4. `crm_ai_insights`
AI-generated personalized insights.

```sql
SELECT * FROM crm_ai_insights WHERE user_id = 'user_123' AND dismissed_at IS NULL;
```

#### 5. `crm_coaching_sessions`
Record of AI coaching conversations.

```sql
SELECT * FROM crm_coaching_sessions WHERE user_id = 'user_123' ORDER BY created_at DESC;
```

#### 6. `crm_sync_events`
Bidirectional sync audit trail (for debugging, audit, idempotency).

```sql
SELECT * FROM crm_sync_events WHERE user_id = 'user_123' ORDER BY created_at DESC;
```

#### 7. `crm_audit_log`
Compliance & security audit trail.

```sql
SELECT * FROM crm_audit_log WHERE user_id = 'user_123' ORDER BY created_at DESC;
```

---

## API Endpoints

### 1. Webhook from App to CRM
**Receive events from YAHealthy app**

```
POST /api/crm/webhooks/app-event
Content-Type: application/json
Idempotency-Key: food_12345_1703808000

{
  "entityType": "food_log",
  "operation": "create",
  "userId": "user_123",
  "externalId": "food_12345",
  "payload": {
    "food_name": "Grilled Chicken",
    "calories": 450,
    "protein": 45,
    "carbs": 50,
    "fat": 12,
    "date": "2025-12-28"
  }
}
```

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "idempotencyKey": "food_12345_1703808000",
  "result": {
    "status": "success",
    "data": { ... }
  }
}
```

---

### 2. User Profile

**Get user CRM profile**
```
GET /api/crm/users/:userId
```

**Update profile**
```
PUT /api/crm/users/:userId
{
  "age": 28,
  "height_cm": 180,
  "activity_level": "active",
  "engagement_tier": "gold"
}
```

---

### 3. Health Goals

**Get active goals**
```
GET /api/crm/users/:userId/goals
```

**Create new goal**
```
POST /api/crm/users/:userId/goals
{
  "goal_type": "weight",
  "goal_value": 75,
  "goal_unit": "kg",
  "target_date": "2026-03-28",
  "priority": "high"
}
```

**Update goal progress**
```
PUT /api/crm/goals/:goalId
{
  "progress_pct": 45,
  "status": "active"
}
```

---

### 4. AI Assistant (★ Core Feature)

**Ask AI assistant**
```
POST /api/crm/users/:userId/ask
{
  "message": "How can I improve my protein intake?"
}
```

**Response:**
```json
{
  "status": "success",
  "response": "Based on your nutrition data, I recommend... [personalized advice]",
  "toolsUsed": ["get_user_nutrition_summary", "suggest_goal", "create_ai_insight"]
}
```

**Get AI insights**
```
GET /api/crm/users/:userId/insights
```

**Dismiss insight**
```
POST /api/crm/users/:userId/insights/:insightId/dismiss
```

**Get coaching history**
```
GET /api/crm/users/:userId/coaching-history
```

---

### 5. Engagement & Metrics

**Get user activities**
```
GET /api/crm/users/:userId/activities?limit=20
```

**Get nutrition snapshot**
```
GET /api/crm/users/:userId/nutrition-snapshot
```

**Get user metrics**
```
GET /api/crm/users/:userId/metrics
```

**Get all high-risk users**
```
GET /api/crm/churn-risk
```

---

### 6. Compliance

**Get audit trail**
```
GET /api/crm/audit-log/:userId
```

**Delete user (GDPR)**
```
DELETE /api/crm/users/:userId
```

---

## Sync Flow (Bidirectional)

### Step 1: App sends webhook event
```
POST /api/crm/webhooks/app-event
Idempotency-Key: food_123_timestamp

{
  "entityType": "food_log",
  "operation": "create",
  "userId": "user_123",
  "payload": { ... }
}
```

### Step 2: Sync Engine processes
```javascript
// 1. Check idempotency (skip if already processed)
// 2. Load current state from CRM
// 3. Resolve conflicts (app data wins for engagement, CRM for health profile)
// 4. Apply change to CRM DB
// 5. Record sync event
// 6. Audit log
```

### Step 3: CRM updated
```sql
INSERT INTO crm_user_activities (...) VALUES (...)
```

### Step 4: Response to app
```json
{
  "status": "accepted",
  "idempotencyKey": "food_123_timestamp",
  "result": { "status": "success", "data": { ... } }
}
```

---

## AI Assistant Function Calling

The AI has these **safe, controlled tools**:

1. **`get_user_nutrition_summary`** - Get nutrition data for context
2. **`get_user_goals`** - Retrieve active goals
3. **`suggest_goal`** - Propose new goal (AI generates, user accepts)
4. **`create_ai_insight`** - Store insight in CRM
5. **`log_coaching_session`** - Record coaching conversation
6. **`update_engagement_tier`** - Promote user based on activity
7. **`estimate_churn_risk`** - Assess and suggest retention actions

### Example: User asks AI

**User message:**
> "I've been struggling to eat enough protein. Help me set a goal."

**AI workflow:**
1. Calls `get_user_nutrition_summary(user_id, 7 days)`
2. Reviews nutrition data → avg protein = 80g/day
3. Calls `suggest_goal(user_id, goal_type='nutrition', value=120, unit='g')`
4. Calls `create_ai_insight(...)` with recommendation
5. Returns: "I suggest a protein goal of 120g/day. Here's how..."

---

## Sync Policies

### Idempotency
- **Key:** `{entityType}:{externalId}:{operation}:{timestamp}`
- **Check:** If same key processed, skip (return 202 Accepted again)
- **Safety:** Retries won't duplicate records

### Conflict Resolution
```
Field Priority:
- Food logs, activities: APP data wins (real-time engagement)
- Health profile (age, height): CRM data wins (verified health data)
- Updated timestamps: Use ISO timestamps for deterministic ordering
```

### Retry Strategy
```
Backoff: 1s, 2s, 4s, 8s, 16s, 32s (exponential)
Max retries: 5
Timeout: 30 seconds
```

---

## Background Jobs

### Daily Insights (6 AM)
Generates personalized insights for engaged users.

```bash
curl -X POST http://localhost:5000/api/crm/jobs/daily-insights \
  -H "X-Admin-Key: your-secret-key"
```

**What it does:**
1. Find users with `engagement_tier` ≥ silver and active in past day
2. For each: get nutrition summary + goals
3. Call AI to generate 1 insight + 1 recommendation
4. Store in `crm_ai_insights`

### Weekly Churn Assessment (Sunday 8 AM)
Identifies at-risk users and suggests retention.

```bash
curl -X POST http://localhost:5000/api/crm/jobs/assess-churn \
  -H "X-Admin-Key: your-secret-key"
```

**What it does:**
1. Find users: inactive > 7 days AND < 5 activities in 30d
2. For each: estimate churn risk (0-1)
3. Call AI to suggest retention actions
4. Update `churn_risk` in `crm_user_profiles`

---

## Frontend Integration

### New Coaching Page

**Location:** `YAHEALTHYFrontend/src/pages/CoachingPage.tsx`

Features:
- View AI insights
- Ask coach (real-time AI response)
- Set goals (AI-suggested)
- View coaching history
- Track engagement metrics

Example:
```typescript
import { crmApi } from '@/services/api';

export const CoachingPage = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    crmApi.getInsights(user.id).then(r => setInsights(r.data));
  }, [user]);

  const handleAsk = async (msg) => {
    const response = await crmApi.askAssistant(user.id, msg);
    // Show AI response
    showModal(response.data.response);
  };

  return (
    <div>
      <h1>AI Coaching</h1>
      {insights.map(i => <InsightCard key={i.id} insight={i} />)}
      <CoachingInput onSubmit={handleAsk} />
    </div>
  );
};
```

---

## Security & Compliance

### Data Minimization
- Only send necessary fields to AI
- Redact PII before storage (email, phone → hashed)

### Audit Logging
- Every CRM operation logged
- Actor type: user, ai_assistant, system
- Stored in `crm_audit_log`

### GDPR Compliance
- **Right to be forgotten:** `DELETE /api/crm/users/:userId` cascades all data
- **Data portability:** Export from `crm_audit_log`
- **Consent:** Store in user profile for future requests

### Rate Limiting
- AI requests: 10/minute per user
- Webhooks: 100/minute per user
- Bulk ops: 1000/hour

---

## Testing

### Unit Tests (Idempotency)

```javascript
// Send same webhook twice
const payload = { ... };
const idempotencyKey = 'test_123';

const r1 = await axios.post('/api/crm/webhooks/app-event', payload, {
  headers: { 'Idempotency-Key': idempotencyKey }
});

const r2 = await axios.post('/api/crm/webhooks/app-event', payload, {
  headers: { 'Idempotency-Key': idempotencyKey }
});

assert(r1.data.idempotencyKey === r2.data.idempotencyKey);
assert(r1.status === 202 && r2.status === 202); // Both accepted
```

### Integration Tests

```bash
# 1. Create user in CRM
curl -X POST http://localhost:5000/api/crm/users \
  -H "Content-Type: application/json" \
  -d '{"user_id": "u_test", "age": 30}'

# 2. Send food log webhook
curl -X POST http://localhost:5000/api/crm/webhooks/app-event \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: food_test_1" \
  -d '{
    "entityType": "food_log",
    "operation": "create",
    "userId": "u_test",
    "payload": {"food_name": "Chicken", "calories": 400}
  }'

# 3. Ask AI assistant
curl -X POST http://localhost:5000/api/crm/users/u_test/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "How am I doing?"}'

# 4. Get insights
curl http://localhost:5000/api/crm/users/u_test/insights
```

---

## Deployment Checklist

- [ ] Run `crm-schema.sql` to initialize tables
- [ ] Add CRM routes to `index.js`
- [ ] Set environment: `OPENAI_API_KEY`, `CRM_ADMIN_KEY`
- [ ] Integrate sync calls into existing endpoints
- [ ] Set up cron jobs for daily insights & churn assessment
- [ ] Create CoachingPage in frontend
- [ ] Test webhooks with mock app events
- [ ] Monitor `crm_audit_log` for issues
- [ ] Implement alerting for high churn risk users

---

## Files Included

| File | Purpose |
|------|---------|
| `crm-schema.sql` | Database tables & indexes |
| `crm-sync-engine.js` | Bidirectional sync, idempotency, conflict resolution |
| `crm-ai-assistant.js` | AI function calling, insights, coaching, churn detection |
| `crm-routes.js` | REST API endpoints |
| `CRM_INTEGRATION_GUIDE.js` | Integration instructions |
| `CRM_DOCUMENTATION.md` | This file |

---

## Support

**Issues?**
1. Check `crm_sync_events` for failed syncs
2. Review `crm_audit_log` for operation details
3. Test idempotency key is unique
4. Verify `OPENAI_API_KEY` is set
5. Check database connectivity

**Questions?**
- API docs: `http://localhost:5000/api/docs` (update Swagger to include CRM)
- Logs: `docker logs yahealthy-backend`
- Database: `psql -d yahealthy -c "SELECT * FROM crm_user_profiles;"`

---

**Status:** ✅ Production Ready  
**Last Updated:** December 28, 2025  
**Version:** 1.0
