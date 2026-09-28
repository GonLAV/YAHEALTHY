-- אינדקסים לקריאות המרוכזות של ה-schedulers.
--
-- ריצת ה-lifecycle השעתית (utils/lifecycle-runner.js) ותזכורות ה-push כל
-- חמש דקות (utils/push.js) קוראות עכשיו עמוד של 200 משתמשים בכל פעם:
--   select ... from <logs> where user_id in (...) order by user_id, created_at desc, id
-- ולא שאילתה לכל משתמש. כדי שהסדר יגיע ישר מהאינדקס (בלי מיון מחדש לכל
-- עמוד של range()) צריך (user_id, created_at desc). ל-food_logs,
-- weight_logs, weight_goals ו-surveys יש כבר אינדקס כזה ממיגרציה 001;
-- ל-hydration_logs ול-sleep_logs יש רק (user_id, date desc).
--
-- תזכורות ה-push עוברות על מי שהפעיל תזכורות בדפים לפי user_id
-- (where enabled order by user_id, keyset). האינדקס החלקי ממיגרציה 020 הוא
-- על (enabled) בלבד ולא נותן את הסדר; זה החלקי על user_id כן.
--
-- שאר הקריאות כבר מכוסות: lifecycle_sends לפי (recipient_type,
-- recipient_id, created_at desc) ממיגרציה 018, push_subscriptions לפי user_id
-- ממיגרציה 020, notification_preferences/users/marketing_leads לפי המפתח
-- הראשי.
--
-- תלויה ב-020 (push_reminder_settings) — להריץ אחריה.
-- אין כאן שינוי נתונים ואין עמודות חדשות. בטוח להרצה חוזרת.
-- בטבלאות לוגים גדולות אפשר להריץ כל שורה בנפרד עם
-- "create index concurrently if not exists ..." (מחוץ לטרנזקציה) כדי לא
-- לחסום כתיבות בזמן הבנייה.
--
-- נתיב חזרה:
--   drop index if exists public.hydration_logs_user_created_idx;
--   drop index if exists public.sleep_logs_user_created_idx;
--   drop index if exists public.push_reminder_settings_enabled_user_idx;

create index if not exists hydration_logs_user_created_idx
  on public.hydration_logs (user_id, created_at desc);

create index if not exists sleep_logs_user_created_idx
  on public.sleep_logs (user_id, created_at desc);

create index if not exists push_reminder_settings_enabled_user_idx
  on public.push_reminder_settings (user_id)
  where enabled;
