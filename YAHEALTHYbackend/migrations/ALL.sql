-- YAHEALTHY — כל המיגרציות, לפי הסדר, בקובץ אחד.
--
-- 🔴 קובץ מחולל. לא לערוך ידנית: node scripts/build-all-sql.js
--
-- הרצה: Supabase Dashboard → SQL Editor → הדבק והרץ.
-- בטוח גם על מסד ריק וגם על מסד שכבר יש בו חלק מזה או את כולו.
-- טרנזקציה אחת: אם משהו נכשל — שום דבר לא משתנה.

begin;

-- ═══════════════════════════════════════════════════════════════
-- 001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════

-- YAHEALTHY — סכימה ראשונית
-- נגזרה מהקוד: utils/database.js (הטבלאות והשאילתות) ו-index.js (שדות ה-payload).
-- ADR-001 קבע Supabase. זו המיגרציה הראשונה בפרויקט.
--
-- הרצה: Supabase Dashboard → SQL Editor → הדבק והרץ.
-- בטוח להרצה חוזרת: הכל IF NOT EXISTS.

-- ─────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key,
  email         text not null,
  password_hash text not null,
  name          text,
  preferences   jsonb,
  created_at    timestamptz not null default now()
);

-- האפליקציה מחפשת לפי אימייל מנורמל לאותיות קטנות. אילוץ ייחודיות
-- על ביטוי lower() מונע שני חשבונות שנבדלים רק באותיות גדולות.
create unique index if not exists users_email_lower_key
  on public.users (lower(email));

-- ─────────────────────────────────────────────────────────────
-- surveys — שאלון בריאות. 🩺 מידע רגיש.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.surveys (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  gender              text,
  height_cm           numeric,
  weight_kg           numeric,
  target_weight_kg    numeric,
  target_days         integer,
  lifestyle           text,
  bmi                 numeric,
  body_fat_percent    numeric,
  bmr                 numeric,
  tdee                numeric,
  daily_calories      jsonb,
  water_target_liters numeric,
  sleep_target_hours  numeric,
  protein_target_g    numeric,
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- weight_goals / weight_logs — 🩺 מידע רגיש.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.weight_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  start_weight_kg  numeric,
  target_weight_kg numeric,
  weigh_in_days    jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists public.weight_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  goal_id      uuid references public.weight_goals(id) on delete set null,
  weight_kg    numeric,
  water_liters numeric,
  sleep_hours  numeric,
  celebration  text,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- הרגלים יומיים
-- ─────────────────────────────────────────────────────────────
create table if not exists public.hydration_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  date            date,
  liters_consumed numeric,
  time_of_day     text,
  created_at      timestamptz not null default now()
);

create table if not exists public.sleep_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  date          date,
  sleep_hours   numeric,
  sleep_quality text,
  created_at    timestamptz not null default now()
);

create table if not exists public.fasting_windows (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  window_hours numeric,
  protocol     text,
  created_at   timestamptz not null default now()
);

create table if not exists public.readiness_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  hrv         numeric,
  resting_hr  numeric,
  sleep_hours numeric,
  score       numeric,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- meal_swaps — allergies מגיע מהמשתמש. 🩺 רגיש.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.meal_swaps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  ingredients jsonb,
  allergies   jsonb,
  swaps       jsonb,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- offline_logs — סנכרון מהלקוח. log_type/data הם payload שרירותי.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.offline_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  log_type   text,
  data       jsonb,
  synced     boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- food_logs — ליבת המוצר. 15 endpoints נשענים עליה.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.food_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  date          date,
  name          text,
  meal_type     text,
  calories      numeric,
  protein_grams numeric,
  carbs_grams   numeric,
  fat_grams     numeric,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.food_log_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  name          text,
  meal_type     text,
  calories      numeric,
  protein_grams numeric,
  carbs_grams   numeric,
  fat_grams     numeric,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- אינדקסים — לפי מה שהקוד באמת מסנן וממיין
-- (utils/database.js: eq על user_id/date/goal_id/synced,
--  order על created_at/date, טווחים על date)
-- ─────────────────────────────────────────────────────────────
create index if not exists food_logs_user_date_idx        on public.food_logs (user_id, date desc);
create index if not exists food_logs_user_created_idx     on public.food_logs (user_id, created_at desc);
create index if not exists food_log_templates_user_idx    on public.food_log_templates (user_id, created_at desc);
create index if not exists surveys_user_idx               on public.surveys (user_id, created_at desc);
create index if not exists weight_goals_user_idx          on public.weight_goals (user_id, created_at desc);
create index if not exists weight_logs_user_idx           on public.weight_logs (user_id, created_at desc);
create index if not exists weight_logs_goal_idx           on public.weight_logs (goal_id);
create index if not exists hydration_logs_user_date_idx   on public.hydration_logs (user_id, date desc);
create index if not exists sleep_logs_user_date_idx       on public.sleep_logs (user_id, date desc);
create index if not exists fasting_windows_user_idx       on public.fasting_windows (user_id, created_at desc);
create index if not exists readiness_scores_user_idx      on public.readiness_scores (user_id, created_at desc);
create index if not exists meal_swaps_user_idx            on public.meal_swaps (user_id, created_at desc);
create index if not exists offline_logs_user_synced_idx   on public.offline_logs (user_id, synced);

