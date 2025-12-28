/**
 * CRM Sync Engine - Bidirectional sync between YAHealthy app and CRM
 * Handles idempotency, conflict resolution, audit logging
 */

import { pool } from './db.js';
import crypto from 'crypto';

// ============================================================================
// SYNC ENGINE - Core
// ============================================================================

export class CRMSyncEngine {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * Process sync event from app or CRM
   * - Idempotent: retries won't duplicate
   * - Conflict resolution: timestamp-based with audit trail
   * - Returns: sync result with success/error
   */
  async processSyncEvent({
    source,           // 'app' or 'crm'
    entityType,       // user, food_log, goal, activity
    externalId,       // ID from source system
    userId,           // YAHealthy user_id
    operation,        // create, update, delete
    payload,          // data to sync
    idempotencyKey    // for deduplication
  }) {
    const client = await pool.connect();
    try {
      // 1. Check idempotency: already processed?
      const existing = await client.query(
        'SELECT id, processed FROM crm_sync_events WHERE idempotency_key = $1',
        [idempotencyKey]
      );

      if (existing.rows.length > 0 && existing.rows[0].processed) {
        this.logger.info(`[SYNC] Idempotent skip: ${idempotencyKey}`);
        return { status: 'skipped', reason: 'already_processed' };
      }

      // 2. Start transaction
      await client.query('BEGIN');

      // 3. Load current state for conflict detection
      const currentState = await this._loadEntityState(client, entityType, externalId);

      // 4. Resolve conflicts
      const resolvedData = await this._resolveConflict(
        currentState,
        payload,
        source,
        operation
      );

      // 5. Apply the change to CRM DB
      const result = await this._applyChange(
        client,
        entityType,
        operation,
        externalId,
        userId,
        resolvedData
      );

      // 6. Record sync event
      await client.query(
        `INSERT INTO crm_sync_events 
         (source, entity_type, external_id, user_id, operation, old_data, new_data, idempotency_key, processed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [source, entityType, externalId, userId, operation, currentState, resolvedData, idempotencyKey]
      );

      // 7. Audit log
      await this._auditLog(client, {
        userId,
        action: operation,
        entityType,
        entityId: result?.id,
        actor: 'sync_engine',
        details: { source, externalId, resolved: resolvedData !== payload }
      });

      await client.query('COMMIT');

      this.logger.info(`[SYNC] Success: ${source} ${operation} ${entityType} ${externalId}`);
      return { status: 'success', data: result };

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`[SYNC] Error: ${error.message}`);
      return { status: 'error', error: error.message };
    } finally {
      client.release();
    }
  }

  /**
   * Load current state of an entity
   */
  async _loadEntityState(client, entityType, externalId) {
    const queries = {
      user: `SELECT * FROM crm_user_profiles WHERE external_id = $1`,
      food_log: `SELECT * FROM crm_user_activities WHERE id = $1 AND activity_type = 'food_logged'`,
      goal: `SELECT * FROM crm_health_goals WHERE id = $1`,
      activity: `SELECT * FROM crm_user_activities WHERE id = $1`,
    };

    if (!queries[entityType]) return null;

    const result = await client.query(queries[entityType], [externalId]);
    return result.rows[0] || null;
  }

  /**
   * Conflict resolution policy
   * Rule: If source is 'app', app's data wins (except user health profile which is CRM authoritative)
   */
  async _resolveConflict(currentState, newData, source, operation) {
    if (!currentState) return newData; // No conflict if new

    // Field-level priority
    const resolved = { ...currentState, ...newData };

    // CRM fields (health profile) win over app
    if (currentState.age !== undefined) {
      resolved.age = currentState.age;
      resolved.height_cm = currentState.height_cm;
      resolved.activity_level = currentState.activity_level;
    }

    // App data wins for activity/engagement (food logs, goals)
    if (source === 'app') {
      resolved.updated_at = new Date();
    }

    return resolved;
  }

  /**
   * Apply change to CRM database
   */
  async _applyChange(client, entityType, operation, externalId, userId, data) {
    const handlers = {
      user: () => this._syncUser(client, operation, externalId, userId, data),
      food_log: () => this._syncFoodLog(client, operation, userId, data),
      goal: () => this._syncGoal(client, operation, userId, data),
      activity: () => this._syncActivity(client, operation, userId, data),
    };

    if (!handlers[entityType]) throw new Error(`Unknown entity type: ${entityType}`);
    return handlers[entityType]();
  }

  // ========== ENTITY-SPECIFIC SYNC HANDLERS ==========

  async _syncUser(client, op, externalId, userId, data) {
    if (op === 'create') {
      const result = await client.query(
        `INSERT INTO crm_user_profiles 
         (user_id, external_id, age, height_cm, primary_goal, engagement_tier)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, externalId, data.age, data.height_cm, data.primary_goal, data.engagement_tier || 'bronze']
      );
      return result.rows[0];
    } else if (op === 'update') {
      const result = await client.query(
        `UPDATE crm_user_profiles 
         SET age = COALESCE($1, age),
             height_cm = COALESCE($2, height_cm),
             primary_goal = COALESCE($3, primary_goal),
             churn_risk = COALESCE($4, churn_risk),
             last_active_at = now(),
             updated_at = now()
         WHERE user_id = $5
         RETURNING *`,
        [data.age, data.height_cm, data.primary_goal, data.churn_risk, userId]
      );
      return result.rows[0];
    } else if (op === 'delete') {
      await client.query('DELETE FROM crm_user_profiles WHERE user_id = $1', [userId]);
      return { id: userId };
    }
  }

  async _syncFoodLog(client, op, userId, data) {
    // Food logs become activities in CRM
    if (op === 'create' || op === 'update') {
      const result = await client.query(
        `INSERT INTO crm_user_activities 
         (user_id, activity_type, category, title, description, metadata)
         VALUES ($1, 'food_logged', 'engagement', $2, $3, $4)
         RETURNING *`,
        [
          userId,
          data.food_name,
          `${data.calories} kcal | P: ${data.protein}g C: ${data.carbs}g F: ${data.fat}g`,
          JSON.stringify({ calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat })
        ]
      );
      return result.rows[0];
    }
  }

  async _syncGoal(client, op, userId, data) {
    if (op === 'create') {
      const result = await client.query(
        `INSERT INTO crm_health_goals 
         (user_id, goal_type, goal_value, goal_unit, target_date, priority)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, data.goal_type, data.goal_value, data.goal_unit, data.target_date, data.priority || 'medium']
      );
      return result.rows[0];
    } else if (op === 'update') {
      const result = await client.query(
        `UPDATE crm_health_goals 
         SET goal_value = COALESCE($1, goal_value),
             progress_pct = COALESCE($2, progress_pct),
             status = COALESCE($3, status),
             updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [data.goal_value, data.progress_pct, data.status, data.id]
      );
      return result.rows[0];
    }
  }

  async _syncActivity(client, op, userId, data) {
    if (op === 'create') {
      const result = await client.query(
        `INSERT INTO crm_user_activities 
         (user_id, activity_type, category, title, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, data.activity_type, data.category, data.title, data.description, JSON.stringify(data.metadata || {})]
      );
      return result.rows[0];
    }
  }

  /**
   * Audit log every action
   */
  async _auditLog(client, { userId, action, entityType, entityId, actor, details }) {
    await client.query(
      `INSERT INTO crm_audit_log 
       (user_id, action, entity_type, entity_id, actor, actor_type, details)
       VALUES ($1, $2, $3, $4, $5, 'system', $6)`,
      [userId, action, entityType, entityId, actor, JSON.stringify(details || {})]
    );
  }
}

// ============================================================================
// WEBHOOK HANDLER - Receive events from YAHealthy app
// ============================================================================

export async function handleWebhookFromApp(req, res) {
  const { idempotencyKey, entityType, operation, externalId, userId, payload } = req.body;

  // Validate
  if (!idempotencyKey || !entityType || !operation) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const engine = new CRMSyncEngine();
  const result = await engine.processSyncEvent({
    source: 'app',
    entityType,
    externalId: externalId || crypto.randomUUID(),
    userId,
    operation,
    payload,
    idempotencyKey
  });

  if (result.status === 'error') {
    return res.status(500).json(result);
  }

  return res.status(202).json({ status: 'accepted', result });
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate idempotency key from request
 */
export function generateIdempotencyKey(entityType, externalId, operation) {
  return crypto
    .createHash('sha256')
    .update(`${entityType}:${externalId}:${operation}:${Date.now()}`)
    .digest('hex');
}

/**
 * Batch sync for historical backfill
 */
export async function batchSyncHistoricalData(entityType, records) {
  const engine = new CRMSyncEngine();
  const results = [];

  for (const record of records) {
    const result = await engine.processSyncEvent({
      source: 'app',
      entityType,
      externalId: record.id,
      userId: record.user_id,
      operation: 'create',
      payload: record,
      idempotencyKey: generateIdempotencyKey(entityType, record.id, 'create')
    });
    results.push(result);
  }

  return results;
}
