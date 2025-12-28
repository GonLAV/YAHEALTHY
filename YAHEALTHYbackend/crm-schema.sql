-- ============================================================================
-- YAHEALTHY CRM SCHEMA - Custom built for nutrition & health tracking
-- ============================================================================

-- ============================================================================
-- 1. CORE USER & PROFILE TABLES
-- ============================================================================

-- Extended user profiles with health metadata
CREATE TABLE IF NOT EXISTS crm_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  external_id TEXT UNIQUE,              -- mapping to main app users table
  age INTEGER,
  gender TEXT,                          -- M, F, Other
  height_cm DECIMAL(5,2),
  current_weight_kg DECIMAL(5,2),
  activity_level TEXT,                  -- sedentary, lightly_active, etc.
  dietary_preferences TEXT[],           -- vegan, keto, gluten_free, etc.
  health_conditions TEXT[],             -- diabetes, hypertension, etc.
  medications TEXT[],
  allergies TEXT[],
  primary_goal TEXT,                    -- weight_loss, muscle_gain, general_health
  engagement_tier TEXT DEFAULT 'bronze', -- bronze, silver, gold, platinum
  churn_risk DECIMAL(3,2),              -- 0-1 probability
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_user_profiles_user_id ON crm_user_profiles(user_id);
CREATE INDEX idx_crm_user_profiles_external_id ON crm_user_profiles(external_id);

-- ============================================================================
-- 2. HEALTH GOALS & TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_health_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,              -- weight, nutrition, activity, water, sleep
  goal_value DECIMAL(10,2),
  goal_unit TEXT,                       -- kg, g, kcal, steps, minutes, L
  target_date DATE,
  progress_pct DECIMAL(5,2),            -- 0-100
  status TEXT DEFAULT 'active',         -- active, paused, achieved, abandoned
  streak_days INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',       -- low, medium, high
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_health_goals_user_id ON crm_health_goals(user_id);
CREATE INDEX idx_crm_health_goals_status ON crm_health_goals(status);

-- ============================================================================
-- 3. ENGAGEMENT & ACTIVITY TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_user_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,         -- food_logged, goal_updated, milestone, coaching_requested
  category TEXT,                       -- engagement, warning, achievement
  title TEXT,
  description TEXT,
  metadata JSONB,                      -- flexible data store (calories, streak, etc.)
  severity TEXT DEFAULT 'info',        -- info, warning, critical
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_user_activities_user_id ON crm_user_activities(user_id);
CREATE INDEX idx_crm_user_activities_type ON crm_user_activities(activity_type);
CREATE INDEX idx_crm_user_activities_created_at ON crm_user_activities(created_at DESC);

-- ============================================================================
-- 4. AI INSIGHTS & COACHING
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,          -- nutrition_recommendation, progress_summary, warning, motivational
  title TEXT,
  content TEXT,
  confidence DECIMAL(3,2),             -- 0-1 (model confidence)
  actionable BOOLEAN DEFAULT false,
  suggested_action TEXT,               -- e.g., "Increase water intake to 2L"
  ai_model TEXT,                       -- gpt-4o, gpt-3.5, etc.
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  generated_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_ai_insights_user_id ON crm_ai_insights(user_id);
CREATE INDEX idx_crm_ai_insights_type ON crm_ai_insights(insight_type);
CREATE INDEX idx_crm_ai_insights_created_at ON crm_ai_insights(created_at DESC);

-- ============================================================================
-- 5. COACHING & RECOMMENDATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  session_type TEXT,                   -- goal_setting, nutrition_advice, motivation, troubleshoot
  topic TEXT,
  coaching_prompt TEXT,                -- user's question/request
  ai_response TEXT,
  follow_up_questions TEXT[],
  recommended_actions JSONB,
  user_feedback TEXT,
  helpful BOOLEAN,
  sentiment TEXT,                      -- positive, neutral, negative
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_coaching_sessions_user_id ON crm_coaching_sessions(user_id);

