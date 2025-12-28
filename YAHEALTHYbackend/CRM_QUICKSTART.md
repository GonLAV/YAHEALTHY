# CRM Quick Start Integration Guide

## 5-Minute Setup

### Step 1: Add Environment Variables
Create or update `.env` in `/YAHEALTHYbackend/`:

```
# CRM Configuration
CRM_ENABLED=true
CRM_ADMIN_KEY=your-secure-admin-key-here
OPENAI_API_KEY=sk-your-actual-key-here
WEBHOOK_SECRET=webhook-secret-key

# Database (if needed)
DB_NAME=yahealthy
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
```

### Step 2: Initialize Database

```bash
cd /YAHEALTHYbackend

# Create tables
psql -U postgres -d yahealthy -f crm-schema.sql

# Verify tables created
psql -U postgres -d yahealthy -c "\dt crm_*"
```

### Step 3: Add CRM to Backend

**In `/YAHEALTHYbackend/index.js`, at the top:**

```javascript
// Add these imports
const crmRoutes = require('./crm-routes');
const { CRMSyncEngine } = require('./crm-sync-engine');
const { CRMAssistant } = require('./crm-ai-assistant');
```

**Then, mount the routes (after other routes):**

```javascript
// Add to Express app
app.use('/api/crm', crmRoutes);
```

### Step 4: Integrate Sync into Auth Endpoint

**In the signup endpoint** (where user is created):

```javascript
app.post('/api/auth/signup', async (req, res) => {
  // ... existing signup code ...
  
  // NEW: Create CRM profile
  try {
    await axios.post('http://localhost:5000/api/crm/users', {
      user_id: newUser.id,
      age: req.body.age || null,
      height_cm: req.body.height || null,
      primary_goal: req.body.goal || 'general_health',
      engagement_tier: 'bronze'
    });
  } catch (err) {
    console.error('CRM profile creation failed:', err);
    // Continue (don't fail signup if CRM fails)
  }
  
  return res.json({ token: jwtToken });
});
```

### Step 5: Integrate Sync into Food Log Endpoint

**In the food log endpoint:**

```javascript
app.post('/api/user/food-logs', authenticate, async (req, res) => {
  // ... existing code to save food log ...
  
  // NEW: Sync to CRM
  const foodLogId = savedLog.id;
  try {
    const idempotencyKey = `food_${foodLogId}_${Date.now()}`;
    await axios.post('http://localhost:5000/api/crm/webhooks/app-event', {
      entityType: 'food_log',
      operation: 'create',
      userId: req.user.id,
      externalId: foodLogId,
      payload: {
        food_name: req.body.name,
        calories: req.body.calories,
        protein: req.body.protein,
        carbs: req.body.carbs,
        fat: req.body.fat,
        date: req.body.date
      }
    }, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
  } catch (err) {
    console.error('CRM sync failed:', err);
    // Continue (don't fail food log if CRM fails)
  }
  
  return res.json(savedLog);
});
```

### Step 6: Set Up Daily Jobs

**In `/YAHEALTHYbackend/index.js`, add at the end:**

```javascript
const cron = require('node-cron');

// Daily insights generation (6 AM UTC)
cron.schedule('0 6 * * *', async () => {
  console.log('Running daily insights job...');
  try {
    await axios.post('http://localhost:5000/api/crm/jobs/daily-insights', {}, {
      headers: { 'X-Admin-Key': process.env.CRM_ADMIN_KEY }
    });
  } catch (err) {
    console.error('Daily insights job failed:', err);
  }
});

// Weekly churn assessment (Sunday 8 AM UTC)
cron.schedule('0 8 * * 0', async () => {
  console.log('Running churn assessment job...');
  try {
    await axios.post('http://localhost:5000/api/crm/jobs/assess-churn', {}, {
      headers: { 'X-Admin-Key': process.env.CRM_ADMIN_KEY }
    });
  } catch (err) {
    console.error('Churn assessment job failed:', err);
  }
});

console.log('CRM jobs scheduled');
```

### Step 7: Test It

