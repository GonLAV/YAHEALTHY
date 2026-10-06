-- whapi_handoffs — כשעדי עוצרת ומעבירה לאדם, זה מה שנשאר מאחור.
--
-- עד עכשיו עדי כתבה ללקוחה "אעביר את הפנייה" בלי שום מנגנון מאחורי זה —
-- הבטחה שאף אחד לא קיבל. הטבלה הזו היא הרשומה: מי, למה, עד כמה דחוף,
-- ומתי מישהו מהצוות סגר את זה. הכלי request_human_handoff כותב אליה,
-- והצוות קורא ממנה דרך /api/whapi/handoffs (is_staff בלבד).
--
-- לכל היותר פנייה פתוחה אחת לכל טלפון: האינדקס החלקי מבטיח ששתי הודעות
-- רצופות לא יפתחו שתי פניות ושני מבזקים לצוות.
--
-- 🩺 summary יכול להכיל מידע בריאותי שהלקוחה שיתפה. RLS מופעל בלי
-- policies, כמו שאר טבלאות whapi — רק השרת (service role) ניגש.
--
-- Rollback:
--   drop table if exists whapi_handoffs;

create table if not exists whapi_handoffs (
  id uuid primary key default gen_random_uuid(),
  phone text not null references whapi_conversations(phone) on delete cascade,
  active_bot text not null,
  category text not null check (category in (
    'medical_flag', 'minor', 'distress', 'urgent_symptom',
    'below_floor', 'billing', 'complaint', 'other'
  )),
  summary text not null,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'resolved')),
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null
);

create unique index if not exists whapi_handoffs_one_open_per_phone_idx
  on whapi_handoffs (phone) where status = 'open';

create index if not exists whapi_handoffs_status_created_idx
  on whapi_handoffs (status, urgent desc, created_at);

alter table whapi_handoffs enable row level security;
