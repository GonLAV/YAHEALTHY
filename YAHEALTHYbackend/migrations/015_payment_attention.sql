-- תשלום שדורש אדם.
--
-- עד עכשיו, כשכסף נכנס ולא היה ברור על מה — תשלום על פגישה בסופר בלי תור
-- תואם, תשלום בלי מייל או מסלול שאפשר לזהות, או מספר טלפון שכבר שייך לחשבון
-- אחר — זה נרשם רק בלוג. ביומן של שרת, שאף אחד לא קורא, זה כסף שנעלם.
--
-- עכשיו זה נרשם על התשלום עצמו, ומסך הצוות מציג אותו עד שמישהו מסמן שטופל.
-- כמה סיבות באותו תשלום נשמרות מופרדות בפסיק, כמו ב-appointments.
--
-- נתיב חזרה:
--   alter table public.payment_events drop column needs_attention;

alter table public.payment_events
  add column if not exists needs_attention text;

create index if not exists payment_events_attention_idx
  on public.payment_events (received_at) where needs_attention is not null;
