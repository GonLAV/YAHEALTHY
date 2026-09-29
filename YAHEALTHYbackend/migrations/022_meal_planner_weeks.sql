-- meal_planner_weeks — מתכנן הארוחות השבועי (7 ימים × בוקר/צהריים/ערב/נשנוש)
-- ורשימת הקניות שנגזרת ממנו.
--
-- שורה אחת למשתמש לכל שבוע (week_start = יום ראשון של השבוע). התוכנית
-- עצמה נשמרת כ-jsonb: לכל ארוחה — מזהה התבנית, האם היא נעולה, והכמויות
-- בגרמים של כל רכיב. הערכים התזונתיים לא נשמרים כאן בכוונה: הם מחושבים
-- בכל קריאה מ-data/food-database.json ו-data/foods-usda.json
-- (utils/meal-planner.js), כך שתיקון ערך במאגר מתקן גם תוכניות קיימות.
--
-- checked_items — מפתחות הפריטים שסומנו ברשימת הקניות. הלקוח שולח את
-- הרשימה המלאה (last write wins), כך שאין read-modify-write בשרת.
--
-- זה לא מחליף את meal_plans (004): שם מתכון אחד לכל משבצת, כאן ארוחה
-- מורכבת עם כמויות שמכוונות ליעדים האישיים.
--
-- 🔴 תוכנית תזונה אישית (כולל אלרגיות שנגזרות ממנה) היא מידע בריאותי.
-- RLS מופעל בלי policies; הגישה רק דרך SUPABASE_SERVICE_ROLE_KEY — ה-backend
-- הוא השוער, כמו push_subscriptions.
--
-- נתיב חזרה:
--   drop table public.meal_planner_weeks;

create table if not exists public.meal_planner_weeks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  week_start    date not null,

  -- ה-seed שממנו נבנתה התוכנית; החלפה/יצירה מחדש מקדמים אותו, כך
  -- שאותה פעולה על אותה תוכנית תמיד נותנת אותה תוצאה.
  seed          bigint not null default 1,

  -- { version, targets, days: [{ date, meals: [{ slot, templateId, locked,
  --   items: [{ ing, grams }] }] }] } — מאומת ב-routes/meal-planner.js.
  plan          jsonb not null,
  checked_items text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- שבוע אחד לכל משתמש. גם האינדקס של הקריאות (user_id, week_start).
  constraint meal_planner_weeks_user_week_key unique (user_id, week_start)
);

alter table public.meal_planner_weeks enable row level security;
