-- אשף הכניסה (onboarding) — מתי המשתמש סיים אותו.
--
-- users.onboarding_completed_at — נכתב פעם אחת, כשהמשתמש מסיים או מדלג על
--                                 האשף (POST /api/onboarding). null = עוד לא.
--
-- כל שאר מה שהאשף אוסף נשמר במקומות הקיימים: users.preferences (מטרה,
-- העדפות תזונה, יעדים יומיים, תזכורות), weight_goals, hydration_logs.
-- משתמשים ותיקים עם העדפות/יעדים/תיעודים נחשבים כמי שסיימו גם בלי העמודה
-- (utils/onboarding.js), כך שאין צורך ב-backfill.
--
-- נתיב חזרה:
--   alter table public.users drop column onboarding_completed_at;

alter table public.users
  add column if not exists onboarding_completed_at timestamptz;
