# מפת הקוד של YAHEALTHY — המצב האמיתי

> נמדד ב-17/09/2026 מתוך הקוד עצמו, לא מהתיעוד.
> ⚠️ **התיעוד בריפו לא אמין.** `PROJECT_STATUS.md` מתאר מערכת בוגרת יותר ממה שקיים בפועל. כשיש סתירה — **הקוד קובע.** מדוד מחדש לפני שאתה מסתמך על המספרים כאן.

## גודל בפועל

| | שורות | הערה |
|---|---|---|
| Backend (JS, ללא node_modules) | **7,508** | |
| ↳ `index.js` | **3,517** | **47% מכל ה-backend בקובץ אחד.** זה החוב המרכזי |
| ↳ `utils/database.js` | 1,072 | שכבת האחסון |
| ↳ `crm-*.js` (3 קבצים) | 1,344 | **קוד מת — ראה למטה** |
| Frontend (TS/TSX) | **1,115** | 5 עמודים, hook אחד ל-auth |

**המסקנה:** זו לא "אפליקציה בקנה מידה". זה פרויקט מוקדם עם קובץ מונוליטי אחד גדול. כל דיבור על סקייל מתחיל מכאן — לא מ-Kubernetes.

## 🔴 שלושה ליקויים מאומתים — לתקן לפני כל פיצ'ר חדש

### 1. `crm-routes.js` מייבא קובץ שלא קיים
```js
import { pool } from './db.js';   // crm-routes.js:6
```
**`YAHEALTHYbackend/db.js` לא קיים בריפו.** כל 3 קבצי ה-CRM (1,344 שורות) יקרסו בטעינה.

### 2. התנגשות מודולים — ESM מול CommonJS
`package.json` מצהיר `"type": "commonjs"`, אבל `crm-routes.js` משתמש ב-`import`/`export` (ESM). זה לא ירוץ. `index.js` ו-`utils/database.js` משתמשים ב-`require` — הריפו מעורבב.

### 3. שלוש ערימות DB מותקנות — הוכרע: Supabase (ADR-001)
| חבילה | סטטוס בפועל |
|---|---|
| `mongoose` ^9.0.2 | **מותקן, לא בשימוש. ADR-001 הכריע להסיר** |
| `@supabase/supabase-js` ^2.89.0 | ✅ **הערימה הרשמית (ADR-001).** בשימוש ב-`utils/database.js` |
| `pg` (PostgreSQL) | **קוד ה-CRM מניח `pool.query()` — אבל `pg` לא ב-dependencies בכלל** |

**+ `crm-*.js` לא מחוברים ל-`index.js`** — אף route לא רשום. קוד מת לחלוטין.

## שכבת האחסון — איך היא באמת עובדת

`utils/database.js` הוא **דו-מצבי**: אם `SUPABASE_URL`/`SUPABASE_KEY` חסרים או עדיין ערכי placeholder — הוא נופל אוטומטית ל-`memoryDb` (מפות ומערכים בזיכרון).

```js
const USE_MEMORY_DB = !process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || ...
```

**המשמעות המסוכנת:** הוא **לא זורק שגיאה** — הוא שותק ועובר לזיכרון. אפשר להעלות לפרודקשן בלי env ולגלות שהדאטה נעלמת בכל restart, בלי שום אזהרה. **זה ליקוי-סקייל מספר אחת, לפני כל אופטימיזציה.**

ישויות ב-`memoryDb`: `usersById`, `usersByEmail`, `surveys`, `weightGoals`, `weightLogs`, `hydrationLogs`, `sleepLogs`, `fastingWindows`, `mealSwaps` ועוד.

## מה כן קיים ועובד

- **Auth:** JWT (`jsonwebtoken`), hashing ב-`bcryptjs`, `utils/auth.js`
- **הגנות:** `express-rate-limit`, middleware ל-`validate` (zod), `requestContext`
- **תיעוד API:** `swagger-jsdoc` + `swagger-ui-express`, `openapi.js` (472 שורות)
- **לוגיקת תחום:** `utils/health-calculations.js` (242 שורות) — חישובי בריאות
- **תוכן:** מתכונים בעברית ב-`data/recipes.json` (לא מוטמעים ב-`index.js` — תוקן 22/09/2026, ADR-003 ב-`decisions.md`) — **מקור נתונים אמיתי לבוט/למוצר**
- **Frontend:** React 18 + TS + Vite + Tailwind, React Router, `useAuth`, `PrivateRoute`, Recharts

## Frontend — מה קיים

| קובץ | שורות |
|---|---|
| `pages/FoodLogPage.tsx` | 280 |
| `pages/CoachingPage.tsx` | 145 |
| `pages/DashboardPage.tsx` | 133 |
| `pages/SignupPage.tsx` | 105 |
| `pages/LoginPage.tsx` | 85 |
| `services/api.ts` | 124 |
| `hooks/useAuth.tsx` | 87 |

אין ניהול-state גלובלי מעבר ל-`useAuth`. אין שכבת caching. אין בדיקות.

## מה לא קיים בכלל

אין בדיקות אוטומטיות · אין CI (`.github/` קיימת — לבדוק מה בה) · אין מיגרציות · אין סכימת DB בקוד · אין לוגים מובנים · אין ניטור · אין הגבלת גודל payload · אין תשתית WhatsApp/Instagram