-- ─────────────────────────────────────────────────────────────
-- 🔴 RLS — הגנה בעומק
--
-- השרת ניגש עם מפתח secret ולכן עוקף RLS ממילא. ההפעלה כאן היא
-- רשת ביטחון: אם מפתח ציבורי ידלוף או ייחשף מהלקוח, הוא לא יוכל
-- לקרוא שורה אחת. בלי זה, מפתח שדלף = כל נתוני הבריאות חשופים.
--
-- אין policies בכוונה: ברירת המחדל היא דחייה מוחלטת לכל מי שאינו
-- service/secret. כשה-frontend יקרא ישירות ל-Supabase — מוסיפים
-- policies לפי auth.uid(), לא לפני.
-- ─────────────────────────────────────────────────────────────
alter table public.users              enable row level security;
alter table public.surveys            enable row level security;
alter table public.weight_goals       enable row level security;
alter table public.weight_logs        enable row level security;
alter table public.hydration_logs     enable row level security;
alter table public.sleep_logs         enable row level security;
alter table public.fasting_windows    enable row level security;
alter table public.readiness_scores   enable row level security;
alter table public.meal_swaps         enable row level security;
alter table public.offline_logs       enable row level security;
alter table public.food_logs          enable row level security;
alter table public.food_log_templates enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 001_whapi_bot_conversations.sql
-- ═══════════════════════════════════════════════════════════════

-- First migration in this repo (ADR-002 follow-up, decisions.md step 4).
-- Run in the Supabase SQL editor before the WHAPI webhook goes live.
--
-- Rollback:
--   drop table if exists whapi_messages;
--   drop table if exists whapi_conversations;

create table if not exists whapi_conversations (
  phone text primary key,
  active_bot text not null default 'nuri' check (active_bot in ('nuri', 'chef')),
  updated_at timestamptz not null default now()
);

