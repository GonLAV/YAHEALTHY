-- Phase 1 storage for the deterministic nutrition engine
-- (utils/nutrition-calculator.js, utils/food-calculator.js): a person's
-- profile (what the calculator needs -- age/sex/height/weight/goal/activity)
-- and their daily food log ("ledger" -- what they've actually logged eating,
-- with calories/macros already computed by the engine, never by the model).
--
-- Not yet read or written by any live code path. This is the storage side
-- of the engine being built before it's wired into the conversation --
-- routes/whapi.js and docs/bot/nuri-bot-prompt.md still hold the current
-- customer-facing boundary (general structure, no exact numbers) until
-- that wiring is a deliberate, separately-tested step.
--
-- Rollback:
--   drop table if exists food_log_entries;
--   drop table if exists user_nutrition_profile;

create table if not exists user_nutrition_profile (
  phone text primary key references whapi_conversations(phone) on delete cascade,
  age int check (age between 10 and 120),
  sex text check (sex in ('male', 'female')),
  height_cm numeric check (height_cm between 50 and 250),
  weight_kg numeric check (weight_kg between 20 and 400),
  goal text check (goal in ('lose', 'gain', 'maintain')),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  updated_at timestamptz not null default now()
);

create table if not exists food_log_entries (
  id bigint generated always as identity primary key,
  phone text not null references whapi_conversations(phone) on delete cascade,
  logged_at timestamptz not null default now(),
  description text not null,
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null
);

-- Covers both the FK lookup and the actual query pattern (today's entries /
-- running total per phone), same reasoning as whapi_messages_phone_created_idx
-- in migrations/001.
create index if not exists food_log_entries_phone_logged_idx
  on food_log_entries (phone, logged_at);

-- Same posture as whapi_conversations/whapi_messages (migrations/001): written
-- only by the backend server via the service-role key, never read directly by
-- a client. RLS on with no policies means anon/authenticated get zero access.
alter table user_nutrition_profile enable row level security;
alter table food_log_entries enable row level security;
