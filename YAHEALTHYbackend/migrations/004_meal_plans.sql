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
