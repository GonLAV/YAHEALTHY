-- רישום מזון מהיר: כמות ויחידה, קישור למאגר המזון, ארוחות שמורות.
--
-- food_logs:
--   quantity / unit — "רשום שוב" מציע את הכמות האחרונה, אז היא צריכה להישמר.
--     ה-frontend שלח אותן תמיד, וה-API זרק אותן בשקט.
--   food_id — כשהרישום הגיע מחיפוש במאגר (public.foods), הערכים חושבו שם
--     בשרת; המזהה מאפשר לחשב שוב לכמות אחרת ולקבץ "הכי נפוצים" לפי מזון
--     ולא לפי איות. on delete set null: מחיקת שורה מהמאגר לא מוחקת היסטוריה.
--   updated_at — updateFoodLog (utils/database.js) כבר כותב את העמודה הזו,
--     ובלעדיה PUT/PATCH על רישום נכשל ב-Supabase.
--
-- food_log_templates (מועדפים):
--   kind — 'food' (מזון בודד עם כוכב) או 'meal' (ארוחה שמורה, "הבוקר הרגיל
--     שלי"). items — לארוחה בלבד: מערך JSON של הפריטים, כל אחד עם ערכיו,
--     כך שרישום בלחיצה אחת לא תלוי במצב המאגר באותו רגע.
--
-- אינדקס חלקי על food_id: עמודת FK חייבת אינדקס כדי ש-on delete set null
-- לא יסרוק את כל food_logs; רוב השורות בלי food_id ולכן חלקי.
-- ההצעות (GET /api/food-logs/suggestions) קוראות 90 ימים אחרונים לפי
-- (user_id, created_at desc) — האינדקס קיים ממיגרציה 001.
--
-- תלויה ב-001 (food_logs, food_log_templates) וב-007 (foods).
-- רק הוספת עמודות nullable / עם ברירת מחדל קבועה — בלי שכתוב טבלה. בטוח
-- להרצה חוזרת.
--
-- נתיב חזרה:
--   drop index if exists public.food_logs_food_id_idx;
--   drop index if exists public.food_log_templates_food_id_idx;
--   alter table public.food_logs
--     drop column if exists quantity, drop column if exists unit,
--     drop column if exists food_id, drop column if exists updated_at;
--   alter table public.food_log_templates
--     drop column if exists kind, drop column if exists items,
--     drop column if exists quantity, drop column if exists unit,
--     drop column if exists food_id, drop column if exists updated_at;

alter table public.food_logs
  add column if not exists quantity   numeric check (quantity is null or quantity >= 0),
  add column if not exists unit       text,
  add column if not exists food_id    uuid references public.foods(id) on delete set null,
  add column if not exists updated_at timestamptz;

alter table public.food_log_templates
  add column if not exists kind       text not null default 'food' check (kind in ('food', 'meal')),
  add column if not exists items      jsonb check (items is null or jsonb_typeof(items) = 'array'),
  add column if not exists quantity   numeric check (quantity is null or quantity >= 0),
  add column if not exists unit       text,
  add column if not exists food_id    uuid references public.foods(id) on delete set null,
  add column if not exists updated_at timestamptz;

create index if not exists food_logs_food_id_idx
  on public.food_logs (food_id)
  where food_id is not null;

create index if not exists food_log_templates_food_id_idx
  on public.food_log_templates (food_id)
  where food_id is not null;
