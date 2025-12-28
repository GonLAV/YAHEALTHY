/**
 * AI Assistant - Function calling based coaching & insights
 * Uses OpenAI GPT with tool definitions for safe CRM operations
 */

import OpenAI from 'openai';
import { pool } from './db.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TOOL DEFINITIONS - What AI can do
// ============================================================================

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_nutrition_summary',
      description: 'Get user\'s nutrition data for the last 7/30 days to provide context',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User ID' },
          days: { type: 'integer', enum: [7, 30, 90], description: 'How many days back' }
        },
        required: ['user_id', 'days']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_goals',
      description: 'Retrieve user\'s active health goals',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User ID' }
        },
        required: ['user_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_goal',
      description: 'Suggest a new health goal based on user profile and progress',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          goal_type: { 
            type: 'string', 
            enum: ['weight', 'nutrition', 'activity', 'water', 'sleep'],
            description: 'Type of goal'
          },
          goal_value: { type: 'number', description: 'Target value (e.g., 75 for weight in kg)' },
          goal_unit: { type: 'string', description: 'Unit (kg, g, kcal, steps, L)' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          reasoning: { type: 'string', description: 'Why this goal is recommended' }
        },
        required: ['user_id', 'goal_type', 'goal_value', 'goal_unit', 'priority']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_ai_insight',
      description: 'Generate and store an AI insight for the user',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          insight_type: { 
            type: 'string',
            enum: ['nutrition_recommendation', 'progress_summary', 'warning', 'motivational'],
            description: 'Type of insight'
          },
          title: { type: 'string' },
          content: { type: 'string' },
          suggested_action: { type: 'string', description: 'Actionable recommendation' },
          confidence: { type: 'number', description: '0 to 1, model confidence' }
        },
        required: ['user_id', 'insight_type', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_coaching_session',
      description: 'Record a coaching session in CRM',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          session_type: {
            type: 'string',
            enum: ['goal_setting', 'nutrition_advice', 'motivation', 'troubleshoot'],
            description: 'Type of coaching'
          },
          topic: { type: 'string' },
          coaching_prompt: { type: 'string', description: 'User\'s question' },
          ai_response: { type: 'string', description: 'AI\'s response' },
          recommended_actions: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of actions for user'
          }
        },
        required: ['user_id', 'session_type', 'topic', 'coaching_prompt', 'ai_response']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_engagement_tier',
      description: 'Update user engagement tier based on activity',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          tier: { type: 'string', enum: ['bronze', 'silver', 'gold', 'platinum'] },
          reason: { type: 'string', description: 'Why this tier was assigned' }
        },
        required: ['user_id', 'tier', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estimate_churn_risk',
      description: 'Assess user churn risk and suggest retention actions',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          risk_score: { type: 'number', description: '0 to 1, churn probability' },
          risk_factors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Why user might churn'
          },
          suggested_actions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Retention strategies'
          }
        },
        required: ['user_id', 'risk_score', 'risk_factors', 'suggested_actions']
      }
    }
  }
];

// ============================================================================
// AI ASSISTANT - Main class
// ============================================================================

export class CRMAssistant {
  constructor(logger = console) {
    this.logger = logger;
    this.tools = TOOLS;
  }

  /**
   * Main entry point: User asks a question or needs coaching
   * AI decides what tools to use, executes them, returns guidance
   */
  async handleUserRequest(userId, userMessage, context = {}) {
    this.logger.info(`[AI] Request from user ${userId}: ${userMessage}`);

    const systemPrompt = this._getSystemPrompt(context);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    try {
      let response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        tools: this.tools,
        tool_choice: 'auto',
        messages
      });

