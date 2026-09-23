-- is_staff — מי מורשה לקרוא הודעות של לקוחות.
--
-- 🔴 התקלה שזה סוגר: `/api/whatsapp/pending` היה מוגן ב-authMiddleware בלבד,
-- ולא קיים בפרויקט שום מודל תפקידים. כלומר **כל מי שנרשם** — וההרשמה
-- פתוחה ולא מאומתת — יכול היה לקרוא את כל ההודעות הנכנסות במלואן, כולל
-- אלה שסומנו `escalated`, שהן בהגדרה הודעות שבהן אדם כתב "אני בהריון",
-- "יש לי סוכרת" או "הפרעת אכילה", עם מספר הטלפון שלו לצידן.
--
-- אימות מול הרשאה: השאלה "מי אתה" נענתה. השאלה "ומה מותר לך" לא נשאלה.
--
-- ברירת המחדל היא false, כלומר אף אחד. הענקה נעשית ידנית ב-SQL בכוונה:
-- אין endpoint שמעניק אותה, כי endpoint כזה הוא עוד משטח התקפה על בדיוק
-- אותו מידע.
--
--   update public.users set is_staff = true where email = 'someone@example.com';
--
-- נתיב חזרה: alter table public.users drop column is_staff;

alter table public.users
  add column if not exists is_staff boolean not null default false;

create index if not exists users_staff_idx
  on public.users (is_staff) where is_staff = true;
