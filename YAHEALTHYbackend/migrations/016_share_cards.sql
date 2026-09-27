-- share_cards — קישורי "שתפו את השבוע שלי" (routes/share.js).
--
-- כל שורה היא תמונת מצב (snapshot) קפואה של שבוע, שעברה סינון פרטיות לפני
-- שנשמרה: שם פרטי בלבד (ורק אם הבעלים השאיר אותו), בלי אימייל, בלי מזהה
-- משתמש, ובלי מספרי משקל אלא אם הבעלים סימן זאת — וגם אז רק השינוי השבועי.
-- ה-snapshot נבנה בשרת מהנתונים, לעולם לא ממספרים שהלקוח שולח.
--
-- הטוקן עצמו לא נשמר: רק SHA-256 שלו (token_hash). דליפה של הטבלה לא
-- מחלקת קישורים עובדים. 192 ביט אקראיים — ניחוש אינו מעשי.
--
-- תוקף: expires_at (30 יום). ביטול על ידי הבעלים: revoked_at (והתמונה נמחקת).
--
-- image_png — רינדור PNG של הכרטיס שהדפדפן של הבעלים מעלה, כדי ש-og:image
-- יהיה PNG (וואטסאפ/פייסבוק מתעלמים מ-SVG). base64 ב-text ולא bytea: כך
-- supabase-js מחזיר אותו בלי המרת hex. מוגבל ל-800KB ולמידות 1200×630 בקוד.
--
-- נתיב חזרה:
--   drop table public.share_cards;

create table if not exists public.share_cards (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null,
  user_id     uuid not null references public.users(id) on delete cascade,
  snapshot    jsonb not null,
  ref_code    text,
  lang        text not null default 'he' check (lang in ('he', 'en')),
  image_png   text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);

create unique index if not exists share_cards_token_hash_key
  on public.share_cards (token_hash);

-- מגבלת יצירה יומית לכל משתמש (countCreatedSince).
create index if not exists share_cards_user_created_idx
  on public.share_cards (user_id, created_at desc);

-- 🔴 RLS מופעל בלי policies, כמו שאר הטבלאות; הגישה דרך השרת בלבד.
alter table public.share_cards enable row level security;
