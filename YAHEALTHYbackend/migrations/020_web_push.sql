-- Web Push: מנויי דפדפן להתראות, והגדרות תזכורות למשתמש.
--
-- שתי טבלאות:
--   push_subscriptions      — דפדפן אחד במכשיר אחד. ה-endpoint הוא הזהות שלו
--                             וייחודי: דפדפן שעבר לחשבון אחר עובר איתו, ולא
--                             ממשיך לקבל התראות של החשבון הקודם.
--                             מנוי שה-push service מחזיר עליו 404/410 נמחק
--                             (utils/push.js).
--   push_reminder_settings  — שורה אחת למשתמש: אילו תזכורות הוא רוצה (מים,
--                             רישום ארוחה, רצף בסיכון), שעות שקטות ואזור זמן.
--                             state — מתי כל תזכורת נשלחה לאחרונה; רק
--                             ה-scheduler כותב אותו.
--
-- מספרים 013–019 שמורים לעבודה אחרת; זו 020.
--
-- 🔴 p256dh/auth מאפשרים לשלוח התראות לדפדפן הזה. RLS מופעל בלי policies,
-- והגישה רק דרך SUPABASE_SERVICE_ROLE_KEY (כמו marketing_leads וטבלאות whapi).
--
-- נתיב חזרה:
--   drop table public.push_reminder_settings;
--   drop table public.push_subscriptions;

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,

  -- כשלונות רצופים שאינם 404/410 (למשל 5xx זמני). מתאפס בהצלחה.
  failure_count   integer not null default 0,
  last_success_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table if not exists public.push_reminder_settings (
  user_id    uuid primary key references public.users(id) on delete cascade,
  enabled    boolean not null default false,

  -- IANA, למשל Asia/Jerusalem. "עכשיו" של התזכורות נמדד בו.
  tz         text not null default 'Asia/Jerusalem',
  lang       text not null default 'he' check (lang in ('he', 'en')),

  -- { quietHours: {start,end}, water: {enabled,intervalMinutes,start,end},
  --   meal: {enabled,time}, streak: {enabled,time} } — מאומת ב-routes/push.js.
  settings   jsonb not null default '{}'::jsonb,
  state      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ה-scheduler קורא רק את מי שהפעיל תזכורות.
create index if not exists push_reminder_settings_enabled_idx
  on public.push_reminder_settings (enabled)
  where enabled;

alter table public.push_subscriptions     enable row level security;
alter table public.push_reminder_settings enable row level security;
