-- תוכנית הפניות (referrals) וייחוס הרשמה (attribution).
--
-- ארבעה דברים:
--   users.referral_code   — קוד קצר לכל משתמש. נוצר בעצלות, בפעם הראשונה
--                           שמישהו מבקש אותו (GET /api/referrals/me).
--   users.attribution     — מאיפה הגיע המשתמש: utm_*, landing_path, referrer.
--                           first-touch, נשמר פעם אחת בהרשמה.
--   referrals             — מי הזמין את מי. שורה אחת לכל מוזמן.
--   referral_rewards      — מה ההפניה הרוויחה (ימי פרימיום, לפי
--                           REFERRAL_REWARDS ב-utils/constants.js). נרשם בלבד —
--                           שום דבר כאן לא נוגע בחיוב.
--
-- הייחודיות נאכפת באילוצים ולא ב-if: שתי הרשמות מקבילות עם אותו קוד
-- לא יכולות לייצר שתי הפניות לאותו מוזמן או שני תגמולים לאותה הפניה.
--
-- נתיב חזרה:
--   drop table public.referral_rewards;
--   drop table public.referrals;
--   alter table public.users drop column referral_code,
--                            drop column attribution,
--                            drop column referred_by;

alter table public.users
  add column if not exists referral_code text,
  add column if not exists attribution   jsonb,
  add column if not exists referred_by   uuid references public.users(id) on delete set null;

-- ייחודי רק על מה שקיים: רוב המשתמשים לא יבקשו קוד לעולם.
create unique index if not exists users_referral_code_key
  on public.users (referral_code)
  where referral_code is not null;

create table if not exists public.referrals (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id) on delete cascade,
  referee_id  uuid not null references public.users(id) on delete cascade,

  -- הקוד כפי שהיה בזמן ההרשמה, להיסטוריה.
  code        text not null,

  -- 'signed_up' — נרשם. המרה לתשלום נקראת מטבלת subscriptions ולא נשמרת כאן.
  status      text not null default 'signed_up',
  created_at  timestamptz not null default now(),

  -- אדם לא מפנה את עצמו.
  constraint referrals_not_self check (referrer_id <> referee_id)
);

-- מוזמן אחד — מפנה אחד. ההפניה הראשונה מנצחת ולא מוחלפת.
create unique index if not exists referrals_referee_key
  on public.referrals (referee_id);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id, created_at desc);

create table if not exists public.referral_rewards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,

  -- תגמול שהורווח נשאר גם אם המוזמן מחק את החשבון.
  referral_id uuid references public.referrals(id) on delete set null,

  -- 'premium_days'
  type        text not null,
  amount      integer not null check (amount >= 0),

  -- 'referee_signup'
  reason      text not null,

  -- 'earned' — נרשם · 'applied' — הוחל על מנוי (בעתיד) · 'revoked'
  status      text not null default 'earned',
  created_at  timestamptz not null default now()
);

-- תגמול אחד לכל הפניה לכל משתמש: handler שרץ פעמיים לא משלם פעמיים.
create unique index if not exists referral_rewards_once_key
  on public.referral_rewards (referral_id, user_id);

create index if not exists referral_rewards_user_idx
  on public.referral_rewards (user_id, created_at desc);

-- 🔴 מי הזמין את מי הוא מידע אישי. RLS מופעל, בלי policies, כמו שאר הטבלאות.
alter table public.referrals        enable row level security;
alter table public.referral_rewards enable row level security;
