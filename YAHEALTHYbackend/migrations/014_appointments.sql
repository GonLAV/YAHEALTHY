-- תורים: אבחון (פיזי / אונליין, חינם) ופגישה בסופר (בתשלום).
--
-- יומן הגוגל של המאבחנת הוא מקור האמת למה שתפוס. הטבלה הזו קיימת בשביל מה
-- שגוגל לא נותן: רשומה שלנו של מי קבע ומתי, ומנעול. שני אנשים שלוחצים על
-- אותה שעה באותה שנייה — ה-unique index כאן מכריע ביניהם לפני שמשהו נכתב
-- ליומן.
--
-- פגישה בסופר נקבעת לפני התשלום ונשמרת כ-pending_payment. השעה מוחזקת לזמן
-- קצוב (BOOKING_HOLD_MINUTES בקוד); החזקה שפגה משוחררת ל-cancelled לפני כל
-- הזמנה חדשה. רק callback מאושר של PayPlus הופך אותה ל-booked ויוצר אירוע
-- ביומן — תור שלא שולם לא מגיע ליומן שלה.
--
-- פרטים אישיים: שם, טלפון, ולפעמים הערה על מצב בריאותי. לכן RLS פעיל בלי
-- policies, כמו whapi_*: רק השרת, עם service role, קורא וכותב.
--
-- נתיב חזרה:
--   drop table if exists public.appointments;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('physical', 'online', 'supermarket')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'booked'
    check (status in ('pending_payment', 'booked', 'cancelled')),
  name text not null,
  phone text not null,
  email text,
  -- לפגישה בסופר: איזה סופר / איזה אזור. הלקוח בוחר, לא אנחנו.
  location text,
  notes text,
  amount numeric,
  google_event_id text,
  meet_link text,
  -- The customer's link to cancel their own booking. It unlocks exactly one
  -- action on exactly one row, which is why it sits here in plain text: anyone
  -- who can read this table can already do more than it allows.
  cancel_token text,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'staff', 'expired')),
  -- Set when something needs a person, comma-separated when there is more than
  -- one: underpaid, slot_taken, calendar_failed,
  -- refund_requested, calendar_cleanup. The staff screen lists these;
  -- clearing it is how a person marks the matter as settled.
  needs_attention text,
  -- The evening-before WhatsApp reminder (routes/cron.js). Set once sent, and
  -- cleared on a reschedule so the new time gets its own reminder.
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- שעת התחלה אחת לכל תור חי. מבוטל לא תופס את השעה; ממתין-לתשלום כן.
create unique index if not exists appointments_one_per_start
  on public.appointments (start_at)
  where status in ('booked', 'pending_payment');

create index if not exists appointments_start_idx on public.appointments (start_at);
create index if not exists appointments_attention_idx
  on public.appointments (created_at) where needs_attention is not null;

alter table public.appointments enable row level security;
