-- meal_plans: was never persisted anywhere. index.js declared
-- `const mealPlans = [];` at module scope and read/wrote it directly --
-- unlike every other entity in utils/database.js, this one had no
-- Supabase path to fall back from at all. Every meal plan was guaranteed
-- to vanish on every server restart, in every environment, unconditionally.
-- Found while auditing index.js's full route list against utils/database.js
-- (see supabase/migrations/20260917100000_initial_schema.sql, which only
-- covered database.js's memoryDb entities and missed this one).

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- Recipes are still hardcoded in index.js (VLAD's open decision #4 --
  -- recipes in code vs. data), so there is no recipes table to reference
  -- yet. Kept as opaque text for now; add the FK once that's decided.
  recipe_id text not null,
  date date not null,
  meal_type text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_meal_plans_user_date on meal_plans (user_id, date);

alter table meal_plans enable row level security;
-- Deny-all by default, same reasoning as the initial schema migration:
-- this backend uses its own JWT, not Supabase Auth, so only the secret
-- key (which bypasses RLS) should ever touch this table.