-- ============================================================================
-- 6. NUTRITION INSIGHTS SNAPSHOT
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_nutrition_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  snapshot_date DATE,
  total_calories_logged INTEGER,
  avg_protein_g DECIMAL(6,2),
  avg_carbs_g DECIMAL(6,2),
  avg_fat_g DECIMAL(6,2),
  days_logged INTEGER,
  consistency_pct DECIMAL(5,2),        -- % of days logged
  water_intake_L DECIMAL(5,2),
  meals_logged INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_nutrition_snapshots_user_id ON crm_nutrition_snapshots(user_id);
CREATE INDEX idx_crm_nutrition_snapshots_date ON crm_nutrition_snapshots(snapshot_date DESC);

-- ============================================================================
-- 7. SYNC & AUDIT TABLES
-- ============================================================================

-- Track all bidirectional sync events
CREATE TABLE IF NOT EXISTS crm_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,               -- 'app' or 'crm'
  entity_type TEXT NOT NULL,          -- user, food_log, goal, activity, insight
  external_id TEXT,
  user_id UUID,
  operation TEXT NOT NULL,            -- create, update, delete
  old_data JSONB,                     -- previous state (for deltas)
  new_data JSONB,                     -- updated state
  idempotency_key TEXT UNIQUE,        -- for retry safety
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_crm_sync_events_source ON crm_sync_events(source);
CREATE INDEX idx_crm_sync_events_user_id ON crm_sync_events(user_id);
CREATE INDEX idx_crm_sync_events_processed ON crm_sync_events(processed);
CREATE INDEX idx_crm_sync_events_idempotency ON crm_sync_events(idempotency_key);

-- Audit log for compliance & debugging
CREATE TABLE IF NOT EXISTS crm_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT,                        -- create, update, delete, ai_call, tool_execution
  entity_type TEXT,
  entity_id UUID,
  actor TEXT,                         -- 'system', 'ai', user_id, etc.
  actor_type TEXT,                    -- 'user', 'ai_assistant', 'system'
  details JSONB,                      -- what changed
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_audit_log_user_id ON crm_audit_log(user_id);
CREATE INDEX idx_crm_audit_log_action ON crm_audit_log(action);
CREATE INDEX idx_crm_audit_log_created_at ON crm_audit_log(created_at DESC);

-- ============================================================================
-- 8. EMBEDDING STORE (for retrieval)
-- ============================================================================

-- Install pgvector extension first: CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS crm_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  content_type TEXT,                  -- activity, note, insight, coaching
  content_id UUID,                    -- reference to source table
  content_text TEXT,
  embedding vector(1536),             -- OpenAI ada-002 dimension
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_embeddings_user_id ON crm_embeddings(user_id);
CREATE INDEX idx_crm_embeddings_content_type ON crm_embeddings(content_type);
-- Vector index for similarity search (requires pgvector)
-- CREATE INDEX ON crm_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- 9. NOTIFICATIONS & ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  notification_type TEXT,             -- reminder, achievement, warning, coaching_suggestion
  title TEXT,
  message TEXT,
  action_url TEXT,
  priority TEXT DEFAULT 'normal',     -- low, normal, high, urgent
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  channel TEXT,                       -- in_app, email, sms, push
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_notifications_user_id ON crm_notifications(user_id);
CREATE INDEX idx_crm_notifications_sent_at ON crm_notifications(sent_at DESC);

-- ============================================================================
-- 10. PERFORMANCE METRICS & KPIs
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_user_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES crm_user_profiles(user_id) ON DELETE CASCADE,
  metric_date DATE,
  app_opens INTEGER,
  food_logs_count INTEGER,
  goals_active INTEGER,
  insights_received INTEGER,
  coaching_sessions INTEGER,
  goal_progress_avg DECIMAL(5,2),
  engagement_score DECIMAL(5,2),      -- 0-100
  retention_score DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_user_metrics_user_id ON crm_user_metrics(user_id);
CREATE INDEX idx_crm_user_metrics_date ON crm_user_metrics(metric_date DESC);