create table if not exists whapi_messages (
  id bigint generated always as identity primary key,
  phone text not null references whapi_conversations(phone) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Covers both the FK lookup and the actual query pattern (recent messages per phone).
create index if not exists whapi_messages_phone_created_idx
  on whapi_messages (phone, created_at);

-- These tables are written only by the backend server, never read directly by a
-- client. RLS is enabled with no policies, so the anon/authenticated roles get
-- zero access by default; only the Postgres service_role (which bypasses RLS)
-- can read or write them.
--
-- The rest of this app's tables connect via SUPABASE_KEY, documented in
-- .env.example as the anon key. If that is what's actually configured, the
-- webhook's DB calls will fail against these two tables until the backend
-- also has a service-role key. Add SUPABASE_SERVICE_ROLE_KEY (Supabase
-- dashboard -> Settings -> API) and use it for the four whapi* functions in
-- utils/database.js -- see the comment there.
alter table whapi_conversations enable row level security;
alter table whapi_messages enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 002_whatsapp_messages.sql
-- ═══════════════════════════════════════════════════════════════

-- WhatsApp — הודעות נכנסות מ-WHAPI
-- נגזר מצורת ה-webhook האמיתית שנצפתה ב-20/09/2026.
-- נתיב חזרה: drop table public.whatsapp_messages;

create table if not exists public.whatsapp_messages (
  -- המזהה של WHAPI. משמש כמפתח ראשי כדי שמסירה כפולה של אותו
  -- webhook לא תיצור שתי שורות — WHAPI שולח שוב על כישלון.
  id          text primary key,
  chat_id     text not null,
  from_number text,
  from_name   text,
  from_me     boolean not null default false,
  type        text,
  body        text,
  sent_at     timestamptz,

  -- מצב הטיפול. אין כאן תשובה אוטומטית: הודעה נכנסת ומחכה.
  --   pending   — התקבלה, לא טופלה
  --   drafted   — נוסחה תשובה וממתינה לאישור
  --   answered  — נשלחה תשובה
  --   escalated — 🩺 דגל בריאותי, עוברת לאדם ולא נענית אוטומטית
  status      text not null default 'pending',

  -- ה-payload המלא כפי שהתקבל. נשמר כדי שנוכל להבין מבנה שלא צפינו
  -- בלי לאבד את ההודעה.
  raw         jsonb,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_status_idx
  on public.whatsapp_messages (status, received_at desc);
create index if not exists whatsapp_messages_chat_idx
  on public.whatsapp_messages (chat_id, sent_at desc);

-- 🔴 הודעות מלקוחות עלולות להכיל מידע בריאותי — מישהו כותב "אני בהריון"
-- לפני שיש לו חשבון. RLS מופעל, בלי policies, כמו שאר הטבלאות.
alter table public.whatsapp_messages enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 003_rename_nuri_to_adi.sql
-- ═══════════════════════════════════════════════════════════════

-- Renames the internal bot identifier from 'nuri' to 'adi'.
--
-- Persona history: Nuri -> Mor -> Adi. The first two renames only ever
-- touched user-facing prose (docs/bot/nuri-bot-prompt.md, routes/whapi.js
-- strings) -- migrations/001 hardcoded the original name as stored data
-- (the default and the check constraint below), and that survived both
-- renames until now.
--
-- No longer a hard prerequisite for deploying the code that writes 'adi' as
-- active_bot: utils/database.js (getWhapiConversation/upsertWhapiConversation)
-- now normalizes at the boundary -- a write of 'adi' that hits this
-- constraint before it's been updated retries once with the legacy 'nuri'
-- value instead of failing, and a row read back as 'nuri' is returned as
-- 'adi' -- so an existing conversation never loses its system prompt
-- (SYSTEM_PROMPTS keyed by 'adi', not 'nuri') either way. Run this whenever
-- convenient regardless: it's the real fix (the stored data matches the
-- code's vocabulary, so anyone reading the table directly -- e.g. in the
-- Supabase dashboard -- isn't confused by a stale 'nuri'), the fallback in
-- database.js is a safety net, not a replacement for it. Once this has run,
-- that fallback path simply never triggers again.
--
-- Rollback:
--   alter table whapi_conversations drop constraint if exists whapi_conversations_active_bot_check;
--   update whapi_conversations set active_bot = 'nuri' where active_bot = 'adi';
--   alter table whapi_conversations alter column active_bot set default 'nuri';
--   alter table whapi_conversations add constraint whapi_conversations_active_bot_check check (active_bot in ('nuri', 'chef'));


alter table whapi_conversations drop constraint if exists whapi_conversations_active_bot_check;

update whapi_conversations set active_bot = 'adi' where active_bot = 'nuri';

alter table whapi_conversations alter column active_bot set default 'adi';

-- 'yoni' is allowed here too, although it arrives only in migrations/008.
-- Without it this file cannot run twice: on a database where 008 has already
-- renamed 'chef' to 'yoni', adding a constraint that forbids 'yoni' fails,
-- and in ALL.sql that failure aborts the whole run. 008 then narrows the
-- constraint to exactly ('adi', 'yoni'), so the end state is unchanged.
alter table whapi_conversations
  add constraint whapi_conversations_active_bot_check check (active_bot in ('adi', 'chef', 'yoni'));

-- ═══════════════════════════════════════════════════════════════
-- 003_token_version.sql
-- ═══════════════════════════════════════════════════════════════

-- token_version — הופך טוקן חתום לטוקן שאפשר לבטל.
--
-- עד כאן JWT היה תקף 7 ימים ואי אפשר היה לעצור אותו: "התנתקות" מחקה
-- אותו מהדפדפן בלבד, ואיפוס סיסמה לא ניתק את מי שכבר היה בפנים.
-- המספר הזה נחתם בתוך הטוקן ונבדק מול השורה בכל בקשה. העלאה שלו
-- באחד מהמצבים הבאים פוסלת מיידית כל טוקן שהונפק קודם:
--   התנתקות · שינוי סיסמה · איפוס סיסמה
--
-- היא גם מה שהופך טוקן איפוס לחד-פעמי: הוא נושא את הערך שהיה בשעת
-- ההנפקה, והאיפוס עצמו מעלה אותו — כך שאותו טוקן לא יעבוד פעמיים.
--
-- נתיב חזרה: alter table public.users drop column token_version;

alter table public.users
  add column if not exists token_version integer not null default 0;

-- ═══════════════════════════════════════════════════════════════
-- 004_meal_plans.sql
-- ═══════════════════════════════════════════════════════════════

-- meal_plans — התוכנית השבועית שהלקוח משלם עליה.
--
-- עד כאן היא ישבה ב-`const mealPlans = []` בתוך index.js. כלומר: כל restart
-- של השרת מחק לכל הלקוחות את התוכנית ואת רשימת הקניות שנגזרת ממנה, בלי
-- שגיאה ובלי דרך לשחזר. אי אפשר לגבות כסף על מוצר שלא שורד אתחול.
--
-- rows נמחקות יחד עם המשתמש, כמו כל שאר הטבלאות.
--
-- נתיב חזרה: drop table public.meal_plans;

create table if not exists public.meal_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,

  -- מזהה מתוך data/recipes.json ("recipe_12"), לא מפתח זר: המתכונים הם
  -- קובץ תוכן ולא טבלה. אם הם יעברו ל-DB, זה הופך ל-references.
  recipe_id  text not null,

  date       date not null,
  meal_type  text not null,
  completed  boolean not null default false,
  created_at timestamptz not null default now(),

  -- ארוחה אחת לכל סוג ביום. הקוד כבר התנהג כך כשייצר תוכניות אוטומטית,
  -- אבל שום דבר לא אכף את זה — ויצירה ידנית יכלה לשתול כפילויות שרשימת
  -- הקניות הייתה סופרת פעמיים.
  unique (user_id, date, meal_type)
);

create index if not exists meal_plans_user_date_idx
  on public.meal_plans (user_id, date);

-- 🔴 תוכנית תזונה אישית היא מידע בריאותי. RLS מופעל, בלי policies,
-- כמו שאר הטבלאות — ה-backend הוא השוער.
alter table public.meal_plans enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 004_nutrition_engine_storage.sql
-- ═══════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════
-- 005_subscriptions_and_payments.sql
-- ═══════════════════════════════════════════════════════════════

-- מנויים ואירועי תשלום — ADR-007.
--
-- שתי טבלאות, שני תפקידים נפרדים:
--   subscriptions  — מה הלקוח קנה ועד מתי. זה מה שקובע הרשאה.
--   payment_events — מה PayPlus הודיע לנו. זה מה שמונע חיוב כפול.
--
-- ההפרדה חשובה: ספק הסליקה שולח את אותה הודעה יותר מפעם אחת, וטבלת
-- האירועים היא מה שהופך מסירה חוזרת לחסרת השפעה.
--
-- נתיב חזרה: drop table public.payment_events; drop table public.subscriptions;

create table if not exists public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,

  -- 'base' — מסלול בסיס · 'yoni' — מסלול עם יוני (ADR-007, אוחד ב-009)
  plan       text not null,

  -- 'active' · 'cancelled' · 'expired'
  status     text not null default 'active',

  started_at timestamptz not null default now(),

  -- null = ללא תאריך סיום. מי שמבטל לפי זכות הביטול מקבל כאן תאריך,
  -- והשורה נשמרת — ההיסטוריה היא מה שמוכיח מה נמכר ומתי.
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);

