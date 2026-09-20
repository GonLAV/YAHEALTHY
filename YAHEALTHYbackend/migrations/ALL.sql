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

  -- 'base' — מסלול בסיס · 'chef' — מסלול עם שף אנושי (ADR-007)
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
