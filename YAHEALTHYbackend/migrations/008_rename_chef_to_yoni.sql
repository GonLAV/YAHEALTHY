-- שינוי שם הפרסונה: 'chef' → 'yoni'.
--
-- אותה תבנית בדיוק כמו migrations/003 (nuri → adi): הערך ב-active_bot הוא
-- מזהה פרסונה שהקוד מתייחס אליו, ולכן הוא משתנה כאן. שם הקובץ
-- chef-bot-prompt.md נשאר — לנתיב קובץ אין משמעות בזמן ריצה כמו שיש למפתח,
-- ושינוי שלו הוא רעש בלי תועלת.
--
-- utils/database.js ממפה 'chef' → 'yoni' בקריאה, ונופל חזרה ל-'chef' בכתיבה
-- אם האילוץ הישן עדיין בתוקף. כלומר הקוד והמיגרציה לא חייבים לעלות יחד,
-- ושום שיחה לא נשברת בין הפריסות.
--
-- נתיב חזרה:
--   alter table whapi_conversations drop constraint if exists whapi_conversations_active_bot_check;
--   update whapi_conversations set active_bot = 'chef' where active_bot = 'yoni';
--   alter table whapi_conversations
--     add constraint whapi_conversations_active_bot_check check (active_bot in ('adi', 'chef'));

alter table whapi_conversations
  drop constraint if exists whapi_conversations_active_bot_check;

update whapi_conversations set active_bot = 'yoni' where active_bot = 'chef';

alter table whapi_conversations
  add constraint whapi_conversations_active_bot_check
  check (active_bot in ('adi', 'yoni'));