-- מנוי פעיל אחד לכל מסלול. שני מנויים פעילים לאותו אדם לאותו מסלול
-- הם תמיד תקלה — בדרך כלל מסירה כפולה של webhook.
create unique index if not exists subscriptions_one_active_per_plan
  on public.subscriptions (user_id, plan)
  where status = 'active';

create index if not exists subscriptions_user_idx
  on public.subscriptions (user_id, status);

create table if not exists public.payment_events (
  -- המזהה של PayPlus לבקשת התשלום. מפתח ראשי בכוונה: מסירה חוזרת של
  -- אותו callback נופלת על אילוץ ייחודיות במקום להיבדק ב-if שתי בקשות
  -- מקבילות יכולות לחמוק ממנו.
  page_request_uid text primary key,

  user_id     uuid references public.users(id) on delete set null,
  email       text,
  plan        text,
  status      text not null,
  amount      numeric,
  currency    text,

  -- ה-payload כפי שהתקבל, אחרי אימות חתימה. נשמר כדי שנוכל להסביר
  -- חיוב שנוי במחלוקת בלי להסתמך על הזיכרון של מישהו.
  raw         jsonb,
  received_at timestamptz not null default now()
);

create index if not exists payment_events_email_idx
  on public.payment_events (email, received_at desc);

-- 🔴 מי קנה מה הוא מידע אישי. RLS מופעל, בלי policies, כמו שאר הטבלאות.
alter table public.subscriptions  enable row level security;
alter table public.payment_events enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 006_chef_requests.sql
-- ═══════════════════════════════════════════════════════════════

-- chef_requests — "נדאג שהשף יצור איתך קשר" כמצב בדאטה, לא כמשפט.
--
-- ADR-007: השף הוא אדם. הבטחה שנאמרת ללקוח ולא נרשמת בשום מקום היא
-- הבטחה שתישבר — אף אחד לא יודע שמישהו מחכה.
--
-- נתיב חזרה: drop table public.chef_requests;

create table if not exists public.chef_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,

  -- 'open' — ממתין · 'contacted' — השף יצר קשר · 'closed' — טופל
  status       text not null default 'open',

  -- מה הלקוח כתב, אם כתב. 🩺 לא לשים כאן ייעוץ תזונתי — השף מלמד לבשל.
  note         text,

  requested_at timestamptz not null default now(),
  contacted_at timestamptz
);

-- בקשה פתוחה אחת ללקוח. לחיצה כפולה לא יוצרת שתי בקשות ולא שתי שיחות.
create unique index if not exists chef_requests_one_open_per_user
  on public.chef_requests (user_id)
  where status = 'open';

create index if not exists chef_requests_status_idx
  on public.chef_requests (status, requested_at desc);

alter table public.chef_requests enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 007_foods.sql
-- ═══════════════════════════════════════════════════════════════

-- foods — ערכים תזונתיים לכל 100 גרם, עם מקור לכל שורה.
--
-- שתי הכרעות שמעצבות את הטבלה:
--
-- 1. **הכול ל-100 גרם.** "תפוח" הוא לא כמות. תפוח קטן ותפוח גדול הם אותו
--    מזון במשקל שונה, וכל חישוב לכמות נגזר מהבסיס הזה.
--
-- 2. **אין שורה בלי מקור.** `source` ו-`source_ref` הם NOT NULL בכוונה:
--    ערך קלורי שאי אפשר להצביע על מקורו הוא ערך שהיועצת לא יכולה להגן
--    עליו מול לקוחה. שורה בלי מקור פשוט לא נכנסת.
--
-- נתיב חזרה: drop table public.foods;

