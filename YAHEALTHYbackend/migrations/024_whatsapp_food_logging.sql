-- רישום ארוחות מהוואטסאפ: חיבור מאומת בין שיחה לחשבון, ואישור לפני כתיבה ליומן.
--
-- הלולאה: משתמש מתאר/מצלם ארוחה לעדי → המחשבון (calculate_meal_nutrition)
-- מחזיר ערכים → השרת (לא המודל) שומר הצעה ממתינה ושואל "לרשום ביומן? כן/לא"
-- → רק אחרי "כן" מפורש נכתבות שורות ל-food_logs עם source='whatsapp'.
--
-- טבלאות:
--   whatsapp_links            — קישור מאומת: טלפון ↔ חשבון. נוצר רק אחרי שהמשתמש
--                               שלח מהטלפון קוד חד-פעמי שהונפק לו באפליקציה.
--                               🔴 לא מקשרים לעולם לפי מספר טלפון בלבד (ראו 010:
--                               users.phone מגיע מטופס תשלום ולא אומת).
--   whatsapp_link_codes       — קודי חיבור. נשמר רק SHA-256 של הקוד; תוקף קצר,
--                               שימוש אחד, קוד חדש מבטל את הקודמים.
--   whatsapp_link_attempts    — ניסיונות קוד שנכשלו, לפי טלפון — להגבלת ניחושים.
--   whatsapp_conversation_state — לכל שיחה: מתי הוסלמה (דגל בריאות — אז לא רושמים
--                               ולא מזמינים לעולם), ומתי נשלחה הזמנה לחיבור.
--                               לא נשמר תוכן ההודעה ולא איזה דגל.
--   whatsapp_pending_logs     — הצעת רישום ממתינה לאישור. לכל טלפון לכל היותר
--                               אחת במצב pending (אינדקס ייחודי חלקי).
--   whatsapp_inbound_messages — מזהי הודעות WHAPI שכבר טופלו. משלוח כפול של
--                               ה-webhook לא מטופל פעמיים (ולא נרשם פעמיים).
--   food_logs.source/source_ref — מאיפה הגיעה השורה; source_ref ייחודי לכל משתמש
--                               הוא ההגנה השנייה מפני רישום כפול.
--   food_logs.food_id/quantity/unit — כמו ב-023 (if not exists — בטוח להריץ
--                               אחריה); קישור לפריט בקטלוג כשנמצאה התאמה.
--
-- מספרים: 022 מתכנן ארוחות, 023 רישום מזון מהיר; זו 024.
--
-- נתונים אישיים (טלפון, מה אכל): RLS מופעל בלי policies, גישה רק דרך
-- SUPABASE_SERVICE_ROLE_KEY (כמו whapi_* ו-share_cards).
--
-- נתיב חזרה:
--   drop table public.whatsapp_inbound_messages;
--   drop table public.whatsapp_pending_logs;
--   drop table public.whatsapp_conversation_state;
--   drop table public.whatsapp_link_attempts;
--   drop table public.whatsapp_link_codes;
--   drop table public.whatsapp_links;
--   drop index if exists public.food_logs_source_ref_key;
--   alter table public.food_logs drop column source, drop column source_ref;
--   (food_id/quantity/unit שייכות ל-023 — לא להסיר כאן)

create table if not exists public.whatsapp_links (
  user_id    uuid primary key references public.users(id) on delete cascade,
  -- E.164 בלי פלוס (utils/phone.js). מספר אחד — חשבון אחד.
  phone      text not null,
  linked_at  timestamptz not null default now()
);

create unique index if not exists whatsapp_links_phone_key
  on public.whatsapp_links (phone);

create table if not exists public.whatsapp_link_codes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  code_hash     text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  -- ביטול (קוד חדש הונפק / ניתוק) — לא אותו דבר כמו שימוש.
  revoked_at    timestamptz
);

create unique index if not exists whatsapp_link_codes_hash_key
  on public.whatsapp_link_codes (code_hash);

create index if not exists whatsapp_link_codes_user_idx
  on public.whatsapp_link_codes (user_id, created_at desc);

create table if not exists public.whatsapp_link_attempts (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  created_at   timestamptz not null default now()
);

create index if not exists whatsapp_link_attempts_phone_idx
  on public.whatsapp_link_attempts (phone, created_at desc);

create table if not exists public.whatsapp_conversation_state (
  phone            text primary key,
  escalated_at     timestamptz,
  link_invited_at  timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.whatsapp_pending_logs (
  id                uuid primary key default gen_random_uuid(),
  phone             text not null,
  user_id           uuid not null references public.users(id) on delete cascade,
  status            text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'superseded')),
  -- [{ botFoodId, catalogFoodId, nameHe, nameEn, grams, calories, proteinG, carbsG, fatG }]
  items             jsonb not null check (jsonb_typeof(items) = 'array'),
  meal_type         text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  log_date          date not null,
  tz                text not null,
  source_message_id text,
  food_log_ids      jsonb,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  resolved_at       timestamptz
);

create unique index if not exists whatsapp_pending_logs_one_live
  on public.whatsapp_pending_logs (phone)
  where status = 'pending';

create index if not exists whatsapp_pending_logs_user_idx
  on public.whatsapp_pending_logs (user_id, created_at desc);

create table if not exists public.whatsapp_inbound_messages (
  message_id   text primary key,
  received_at  timestamptz not null default now()
);

alter table public.food_logs
  add column if not exists source     text,
  add column if not exists source_ref text,
  add column if not exists quantity   numeric check (quantity is null or quantity >= 0),
  add column if not exists unit       text,
  add column if not exists food_id    uuid references public.foods(id) on delete set null;

create unique index if not exists food_logs_source_ref_key
  on public.food_logs (user_id, source_ref)
  where source_ref is not null;

alter table public.whatsapp_links              enable row level security;
alter table public.whatsapp_link_codes         enable row level security;
alter table public.whatsapp_link_attempts      enable row level security;
alter table public.whatsapp_conversation_state enable row level security;
alter table public.whatsapp_pending_logs       enable row level security;
alter table public.whatsapp_inbound_messages   enable row level security;
