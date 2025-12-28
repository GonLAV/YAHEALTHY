# CRM Implementation Checklist

## Pre-Integration
- [ ] Environment variables configured (.env)
  - [ ] `CRM_ENABLED=true`
  - [ ] `CRM_ADMIN_KEY=<secure-key>`
  - [ ] `OPENAI_API_KEY=sk-<your-key>`
  - [ ] `WEBHOOK_SECRET=<secret>`

- [ ] Dependencies installed
  - [ ] `npm install node-cron axios`
  
- [ ] Database ready
  - [ ] PostgreSQL running on `:5432`
  - [ ] `yahealthy` database exists
  - [ ] `crm-schema.sql` in project root

---

## Phase 1: Database Setup
- [ ] Run SQL schema
  ```bash
  psql -U postgres -d yahealthy -f crm-schema.sql
  ```

- [ ] Verify tables created
  ```bash
  psql -U postgres -d yahealthy -c "\dt crm_*"
  ```
  Expected: 10 tables (user_profiles, health_goals, activities, etc.)

- [ ] Install pgvector (for embeddings)
  ```bash
  psql -U postgres -d yahealthy -c "CREATE EXTENSION IF NOT EXISTS vector;"
  ```

---

## Phase 2: Backend Integration

### Step 1: File Placement ✓
Files already in `/YAHEALTHYbackend/`:
- [ ] `crm-schema.sql` ✓
- [ ] `crm-sync-engine.js` ✓
- [ ] `crm-ai-assistant.js` ✓
- [ ] `crm-routes.js` ✓

### Step 2: Update `index.js`

**Add imports (at top):**
```javascript
const crmRoutes = require('./crm-routes');
const { CRMSyncEngine } = require('./crm-sync-engine');
const { CRMAssistant } = require('./crm-ai-assistant');
```

**Mount routes (after auth routes):**
```javascript
// CRM Routes
app.use('/api/crm', crmRoutes);
```

**Add cron jobs (at end, before app.listen):**
```javascript
const cron = require('node-cron');

// Daily insights (6 AM UTC)
cron.schedule('0 6 * * *', async () => {
  console.log('[CRM] Running daily insights job...');
  try {
    await axios.post('http://localhost:5000/api/crm/jobs/daily-insights', {}, {
      headers: { 'X-Admin-Key': process.env.CRM_ADMIN_KEY }
    });
    console.log('[CRM] Daily insights completed');
  } catch (err) {
    console.error('[CRM] Daily insights failed:', err.message);
  }
});

// Weekly churn assessment (Sunday 8 AM UTC)
cron.schedule('0 8 * * 0', async () => {
  console.log('[CRM] Running churn assessment job...');
  try {
    await axios.post('http://localhost:5000/api/crm/jobs/assess-churn', {}, {
      headers: { 'X-Admin-Key': process.env.CRM_ADMIN_KEY }
    });
    console.log('[CRM] Churn assessment completed');
  } catch (err) {
    console.error('[CRM] Churn assessment failed:', err.message);
  }
});

console.log('[CRM] Background jobs scheduled');
```

- [ ] `index.js` updated with imports
- [ ] `index.js` updated with route mounting
- [ ] `index.js` updated with cron jobs
- [ ] Server starts without errors

### Step 3: Integrate Sync into Auth Endpoint

**In signup endpoint, after user is created:**
```javascript
// Create CRM profile
if (process.env.CRM_ENABLED === 'true') {
  try {
    await axios.post('http://localhost:5000/api/crm/users', {
      user_id: newUser.id,
      age: req.body.age || null,
      height_cm: req.body.height || null,
      primary_goal: req.body.goal || 'general_health',
      engagement_tier: 'bronze',
      created_at: new Date().toISOString()
    });
    console.log(`[CRM] Profile created for user ${newUser.id}`);
  } catch (err) {
    console.error('[CRM] Profile creation failed:', err.message);
    // Don't fail signup if CRM fails
  }
}
```

- [ ] Signup endpoint includes CRM profile creation

### Step 4: Integrate Sync into Food Log Endpoint

**After food log is saved:**
```javascript
// Sync food log to CRM
if (process.env.CRM_ENABLED === 'true') {
  try {
    const idempotencyKey = `food_${savedLog.id}_${Date.now()}`;
    await axios.post('http://localhost:5000/api/crm/webhooks/app-event', {
      entityType: 'food_log',
      operation: 'create',
      userId: req.user.id,
      externalId: savedLog.id,
      payload: {
        food_name: req.body.name,
        calories: req.body.calories || 0,
        protein: req.body.protein || 0,
        carbs: req.body.carbs || 0,
        fat: req.body.fat || 0,
        date: req.body.date || new Date().toISOString().split('T')[0]
      }
    }, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
    console.log(`[CRM] Food log synced for user ${req.user.id}`);
  } catch (err) {
    console.error('[CRM] Food log sync failed:', err.message);
    // Don't fail food log if CRM fails
  }
}
```

