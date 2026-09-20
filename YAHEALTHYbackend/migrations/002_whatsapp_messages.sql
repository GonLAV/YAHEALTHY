-- WhatsApp — הודעות נכנסות מ-WHAPI
-- נגזר מצורת ה-webhook האמיתית שנצפתה ב-20/09/2026.
-- נתיב חזרה: drop table public.whatsapp_messages;

create table if not exists public.whatsapp_messages (
  -- המזהה של WHAPI. משמש כמפתח ראשי כדי שמסירה כפולה של אותו
  -- webhook לא תיצור שתי שורות — WHAPI שולח שוב על כישלון.
  id          text primary key,
  chat_id     text not null,
  from_number text,
  from_name   text,
  from_me     boolean not null default false,
  type        text,
  body        text,
  sent_at     timestamptz,

  -- מצב הטיפול. אין כאן תשובה אוטומטית: הודעה נכנסת ומחכה.
  --   pending   — התקבלה, לא טופלה
  --   drafted   — נוסחה תשובה וממתינה לאישור
  --   answered  — נשלחה תשובה
  --   escalated — 🩺 דגל בריאותי, עוברת לאדם ולא נענית אוטומטית
  status      text not null default 'pending',

  -- ה-payload המלא כפי שהתקבל. נשמר כדי שנוכל להבין מבנה שלא צפינו
  -- בלי לאבד את ההודעה.
  raw         jsonb,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_status_idx
  on public.whatsapp_messages (status, received_at desc);
create index if not exists whatsapp_messages_chat_idx
  on public.whatsapp_messages (chat_id, sent_at desc);

-- 🔴 הודעות מלקוחות עלולות להכיל מידע בריאותי — מישהו כותב "אני בהריון"
-- לפני שיש לו חשבון. RLS מופעל, בלי policies, כמו שאר הטבלאות.
alter table public.whatsapp_messages enable row level security;