```bash
# 1. Start your backend
npm start

# 2. Create a user (signup)
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "name": "Test User",
    "age": 28,
    "height": 180
  }'

# 3. Send a food log webhook
curl -X POST http://localhost:5000/api/crm/webhooks/app-event \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: food_test_1" \
  -d '{
    "entityType": "food_log",
    "operation": "create",
    "userId": "user_from_signup",
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

# 4. Ask AI assistant
curl -X POST http://localhost:5000/api/crm/users/user_from_signup/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "How am I doing with my nutrition?"}'

# 5. Check insights
curl http://localhost:5000/api/crm/users/user_from_signup/insights

# 6. Get user profile
curl http://localhost:5000/api/crm/users/user_from_signup
```

### Step 8: Frontend Integration

**Create `/YAHEALTHYFrontend/src/pages/CoachingPage.tsx`:**

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';

export const CoachingPage = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState([]);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInsights();
  }, [user]);

  const loadInsights = async () => {
    try {
      const res = await axios.get(`/api/crm/users/${user.id}/insights`);
      setInsights(res.data.data || []);
    } catch (err) {
      console.error('Failed to load insights:', err);
    }
  };

  const handleAsk = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`/api/crm/users/${user.id}/ask`, {
        message
      });
      setResponse(res.data.response);
      setMessage('');
      // Reload insights
      setTimeout(loadInsights, 1000);
    } catch (err) {
      setResponse('Sorry, I encountered an error. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">AI Coaching</h1>

      {/* Insights */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Insights</h2>
        {insights.length === 0 ? (
          <p className="text-gray-500">No insights yet. Keep logging food!</p>
        ) : (
          <div className="space-y-4">
            {insights.map((insight) => (
              <div key={insight.id} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="font-semibold text-blue-900">{insight.insight_type}</p>
                <p className="text-sm text-gray-700 mt-2">{insight.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Ask Your Coach</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask me anything about your nutrition..."
            className="flex-1 px-4 py-2 border rounded-lg"
            onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
          />
          <button
            onClick={handleAsk}
            disabled={loading || !message}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>
        {response && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-gray-800">{response}</p>
          </div>
        )}
      </div>
    </div>
  );
};
```

**Update `/YAHEALTHYFrontend/src/App.tsx` to add route:**

```typescript
import { CoachingPage } from '@/pages/CoachingPage';

// In your Routes:
<Route path="/coaching" element={<CoachingPage />} />

// Add navigation link
<nav>
  {/* ... existing links ... */}
  <a href="/coaching">Coaching</a>
</nav>
```

---

## Installation (if needed)

```bash
# Install dependencies
npm install node-cron axios

# Or for Yarn
yarn add node-cron axios
```

---

## Commands Reference

| Task | Command |
|------|---------|
| **Initialize DB** | `psql -U postgres -d yahealthy -f crm-schema.sql` |
| **Start server** | `npm start` |
| **Test webhook** | `curl -X POST http://localhost:5000/api/crm/webhooks/app-event ...` |
| **Check logs** | `grep -i crm server.log` |
| **DB query** | `psql -d yahealthy -c "SELECT * FROM crm_user_profiles;"` |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `OPENAI_API_KEY not found` | Add to `.env` and restart server |
| `Table not exists` | Run `crm-schema.sql` again |
| `Webhook returns 500` | Check `CRM_ADMIN_KEY` in headers |
| `AI response is slow` | Normal (OpenAI API latency); add timeout buffer |
| `Sync events not recorded` | Verify `Idempotency-Key` header is unique |

---

## Next Steps

1. ✅ **Done:** Database schema created
2. ✅ **Done:** CRM routes set up
3. ✅ **Done:** AI assistant configured
4. ⏳ **Now:** Run integration steps above
5. ⏳ **Next:** Test endpoints
6. ⏳ **Then:** Deploy to production

---

**Status:** Ready to integrate  
**Estimated Integration Time:** 15-30 minutes  
**Support:** See CRM_DOCUMENTATION.md for full API reference
