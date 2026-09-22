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
  state         text not null default raw,

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
