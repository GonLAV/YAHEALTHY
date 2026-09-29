-- הזמנות חד-פעמיות — תפריט אישי מיעל.
--
-- מנוי נותן גישה ואין מה "לבצע" בו. תפריט אישי הוא עבודה של אדם: יעל צריכה
-- לדעת שמישהו שילם, ליצור איתו קשר ולבנות לו תפריט. בלי רשומה כזו, התשלום
-- מופיע רק ב-payment_events, ששום מסך לא מציג כמשימה.
--
-- שורה לכל תשלום מאושר על מוצר חד-פעמי (routes/payments.js, PRODUCTS).
-- page_request_uid ייחודי: callback שמגיע פעמיים לא פותח שתי הזמנות.
-- פרטים אישיים (מייל, טלפון) — RLS בלי policies, רק השרת ניגש.
--
-- נתיב חזרה:
--   drop table if exists public.orders;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  page_request_uid text not null unique,
  user_id uuid references public.users(id) on delete set null,
  product text not null,
  email text,
  phone text,
  amount numeric,
  status text not null default 'paid'
    check (status in ('paid', 'in_progress', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- המסך של יעל: מה פתוח, מהישן לחדש.
create index if not exists orders_open_idx
  on public.orders (created_at) where status in ('paid', 'in_progress');

alter table public.orders enable row level security;