create table if not exists public.foods (
  id            uuid primary key default gen_random_uuid(),

  name_he       text not null,
  name_en       text,

  -- ירקות · פירות · חלב · ביצים · בשר · דגים · קטניות · דגנים · שומן · אחר
  category      text,

  -- נא · מבושל · אפוי · מטוגן · יבש · משומר.
  -- עדשים יבשות ועדשים מבושלות אינן אותו מזון: ספיחת מים משנה את הערך
  -- ל-100 גרם פי שלושה. בלי השדה הזה המאגר משקר בלי לשים לב.
  -- 'raw' was once written without quotes, which Postgres reads as a column
  -- name and refuses ("cannot use column reference in DEFAULT expression") —
  -- so this whole file failed wherever it was run, and the table never existed.
  state         text not null default 'raw',

  -- כמה גרם יש ביחידה אחת נפוצה - ביצה אחת, כף שמן, פרוסת לחם.
  -- null = לא ידוע, ואז לא ממירים יחידות לגרמים ולא מנחשים.
  grams_per_unit numeric,
  unit_he        text,

  -- ⚠️ הליבה. תמיד ל-100 גרם, תמיד קילו-קלוריות.
  -- FDC מחזיר לחלק מהרשומות קילו-ג'ול; ההמרה נעשית בטעינה, לא כאן.
  kcal_per_100g numeric not null check (kcal_per_100g >= 0 and kcal_per_100g <= 900),

  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  fiber_g       numeric,
  sugar_g       numeric,
  sodium_mg     numeric,

  -- 'usda_fdc' · 'moh_il' · 'manufacturer_label' · 'manual'
  source        text not null,

  -- מזהה שאפשר לחזור אליו: fdcId, מספר פריט במאגר משרד הבריאות,
  -- או ברקוד/קישור לתווית יצרן.
  source_ref    text not null,

  -- 'Foundation' / 'SR Legacy' / 'Branded' ב-FDC. איכות שונה מאוד.
  source_detail text,
  retrieved_at  timestamptz not null default now(),

  -- שמות שהלקוח עשוי לכתוב בוואטסאפ. "אכלתי 200 גרם חזה" צריך למצוא
  -- את חזה העוף. עבודת תרגום, ולכן מותר שמודל ייצר אותה — היא לא מספר.
  aliases_he    jsonb,

  -- מנות נפוצות עם משקל בגרמים: [{"name_he":"כף","grams":15}].
  -- ⚠️ נטען מ-foodPortions של FDC כשקיים. משקל שלא הגיע ממקור לא נכנס:
  -- ניחוש של משקל מנה הוא ניחוש של קלוריות.
  common_servings jsonb,

  -- טקסט חופשי שהיועצת יכולה לצטט: זן, בישול, חלק אכיל.
  note_he       text,

  created_at    timestamptz not null default now(),

  -- מזון אחד לכל מקור. טעינה חוזרת מעדכנת, לא מכפילה.
  unique (source, source_ref, state)
);

create index if not exists foods_name_he_idx  on public.foods (name_he);
create index if not exists foods_category_idx on public.foods (category);

-- ingredient_foods — מה שמחבר "עגבניות בשלות" מתוך מתכון לשורה במאגר.
--
-- ההתאמה בין שם בעברית לרשומה ב-FDC נעשית על ידי אדם או מודל, והיא עלולה
-- להיות שגויה. לכן היא יושבת בטבלה נפרדת עם רמת ביטחון — ולא מודבקת
-- לתוך `foods` כאילו היא חלק מהמדידה.
create table if not exists public.ingredient_foods (
  ingredient_he text primary key,
  food_id       uuid references public.foods(id) on delete set null,

  -- 'exact' — אותו מזון · 'approximate' — קרוב · 'unmapped' — לא נמצא
  confidence    text not null default 'approximate',

  -- כמה גרם ב"יחידה אחת" של המרכיב הזה. null = לא ידוע, ואז אי אפשר
  -- להמיר "5 בינוניות" לגרמים, ולא מנחשים.
  grams_per_unit numeric,
  unit_he        text,

  mapped_at     timestamptz not null default now(),
  mapped_by     text
);

alter table public.foods            enable row level security;
alter table public.ingredient_foods enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 008_rename_chef_to_yoni.sql
-- ═══════════════════════════════════════════════════════════════

-- שינוי שם הפרסונה: 'chef' → 'yoni'.
--
-- אותה תבנית בדיוק כמו migrations/003 (nuri → adi): הערך ב-active_bot הוא
-- מזהה פרסונה שהקוד מתייחס אליו, ולכן הוא משתנה כאן. שם הקובץ
-- chef-bot-prompt.md נשאר — לנתיב קובץ אין משמעות בזמן ריצה כמו שיש למפתח,
-- ושינוי שלו הוא רעש בלי תועלת.
--
-- utils/database.js ממפה 'chef' → 'yoni' בקריאה, ונופל חזרה ל-'chef' בכתיבה
-- אם האילוץ הישן עדיין בתוקף. כלומר הקוד והמיגרציה לא חייבים לעלות יחד,
-- ושום שיחה לא נשברת בין הפריסות.
--
-- נתיב חזרה:
--   alter table whapi_conversations drop constraint if exists whapi_conversations_active_bot_check;
--   update whapi_conversations set active_bot = 'chef' where active_bot = 'yoni';
--   alter table whapi_conversations
--     add constraint whapi_conversations_active_bot_check check (active_bot in ('adi', 'chef'));

alter table whapi_conversations
  drop constraint if exists whapi_conversations_active_bot_check;

update whapi_conversations set active_bot = 'yoni' where active_bot = 'chef';