- [ ] Food log endpoint includes CRM sync

### Step 5: Optional - Sync Goals

**When user creates/updates a goal:**
```javascript
if (process.env.CRM_ENABLED === 'true') {
  try {
    const idempotencyKey = `goal_${goalId}_${Date.now()}`;
    await axios.post('http://localhost:5000/api/crm/webhooks/app-event', {
      entityType: 'goal',
      operation: operation, // 'create' or 'update'
      userId: req.user.id,
      externalId: goalId,
      payload: {
        goal_type: req.body.type,
        goal_value: req.body.value,
        goal_unit: req.body.unit,
        target_date: req.body.targetDate
      }
    }, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
  } catch (err) {
    console.error('[CRM] Goal sync failed:', err.message);
  }
}
```

- [ ] Goal endpoint includes CRM sync (optional)

---

## Phase 3: Frontend Integration

### Step 1: Create Coaching Page

**Create `/YAHEALTHYFrontend/src/pages/CoachingPage.tsx`:**

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

export const CoachingPage = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadInsights();
    }
  }, [user?.id]);

  const loadInsights = async () => {
    try {
      const res = await axios.get(`/api/crm/users/${user?.id}/insights`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setInsights(res.data.data || []);
    } catch (err) {
      console.error('Failed to load insights:', err);
      setError('Could not load insights');
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `/api/crm/users/${user?.id}/ask`,
        { message },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setResponse(res.data.response);
      setMessage('');
      
      // Reload insights
      setTimeout(loadInsights, 1000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error getting response');
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">AI Nutrition Coach</h1>
      <p className="text-gray-600 mb-8">Get personalized nutrition advice</p>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Chat Section */}
        <div className="col-span-2 md:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Ask Your Coach</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                {error}
              </div>
            )}

            <form onSubmit={handleAsk} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask me about your nutrition..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Thinking...' : 'Ask'}
                </button>
              </div>
            </form>

            {response && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-gray-800">{response}</p>
              </div>
            )}
          </div>
        </div>

        {/* Insights Section */}
        <div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Your Insights</h2>
            
            {insights.length === 0 ? (
              <p className="text-gray-500">No insights yet. Keep logging food!</p>
            ) : (
              <div className="space-y-3">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-3 bg-blue-50 border border-blue-200 rounded"
                  >
                    <p className="font-semibold text-blue-900 text-sm">
                      {insight.insight_type}
                    </p>
                    <p className="text-xs text-gray-700 mt-1">
                      {insight.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] CoachingPage.tsx created

### Step 2: Update App.tsx

**Add route:**
```typescript
import { CoachingPage } from '@/pages/CoachingPage';

// In Routes:
<Route path="/coaching" element={<PrivateRoute><CoachingPage /></PrivateRoute>} />
```

**Add navigation link:**
```typescript
<nav>
  {/* ... existing links ... */}
  <a href="/coaching" className="...">Coaching</a>
</nav>
```

- [ ] Route added to App.tsx
- [ ] Navigation link added

### Step 3: Test Frontend

- [ ] Frontend starts: `npm run dev`
- [ ] Login works
- [ ] Navigate to `/coaching` works
- [ ] Insights display (if any)
- [ ] Chat input appears

---

## Phase 4: Testing

### Quick Test

```bash
# 1. Start server
npm start

# 2. Create test user (signup)
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "name": "Test User",
    "age": 28,
    "height": 180,
    "goal": "weight_loss"
  }'

# Save the token: TOKEN=<jwt_from_response>

# 3. Send webhook
curl -X POST http://localhost:5000/api/crm/webhooks/app-event \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: food_test_1" \
  -d '{
    "entityType": "food_log",
    "operation": "create",
    "userId": "user_123",
    "externalId": "food_1",
    "payload": {
      "food_name": "Grilled Chicken",
      "calories": 450,
      "protein": 45,
      "carbs": 0,
      "fat": 12,
      "date": "2025-12-28"
    }
  }'

# 4. Ask AI
curl -X POST http://localhost:5000/api/crm/users/user_123/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "How am I doing?"}'

# 5. Check insights
curl http://localhost:5000/api/crm/users/user_123/insights
```

- [ ] Webhook returns 202 Accepted
- [ ] AI responds (may take 1-3s)
- [ ] Insights appear in response

### Full Test Suite

- [ ] **Idempotency Test**
  ```bash
  # Send same webhook twice (same Idempotency-Key)
  # Both should return 202 Accepted
  # Only one record should be created (verify with DB)
  SELECT COUNT(*) FROM crm_user_activities WHERE external_id = 'food_1';
  # Expected: 1
  ```

- [ ] **AI Function Calling Test**
  - [ ] Ask AI → Gets nutrition summary
  - [ ] Ask AI → Suggests goal
  - [ ] Ask AI → Creates insight
  - [ ] Check coaching session recorded in DB

- [ ] **Churn Detection Test**
  - [ ] Create inactive user (no activity > 7 days)
  - [ ] Run `/api/crm/jobs/assess-churn` manually
  - [ ] Check `churn_risk` > 0.5 for inactive user

- [ ] **GDPR Deletion Test**
  - [ ] `DELETE /api/crm/users/user_123`
  - [ ] Verify all user data deleted from all tables

- [ ] **Frontend Test**
  - [ ] Login to app
  - [ ] Navigate to `/coaching`
  - [ ] Ask AI question
  - [ ] See AI response
  - [ ] See insights listed

---

## Phase 5: Deployment

### Pre-Production

- [ ] All tests passing
- [ ] No errors in logs
- [ ] Database backed up
- [ ] Load testing completed (if needed)
- [ ] Security review done
- [ ] HTTPS/TLS configured

### Production Deploy

```bash
# 1. Build frontend
cd /YAHEALTHYFrontend
npm run build

# 2. Deploy frontend (to your host)
# ... (varies by platform)

# 3. Deploy backend
# ... (varies by platform)

# 4. Run database migrations
psql -U postgres -d yahealthy -f crm-schema.sql

# 5. Verify services
curl http://your-domain:5000/health
curl http://your-domain:5173

# 6. Monitor
tail -f server.log | grep "\[CRM\]"
```

- [ ] Frontend deployed
- [ ] Backend deployed
- [ ] Database migrations run
- [ ] Services responding
- [ ] Logs monitored

---

## Verification Checklist

### Database
```bash
psql -U postgres -d yahealthy -c "SELECT * FROM crm_user_profiles LIMIT 1;"
```
- [ ] Query returns results (tables exist)

### Backend
```bash
curl http://localhost:5000/api/crm/users/test
```
- [ ] Returns 200 or 401 (not 404)

### Routes
```bash
curl http://localhost:5000/api/crm/churn-risk -H "X-Admin-Key: your-key"
```
- [ ] Returns JSON (routes mounted)

### AI
```bash
curl -X POST http://localhost:5000/api/crm/users/test/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```
- [ ] Returns response with status (not error)

### Jobs
```bash
curl -X POST http://localhost:5000/api/crm/jobs/daily-insights \
  -H "X-Admin-Key: your-key"
```
- [ ] Returns 200 or 202 (job started)

### Frontend
```bash
curl http://localhost:5173
```
- [ ] Returns HTML (app running)

---

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| `OPENAI_API_KEY undefined` | `.env` file | Add key + restart |
| `Table not found` | `\dt crm_*` | Run `crm-schema.sql` |
| `Cannot POST /api/crm/...` | Routes mounted | Check `index.js` |
| `Webhook timeout` | Network | Check network, increase timeout |
| `AI response is empty` | OpenAI | Check API key, rate limits |
| `Database connection failed` | PostgreSQL | Verify running, credentials |
| `CoachingPage 404` | Routes | Check Route in App.tsx |

---

## Success Criteria

✅ All items checked = **READY FOR PRODUCTION**

1. [ ] Database initialized with all tables
2. [ ] Backend starts without errors
3. [ ] CRM routes respond (202/200/401 not 404)
4. [ ] Webhook sync works (idempotency verified)
5. [ ] AI responds to questions
6. [ ] Insights generated (daily/weekly jobs)
7. [ ] Frontend loads
8. [ ] CoachingPage renders
9. [ ] Can ask AI from frontend
10. [ ] Insights appear
11. [ ] Audit log records operations
12. [ ] GDPR deletion works
13. [ ] All tests passing

---

## Quick Reference Commands

```bash
# Restart backend
npm start

# Restart frontend
npm run dev

# Check logs
tail -f server.log | grep CRM

# Query database
psql -d yahealthy -c "SELECT COUNT(*) FROM crm_user_activities;"

# Trigger daily insights
curl -X POST http://localhost:5000/api/crm/jobs/daily-insights \
  -H "X-Admin-Key: $CRM_ADMIN_KEY"

# Delete test user
curl -X DELETE http://localhost:5000/api/crm/users/test_user

# Test sync idempotency
curl -X POST http://localhost:5000/api/crm/webhooks/app-event \
  -H "Idempotency-Key: test_$(date +%s)" \
  -d '{"entityType":"food_log", ...}'
```

---

**Status:** Ready for integration  
**Estimated Time:** 1.5-2 hours  
**Support:** See CRM_DOCUMENTATION.md for full reference
