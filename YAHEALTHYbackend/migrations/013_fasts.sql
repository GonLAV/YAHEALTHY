-- fasts — טיימר צום לסירוגין: שורה לכל צום שהתחיל.
--
-- ended_at הוא NULL כל עוד הצום רץ. האינדקס הייחודי החלקי מבטיח
-- לכל היותר צום פעיל אחד למשתמש, ו-routes/fasts.js נשען עליו
-- (23505 → 409). בלי האינדקס, שתי לחיצות "התחל" במקביל יפתחו שני צומות.
--
-- RLS מופעל בלי policies, כמו שאר הטבלאות (ראו ALL.sql).

create table if not exists public.fasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  target_hours numeric(5,2) not null check (target_hours >= 8 and target_hours <= 72),
  duration_hours numeric(6,2),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists fasts_user_started_idx
  on public.fasts (user_id, started_at desc);

create unique index if not exists fasts_one_active_per_user_idx
  on public.fasts (user_id) where ended_at is null;

alter table public.fasts enable row level security;
