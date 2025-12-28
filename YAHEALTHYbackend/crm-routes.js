/**
 * CRM API Routes - REST endpoints for CRM operations
 */

import express from 'express';
import { pool } from './db.js';
import { CRMSyncEngine, handleWebhookFromApp, generateIdempotencyKey } from './crm-sync-engine.js';
import { CRMAssistant, generateDailyInsights, assessChurnRisk } from './crm-ai-assistant.js';

const router = express.Router();
const engine = new CRMSyncEngine();
const assistant = new CRMAssistant();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Verify webhook signature from app
 */
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'];
  const body = JSON.stringify(req.body);
  
  // TODO: Implement HMAC signature verification
  // const computed = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(body).digest('hex');
  // if (computed !== signature) return res.status(401).json({ error: 'Invalid signature' });
  
  next();
}

// ============================================================================
// 1. SYNC ENDPOINTS
// ============================================================================

/**
 * POST /crm/webhooks/app-event
 * Receive webhook from YAHealthy app
 */
router.post('/webhooks/app-event', verifyWebhookSignature, async (req, res) => {
  const {
    entityType,
    operation,
    userId,
    externalId,
    payload
  } = req.body;

  if (!entityType || !operation || !userId) {
    return res.status(400).json({ error: 'Missing required fields: entityType, operation, userId' });
  }

  const idempotencyKey = req.headers['idempotency-key'] || generateIdempotencyKey(entityType, externalId, operation);

  try {
    const result = await engine.processSyncEvent({
      source: 'app',
      entityType,
      externalId: externalId || `app_${Date.now()}`,
      userId,
      operation,
      payload,
      idempotencyKey
    });

    return res.status(202).json({ 
      status: 'accepted',
      idempotencyKey,
      result 
    });
  } catch (error) {
    console.error('[CRM] Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /crm/sync-status/:idempotencyKey
 * Check sync status
 */
router.get('/sync-status/:idempotencyKey', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM crm_sync_events WHERE idempotency_key = $1',
      [req.params.idempotencyKey]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 2. USER PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /crm/users/:userId
 * Get user's CRM profile
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM crm_user_profiles WHERE user_id = $1',
      [req.params.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /crm/users/:userId
 * Update user profile
 */
router.put('/users/:userId', async (req, res) => {
  const { age, height_cm, activity_level, engagement_tier, churn_risk } = req.body;

  try {
    const result = await pool.query(
      `UPDATE crm_user_profiles 
       SET age = COALESCE($1, age),
           height_cm = COALESCE($2, height_cm),
           activity_level = COALESCE($3, activity_level),
           engagement_tier = COALESCE($4, engagement_tier),
           churn_risk = COALESCE($5, churn_risk),
           updated_at = now()
       WHERE user_id = $6
       RETURNING *`,
      [age, height_cm, activity_level, engagement_tier, churn_risk, req.params.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 3. HEALTH GOALS ENDPOINTS
// ============================================================================

/**
 * GET /crm/users/:userId/goals
 * Get user's health goals
 */
router.get('/users/:userId/goals', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crm_health_goals 
       WHERE user_id = $1 
       ORDER BY priority DESC, created_at DESC`,
      [req.params.userId]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /crm/users/:userId/goals
 * Create a new health goal
 */
router.post('/users/:userId/goals', async (req, res) => {
  const { goal_type, goal_value, goal_unit, target_date, priority } = req.body;

  if (!goal_type || !goal_value) {
    return res.status(400).json({ error: 'Missing goal_type or goal_value' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO crm_health_goals 
       (user_id, goal_type, goal_value, goal_unit, target_date, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [req.params.userId, goal_type, goal_value, goal_unit, target_date, priority || 'medium']
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /crm/goals/:goalId
 * Update goal progress
 */
router.put('/goals/:goalId', async (req, res) => {
  const { progress_pct, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE crm_health_goals 
       SET progress_pct = COALESCE($1, progress_pct),
           status = COALESCE($2, status),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [progress_pct, status, req.params.goalId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 4. ACTIVITIES & ENGAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /crm/users/:userId/activities
 * Get user's recent activities
 */
router.get('/users/:userId/activities', async (req, res) => {
  const limit = req.query.limit || 20;

  try {
    const result = await pool.query(
      `SELECT * FROM crm_user_activities 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [req.params.userId, limit]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /crm/users/:userId/nutrition-snapshot
 * Get user's nutrition summary
 */
router.get('/users/:userId/nutrition-snapshot', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crm_nutrition_snapshots 
       WHERE user_id = $1 
       ORDER BY snapshot_date DESC 
       LIMIT 1`,
      [req.params.userId]
    );

    return res.json(result.rows[0] || {});
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 5. AI ASSISTANT ENDPOINTS
// ============================================================================

/**
 * POST /crm/users/:userId/ask
 * User asks AI assistant a question
 */
router.post('/users/:userId/ask', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  try {
    // Get user context
    const userResult = await pool.query(
      'SELECT * FROM crm_user_profiles WHERE user_id = $1',
      [req.params.userId]
    );

    const userProfile = userResult.rows[0] || {};

    // Call AI assistant
    const result = await assistant.handleUserRequest(req.params.userId, message, {
      userProfile,
      engagement_tier: userProfile.engagement_tier
    });

    return res.json(result);
  } catch (error) {
    console.error('[CRM] AI error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /crm/users/:userId/insights
 * Get AI-generated insights
 */
router.get('/users/:userId/insights', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crm_ai_insights 
       WHERE user_id = $1 AND dismissed_at IS NULL
       ORDER BY created_at DESC 
       LIMIT 10`,
      [req.params.userId]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /crm/users/:userId/insights/:insightId/dismiss
 * Dismiss an insight
 */
router.post('/users/:userId/insights/:insightId/dismiss', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE crm_ai_insights 
       SET dismissed_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.insightId, req.params.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Insight not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /crm/users/:userId/coaching-history
 * Get past coaching sessions
 */
router.get('/users/:userId/coaching-history', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crm_coaching_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.params.userId]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 6. ANALYTICS & METRICS ENDPOINTS
// ============================================================================

/**
 * GET /crm/users/:userId/metrics
 * Get user engagement metrics
 */
router.get('/users/:userId/metrics', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crm_user_metrics 
       WHERE user_id = $1 
       ORDER BY metric_date DESC 
       LIMIT 30`,
      [req.params.userId]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /crm/churn-risk
 * Get all users with high churn risk
 */
router.get('/churn-risk', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, external_id, engagement_tier, churn_risk, last_active_at
       FROM crm_user_profiles 
       WHERE churn_risk > 0.5
       ORDER BY churn_risk DESC 
       LIMIT 50`
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 7. AUDIT & COMPLIANCE ENDPOINTS
// ============================================================================

/**
 * GET /crm/audit-log/:userId
 * Get audit trail for a user
 */
router.get('/audit-log/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crm_audit_log 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [req.params.userId]
    );

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /crm/users/:userId
 * Delete user data (GDPR right to be forgotten)
 */
router.delete('/users/:userId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete in cascade order
    await client.query('DELETE FROM crm_embeddings WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM crm_ai_insights WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM crm_coaching_sessions WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM crm_health_goals WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM crm_user_activities WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM crm_user_metrics WHERE user_id = $1', [req.params.userId]);
    await client.query('DELETE FROM crm_user_profiles WHERE user_id = $1', [req.params.userId]);

    // Log deletion
    await client.query(
      `INSERT INTO crm_audit_log (user_id, action, actor, actor_type, details)
       VALUES ($1, 'delete', 'user', 'system', '{"reason": "gdpr_deletion"}')`,
      [req.params.userId]
    );

    await client.query('COMMIT');

    return res.json({ status: 'deleted', userId: req.params.userId });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ============================================================================
// 8. BACKGROUND JOB TRIGGERS
// ============================================================================

/**
 * POST /crm/jobs/daily-insights
 * Trigger daily insights generation (would normally be in cron)
 */
router.post('/jobs/daily-insights', async (req, res) => {
  // Verify admin key
  if (req.headers['x-admin-key'] !== process.env.CRM_ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await generateDailyInsights();
    return res.json({ status: 'started', job: 'daily_insights' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /crm/jobs/assess-churn
 * Trigger churn risk assessment
 */
router.post('/jobs/assess-churn', async (req, res) => {
  // Verify admin key
  if (req.headers['x-admin-key'] !== process.env.CRM_ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await assessChurnRisk();
    return res.json({ status: 'started', job: 'assess_churn_risk' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
