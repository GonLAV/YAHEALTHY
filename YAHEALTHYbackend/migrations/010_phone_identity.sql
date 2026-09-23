-- קישור בין מספר טלפון לחשבון — התנאי לגבייה על יוני.
--
-- הבעיה: וואטסאפ מזהה אנשים לפי מספר טלפון, ומנויים רשומים על חשבון עם
-- אימייל. לא היה ביניהם שום קשר, ולכן השרת לא ידע מי כותב לו — ולא יכול
-- היה לדעת אם שילם.
--
-- 🔴 מספר טלפון הוא לא הוכחת זהות. הוא מספיק כדי להחליט מי מקבל בוט
-- בישול; הוא לא מספיק לשום דבר חמור מזה. אין כאן מפתח לחשבון.
--
-- נתיב חזרה:
--   alter table public.users drop column phone;
--   alter table whapi_conversations drop column user_id;

-- E.164 בלי הפלוס: 972501234567. צורה אחת בלבד, כי השוואה בין
-- "050-123-4567" ל-"+972501234567" היא באג שמחכה לקרות.
alter table public.users
  add column if not exists phone text;

-- ייחודי, אבל רק על מה שקיים: שני חשבונות על אותו מספר הם תמיד תקלה,
-- ורוב החשבונות לא ימסרו מספר בכלל.
create unique index if not exists users_phone_key
  on public.users (phone)
  where phone is not null;

-- מי מדבר איתנו בוואטסאפ, אם ידוע. null = מספר שלא זוהה, וזה מצב
-- לגיטימי: אדם יכול לכתוב לפני שקנה.
alter table whapi_conversations
  add column if not exists user_id uuid references public.users(id) on delete set null;

create index if not exists whapi_conversations_user_idx
  on whapi_conversations (user_id);