alter table whapi_conversations
  add constraint whapi_conversations_active_bot_check
  check (active_bot in ('adi', 'yoni'));

-- ═══════════════════════════════════════════════════════════════
-- 009_unify_on_yoni.sql
-- ═══════════════════════════════════════════════════════════════

-- איחוד: שף אחד, יוני, בוט בוואטסאפ.
--
-- ADR-007 קבע שהשף הוא אדם, ושלקוח מבקש שייצרו איתו קשר. במקביל נבנה בוט
-- שעונה בצ'אט מיידית. שתי המערכות חיו זו לצד זו, ולקוח ששילם היה נכנס לתור
-- שאיש לא מנהל בזמן שיוני עונה לו תוך שנייה. ההכרעה החדשה: רק יוני.
--
-- מה שנמחק כאן הוא מסלול-האדם בלבד. המנוי עצמו נשאר — הוא פשוט קונה את יוני.
--
-- נתיב חזרה: git מחזיר את routes/chef.js ואת migrations/006, והטבלה נוצרת
-- מחדש משם. שם המסלול חוזר עם:
--   update public.subscriptions   set plan = 'chef' where plan = 'yoni';
--   update public.payment_events  set plan = 'chef' where plan = 'yoni';

-- שם אחד לפרסונה ולמסלול שקונה אותה.
update public.subscriptions  set plan = 'yoni' where plan = 'chef';
update public.payment_events set plan = 'yoni' where plan = 'chef';

-- מסלול-האדם. אין לו יותר endpoint, ואין לו מי שמנהל את התור שהוא יוצר.
drop table if exists public.chef_requests;

-- ═══════════════════════════════════════════════════════════════
-- 010_phone_identity.sql
-- ═══════════════════════════════════════════════════════════════

-- קישור בין מספר טלפון לחשבון — התנאי לגבייה על יוני.
--
-- הבעיה: וואטסאפ מזהה אנשים לפי מספר טלפון, ומנויים רשומים על חשבון עם
-- אימייל. לא היה ביניהם שום קשר, ולכן השרת לא ידע מי כותב לו — ולא יכול
-- היה לדעת אם שילם.
--
-- 🔴 מספר טלפון הוא לא הוכחת זהות. הוא מספיק כדי להחליט מי מקבל בוט
-- בישול; הוא לא מספיק לשום דבר חמור מזה. אין כאן מפתח לחשבון.
--
-- נתיב חזרה:
--   alter table public.users drop column phone;
--   alter table whapi_conversations drop column user_id;

-- E.164 בלי הפלוס: 972501234567. צורה אחת בלבד, כי השוואה בין
-- "050-123-4567" ל-"+972501234567" היא באג שמחכה לקרות.
alter table public.users
  add column if not exists phone text;

-- ייחודי, אבל רק על מה שקיים: שני חשבונות על אותו מספר הם תמיד תקלה,
-- ורוב החשבונות לא ימסרו מספר בכלל.
create unique index if not exists users_phone_key
  on public.users (phone)
  where phone is not null;

-- מי מדבר איתנו בוואטסאפ, אם ידוע. null = מספר שלא זוהה, וזה מצב
-- לגיטימי: אדם יכול לכתוב לפני שקנה.
alter table whapi_conversations
  add column if not exists user_id uuid references public.users(id) on delete set null;

create index if not exists whapi_conversations_user_idx
  on whapi_conversations (user_id);

-- ═══════════════════════════════════════════════════════════════
-- 011_prompt_provenance.sql
-- ═══════════════════════════════════════════════════════════════

-- איזו גרסת פרומפט ענתה ללקוח.
--
-- הבוט אומר לאנשים מה לאכול ובאיזה יעד קלורי. ההצדקה לכך היא שאשת מקצוע
-- כתבה ואישרה את הנוסח. ההצדקה הזו שווה משהו רק אם אפשר להראות **איזה**
-- נוסח היה בתוקף כשנאמר מה שנאמר — שיחה משישה חודשים אחורה מול פרומפט
-- שהשתנה מאז היא בדיוק המצב שבו אי אפשר להגן על כלום.
--
-- הערך הוא persona:12 התווים הראשונים של sha256 של קובץ הפרומפט, למשל
-- "adi:dc4acc971f59". מי שמשווה אותו ל-data/clinical-approvals.json יודע
-- מיד אם הגרסה שענתה היא הגרסה שאושרה.
--
-- null מותר: שורות שנכתבו לפני השינוי הזה, ותשובות מערכת שאינן מהמודל.
--
-- נתיב חזרה: alter table whapi_messages drop column prompt_version;

alter table whapi_messages
  add column if not exists prompt_version text;

create index if not exists whapi_messages_prompt_version_idx
  on whapi_messages (prompt_version);

-- ═══════════════════════════════════════════════════════════════
-- 012_staff_role.sql
-- ═══════════════════════════════════════════════════════════════

