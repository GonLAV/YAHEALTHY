-- העמודות שהקוד כותב אליהן ולא היו קיימות.
--
-- 🔴 התקלה שזה סוגר: חמישה נתיבי כתיבה שולחים שדות שאין להם עמודה בסכימה.
-- ב-ALLOW_MEMORY_DB השורה היא אובייקט JS רגיל — utils/database.js עושה
-- `{...data}` ומקבל כל שדה — ולכן הכל עבד בפיתוח. Supabase דוחה עמודה לא
-- מוכרת, ולכן אותן כתיבות נכשלו בייצור בלבד.
--
-- זו הסיבה שהן לא נתפסו: מצב הזיכרון לא מדמה את הסכימה, הוא מתעלם ממנה.
--
-- החמורה מכולן היא surveys.age. POST /api/surveys שולח age, ובלעדיה יצירת
-- סקר נכשלת לגמרי בייצור — וטבלת הסקרים היא המקום היחיד שממנו מגיע יעד
-- קלורי. כלומר: אי אפשר היה להגדיר יעד, ולכן הטבעת במסך הבית נפלה תמיד
-- ל-2000 שהפרונטאנד המציא.
--
-- כל העמודות nullable בכוונה: שורות שנכתבו לפני המיגרציה תקפות בדיוק
-- כפי שהן, ואין כאן ערך ברירת מחדל שמתיימר לדעת משהו על מי שכבר רשום.
--
-- נתיב חזרה:
--   alter table public.surveys           drop column age;
--   alter table public.readiness_scores  drop column level, drop column recommendations;
--   alter table public.fasting_windows   drop column tips;
--   alter table public.sleep_logs        drop column notes;
--   alter table public.hydration_logs    drop column source;

-- index.js: POST /api/surveys שולח age, ו-calculateBodyFat/calculateBMR/
-- calculateSleepTarget כולם מקבלים אותו. בלי העמודה, הסקר כולו נופל.
alter table public.surveys
  add column if not exists age integer;

-- index.js: POST /api/readiness שולח level ו-recommendations.
alter table public.readiness_scores
  add column if not exists level text,
  add column if not exists recommendations jsonb;

-- index.js: POST /api/fasting-windows שולח tips.
alter table public.fasting_windows
  add column if not exists tips jsonb;

-- index.js: POST /api/sleep-logs שולח notes כשהמשתמש/ת מילא/ה אותו.
alter table public.sleep_logs
  add column if not exists notes text;

-- index.js: POST /api/hydration-logs שולח source. undefined נעלם בסריאליזציה
-- ל-JSON, ולכן זה נכשל רק כשבאמת נשלח ערך — הסוג הגרוע של באג לתפוס.
alter table public.hydration_logs
  add column if not exists source text;
