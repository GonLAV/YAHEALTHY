# חיבור הערוצים — ישירות מול Meta Graph API

> **ההכרעה:** בלי פלטפורמת ביניים. מלאכי מדבר ישירות עם Graph API של מטא.
> **המפתח שמאפשר את זה:** **Development Mode.**

---

## 🔑 העובדה שמשנה הכול

App Review נדרש כדי שהאפליקציה תוכל לשרת **חשבונות של אנשים אחרים**.
**לחשבון שלך עצמך — לא צריך.** אפליקציה ב-Development Mode מקבלת את ההרשאות המלאות עבור כל מי שיש לו **תפקיד באפליקציה** (Admin / Developer / Tester).

אתה הבעלים של `@yahealthy1` ושל הדף → אתה מגדיר את עצמך Admin → **ההרשאות עובדות מיד.**

**מתי כן תצטרך App Review:** רק אם תרצה שהכלי ינהל חשבונות של לקוחות אחרים. לניהול העסק שלך — לא רלוונטי.

---

## מה שהמשתמש/ת עושה

### 1. ליצור Meta App
developers.facebook.com → My Apps → **Create App** → סוג **Business**.

### 2. להוסיף Products
בלוח האפליקציה → Add Product:
- **Instagram** → Instagram API setup with Facebook Login
- **Messenger** (לפייסבוק Messenger)

### 3. לקשר את הדף
Messenger → Settings → **Add or Remove Pages** → לבחור את דף YAHEALTHY.
(החשבון כבר מקושר לדף — צעד 0 הושלם.)

### 4. לוודא שאתה Admin
App Roles → Roles → לוודא שהמשתמש שלך מופיע כ-**Administrator**. **זה מה שמפעיל את ההרשאות ב-Development Mode.**

### 5. להפיק טוקן
Tools → **Graph API Explorer**:
1. לבחור את האפליקציה
2. **User or Page** → לבחור את הדף (**Page Access Token**, לא User)
3. **Add permissions** — לסמן:
   ```
   instagram_basic
   instagram_manage_messages
   instagram_manage_comments
   pages_messaging
   pages_show_list
   pages_read_engagement
   ```
4. **Generate Access Token** → לאשר בחלון

### 6. להאריך את הטוקן — אל תדלג
הטוקן מה-Explorer תקף **שעה אחת**. להחלפה בטוקן ארוך:

```bash
curl -s "https://graph.facebook.com/v19.0/oauth/access_token\
?grant_type=fb_exchange_token\
&client_id=<APP_ID>\
&client_secret=<APP_SECRET>\
&fb_exchange_token=<SHORT_TOKEN>"
```

מה שחוזר תקף **60 יום**. **Page Access Token שמופק מטוקן-משתמש ארוך אינו פג** — זה מה שכדאי לשמור:

```bash
curl -s "https://graph.facebook.com/v19.0/me/accounts?access_token=<LONG_USER_TOKEN>"
```

### 7. למצוא את מזהה חשבון האינסטגרם
```bash
curl -s "https://graph.facebook.com/v19.0/<PAGE_ID>?fields=instagram_business_account&access_token=<PAGE_TOKEN>"
```
מחזיר ריק → **הקישור בין החשבון לדף לא באמת קיים**, גם אם נראה מקושר באפליקציה. לתקן לפני שממשיכים.

---

## משתני הסביבה

בקובץ `.env.malachi` בשורש הפרויקט (מוסתר מ-git):

```
META_APP_ID=
META_APP_SECRET=
META_PAGE_ID=
META_PAGE_ACCESS_TOKEN=
IG_BUSINESS_ACCOUNT_ID=
```

🔒 **לא בצ'אט, לא בריפו.** שדה חסר → מלאכי נשאר בניסוח-בלבד ואומר את זה במפורש.

---

## בדיקת הרשאות — לפני כל עבודה חיה

```bash
curl -s "https://graph.facebook.com/v19.0/me/permissions?access_token=$META_PAGE_ACCESS_TOKEN"
```

כל הרשאה חייבת `"status": "granted"` — לא רק להופיע ברשימה. יש גם `"declined"` ו-`"expired"`.

---

## ה-Endpoints שמלאכי משתמש בהם

| פעולה | קריאה |
|---|---|
| שיחות אינסטגרם | `GET /{IG_ID}/conversations?platform=instagram` |
| הודעות בשיחה | `GET /{CONVERSATION_ID}?fields=messages{message,from,created_time}` |
| שליחת DM | `POST /{IG_ID}/messages` — `recipient={id}`, `message={text}` |
| תגובות לפוסט | `GET /{MEDIA_ID}/comments` |
| מענה לתגובה | `POST /{COMMENT_ID}/replies` |
| שיחות פייסבוק | `GET /{PAGE_ID}/conversations` |

**כל קריאת GET בטוחה תמיד.** כל POST — **רק אחרי אישור מפורש להודעה הזו.**

---

## וואטסאפ — מסלול נפרד, לא כאן

WhatsApp Business Platform: אימות עסק מול מטא, מספר ייעודי, ותבניות מאושרות מראש לכל הודעה יזומה. **Development Mode לא פותר את זה.** לא חוסם את אינסטגרם ופייסבוק — לטפל בו בנפרד ואחרי.

---

## מגבלות שנשארות

- **חלון 24 שעות** — הודעה חופשית רק תוך יממה מההודעה האחרונה של הלקוח. מגבלת מטא, לא עוקפים אותה. **פולואפ אגרסיבי לא אפשרי.**
- **Rate limits** לפי דרגת האפליקציה.
- **סטורי** — כמעט לא ניתן לפרסום דרך API. רילז כן.
- **Development Mode** — עובד רק לחשבונות עם תפקיד באפליקציה. מספיק לעסק שלך; לא מספיק כדי לשרת לקוחות.

---

## שני השערים שגוברים על כל ניסוח

**🩺 שער בריאותי:** היריון · סוכרת · הפרעות אכילה · מחלה כרונית · תרופות · קטינים → **לא מנסחים תשובה תזונתית. מעבירים לאדם.** גובר על כל שיקול מכירתי.

**📋 שער עובדתי:** אין ל-YAHEALTHY מחירון מאושר. נגיעה במחיר/תנאי/משך → `[חסר: ...]` ושואלים. **לא ממציאים.**
