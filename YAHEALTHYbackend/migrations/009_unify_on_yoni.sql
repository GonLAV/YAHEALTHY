-- איחוד: שף אחד, יוני, בוט בוואטסאפ.
--
-- ADR-007 קבע שהשף הוא אדם, ושלקוח מבקש שייצרו איתו קשר. במקביל נבנה בוט
-- שעונה בצ'אט מיידית. שתי המערכות חיו זו לצד זו, ולקוח ששילם היה נכנס לתור
-- שאיש לא מנהל בזמן שיוני עונה לו תוך שנייה. ההכרעה החדשה: רק יוני.
--
-- מה שנמחק כאן הוא מסלול-האדם בלבד. המנוי עצמו נשאר — הוא פשוט קונה את יוני.
--
-- נתיב חזרה: git מחזיר את routes/chef.js ואת migrations/006, והטבלה נוצרת
-- מחדש משם. שם המסלול חוזר עם:
--   update public.subscriptions   set plan = 'chef' where plan = 'yoni';
--   update public.payment_events  set plan = 'chef' where plan = 'yoni';

-- שם אחד לפרסונה ולמסלול שקונה אותה.
update public.subscriptions  set plan = 'yoni' where plan = 'chef';
update public.payment_events set plan = 'yoni' where plan = 'chef';

-- מסלול-האדם. אין לו יותר endpoint, ואין לו מי שמנהל את התור שהוא יוצר.
drop table if exists public.chef_requests;
