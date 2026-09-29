/**
 * Every lifecycle message text, in one place, in both languages.
 *
 * Tone: warm and short, like Adi and Yoni in docs/bot — a person who is glad
 * you are here, not a campaign. Rules the copy keeps (docs/product-truth.md):
 *   - no prices, no discounts, nothing that is not in the approved price list
 *     (and the price list is not repeated here at all);
 *   - no medical claims and no promised results ("you'll lose X kg");
 *   - the difference we talk about is "what to buy and what to cook", not
 *     "calorie counting".
 *
 * Each template returns { subject, body, whatsapp? }. The frame around it —
 * greeting, the "פרסומת" marker on marketing subjects, sender identity and the
 * unsubscribe link — is added by `renderMessage`, so no template can forget it.
 */

const { getPlan } = require('./plans');

const BRAND = 'YAHEALTHY';

const T = {
  lead_nurture: {
    welcome: {
      he: (v) => ({
        subject: 'נעים להכיר — הנה מה שמחכה לך ב-YAHEALTHY',
        body: [
          'תודה שהשארת פרטים. שמחים שבאת 🙂',
          '',
          'רוב אפליקציות התזונה עוצרות בספירת קלוריות. אצלנו ממשיכים הלאה: מה לקנות, ומה לבשל היום — עם מתכונים בעברית ויומן אוכל פשוט.',
          '',
          'אפשר לפתוח חשבון ולהתחיל כבר עכשיו:',
          v.signupUrl
        ]
      }),
      en: (v) => ({
        subject: 'Nice to meet you — here is what YAHEALTHY is about',
        body: [
          'Thanks for leaving your details — we are glad you are here 🙂',
          '',
          'Most nutrition apps stop at counting calories. We keep going: what to buy and what to cook today, with simple recipes and an easy food log.',
          '',
          'You can open an account and start right away:',
          v.signupUrl
        ]
      })
    },
    day2: {
      he: (v) => ({
        subject: 'שאלה קטנה: מה מבשלים השבוע?',
        body: [
          'הרבה אנשים יודעים בערך מה כדאי לאכול — החלק הקשה הוא לתרגם את זה לקניות ולסיר.',
          '',
          'בדיוק בשביל זה בנינו את YAHEALTHY: יומן אוכל שלוקח שניות, ורעיונות למה לבשל שמתאימים לשגרה אמיתית.',
          '',
          'ההרשמה לוקחת דקה:',
          v.signupUrl
        ]
      }),
      en: (v) => ({
        subject: 'Quick question: what are you cooking this week?',
        body: [
          'Most of us roughly know what we should eat — the hard part is turning it into a shopping list and a pot on the stove.',
          '',
          'That is exactly what YAHEALTHY is for: a food log that takes seconds, and cooking ideas that fit a real routine.',
          '',
          'Signing up takes a minute:',
          v.signupUrl
        ]
      })
    },
    day5: {
      he: (v) => ({
        subject: 'עדיין פה אם בא לך להתחיל',
        body: [
          'רק מזכירים בעדינות — החשבון שלך עוד לא נפתח.',
          '',
          'אין צורך בשינוי גדול כדי להתחיל. ארוחה אחת ביומן ביום הראשון זה מספיק.',
          '',
          'כשמתאים לך:',
          v.signupUrl,
          '',
          'ואם זה לא הזמן — הכול בסדר. זו ההודעה האחרונה בסדרה הזו.'
        ]
      }),
      en: (v) => ({
        subject: 'Still here whenever you are ready',
        body: [
          'Just a gentle reminder — your account is not open yet.',
          '',
          'You do not need a big change to start. One meal in the log on day one is plenty.',
          '',
          'Whenever it suits you:',
          v.signupUrl,
          '',
          'And if now is not the time, that is completely fine. This is the last message in this series.'
        ]
      })
    }
  },

  onboarding: {
    day0: {
      he: (v) => ({
        subject: 'ברוך/ה הבא/ה ל-YAHEALTHY!',
        body: [
          'איזה כיף שהצטרפת 🙂',
          '',
          'שלושה דברים קטנים שכדאי לעשות בהתחלה:',
          '1. לתעד ארוחה אחת ביומן האוכל.',
          '2. להוסיף כוס מים במעקב השתייה.',
          '3. להציץ במתכונים ולבחור משהו לבשל השבוע.',
          '',
          v.appUrl
        ]
      }),
      en: (v) => ({
        subject: 'Welcome to YAHEALTHY!',
        body: [
          'So glad you joined 🙂',
          '',
          'Three small things worth doing first:',
          '1. Log one meal in your food log.',
          '2. Add a glass of water to your hydration tracker.',
          '3. Browse the recipes and pick something to cook this week.',
          '',
          v.appUrl
        ]
      })
    },
    day1: {
      he: (v) => ({
        subject: 'הארוחה הראשונה ביומן?',
        body: [
          'ראינו שעוד לא תיעדת ארוחה — וזה הצעד הכי קל להתחיל בו.',
          '',
          'לא צריך לדייק בגרם. מה אכלת, בערך כמה — וזהו.',
          '',
          v.foodLogUrl
        ],
        whatsapp: `היי${v.name ? ' ' + v.name : ''} 🙂 עוד לא תיעדת ארוחה ב-YAHEALTHY — ארוחה אחת זה כל מה שצריך בשביל להתחיל: ${v.foodLogUrl}`
      }),
      en: (v) => ({
        subject: 'Your first meal in the log?',
        body: [
          'Looks like you have not logged a meal yet — and it is the easiest place to start.',
          '',
          'No need to be exact to the gram. What you ate, roughly how much — that is it.',
          '',
          v.foodLogUrl
        ],
        whatsapp: `Hi${v.name ? ' ' + v.name : ''} 🙂 You have not logged a meal in YAHEALTHY yet — one meal is all it takes to start: ${v.foodLogUrl}`
      })
    },
    day3: {
      he: (v) => ({
        subject: 'שלושה טיפים קטנים לשבוע הראשון',
        body: [
          'כמה דברים שעוזרים להרבה אנשים בימים הראשונים:',
          '',
          '• לתעד סמוך לארוחה — ככה לא צריך לזכור בערב.',
          '• לשמור ארוחות שחוזרות על עצמן כתבנית, ולהוסיף אותן בלחיצה.',
          '• לתכנן ארוחה אחת מראש: לבחור מתכון, ולקנות בשבילו כבר היום.',
          '',
          'אין פה חוקים נוקשים — רק הרגלים קטנים שמצטברים.',
          '',
          v.appUrl
        ]
      }),
      en: (v) => ({
        subject: 'Three small tips for your first week',
        body: [
          'A few things that help a lot of people in the first days:',
          '',
          '• Log close to the meal — then there is nothing to remember at night.',
          '• Save meals you repeat as a template and add them in one tap.',
          '• Plan one meal ahead: pick a recipe and shop for it today.',
          '',
          'No strict rules here — just small habits that add up.',
          '',
          v.appUrl
        ]
      })
    },
    day7: {
      he: (v) => {
        const r = v.recap || {};
        const lines = r.daysLogged > 0
          ? [
              'שבוע ראשון מאחוריך! הנה מה שעשית:',
              '',
              `• ימים עם תיעוד השבוע: ${r.daysLogged} מתוך 7`,
              `• רצף התיעוד הנוכחי: ${r.currentStreak} ימים (השיא שלך: ${r.bestStreak})`,
              `• הישגים שנפתחו: ${r.unlocked}`,
              '',
              'כל יום עם תיעוד הוא עוד נתון שעוזר לך לראות את התמונה. ממשיכים לשבוע השני?'
            ]
          : [
              'עבר שבוע מאז שהצטרפת. עוד לא תועד השבוע שום יום — וזה בסדר גמור.',
              '',
              'שבוע חדש זו הזדמנות טובה להתחיל בקטן: ארוחה אחת היום.'
            ];
        return {
          subject: 'השבוע הראשון שלך ב-YAHEALTHY',
          body: [...lines, '', v.appUrl]
        };
      },
      en: (v) => {
        const r = v.recap || {};
        const lines = r.daysLogged > 0
          ? [
              'Your first week is done! Here is what you did:',
              '',
              `• Days with a log this week: ${r.daysLogged} of 7`,
              `• Current logging streak: ${r.currentStreak} days (your best: ${r.bestStreak})`,
              `• Achievements unlocked: ${r.unlocked}`,
              '',
              'Every logged day is one more data point that helps you see the picture. On to week two?'
            ]
          : [
              'It has been a week since you joined. Nothing was logged this week — and that is completely fine.',
              '',
              'A new week is a good moment to start small: one meal today.'
            ];
        return {
          subject: 'Your first week with YAHEALTHY',
          body: [...lines, '', v.appUrl]
        };
      }
    }
  },

  streak_risk: {
    evening: {
      he: (v) => ({
        subject: `רצף של ${v.streakDays} ימים — עוד לא תיעדת היום`,
        body: [
          `יש לך רצף תיעוד של ${v.streakDays} ימים ברציפות. יפה מאוד!`,
          '',
          'היום עוד לא נרשם כלום — מספיק תיעוד אחד (ארוחה, מים או שינה) כדי לשמור על הרצף.',
          '',
          v.appUrl
        ],
        whatsapp: `ערב טוב${v.name ? ' ' + v.name : ''} 🙂 הרצף שלך עומד על ${v.streakDays} ימים — תיעוד אחד היום שומר עליו: ${v.appUrl}`
      }),
      en: (v) => ({
        subject: `${v.streakDays}-day streak — nothing logged today yet`,
        body: [
          `You have a ${v.streakDays}-day logging streak going. Nice work!`,
          '',
          'Nothing is logged for today yet — one entry (a meal, water or sleep) keeps the streak alive.',
          '',
          v.appUrl
        ],
        whatsapp: `Good evening${v.name ? ' ' + v.name : ''} 🙂 Your streak is at ${v.streakDays} days — one log today keeps it going: ${v.appUrl}`
      })
    }
  },

  win_back: {
    d7: {
      he: (v) => ({
        subject: 'מתגעגעים — מה מבשלים השבוע?',
        body: [
          'עבר כשבוע מאז התיעוד האחרון שלך. קורה לכולם — שגרה, עבודה, חיים.',
          '',
          'אין צורך "להשלים" שום דבר. אפשר פשוט להתחיל מהיום: ארוחה אחת, או לבחור מתכון לסוף השבוע.',
          '',
          v.appUrl
        ]
      }),
      en: (v) => ({
        subject: 'We miss you — what are you cooking this week?',
        body: [
          'It has been about a week since your last log. It happens to everyone — routine, work, life.',
          '',
          'There is nothing to "catch up" on. Just start from today: one meal, or pick a recipe for the weekend.',
          '',
          v.appUrl
        ]
      })
    },
    d21: {
      he: (v) => ({
        subject: 'הדלת פתוחה, תמיד',
        body: [
          'עברו כמה שבועות מאז שהיית כאן. רצינו רק להגיד שהחשבון שלך מחכה, בדיוק כמו שהשארת אותו.',
          '',
          'כשיתאים לך לחזור — יומן האוכל והמתכונים כאן:',
          v.appUrl,
          '',
          'זו ההודעה האחרונה שנשלח בנושא.'
        ]
      }),
      en: (v) => ({
        subject: 'The door is always open',
        body: [
          'It has been a few weeks since you were here. We just wanted to say your account is waiting, exactly as you left it.',
          '',
          'Whenever you feel like coming back — your food log and the recipes are here:',
          v.appUrl,
          '',
          'This is the last message we will send about it.'
        ]
      })
    }
  },
  // No price here either: the link opens /upgrade, which shows the current one.
  renewal: {
    before_end: {
      he: (v) => ({
        subject: `${planName(v, 'he')} מסתיים ב-${endDate(v, 'he')}`,
        body: [
          `רצינו להזכיר: ${planName(v, 'he')} שלך מסתיים ב-${endDate(v, 'he')}.`,
          '',
          'אנחנו לא שומרים פרטי כרטיס ולא מחייבים אוטומטית — אם תרצו להמשיך, מחדשים כאן בכמה קליקים:',
          v.renewUrl,
          '',
          'לא מחדשים? הכול בסדר. היומן, הרצפים וההיסטוריה שלכם נשארים איתכם.'
        ]
      }),
      en: (v) => ({
        subject: `Your ${planName(v, 'en')} ends on ${endDate(v, 'en')}`,
        body: [
          `A quick reminder: your ${planName(v, 'en')} ends on ${endDate(v, 'en')}.`,
          '',
          'We do not keep card details and never charge automatically — if you want to continue, renewing takes a few clicks:',
          v.renewUrl,
          '',
          'Not renewing? That is fine. Your log, streaks and history stay with you.'
        ]
      })
    }
  }
};

