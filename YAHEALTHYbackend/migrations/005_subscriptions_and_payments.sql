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
