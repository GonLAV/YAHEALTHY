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