function planName(v, lang) {
  const plan = v.renewal ? getPlan(v.renewal.plan) : null;
  if (plan) return plan.name[lang];
  return lang === 'he' ? 'המנוי' : 'plan';
}

function endDate(v, lang) {
  if (!v.renewal || !v.renewal.endsAt) return lang === 'he' ? 'בקרוב' : 'soon';
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(v.renewal.endsAt));
}

const FRAME = {
  he: {
    greeting: (name) => (name ? `היי ${name},` : 'היי,'),
    signoff: `— צוות ${BRAND}`,
    adMarker: 'פרסומת',
    whyMarketing: 'קיבלת את ההודעה כי הסכמת לקבל מאיתנו דיוור.',
    whyService: `קיבלת את ההודעה כי יש לך חשבון ב-${BRAND}.`,
    unsubscribe: (url) => `להסרה מרשימת הדיוור בלחיצה אחת: ${url}`,
    forget: (url) => `למחיקת הפרטים שלך מאיתנו: ${url}`,
    sender: `${BRAND} · לפניות אפשר להשיב למייל הזה.`,
    waStop: (url) => `להפסקת הודעות: ${url}`
  },
  en: {
    greeting: (name) => (name ? `Hi ${name},` : 'Hi,'),
    signoff: `— The ${BRAND} team`,
    // Israeli law asks for the Hebrew word at the start of the subject of
    // an advertisement, whatever language the rest is in.
    adMarker: 'פרסומת | Ad',
    whyMarketing: 'You are receiving this because you agreed to hear from us.',
    whyService: `You are receiving this because you have a ${BRAND} account.`,
    unsubscribe: (url) => `Unsubscribe in one click: ${url}`,
    forget: (url) => `Delete your details from our list: ${url}`,
    sender: `${BRAND} · You can reply to this email to reach us.`,
    waStop: (url) => `To stop these messages: ${url}`
  }
};

