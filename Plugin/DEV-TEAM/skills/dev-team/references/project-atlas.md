# אטלס YAHEALTHY — המפה המלאה

> **מה זה:** המלאי המלא של המערכת, שנמדד מהקוד ב-17/09/2026. זה הקובץ שהופך חבר צוות ממי ש"קרא סיכום" למי ש**שוחה בפרויקט**.
> **המפה הזו גדולה.** קרא את החלק הרלוונטי לתחומך; אל תטען הכל בכל פעם.
> ⚠️ **התיעוד בריפו מתאר מערכת אחרת.** כשיש סתירה — **הקוד קובע.**

---

## 1. השטח במספרים

| | ערך |
|---|---|
| Endpoints ב-`index.js` | **82** |
| ישויות דאטה | **13** |
| מסכי frontend | **5** (+ 2 הפניות) |
| שורות backend | 7,508 (מתוכן 3,517 ב-`index.js`) |
| שורות frontend | 1,115 |
| בדיקות יחידה | **0** |

**82 endpoints בקובץ אחד של 3,517 שורות** — זה המספר שמסביר את רוב החוב במערכת. `README.md` מתאר 3 משפחות endpoints. **יש 30.**

---

## 2. משפחות ה-API — כל 82

### תזונה ומזון (הליבה — 27 endpoints)
| נתיב | # | הערה |
|---|---|---|
| `/api/food-logs` | **15** | **המשפחה הגדולה במערכת.** לב המוצר |
| `/api/food-summary` | 4 | סיכומים |
| `/api/recipes` | 4 | מתכונים בעברית, **מוטמעים בקוד** |
| `/api/meal-swaps` | 2 | החלפות מנות |
| `/api/food-days` | 1 | |
| `/api/macro-balance` | 2 | |

### משקל ומעקב (5)
`/api/weight-goals` (3) · `/api/weight-logs` (2)

### הרגלים ובריאות (9)
`/api/hydration-logs` (2) · `/api/sleep-logs` (2) · `/api/fasting-windows` (2) · `/api/sleep-debt` (1) · `/api/water-reminders` (1) · `/api/readiness` (2)

### תובנות וניקוד (8)
`/api/nutrition-score` (2) · `/api/weekly-nutrition` (1) · `/api/weekly-calorie-balance` (1) · `/api/calorie-balance` (1) · `/api/insights` (1) · `/api/progress` (1) · `/api/streaks` (1)

### קניות (3)
`/api/grocery-plan` (1) · `/api/grocery-list` (1) · `/api/grocery-optimize` (1)

### משתמשים וזהות (11)
`/api/auth` (6) · `/api/users` (2) · `/api/surveys` (3)

### תוכניות, יעדים, גיימיפיקציה (8)
`/api/meal-plans` (5) · `/api/targets` (2) · `/api/badges` (1)

### תשתית ו-UI (8)
`/api/health` · `/api/ready` · `/api/docs.json` · `/api/offline-logs` (3) · `/` · `/login` · `/dashboard`

> **`/api/offline-logs` (3)** — יש מנגנון סנכרון offline. מי שנוגע בו צריך לחשוב על התנגשויות ואידמפוטנטיות.

---

## 3. מודל הדאטה — 13 ישויות

הכל ב-`memoryDb` בתוך `utils/database.js`. **אין סכימה בקוד ואין מיגרציות.**

| ישות | מבנה | הערה |
|---|---|---|
| `usersById` | Map | |
| `usersByEmail` | Map | **אותו משתמש בשני מפתחות — סיכון לחוסר עקביות** |
| `foodLogs` | מערך | הישות המרכזית, 15 endpoints |
| `foodLogTemplates` | מערך | |
| `weightGoals` · `weightLogs` | מערך | 🩺 **דאטה בריאותית רגישה** |
| `hydrationLogs` · `sleepLogs` · `fastingWindows` | מערך | 🩺 רגיש |
| `readinessScores` | מערך | נגזר |
| `mealSwaps` · `surveys` · `offlineLogs` | מערך | |

**כל החיפושים הם סריקה ליניארית מעל מערכים.** עובד ב-10 משתמשים, קורס בהיקף.

⚠️ **ADR-001 קבע: Supabase.** הישויות האלה הן מה שצריך להפוך לטבלאות. **זה תחום עזרא.**

---

## 4. Frontend — 5 מסכים

| נתיב | קומפוננטה | שורות | מוגן |
|---|---|---|---|
| `/login` | `LoginPage` | 85 | לא |
| `/signup` | `SignupPage` | 105 | לא |
| `/dashboard` | `DashboardPage` | 133 | ✅ |
| `/food-log` | `FoodLogPage` | **280** | ✅ |
| `/coaching` | `CoachingPage` | 145 | ✅ |
| `/` | הפניה | — | — |

**הפער הבולט:** ה-backend חושף **82 endpoints**; ה-frontend קורא ל-**17** בלבד. **53 endpoints (65%) בלי שום UI.** המפה המלאה לפי ערך מוצרי: `docs/product-gap-map.md`.

🔴 **ובאג חי:** `CoachingPage.tsx` קורא ל-`/api/crm/...` דרך `crmApi` ב-`services/api.ts:85` — **וה-routes של CRM לא רשומים ב-`index.js`.** אחד מחמשת המסכים מקבל 404.

תשתית: `useAuth` (87) · `PrivateRoute` (16) · `services/api.ts` (124) — **כל הקריאות עוברות דרכו, נקודת מינוף מרכזית.**

---

## 5. שכבת האחסון — המלכודת

```js
const USE_MEMORY_DB = !process.env.SUPABASE_URL || !process.env.SUPABASE_KEY ||
  SUPABASE_URL === 'https://your-supabase-url.supabase.co' || ...
```

**לא זורק שגיאה — עובר לזיכרון בשקט.** 13 הישויות נעלמות בכל restart, בלי אזהרה. **הליקוי החמור במערכת.**

---

## 6. CI/CD

| | `ci.yml` | `deploy.yml` |
|---|---|---|
| Node | 20 | **18** |
| actions | v4 | **v3** |
| התקנה | `npm ci` | `npm install` |
| מה רץ | `npm test` → `test-system.sh` | `node -c index.js` |

🔴 **`deploy.yml` מדווח הצלחה על כישלון:** `continue-on-error: true` על שלב ה-deploy גורם ל-`if: success()` להתקיים, וההודעה "✅ Deployment successful!" מודפסת גם כשהייצור לא עודכן.

**`SUPABASE_URL`/`SUPABASE_KEY` לא מופיעים בשום מקום בצינור** — גם deploy מוצלח עלול לרוץ על זיכרון.

---

## 7. מה לא קיים בכלל

בדיקות יחידה · בדיקות frontend · `npm run lint` (ו-`deploy.yml` בכל זאת קורא לו) · סכימה · מיגרציות · לוג מובנה · ניטור · תקרת payload · timeout · ניהול state גלובלי · error boundary · תשתית WhatsApp/Instagram

---

## 8. 🩺 איפה הדאטה הרגישה יושבת

`weightGoals` · `weightLogs` · `sleepLogs` · `fastingWindows` · `hydrationLogs` · `readinessScores` · `surveys` · `health-calculations.js`

**כל נגיעה כאן היא נגיעה בבריאות של אדם אמיתי.** אין ייעוץ אישי בלי אדם; אין הבטחת תוצאה; אין העתקת דאטת ייצור לסביבת בדיקה.
