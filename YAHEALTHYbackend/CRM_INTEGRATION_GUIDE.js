/**
 * CRM Integration Guide for YAHealthy Backend
 * 
 * This file shows how to integrate the CRM modules into your existing index.js
 */

// ============================================================================
// STEP 1: ADD IMPORTS AT TOP OF index.js
// ============================================================================

// import crmRoutes from './crm-routes.js';
// import { CRMSyncEngine } from './crm-sync-engine.js';
// import { CRMAssistant } from './crm-ai-assistant.js';

// ============================================================================
// STEP 2: MOUNT CRM ROUTES
// ============================================================================

// In your express app setup, add:
// app.use('/api/crm', crmRoutes);

// ============================================================================
// STEP 3: INTEGRATE CRM INTO EXISTING ENDPOINTS
// ============================================================================

/**
 * Example: When user signs up, also create CRM profile
 */
// In your /api/auth/signup endpoint:
//
// app.post('/api/auth/signup', async (req, res) => {
//   const { email, password } = req.body;
//   // ... existing signup logic ...
//   const newUser = { id: userId, email };
//
//   // NEW: Create CRM profile
//   try {
//     await pool.query(
//       `INSERT INTO crm_user_profiles (user_id, external_id) VALUES ($1, $2)`,
//       [userId, email]
//     );
//   } catch (error) {
//     console.error('CRM profile creation failed:', error);
//   }
//
//   return res.json(newUser);
// });

/**
 * Example: When user logs food, sync to CRM
 */
// In your /api/food-logs endpoint:
//
// app.post('/api/food-logs', auth.authMiddleware, async (req, res) => {
//   const { food_name, calories, protein, carbs, fat } = req.body;
//   // ... existing food log logic ...
//
//   // NEW: Sync to CRM
//   const syncEngine = new CRMSyncEngine();
//   await syncEngine.processSyncEvent({
//     source: 'app',
//     entityType: 'food_log',
//     externalId: foodLogId,
//     userId: req.user.userId,
//     operation: 'create',
//     payload: { food_name, calories, protein, carbs, fat, date: new Date() },
//     idempotencyKey: `food_${foodLogId}_${Date.now()}`
//   });
//
//   return res.json(foodLog);
// });

// ============================================================================
// STEP 4: SETUP ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Add to your .env file:
 */
/*
# CRM Configuration
CRM_ENABLED=true
CRM_ADMIN_KEY=your-secret-admin-key-for-jobs

# OpenAI for AI Assistant
OPENAI_API_KEY=sk-...

# Database (should already exist)
DATABASE_URL=postgresql://user:password@localhost:5432/yahealthy

# Webhook signature secret
WEBHOOK_SECRET=your-webhook-secret
*/

// ============================================================================
// STEP 5: INITIALIZE CRM TABLES
// ============================================================================

/**
 * Run this once to create CRM tables:
 * 
 * psql -U postgres -d yahealthy -f crm-schema.sql
 * 
 * Or run in your app startup:
 */

import fs from 'fs';
import path from 'path';

// async function initializeCRM() {
//   try {
//     const schema = fs.readFileSync(path.join(process.cwd(), 'crm-schema.sql'), 'utf-8');
//     const statements = schema.split(';').filter(s => s.trim());
//     
//     for (const stmt of statements) {
//       if (stmt.trim()) {
//         await pool.query(stmt);
//       }
//     }
//     console.log('✅ CRM tables initialized');
//   } catch (error) {
//     console.error('CRM initialization failed:', error);
//   }
// }
// 
// Call on startup:
// await initializeCRM();

// ============================================================================
// STEP 6: SETUP BACKGROUND JOBS (CRON)
// ============================================================================

/**
 * Use node-cron or similar to run periodic jobs
 * 
 * npm install node-cron
 */

// import cron from 'node-cron';
// import { generateDailyInsights, assessChurnRisk } from './crm-ai-assistant.js';
//
// // Every day at 6 AM
// cron.schedule('0 6 * * *', async () => {
//   console.log('Running daily insights...');
//   try {
//     await generateDailyInsights();
//   } catch (error) {
//     console.error('Daily insights failed:', error);
//   }
// });
//
// // Every Sunday at 8 AM
// cron.schedule('0 8 * * 0', async () => {
//   console.log('Assessing churn risk...');
//   try {
//     await assessChurnRisk();
//   } catch (error) {
//     console.error('Churn assessment failed:', error);
//   }
// });

// ============================================================================
// STEP 7: FRONTEND INTEGRATION
// ============================================================================

/**
 * In YAHEALTHYFrontend/src/services/api.ts, add CRM API client:
 */