function hasTemplate(campaign, step) {
  return Boolean(T[campaign] && T[campaign][step]);
}

/**
 * Render one message.
 *
 * @param {object} p
 * @param {string} p.campaign
 * @param {string} p.step
 * @param {'he'|'en'} p.lang
 * @param {boolean} p.marketing   true → "פרסומת" subject marker
 * @param {object} p.vars         name, appUrl, foodLogUrl, signupUrl,
 *                                unsubscribeUrl, forgetUrl, streakDays, recap
 * @returns {{ subject, text, whatsapp }}
 */
function renderMessage({ campaign, step, lang, marketing, vars = {} }) {
  if (!hasTemplate(campaign, step)) {
    throw new Error(`No template for ${campaign}/${step}`);
  }
  const l = lang === 'en' ? 'en' : 'he';
  const f = FRAME[l];
  const t = T[campaign][step][l](vars);

  const subject = marketing ? `${f.adMarker}: ${t.subject}` : t.subject;

  const footer = ['', '—', marketing ? f.whyMarketing : f.whyService];
  if (vars.unsubscribeUrl) footer.push(f.unsubscribe(vars.unsubscribeUrl));
  if (vars.forgetUrl) footer.push(f.forget(vars.forgetUrl));
  footer.push(f.sender);

  const text = [f.greeting(vars.name), '', ...t.body, '', f.signoff, ...footer].join('\n');

  let whatsapp = null;
  if (t.whatsapp) {
    whatsapp = marketing ? `${f.adMarker}: ${t.whatsapp}` : t.whatsapp;
    if (vars.unsubscribeUrl) whatsapp += `\n${f.waStop(vars.unsubscribeUrl)}`;
  }

  return { subject, text, whatsapp };
}

