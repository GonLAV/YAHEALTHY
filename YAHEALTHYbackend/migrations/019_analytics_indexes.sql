-- אינדקסים ללוח הבקרה השיווקי (routes/analytics.js, staff בלבד).
--
-- כל endpoint שם מתחיל ב"מי נרשם / מי הופנה / מי השאיר אימייל בטווח
-- התאריכים", כלומר טווח על created_at. ל-users ול-referrals אין אינדקס כזה
-- (ל-marketing_leads יש, ממיגרציה 014), ובלעדיו כל טעינה של הדשבורד היא
-- סריקה מלאה של טבלת המשתמשים.
--
-- שאר הקריאות כבר מכוסות: לוגים לפי (user_id, date/created_at) ממיגרציה 001,
-- subscriptions לפי user_id ממיגרציה 005, referral_rewards לפי
-- (referral_id, user_id) ממיגרציה 013.
--
-- אין כאן שינוי נתונים ואין עמודות חדשות. בטוח להרצה חוזרת.
--
-- נתיב חזרה:
--   drop index if exists public.users_created_at_idx;
--   drop index if exists public.referrals_created_at_idx;

create index if not exists users_created_at_idx
  on public.users (created_at);

create index if not exists referrals_created_at_idx
  on public.referrals (created_at);
