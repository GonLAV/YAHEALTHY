-- איזו גרסת פרומפט ענתה ללקוח.
--
-- הבוט אומר לאנשים מה לאכול ובאיזה יעד קלורי. ההצדקה לכך היא שאשת מקצוע
-- כתבה ואישרה את הנוסח. ההצדקה הזו שווה משהו רק אם אפשר להראות **איזה**
-- נוסח היה בתוקף כשנאמר מה שנאמר — שיחה משישה חודשים אחורה מול פרומפט
-- שהשתנה מאז היא בדיוק המצב שבו אי אפשר להגן על כלום.
--
-- הערך הוא persona:12 התווים הראשונים של sha256 של קובץ הפרומפט, למשל
-- "adi:dc4acc971f59". מי שמשווה אותו ל-data/clinical-approvals.json יודע
-- מיד אם הגרסה שענתה היא הגרסה שאושרה.
--
-- null מותר: שורות שנכתבו לפני השינוי הזה, ותשובות מערכת שאינן מהמודל.
--
-- נתיב חזרה: alter table whapi_messages drop column prompt_version;

alter table whapi_messages
  add column if not exists prompt_version text;

create index if not exists whapi_messages_prompt_version_idx
  on whapi_messages (prompt_version);