/** The small bilingual page GET /api/marketing/unsubscribe answers with. */
const PAGE = {
  he: {
    title: 'הוסרת מרשימת הדיוור',
    done: 'לא נשלח לך יותר הודעות מהסוג הזה. אם זו טעות, אפשר להפעיל שוב בכל עת מהגדרות החשבון.',
    doneLead: 'לא נשלח לך יותר דיוור.',
    invalidTitle: 'הקישור לא תקין',
    invalid: 'לא הצלחנו לאמת את הקישור. אפשר להשיב לאחד המיילים שלנו ונסיר אותך ידנית.',
    forgetButton: 'מחקו גם את הפרטים שלי',
    forgetHint: 'המחיקה סופית: כתובת המייל וכל מה שנשמר איתה יימחקו.',
    forgotten: 'הפרטים שלך נמחקו. תודה שהיית איתנו.',
    forgottenTitle: 'הפרטים נמחקו'
  },
  en: {
    title: 'You have been unsubscribed',
    done: 'We will not send you these messages anymore. If this was a mistake, you can turn them back on any time from your account.',
    doneLead: 'We will not email you again.',
    invalidTitle: 'This link is not valid',
    invalid: 'We could not verify this link. Reply to any of our emails and we will remove you by hand.',
    forgetButton: 'Also delete my details',
    forgetHint: 'This is permanent: your email address and everything stored with it will be deleted.',
    forgotten: 'Your details have been deleted. Thank you for having been with us.',
    forgottenTitle: 'Your details were deleted'
  }
};

module.exports = { renderMessage, hasTemplate, PAGE, BRAND, TEMPLATES: T };
