-- marketing_leads — מי שהשאיר אימייל בדף הנחיתה.
--
-- שורה אחת לכל כתובת. האימייל נשמר כבר מנורמל (trim + אותיות קטנות) על ידי
-- routes/marketing.js, והאינדקס הייחודי הוא שמכריע אם הגשה חדשה או חוזרת —
-- לא if בקוד. הגשה חוזרת לא דורסת את ה-source/utm_* של הביקור הראשון;
-- היא רק מעדכנת last_submitted_at ו-submissions.
--
-- consent_at: חוק התקשורת, סעיף 30א — דיוור שיווקי דורש הסכמה מפורשת.
-- ה-API מסרב לכל הגשה בלי תיבת הסכמה מסומנת, והזמן נשמר כאן כראיה.
--
-- אלה נתונים אישיים של אנשים שעוד אינם לקוחות: RLS פעיל בלי policies,
-- והגישה היא רק דרך SUPABASE_SERVICE_ROLE_KEY (כמו טבלאות ה-whapi).
-- קריאה דרך ה-API: GET /api/marketing/leads — staff בלבד.
--
-- נתיב חזרה: drop table public.marketing_leads;

create table if not exists public.marketing_leads (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  name              text,
  lang              text not null default 'he' check (lang in ('he', 'en')),

  -- ייחוס first-touch: מאיפה הגיע הביקור הראשון.
  source            text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,

  consent_at        timestamptz not null,
  submissions       integer not null default 1,
  created_at        timestamptz not null default now(),
  last_submitted_at timestamptz not null default now(),

  -- הקוד שומר באותיות קטנות; האילוץ מוודא שזה נשאר כך גם בהכנסה ידנית.
  constraint marketing_leads_email_normalized check (email = lower(btrim(email)))
);

create unique index if not exists marketing_leads_email_key
  on public.marketing_leads (email);

create index if not exists marketing_leads_created_idx
  on public.marketing_leads (created_at desc);

alter table public.marketing_leads enable row level security;
