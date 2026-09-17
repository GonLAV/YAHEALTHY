-- Initial schema for YAHEALTHY, reverse-engineered from the actual read/write
-- shape in utils/database.js and the zod validation in index.js (not from
-- PROJECT_STATUS.md or any other doc -- see decisions.md ADR-001).
--
-- Column types/nullability/defaults match exactly what the app already reads
-- and writes today. Anything the app JSON.stringify()s before insert
-- (weigh_in_days, ingredients, allergies, swaps, offline_logs.data,
-- celebration) is kept as `text` here to match current behavior exactly --
-- migrating those to native `jsonb` is a real improvement but requires an
-- app-code change (stop double-encoding) and is out of scope for this
-- migration.

create extension if not exists pgcrypto;

-- ============================================================================
-- USERS
-- ============================================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  name text not null,
  preferences jsonb,
  created_at timestamptz not null default now()
);

-- index.js does not lowercase email before calling getUserByEmail/createUser
-- (only the in-memory fallback path does), so a plain unique constraint on
-- `email` would let "a@x.com" and "A@x.com" collide as different users in
-- Supabase mode. A case-insensitive unique index closes that at the data
-- layer regardless of what the application code does.
create unique index idx_users_email_lower on users (lower(email));

-- ============================================================================
-- SURVEYS
-- ============================================================================
create table surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  gender text not null,
  age integer not null,
  height_cm numeric not null,
  weight_kg numeric not null,
  target_weight_kg numeric,
  target_days integer,
  lifestyle text not null,
  bmi numeric not null,
  body_fat_percent numeric not null,
  bmr numeric not null,
  tdee numeric not null,
  daily_calories numeric not null,
  water_target_liters numeric not null,
  sleep_target_hours numeric not null,
  protein_target_g numeric not null,
  created_at timestamptz not null default now()
);
create index idx_surveys_user_created on surveys (user_id, created_at desc);

-- ============================================================================
-- WEIGHT GOALS
-- ============================================================================
create table weight_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  start_weight_kg numeric not null,
  target_weight_kg numeric not null,
  weigh_in_days text, -- JSON-stringified array, e.g. '["Mon","Fri"]'
  created_at timestamptz not null default now()
);
create index idx_weight_goals_user_created on weight_goals (user_id, created_at desc);

-- ============================================================================
-- WEIGHT LOGS
-- ============================================================================
-- goal_id is NOT NULL: the only code path that creates a weight log
-- (POST /api/weight-logs) always looks up and requires an existing goal first.
create table weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal_id uuid not null references weight_goals(id) on delete cascade,
  weight_kg numeric not null,
  water_liters numeric,
  sleep_hours numeric,
  celebration text, -- JSON-stringified object, set only when weight was lost
  created_at timestamptz not null default now()
);
create index idx_weight_logs_user_created on weight_logs (user_id, created_at desc);
create index idx_weight_logs_goal on weight_logs (goal_id);

-- ============================================================================
-- HYDRATION LOGS
-- ============================================================================
create table hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  liters_consumed numeric not null check (liters_consumed >= 0 and liters_consumed <= 10),
  time_of_day text,
  source text,
  created_at timestamptz not null default now()
);
create index idx_hydration_logs_user_created on hydration_logs (user_id, created_at desc);

-- ============================================================================
-- SLEEP LOGS
-- ============================================================================
create table sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  sleep_hours numeric not null check (sleep_hours >= 0 and sleep_hours <= 16),
  sleep_quality text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_sleep_logs_user_created on sleep_logs (user_id, created_at desc);

-- ============================================================================
-- FASTING WINDOWS
-- ============================================================================
create table fasting_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  window_hours integer not null check (window_hours >= 8 and window_hours <= 23),
  protocol text not null,
  tips text,
  created_at timestamptz not null default now()
);
create index idx_fasting_windows_user_created on fasting_windows (user_id, created_at desc);

-- ============================================================================
-- MEAL SWAPS
-- ============================================================================
create table meal_swaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ingredients text not null, -- JSON-stringified array
  allergies text not null,   -- JSON-stringified array
  swaps text not null,       -- JSON-stringified object
  created_at timestamptz not null default now()
);
create index idx_meal_swaps_user_created on meal_swaps (user_id, created_at desc);

-- ============================================================================
-- READINESS SCORES
-- ============================================================================
create table readiness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  hrv numeric not null,
  resting_hr numeric not null,
  sleep_hours numeric not null,
  score integer not null,
  level text not null,
  recommendations text,
  created_at timestamptz not null default now()
);
create index idx_readiness_scores_user_created on readiness_scores (user_id, created_at desc);

-- ============================================================================
-- OFFLINE LOGS
-- ============================================================================
create table offline_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  log_type text not null,
  data text not null, -- JSON-stringified payload
  synced boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_offline_logs_user_synced on offline_logs (user_id, synced);

-- ============================================================================
-- FOOD LOGS
-- ============================================================================
create table food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  name text not null,
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack')),
  calories numeric not null check (calories >= 0),
  protein_grams numeric check (protein_grams >= 0),
  carbs_grams numeric check (carbs_grams >= 0),
  fat_grams numeric check (fat_grams >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index idx_food_logs_user_date on food_logs (user_id, date);
create index idx_food_logs_user_created on food_logs (user_id, created_at desc);

-- ============================================================================
-- FOOD LOG TEMPLATES
-- ============================================================================
create table food_log_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack')),
  calories numeric not null check (calories >= 0),
  protein_grams numeric check (protein_grams >= 0),
  carbs_grams numeric check (carbs_grams >= 0),
  fat_grams numeric check (fat_grams >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_food_log_templates_user_created on food_log_templates (user_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY -- deny-all by default on every table
-- ============================================================================
-- This backend authenticates its own users with a custom JWT
-- (utils/auth.js, jsonwebtoken + bcryptjs) -- it never uses Supabase Auth.
-- auth.uid() is therefore always null for requests this backend makes, so
-- the standard `using (auth.uid() = user_id)` RLS pattern cannot work here:
-- it would either block the backend entirely (if enforced) or (if skipped)
-- leave every table wide open to anyone holding the anon/publishable key,
-- completely bypassing this backend's own JWT auth.
--
-- Enabling RLS with zero policies denies anon/authenticated entirely and
-- lets only the service_role key (which bypasses RLS by design) through.
-- This is intentional and is the safe state until the backend is switched
-- to the service_role key -- see the open question raised alongside this
-- migration (VLAD).
alter table users               enable row level security;
alter table surveys             enable row level security;
alter table weight_goals        enable row level security;
alter table weight_logs         enable row level security;
alter table hydration_logs      enable row level security;
alter table sleep_logs          enable row level security;
alter table fasting_windows     enable row level security;
alter table meal_swaps          enable row level security;
alter table readiness_scores    enable row level security;
alter table offline_logs        enable row level security;
alter table food_logs           enable row level security;
alter table food_log_templates  enable row level security;