/*
export const crmApi = {
  getUserProfile: (userId: string) =>
    api.get(`/api/crm/users/${userId}`),

  getGoals: (userId: string) =>
    api.get(`/api/crm/users/${userId}/goals`),

  createGoal: (userId: string, goal: any) =>
    api.post(`/api/crm/users/${userId}/goals`, goal),

  getInsights: (userId: string) =>
    api.get(`/api/crm/users/${userId}/insights`),

  askAssistant: (userId: string, message: string) =>
    api.post(`/api/crm/users/${userId}/ask`, { message }),

  getCoachingHistory: (userId: string) =>
    api.get(`/api/crm/users/${userId}/coaching-history`),

  dismissInsight: (userId: string, insightId: string) =>
    api.post(`/api/crm/users/${userId}/insights/${insightId}/dismiss`),

  getMetrics: (userId: string) =>
    api.get(`/api/crm/users/${userId}/metrics`),
};
*/

/**
 * In a new page YAHEALTHYFrontend/src/pages/CoachingPage.tsx:
 */

/*
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { crmApi } from '@/services/api';

export const CoachingPage = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInsights();
  }, [user]);

  const loadInsights = async () => {
    const response = await crmApi.getInsights(user.id);
    setInsights(response.data);
  };

  const handleAsk = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const response = await crmApi.askAssistant(user.id, message);
      // Show AI response in modal or chat UI
      alert(response.data.response);
      setMessage('');
      loadInsights();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">AI Coaching</h1>

      {/* Insights Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Your Insights</h2>
        {insights.map(insight => (
          <div key={insight.id} className="bg-blue-50 p-4 rounded-lg mb-4 border-l-4 border-blue-500">
            <p className="font-semibold text-blue-900">{insight.title}</p>
            <p className="text-blue-800">{insight.content}</p>
            {insight.suggested_action && (
              <p className="text-sm text-blue-700 mt-2">💡 {insight.suggested_action}</p>
            )}
          </div>
        ))}
      </div>

      {/* Ask AI Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Ask Your AI Coach</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about nutrition, goals, or get motivation..."
          className="w-full p-3 border rounded-lg mb-4"
          rows={3}
        />
        <button
          onClick={handleAsk}
          disabled={loading}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
        >
          {loading ? 'Thinking...' : 'Ask Coach'}
        </button>
      </div>
    </div>
  );
};
*/

// ============================================================================
// EXAMPLE: WEBHOOK PAYLOAD FROM APP TO CRM
// ============================================================================

/*
POST /api/crm/webhooks/app-event
Content-Type: application/json
Idempotency-Key: food_abc123_1703808000
X-Webhook-Signature: hmac_sha256=...

{
  "entityType": "food_log",
  "operation": "create",
  "userId": "user_12345",
  "externalId": "food_abc123",
  "payload": {
    "food_name": "Grilled Chicken with Rice",
    "calories": 450,
    "protein": 45,
    "carbs": 50,
    "fat": 12,
    "date": "2025-12-28",
    "meal_type": "lunch"
  }
}

Response (202 Accepted):
{
  "status": "accepted",
  "idempotencyKey": "food_abc123_1703808000",
  "result": {
    "status": "success",
    "data": { ... }
  }
}
*/

// ============================================================================
// COMPLETE SETUP CHECKLIST
// ============================================================================

/*
CRM Setup Checklist:

1. DATABASE
   ☐ Run crm-schema.sql to create tables
   ☐ Verify pgvector extension (for embeddings): CREATE EXTENSION vector;
   
2. BACKEND
   ☐ Copy crm-*.js files to backend directory
   ☐ Update index.js to import and mount CRM routes
   ☐ Add CRM sync calls to existing endpoints
   ☐ Set up environment variables (.env)
   ☐ npm install openai node-cron (if not present)
   
3. FRONTEND
   ☐ Add crmApi to services/api.ts
   ☐ Create CoachingPage.tsx
   ☐ Add route in App.tsx
   ☐ Add navigation link to Coaching page
   
4. JOBS
   ☐ Set up node-cron for daily insights and churn assessment
   ☐ Test jobs with manual API calls:
       curl -X POST http://localhost:5000/api/crm/jobs/daily-insights \
         -H "X-Admin-Key: your-admin-key"
   
5. TESTING
   ☐ Test webhook from app to CRM
   ☐ Test AI assistant endpoint
   ☐ Test sync idempotency (retry same request)
   ☐ Test churn risk detection
   ☐ Test GDPR deletion (DELETE /api/crm/users/:userId)
   
6. MONITORING
   ☐ Check crm_sync_events for failed syncs
   ☐ Monitor crm_audit_log for all operations
   ☐ Alert on high churn risk users
   ☐ Track AI token usage (completion_tokens, prompt_tokens)
*/

export default {};
