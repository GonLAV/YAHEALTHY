-- דיוור מחזור-חיים (lifecycle): טיפוח לידים, onboarding, רצף בסיכון, win-back.
--
-- שלושה דברים:
--   notification_preferences — העדפות דיוור לכל משתמש: מיילים של השירות,
--                              דיוור שיווקי (הסכמה מפורשת, חוק התקשורת 30א),
--                              וואטסאפ (opt-in בלבד), שפה ואזור זמן.
--   lifecycle_sends          — יומן שליחה. שורה אחת לכל (נמען, קמפיין, תקופה).
--                              האינדקס הייחודי הוא מה שמונע שליחה כפולה —
--                              גם בין הפעלות מחדש של השרת וגם כששתי ריצות
--                              של ה-cron חופפות: השורה נתפסת (status='pending')
--                              לפני השליחה, ורק מי שהכניס אותה שולח.
--   marketing_leads.unsubscribed_at — ליד שביקש הסרה לא מקבל עוד דיוור.
--
-- recipient_id הוא users.id או marketing_leads.id לפי recipient_type, ולכן
-- אין עליו foreign key. מחיקת משתמש/ליד מוחקת גם את השורות שלו בקוד
-- (utils/database.js), ומחיקת ליד לפי בקשה (POST /api/marketing/leads/forget)
-- מוחקת את שתיהן.
--
-- נתונים אישיים: RLS פעיל בלי policies, גישה רק דרך SUPABASE_SERVICE_ROLE_KEY.
--
-- נתיב חזרה:
--   drop table public.lifecycle_sends;
--   drop table public.notification_preferences;
--   alter table public.marketing_leads drop column unsubscribed_at;

create table if not exists public.notification_preferences (
  user_id              uuid primary key references public.users(id) on delete cascade,
  -- מיילים של השירות (ברוכים הבאים, טיפים, תזכורת רצף). ברירת מחדל: כן.
  email_lifecycle      boolean not null default true,
  -- דיוור שיווקי (win-back). ברירת מחדל: לא — רק בהסכמה מפורשת.
  marketing_email      boolean not null default false,
  marketing_consent_at timestamptz,
  -- וואטסאפ: opt-in בלבד.
  whatsapp             boolean not null default false,
  whatsapp_consent_at  timestamptz,
  lang                 text check (lang in ('he', 'en')),
  timezone             text,
  unsubscribed_at      timestamptz,
  updated_at           timestamptz not null default now()
);

create table if not exists public.lifecycle_sends (
  id             uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('user', 'lead')),
  recipient_id   uuid not null,
  campaign       text not null,
  step           text not null,
  -- מפתח התקופה: שם השלב לשלבים חד-פעמיים ("day2"), תאריך מקומי לתזכורת
  -- רצף ("2026-09-27"), או "d7:<תאריך פעילות אחרון>" ל-win-back.
  period_key     text not null,
  channel        text not null check (channel in ('email', 'whatsapp')),
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error          text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  opened_at      timestamptz,
  converted_at   timestamptz
);

create unique index if not exists lifecycle_sends_once_key
  on public.lifecycle_sends (recipient_type, recipient_id, campaign, period_key);

create index if not exists lifecycle_sends_recipient_idx
  on public.lifecycle_sends (recipient_type, recipient_id, created_at desc);

create index if not exists lifecycle_sends_campaign_idx
  on public.lifecycle_sends (campaign, status);

alter table public.marketing_leads
  add column if not exists unsubscribed_at timestamptz;

alter table public.notification_preferences enable row level security;
alter table public.lifecycle_sends          enable row level security;