      // Process tool calls iteratively
      while (response.choices[0]?.message?.tool_calls) {
        const toolCall = response.choices[0].message.tool_calls[0];
        const { name, arguments: argsJson } = toolCall.function;
        const args = JSON.parse(argsJson);

        this.logger.info(`[AI] Calling tool: ${name} with args:`, args);

        const toolResult = await this._executeTool(name, args);

        // Add assistant + tool result to messages for next iteration
        messages.push({ role: 'assistant', content: response.choices[0].message.content || '' });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });

        // Get next response
        response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          tools: this.tools,
          tool_choice: 'auto',
          messages
        });
      }

      const finalResponse = response.choices[0]?.message?.content || 'No response generated';

      // Log coaching session
      await this._logCoachingSession(userId, userMessage, finalResponse);

      return {
        status: 'success',
        response: finalResponse,
        toolsUsed: response.choices[0]?.message?.tool_calls?.map(tc => tc.function.name) || []
      };

    } catch (error) {
      this.logger.error(`[AI] Error: ${error.message}`);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Execute a tool call (simulate)
   */
  async _executeTool(toolName, args) {
    switch (toolName) {
      case 'get_user_nutrition_summary':
        return await this._getUserNutritionSummary(args.user_id, args.days);

      case 'get_user_goals':
        return await this._getUserGoals(args.user_id);

      case 'suggest_goal':
        return await this._suggestGoal(args);

      case 'create_ai_insight':
        return await this._createAIInsight(args);

      case 'log_coaching_session':
        return await this._logCoachingSession(args.user_id, args.coaching_prompt, args.ai_response);

      case 'update_engagement_tier':
        return await this._updateEngagementTier(args);

      case 'estimate_churn_risk':
        return await this._estimateChurnRisk(args);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // ========== TOOL IMPLEMENTATIONS ==========

  async _getUserNutritionSummary(userId, days) {
    const result = await pool.query(
      `SELECT 
         COUNT(*) as meals_logged,
         ROUND(AVG((metadata->>'calories')::integer), 0) as avg_calories,
         ROUND(AVG((metadata->>'protein')::decimal), 1) as avg_protein,
         ROUND(AVG((metadata->>'carbs')::decimal), 1) as avg_carbs,
         ROUND(AVG((metadata->>'fat')::decimal), 1) as avg_fat
       FROM crm_user_activities
       WHERE user_id = $1 AND activity_type = 'food_logged' AND created_at > now() - interval '1 day' * $2`,
      [userId, days]
    );
    return result.rows[0] || { meals_logged: 0 };
  }

  async _getUserGoals(userId) {
    const result = await pool.query(
      `SELECT id, goal_type, goal_value, goal_unit, progress_pct, status 
       FROM crm_health_goals 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY priority DESC`,
      [userId]
    );
    return result.rows;
  }

  async _suggestGoal(args) {
    const { user_id, goal_type, goal_value, goal_unit, priority, reasoning } = args;

    const result = await pool.query(
      `INSERT INTO crm_health_goals 
       (user_id, goal_type, goal_value, goal_unit, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING *`,
      [user_id, goal_type, goal_value, goal_unit, priority]
    );

    await this._auditLog({
      userId: user_id,
      action: 'create',
      entityType: 'goal',
      actor: 'ai_assistant',
      details: { reasoning }
    });

    return { success: true, goal: result.rows[0] };
  }

  async _createAIInsight(args) {
    const { user_id, insight_type, title, content, suggested_action, confidence } = args;

    const result = await pool.query(
      `INSERT INTO crm_ai_insights 
       (user_id, insight_type, title, content, suggested_action, confidence, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [user_id, insight_type, title, content, suggested_action, confidence || 0.8]
    );

    await this._auditLog({
      userId: user_id,
      action: 'create',
      entityType: 'insight',
      actor: 'ai_assistant'
    });

    return { success: true, insight: result.rows[0] };
  }

  async _logCoachingSession(userId, prompt, response) {
    const result = await pool.query(
      `INSERT INTO crm_coaching_sessions 
       (user_id, session_type, topic, coaching_prompt, ai_response)
       VALUES ($1, 'general', 'user_coaching', $2, $3)
       RETURNING *`,
      [userId, prompt, response]
    );
    return { success: true, session: result.rows[0] };
  }

  async _updateEngagementTier(args) {
    const { user_id, tier, reason } = args;

    const result = await pool.query(
      `UPDATE crm_user_profiles 
       SET engagement_tier = $1, updated_at = now()
       WHERE user_id = $2
       RETURNING *`,
      [tier, user_id]
    );

    await this._auditLog({
      userId: user_id,
      action: 'update',
      entityType: 'user',
      actor: 'ai_assistant',
      details: { tier, reason }
    });

    return { success: true, user: result.rows[0] };
  }

  async _estimateChurnRisk(args) {
    const { user_id, risk_score, risk_factors, suggested_actions } = args;

    const result = await pool.query(
      `UPDATE crm_user_profiles 
       SET churn_risk = $1, updated_at = now()
       WHERE user_id = $2
       RETURNING *`,
      [risk_score, user_id]
    );

    await this._auditLog({
      userId: user_id,
      action: 'update',
      entityType: 'user',
      actor: 'ai_assistant',
      details: { risk_score, risk_factors, suggested_actions }
    });

    return { success: true, churnAssessment: { risk_score, risk_factors, suggested_actions } };
  }

  /**
   * System prompt for consistent behavior
   */
  _getSystemPrompt(context = {}) {
    return `You are an AI health & nutrition coach for YAHealthy, a nutrition tracking app.

Your role:
- Provide personalized nutrition advice based on user data
- Suggest health goals and track progress
- Identify patterns and opportunities for improvement
- Give motivational support and positive reinforcement
- Never diagnose medical conditions; suggest consulting doctors for health concerns

Constraints:
- Only use approved tools for CRM operations
- Never invent or hallucinate user IDs
- Keep responses concise and actionable
- Always ask if information is unclear
- Respect privacy; discuss data minimally
- Encourage user autonomy and intrinsic motivation

User Context: ${JSON.stringify(context)}

If you need more information, use the available tools. Always return structured, JSON-friendly responses.`;
  }

  /**
   * Audit log helper
   */
  async _auditLog(data) {
    await pool.query(
      `INSERT INTO crm_audit_log 
       (user_id, action, entity_type, actor, actor_type, details)
       VALUES ($1, $2, $3, $4, 'ai_assistant', $5)`,
      [data.userId, data.action, data.entityType, data.actor, JSON.stringify(data.details || {})]
    );
  }
}

// ============================================================================
// BATCH JOBS - Periodic AI insights & churn detection
// ============================================================================

/**
 * Daily job: Generate insights for active users
 */
export async function generateDailyInsights() {
  console.log('[AI] Starting daily insights generation...');
  const assistant = new CRMAssistant();

  const users = await pool.query(
    `SELECT u.user_id, u.age, u.primary_goal, u.engagement_tier
     FROM crm_user_profiles u
     WHERE u.engagement_tier IN ('silver', 'gold', 'platinum')
     AND u.last_active_at > now() - interval '1 day'
     LIMIT 100`
  );

  for (const user of users.rows) {
    try {
      const summary = await assistant._getUserNutritionSummary(user.user_id, 7);
      const goals = await assistant._getUserGoals(user.user_id);

      const prompt = `Based on this week's nutrition data (${JSON.stringify(summary)}) and active goals (${goals.length}), generate one key insight and one actionable recommendation.`;

      await assistant.handleUserRequest(user.user_id, prompt, { userProfile: user });
    } catch (error) {
      console.error(`[AI] Error for user ${user.user_id}:`, error.message);
    }
  }

  console.log('[AI] Daily insights completed');
}

/**
 * Weekly job: Churn risk assessment
 */
export async function assessChurnRisk() {
  console.log('[AI] Assessing churn risk...');
  const assistant = new CRMAssistant();

  const atRiskUsers = await pool.query(
    `SELECT u.user_id, u.engagement_tier, COUNT(a.id) as activities_30d
     FROM crm_user_profiles u
     LEFT JOIN crm_user_activities a ON a.user_id = u.user_id AND a.created_at > now() - interval '30 days'
     WHERE u.last_active_at < now() - interval '7 days'
     GROUP BY u.user_id, u.engagement_tier
     HAVING COUNT(a.id) < 5`
  );

  for (const user of atRiskUsers.rows) {
    try {
      const message = `Assess churn risk for this user with low recent activity and suggest retention strategies. Use estimate_churn_risk tool.`;
      await assistant.handleUserRequest(user.user_id, message, { userProfile: user });
    } catch (error) {
      console.error(`[AI] Churn assessment error for ${user.user_id}:`, error.message);
    }
  }

  console.log('[AI] Churn assessment completed');
}