-- is_staff — מי מורשה לקרוא הודעות של לקוחות.
--
-- 🔴 התקלה שזה סוגר: `/api/whatsapp/pending` היה מוגן ב-authMiddleware בלבד,
-- ולא קיים בפרויקט שום מודל תפקידים. כלומר **כל מי שנרשם** — וההרשמה
-- פתוחה ולא מאומתת — יכול היה לקרוא את כל ההודעות הנכנסות במלואן, כולל
-- אלה שסומנו `escalated`, שהן בהגדרה הודעות שבהן אדם כתב "אני בהריון",
-- "יש לי סוכרת" או "הפרעת אכילה", עם מספר הטלפון שלו לצידן.
--
-- אימות מול הרשאה: השאלה "מי אתה" נענתה. השאלה "ומה מותר לך" לא נשאלה.
--
-- ברירת המחדל היא false, כלומר אף אחד. הענקה נעשית ידנית ב-SQL בכוונה:
-- אין endpoint שמעניק אותה, כי endpoint כזה הוא עוד משטח התקפה על בדיוק
-- אותו מידע.
--
--   update public.users set is_staff = true where email = 'someone@example.com';
--
-- נתיב חזרה: alter table public.users drop column is_staff;

alter table public.users
  add column if not exists is_staff boolean not null default false;

create index if not exists users_staff_idx
  on public.users (is_staff) where is_staff = true;

-- ═══════════════════════════════════════════════════════════════
-- 013_missing_columns.sql
-- ═══════════════════════════════════════════════════════════════

-- העמודות שהקוד כותב אליהן ולא היו קיימות.
--
-- 🔴 התקלה שזה סוגר: חמישה נתיבי כתיבה שולחים שדות שאין להם עמודה בסכימה.
-- ב-ALLOW_MEMORY_DB השורה היא אובייקט JS רגיל — utils/database.js עושה
-- `{...data}` ומקבל כל שדה — ולכן הכל עבד בפיתוח. Supabase דוחה עמודה לא
-- מוכרת, ולכן אותן כתיבות נכשלו בייצור בלבד.
--
-- זו הסיבה שהן לא נתפסו: מצב הזיכרון לא מדמה את הסכימה, הוא מתעלם ממנה.
--
-- החמורה מכולן היא surveys.age. POST /api/surveys שולח age, ובלעדיה יצירת
-- סקר נכשלת לגמרי בייצור — וטבלת הסקרים היא המקום היחיד שממנו מגיע יעד
-- קלורי. כלומר: אי אפשר היה להגדיר יעד, ולכן הטבעת במסך הבית נפלה תמיד
-- ל-2000 שהפרונטאנד המציא.
--
-- כל העמודות nullable בכוונה: שורות שנכתבו לפני המיגרציה תקפות בדיוק
-- כפי שהן, ואין כאן ערך ברירת מחדל שמתיימר לדעת משהו על מי שכבר רשום.
--
-- נתיב חזרה:
--   alter table public.surveys           drop column age;
--   alter table public.readiness_scores  drop column level, drop column recommendations;
--   alter table public.fasting_windows   drop column tips;
--   alter table public.sleep_logs        drop column notes;
--   alter table public.hydration_logs    drop column source;

-- index.js: POST /api/surveys שולח age, ו-calculateBodyFat/calculateBMR/
-- calculateSleepTarget כולם מקבלים אותו. בלי העמודה, הסקר כולו נופל.
alter table public.surveys
  add column if not exists age integer;

-- index.js: POST /api/readiness שולח level ו-recommendations.
alter table public.readiness_scores
  add column if not exists level text,
  add column if not exists recommendations jsonb;

-- index.js: POST /api/fasting-windows שולח tips.
alter table public.fasting_windows
  add column if not exists tips jsonb;

-- index.js: POST /api/sleep-logs שולח notes כשהמשתמש/ת מילא/ה אותו.
alter table public.sleep_logs
  add column if not exists notes text;

-- index.js: POST /api/hydration-logs שולח source. undefined נעלם בסריאליזציה
-- ל-JSON, ולכן זה נכשל רק כשבאמת נשלח ערך — הסוג הגרוע של באג לתפוס.
alter table public.hydration_logs
  add column if not exists source text;

-- ═══════════════════════════════════════════════════════════════
-- 014_appointments.sql
-- ═══════════════════════════════════════════════════════════════

