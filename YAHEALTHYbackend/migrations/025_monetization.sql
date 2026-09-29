-- יסודות המונטיזציה: קטלוג מסלולים, הרשאות, תגמולי הפניה שמוחלים בפועל.
--
-- כבוי כברירת מחדל: שום דבר כאן לא גובה כסף ולא נועל פיצ'ר. החיוב נפתח רק עם
-- CHECKOUT_ENABLED=true + CANCELLATION_POLICY_URL, והנעילה רק עם
-- ENTITLEMENTS_ENFORCED=true (ראו utils/checkout.js, utils/entitlements.js).
--
--   users.premium_until            — עד מתי יש למשתמש פרימיום מימי הפניה.
--                                    ימי פרימיום לא נכתבים ל-subscriptions: שם
--                                    רק מה ששולם, וזה מה ששלב "משלמים"
--                                    במשפך סופר.
--   referral_rewards.applied_at    — מתי התגמול הוחל על premium_until. השורה
--                                    עוברת earned → applied בעדכון מותנה, כך
--                                    שתגמול לא מוחל פעמיים.
--   whatsapp_chef_trials           — כמה הודעות חינם עם יוני נוצלו, לפי מספר
--                                    וואטסאפ (אנשים כותבים לפני שיש להם חשבון).
--   subscriptions (status, ends_at) — אינדקס לקריאות "מסתיים בקרוב" (תזכורת
--                                    חידוש, מסך בריאות המערכת).
--
-- תלויה ב-005 (subscriptions) וב-013 (referral_rewards). בטוחה להרצה חוזרת.
--
-- נתיב חזרה:
--   drop index if exists public.subscriptions_active_ends_idx;
--   drop table if exists public.whatsapp_chef_trials;
--   alter table public.referral_rewards drop column if exists applied_at;
--   alter table public.users drop column if exists premium_until;

alter table public.users
  add column if not exists premium_until timestamptz;

alter table public.referral_rewards
  add column if not exists applied_at timestamptz;

create table if not exists public.whatsapp_chef_trials (
  -- כפי שמגיע מ-WHAPI (chat_id), כמו whapi_conversations.phone.
  phone      text primary key,
  used       integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_active_ends_idx
  on public.subscriptions (ends_at)
  where status = 'active';

-- 🔴 מספר טלפון הוא מידע אישי. RLS מופעל, בלי policies — גישה רק דרך
-- SUPABASE_SERVICE_ROLE_KEY, כמו whapi_conversations.
alter table public.whatsapp_chef_trials enable row level security;
