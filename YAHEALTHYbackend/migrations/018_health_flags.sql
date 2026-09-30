-- דגל בריאותי שנשמר לאדם, לא להודעה.
--
-- עד עכשיו הדגל חי רק בהודעה שבה הופיע. מי שכתב "אני בהריון" אתמול וכתב
-- "יוני" היום קיבל את הצעת המחיר של ליווי עם יוני, כי שער יוני בדק רק את
-- ההודעה הנוכחית. והאפליקציה והערות בהזמנת פגישה לא נשמרו בכלל.
--
-- שורה לכל אדם שאי-פעם כתב משהו שמחייב אדם ולא תוכנה, מכל ערוץ:
--   subject — מספר טלפון מנורמל (972501234567) או user:<uuid>
--   source  — איפה זה נכתב: whapi-bot, whatsapp-inbox, app-coach, booking-notes
-- בלי תוכן ובלי המונח שנמצא: מה שאדם מספר על בריאותו לא נשמר כאן.
--
-- מי שיש לו שורה כאן לא מקבל הצעת מכירה אוטומטית. תזכורות הן עניין אחר:
-- הן נעצרות רק כל עוד יש פנייה פתוחה (hasOpenHealthEscalation).
--
-- RLS בלי policies, כמו שאר הטבלאות: רק השרת ניגש.
--
-- נתיב חזרה:
--   drop table if exists public.health_flags;

create table if not exists public.health_flags (
  subject text primary key,
  source text not null check (source in ('whapi-bot', 'whatsapp-inbox', 'app-coach', 'booking-notes', 'backfill')),
  first_flagged_at timestamptz not null default now(),
  last_flagged_at timestamptz not null default now()
);

alter table public.health_flags enable row level security;

-- מי שכבר הועבר לאדם לפני הטבלה הזו: כל הודעה שסומנה, גם אם כבר טופלה.
-- הבוט כותב ל-whatsapp_messages רק הודעות מסומנות (raw.source = whapi-bot),
-- ותיבת הוואטסאפ מסמנת escalated. תיבה שטופלה הופכת ל-answered ומאבדת את
-- הסימון, ולכן מה שנשמר ממנה הוא רק מה שעדיין פתוח. את מה שטופל, ואת
-- ההערות בהזמנות פגישה, משלים scripts/backfill-health-flags.js, שמריץ עליהם
-- את אותה רשימת דגלים (utils/health-flags.js) שאי אפשר להריץ ב-SQL.
-- בקבוצה chat_id הוא הקבוצה, והאדם הוא השולח.
insert into public.health_flags (subject, source, first_flagged_at, last_flagged_at)
select subject, 'backfill', min(at), max(at)
from (
  select regexp_replace(
           split_part(case when chat_id like '%@g.us' then coalesce(from_number, '') else chat_id end, '@', 1),
           '\D', '', 'g') as subject,
         coalesce(received_at, sent_at, now()) as at
  from public.whatsapp_messages
  where status = 'escalated' or raw->>'source' = 'whapi-bot'
) flagged
where subject <> ''
group by subject
on conflict (subject) do nothing;