-- תורים: אבחון (פיזי / אונליין, חינם) ופגישה בסופר (בתשלום).
--
-- יומן הגוגל של המאבחנת הוא מקור האמת למה שתפוס. הטבלה הזו קיימת בשביל מה
-- שגוגל לא נותן: רשומה שלנו של מי קבע ומתי, ומנעול. שני אנשים שלוחצים על
-- אותה שעה באותה שנייה — ה-unique index כאן מכריע ביניהם לפני שמשהו נכתב
-- ליומן.
--
-- פגישה בסופר נקבעת לפני התשלום ונשמרת כ-pending_payment. השעה מוחזקת לזמן
-- קצוב (BOOKING_HOLD_MINUTES בקוד); החזקה שפגה משוחררת ל-cancelled לפני כל
-- הזמנה חדשה. רק callback מאושר של PayPlus הופך אותה ל-booked ויוצר אירוע
-- ביומן — תור שלא שולם לא מגיע ליומן שלה.
--
-- פרטים אישיים: שם, טלפון, ולפעמים הערה על מצב בריאותי. לכן RLS פעיל בלי
-- policies, כמו whapi_*: רק השרת, עם service role, קורא וכותב.
--
-- נתיב חזרה:
--   drop table if exists public.appointments;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('physical', 'online', 'supermarket')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'booked'
    check (status in ('pending_payment', 'booked', 'cancelled')),
  name text not null,
  phone text not null,
  email text,
  -- לפגישה בסופר: איזה סופר / איזה אזור. הלקוח בוחר, לא אנחנו.
  location text,
  notes text,
  amount numeric,
  google_event_id text,
  meet_link text,
  -- The customer's link to cancel their own booking. It unlocks exactly one
  -- action on exactly one row, which is why it sits here in plain text: anyone
  -- who can read this table can already do more than it allows.
  cancel_token text,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'staff', 'expired')),
  -- Set when something needs a person, comma-separated when there is more than
  -- one: underpaid, slot_taken, calendar_failed,
  -- refund_requested, calendar_cleanup. The staff screen lists these;
  -- clearing it is how a person marks the matter as settled.
  needs_attention text,
  -- The evening-before WhatsApp reminder (routes/cron.js). Set once sent, and
  -- cleared on a reschedule so the new time gets its own reminder.
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- שעת התחלה אחת לכל תור חי. מבוטל לא תופס את השעה; ממתין-לתשלום כן.
create unique index if not exists appointments_one_per_start
  on public.appointments (start_at)
  where status in ('booked', 'pending_payment');

create index if not exists appointments_start_idx on public.appointments (start_at);
create index if not exists appointments_attention_idx
  on public.appointments (created_at) where needs_attention is not null;

alter table public.appointments enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 015_payment_attention.sql
-- ═══════════════════════════════════════════════════════════════

-- תשלום שדורש אדם.
--
-- עד עכשיו, כשכסף נכנס ולא היה ברור על מה — תשלום על פגישה בסופר בלי תור
-- תואם, תשלום בלי מייל או מסלול שאפשר לזהות, או מספר טלפון שכבר שייך לחשבון
-- אחר — זה נרשם רק בלוג. ביומן של שרת, שאף אחד לא קורא, זה כסף שנעלם.
--
-- עכשיו זה נרשם על התשלום עצמו, ומסך הצוות מציג אותו עד שמישהו מסמן שטופל.
-- כמה סיבות באותו תשלום נשמרות מופרדות בפסיק, כמו ב-appointments.
--
-- נתיב חזרה:
--   alter table public.payment_events drop column needs_attention;

alter table public.payment_events
  add column if not exists needs_attention text;

create index if not exists payment_events_attention_idx
  on public.payment_events (received_at) where needs_attention is not null;

-- ═══════════════════════════════════════════════════════════════
-- 016_orders.sql
-- ═══════════════════════════════════════════════════════════════

-- הזמנות חד-פעמיות — תפריט אישי מיעל.
--
-- מנוי נותן גישה ואין מה "לבצע" בו. תפריט אישי הוא עבודה של אדם: יעל צריכה
-- לדעת שמישהו שילם, ליצור איתו קשר ולבנות לו תפריט. בלי רשומה כזו, התשלום
-- מופיע רק ב-payment_events, ששום מסך לא מציג כמשימה.
--
-- שורה לכל תשלום מאושר על מוצר חד-פעמי (routes/payments.js, PRODUCTS).
-- page_request_uid ייחודי: callback שמגיע פעמיים לא פותח שתי הזמנות.
-- פרטים אישיים (מייל, טלפון) — RLS בלי policies, רק השרת ניגש.
--
-- נתיב חזרה:
--   drop table if exists public.orders;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  page_request_uid text not null unique,
  user_id uuid references public.users(id) on delete set null,
  product text not null,
  email text,
  phone text,
  amount numeric,
  status text not null default 'paid'
    check (status in ('paid', 'in_progress', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- המסך של יעל: מה פתוח, מהישן לחדש.
create index if not exists orders_open_idx
  on public.orders (created_at) where status in ('paid', 'in_progress');

alter table public.orders enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 017_nudges.sql
-- ═══════════════════════════════════════════════════════════════

-- תזכורות (nudges) — מים, ארוחת בוקר, התפריט של היום, וכל הכבוד.
--
-- שורה לכל תזכורת שנשלחה, והיא משמשת לשני דברים: מניעת כפילות (תזכורת
-- המים של 14:00 לא נשלחת פעמיים גם אם המשימה רצה פעמיים — dedupe_key
-- ייחודי לכל משתמש), ופיד ההתראות באפליקציה (הפעמון), עם read_at.
--
-- ההסכמה עצמה יושבת ב-users.preferences.nudges ולא כאן: ברירת המחדל כבויה,
-- והמשתמש מדליק במסך ההתראות או מכבה בוואטסאפ ("עצור").
--
-- RLS בלי policies, כמו שאר הטבלאות: רק השרת ניגש.
--
-- נתיב חזרה:
--   drop table if exists public.nudges;

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('water', 'breakfast', 'menu', 'praise', 'test')),
  dedupe_key text not null,
  channel text not null check (channel in ('whatsapp', 'app')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists nudges_user_created_idx on public.nudges (user_id, created_at desc);

alter table public.nudges enable row level security;

commit;
