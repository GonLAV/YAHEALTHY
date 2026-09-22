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
