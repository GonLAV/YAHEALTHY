/**
 * The /guides content hub — structured data, not JSX.
 *
 * Rules for anything added here (see docs/product-truth.md §4–5):
 *  - General, evergreen information only. No promised results, no diagnosis,
 *    no "treatment", no claim that the app or its coaching replaces a
 *    licensed professional.
 *  - Public-health guidance is cited generically ("health authorities such
 *    as …"), never with invented statistics or quotes.
 *  - Every article ends with a note sending people with medical conditions,
 *    pregnancy, eating-disorder history, medication or under-18s to a
 *    licensed professional.
 *
 * Each article has a stable id (for `related` links), and per language a
 * slug, title, description and body blocks. Reading time is computed from
 * the body, not typed in by hand. The signup CTA carries
 * utm_source=seo&utm_medium=guide&utm_campaign=<slug>.
 */
import type { Lang } from '@/i18n/translations';

export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'note'; text: string };

export interface GuideLocale {
  slug: string;
  title: string;
  description: string;
  body: GuideBlock[];
}

export interface Guide {
  id: string;
  /** ISO date the article was written / last materially reviewed. */
  datePublished: string;
  dateModified: string;
  /** Ids of related guides, for internal links. */
  related: string[];
  locales: Record<Lang, GuideLocale>;
}

const PRO_NOTE_EN =
  'This article is general information, not medical advice. If you are pregnant or breastfeeding, have diabetes, kidney, heart or another chronic condition, take medication, have a history of disordered eating, or are under 18, talk to a doctor or a registered dietitian before changing how you eat or drink.';
const PRO_NOTE_HE =
  'המאמר הזה הוא מידע כללי ואינו ייעוץ רפואי. בהיריון או בהנקה, עם סוכרת, מחלת כליות, לב או מחלה כרונית אחרת, בנטילת תרופות, עם רקע של הפרעות אכילה או מתחת לגיל 18 — התייעצו עם רופא.ה או עם דיאטנ.ית קליני.ת מוסמכ.ת לפני שינוי בתזונה או בשתייה.';

export const guides: Guide[] = [
  {
    id: 'water-intake',
    datePublished: '2026-09-27',
    dateModified: '2026-09-27',
    related: ['balanced-plate', 'start-food-log'],
    locales: {
      en: {
        slug: 'how-much-water',
        title: 'How much water do I need each day?',
        description:
          'General guidance on daily fluid needs, what counts toward them, and simple signs you may need more — with the situations where you should ask a professional.',
        body: [
          {
            type: 'p',
            text: 'There is no single number that is right for everyone. Fluid needs depend on body size, how active you are, the weather, and your health. The familiar "eight glasses a day" is a memorable rule of thumb, not a scientific requirement.',
          },
          { type: 'h2', text: 'What health authorities suggest' },
          {
            type: 'p',
            text: 'Public reference values, such as those published by the U.S. National Academies and the European Food Safety Authority, describe total water intake — from drinks and from food — for healthy adults in temperate climates. They land roughly in the range of 2 to 2.7 litres a day for women and 2.5 to 3.7 litres a day for men, depending on the source. A meaningful share of that, often around a fifth, typically comes from food rather than drinks.',
          },
          {
            type: 'p',
            text: 'These are reference values for populations, not personal prescriptions. They are a sensible starting point for thinking about your own habits.',
          },
          { type: 'h2', text: 'What counts' },
          {
            type: 'ul',
            items: [
              'Plain water is the simplest choice and has no calories.',
              'Tea, coffee, milk and soups all contribute fluid. Moderate amounts of caffeinated drinks still count toward intake for most people.',
              'Fruit and vegetables such as watermelon, cucumber and oranges are mostly water.',
              'Sugary drinks and juices add fluid but also add sugar and calories, so most guidance suggests keeping them occasional.',
            ],
          },
          { type: 'h2', text: 'Simple signs to pay attention to' },
          {
            type: 'ul',
            items: [
              'Thirst is a useful signal for most healthy adults — it is fine to respond to it.',
              'Pale yellow urine is a commonly used rough indicator of adequate hydration; consistently dark urine can suggest you need more.',
              'You usually need more in hot weather, during and after exercise, and when you are ill with fever, vomiting or diarrhoea.',
            ],
          },
          { type: 'h2', text: 'Making it a habit' },
          {
            type: 'ul',
            items: [
              'Keep a bottle or glass within reach where you work.',
              'Pair a glass of water with things you already do, such as each meal.',
              'Log what you drink for a few days to see your real pattern before deciding to change anything.',
            ],
          },
          {
            type: 'p',
            text: 'More is not always better. Drinking very large amounts in a short time can be harmful, and some conditions — for example kidney or heart conditions — may require limiting fluids. That is a decision for your doctor, not a general rule.',
          },
          { type: 'note', text: PRO_NOTE_EN },
        ],
      },
      he: {
        slug: 'how-much-water',
        title: 'כמה מים צריך לשתות ביום?',
        description:
          'הנחיות כלליות לצריכת נוזלים יומית, מה נחשב, וסימנים פשוטים שכדאי לשתות יותר — וגם מתי כדאי לשאול איש מקצוע.',
        body: [
          {
            type: 'p',
            text: 'אין מספר אחד שמתאים לכולם. הצורך בנוזלים תלוי בגודל הגוף, ברמת הפעילות, במזג האוויר ובמצב הבריאותי. "שמונה כוסות ביום" הוא כלל אצבע קליט, לא דרישה מדעית.',
          },
          { type: 'h2', text: 'מה אומרים גופי הבריאות' },
          {
            type: 'p',
            text: 'ערכי ייחוס ציבוריים, כמו אלה של האקדמיות הלאומיות בארה"ב ושל הרשות האירופית לבטיחות מזון (EFSA), מתארים צריכת מים כוללת — משתייה וממזון — למבוגרים בריאים באקלים ממוזג. הם נעים בערך בין 2 ל-2.7 ליטר ביום לנשים ובין 2.5 ל-3.7 ליטר ביום לגברים, בהתאם למקור. חלק משמעותי מזה, לרוב בסביבות חמישית, מגיע בדרך כלל מהמזון ולא מהשתייה.',
          },
          {
            type: 'p',
            text: 'אלה ערכים לאוכלוסייה, לא מרשם אישי. הם נקודת פתיחה טובה לחשוב על ההרגלים שלכם.',
          },
          { type: 'h2', text: 'מה נחשב' },
          {
            type: 'ul',
            items: [
              'מים הם הבחירה הפשוטה ביותר, ואין בהם קלוריות.',
              'תה, קפה, חלב ומרקים מוסיפים נוזלים. אצל רוב האנשים גם משקאות עם קפאין בכמות מתונה נחשבים.',
              'פירות וירקות כמו אבטיח, מלפפון ותפוז הם ברובם מים.',
              'משקאות ממותקים ומיצים מוסיפים נוזלים, אבל גם סוכר וקלוריות — ולכן רוב ההנחיות ממליצות עליהם רק מדי פעם.',
            ],
          },
          { type: 'h2', text: 'סימנים פשוטים לשים לב אליהם' },
          {
            type: 'ul',
            items: [
              'צמא הוא סימן שימושי אצל רוב המבוגרים הבריאים — זה בסדר להקשיב לו.',
              'שתן בצבע צהוב בהיר הוא מדד גס ומקובל לשתייה מספקת; שתן כהה באופן קבוע יכול לרמז שצריך יותר.',
              'בדרך כלל צריך יותר במזג אוויר חם, במהלך פעילות גופנית ואחריה, ובמחלה עם חום, הקאות או שלשול.',
            ],
          },
          { type: 'h2', text: 'להפוך את זה להרגל' },
          {
            type: 'ul',
            items: [
              'השאירו בקבוק או כוס בהישג יד במקום העבודה.',
              'חברו כוס מים למשהו שכבר קורה, למשל לכל ארוחה.',
              'תעדו כמה ימים מה אתם שותים כדי לראות את הדפוס האמיתי לפני שמחליטים לשנות משהו.',
            ],
          },
          {
            type: 'p',
            text: 'יותר זה לא תמיד טוב יותר. שתייה של כמויות גדולות מאוד בזמן קצר עלולה להזיק, ויש מצבים — למשל מחלות כליה או לב — שבהם נדרשת הגבלת נוזלים. זו החלטה של הרופא.ה, לא כלל כללי.',
          },
          { type: 'note', text: PRO_NOTE_HE },
        ],
      },
    },
  },
  {
    id: 'balanced-plate',
    datePublished: '2026-09-27',
    dateModified: '2026-09-27',
    related: ['calories-vs-macros', 'start-food-log'],
    locales: {
      en: {
        slug: 'balanced-plate',
        title: 'How to build a balanced plate',
        description:
          'A simple, flexible way to put together everyday meals — vegetables, whole grains, protein and healthy fats — without counting everything.',
        body: [
          {
            type: 'p',
            text: 'You do not need to weigh food to eat well. Many public health bodies use a plate picture to make balance easy to see — for example the U.S. MyPlate model and the Healthy Eating Plate from the Harvard T.H. Chan School of Public Health. The details differ, but the idea is similar.',
          },
          { type: 'h2', text: 'The plate, roughly' },
          {
            type: 'ul',
            items: [
              'About half the plate: vegetables and fruit, with an emphasis on a variety of vegetables.',
              'About a quarter: whole grains or other starchy foods — for example whole-wheat bread, brown rice, bulgur, oats or potatoes.',
              'About a quarter: protein — such as legumes, eggs, fish, poultry, tofu, dairy, or lean meat.',
              'A modest amount of healthy fat, such as olive oil, tahini, nuts or avocado.',
              'Water as the usual drink.',
            ],
          },
          { type: 'h2', text: 'Why it works' },
          {
            type: 'p',
            text: 'Vegetables, fruit, legumes and whole grains bring fibre, vitamins and minerals. Protein and fibre both help a meal feel satisfying. Putting vegetables first on the plate is a practical way to eat more of them without overthinking it.',
          },
          { type: 'h2', text: 'Make it fit your life' },
          {
            type: 'ul',
            items: [
              'Mixed dishes count: a shakshuka with salad and bread, or a lentil soup with a side of vegetables, can follow the same proportions.',
              'Not every meal has to be perfect — look at the pattern across the day or the week.',
              'Plan the shopping: if vegetables, legumes and whole grains are already at home, the balanced plate becomes the easy option.',
              'Cultural and family foods fit too. Balance is about proportions, not about specific "approved" foods.',
            ],
          },
          { type: 'note', text: PRO_NOTE_EN },
        ],
      },
      he: {
        slug: 'balanced-plate',
        title: 'איך בונים צלחת מאוזנת',
        description:
          'דרך פשוטה וגמישה להרכיב ארוחות יומיומיות — ירקות, דגנים מלאים, חלבון ושומן בריא — בלי לספור הכול.',
        body: [
          {
            type: 'p',
            text: 'לא צריך לשקול אוכל כדי לאכול טוב. גופי בריאות רבים משתמשים בתמונה של צלחת כדי להמחיש איזון — למשל מודל MyPlate האמריקאי ו"צלחת האכילה הבריאה" של בית הספר לבריאות הציבור של הרווארד. הפרטים שונים, אבל הרעיון דומה.',
          },
          { type: 'h2', text: 'הצלחת, בערך' },
          {
            type: 'ul',
            items: [
              'כחצי צלחת: ירקות ופירות, עם דגש על מגוון ירקות.',
              'כרבע: דגנים מלאים או מזון עמילני אחר — למשל לחם מחיטה מלאה, אורז מלא, בורגול, שיבולת שועל או תפוחי אדמה.',
              'כרבע: חלבון — כמו קטניות, ביצים, דגים, עוף, טופו, מוצרי חלב או בשר רזה.',
              'כמות מתונה של שומן בריא, כמו שמן זית, טחינה, אגוזים או אבוקדו.',
              'מים כמשקה הקבוע.',
            ],
          },
          { type: 'h2', text: 'למה זה עובד' },
          {
            type: 'p',
            text: 'ירקות, פירות, קטניות ודגנים מלאים מביאים סיבים תזונתיים, ויטמינים ומינרלים. חלבון וסיבים עוזרים לארוחה להשביע. לשים קודם ירקות בצלחת היא דרך מעשית לאכול יותר מהם בלי להתאמץ.',
          },
          { type: 'h2', text: 'להתאים את זה לחיים שלכם' },
          {
            type: 'ul',
            items: [
              'גם מנות מעורבות נחשבות: שקשוקה עם סלט ולחם, או מרק עדשים עם ירקות בצד, יכולים לשמור על אותם יחסים.',
              'לא כל ארוחה צריכה להיות מושלמת — הסתכלו על הדפוס לאורך היום או השבוע.',
              'תכננו את הקניות: אם יש בבית ירקות, קטניות ודגנים מלאים, הצלחת המאוזנת הופכת לאפשרות הקלה.',
              'גם אוכל משפחתי ומסורתי מתאים. איזון הוא עניין של פרופורציות, לא של רשימת מזונות "מאושרים".',
            ],
          },
          { type: 'note', text: PRO_NOTE_HE },
        ],
      },
    },
  },
  {
    id: 'sleep-hygiene',
    datePublished: '2026-09-27',
    dateModified: '2026-09-27',
    related: ['water-intake', 'start-food-log'],
    locales: {
      en: {
        slug: 'sleep-hygiene-basics',
        title: 'Sleep hygiene basics',
        description:
          'Everyday habits that support better sleep — a steady schedule, light, caffeine timing and a calm bedroom — and when trouble sleeping is worth raising with a doctor.',
        body: [
          {
            type: 'p',
            text: '"Sleep hygiene" means the habits and surroundings that make good sleep more likely. Sleep medicine and public health organisations generally recommend that adults aim for at least seven hours a night, though individual needs vary.',
          },
          { type: 'h2', text: 'Habits that tend to help' },
          {
            type: 'ul',
            items: [
              'Keep a consistent schedule: going to bed and getting up at similar times every day, weekends included, helps set your body clock.',
              'Get daylight, ideally in the morning, and keep evenings dimmer.',
              'Watch caffeine timing — its effects can last many hours, so many people do better avoiding it in the afternoon and evening.',
              'Be cautious with alcohol close to bedtime; it may make you drowsy but tends to disrupt sleep later in the night.',
              'Avoid large, heavy meals right before bed.',
              'Build a short wind-down routine: reading, a shower, or quiet time away from work.',
            ],
          },
          { type: 'h2', text: 'The bedroom' },
          {
            type: 'ul',
            items: [
              'Cool, dark and quiet is the usual advice. Curtains, an eye mask or earplugs can help.',
              'Keep screens and notifications out of bed where you can.',
              'If you cannot fall asleep after a while, getting up for a quiet, low-light activity and returning when sleepy is often suggested over lying awake.',
            ],
          },
          { type: 'h2', text: 'Notice your own pattern' },
          {
            type: 'p',
            text: 'Logging bedtime, wake time and how rested you feel for a couple of weeks can show patterns — for example, how late coffee or late screens line up with worse nights. Change one thing at a time so you can tell what helps.',
          },
          { type: 'h2', text: 'When to talk to a doctor' },
          {
            type: 'p',
            text: 'Ongoing difficulty falling or staying asleep, loud snoring, pauses in breathing noticed by a partner, or feeling very sleepy during the day despite enough time in bed are worth raising with a doctor. Sleep problems can have medical causes that habits alone will not fix.',
          },
          { type: 'note', text: PRO_NOTE_EN },
        ],
      },
      he: {
        slug: 'sleep-hygiene-basics',
        title: 'היגיינת שינה — היסודות',
        description:
          'הרגלים יומיומיים שתומכים בשינה טובה יותר — שגרה קבועה, אור, תזמון קפאין וחדר שקט — ומתי כדאי לפנות לרופא.ה בגלל קשיי שינה.',
        body: [
          {
            type: 'p',
            text: '"היגיינת שינה" היא ההרגלים והסביבה שמגדילים את הסיכוי לשינה טובה. ארגונים לרפואת שינה ולבריאות הציבור ממליצים בדרך כלל למבוגרים לישון לפחות שבע שעות בלילה, אם כי הצורך משתנה מאדם לאדם.',
          },
          { type: 'h2', text: 'הרגלים שנוטים לעזור' },
          {
            type: 'ul',
            items: [
              'שמרו על שגרה קבועה: ללכת לישון ולקום בשעות דומות בכל יום, גם בסופי שבוע, עוזר לכוון את השעון הביולוגי.',
              'קבלו אור יום, רצוי בבוקר, והעדיפו תאורה עמומה יותר בערב.',
              'שימו לב לתזמון הקפאין — ההשפעה שלו יכולה להימשך שעות רבות, ולכן לאנשים רבים עדיף להימנע ממנו אחר הצהריים ובערב.',
              'היזהרו עם אלכוהול סמוך לשינה; הוא עשוי לגרום לנמנום, אבל נוטה לפגוע בשינה בהמשך הלילה.',
              'הימנעו מארוחה גדולה וכבדה ממש לפני השינה.',
              'בנו שגרת הרגעה קצרה: קריאה, מקלחת או זמן שקט רחוק מהעבודה.',
            ],
          },
          { type: 'h2', text: 'חדר השינה' },
          {
            type: 'ul',
            items: [
              'קריר, חשוך ושקט — זו ההמלצה המקובלת. וילונות, כיסוי עיניים או אטמי אוזניים יכולים לעזור.',
              'כשאפשר, השאירו מסכים והתראות מחוץ למיטה.',
              'אם לא נרדמים אחרי זמן מה, מקובל להציע לקום לפעילות שקטה באור עמום ולחזור כשמרגישים ישנוניות, במקום לשכב ער.',
            ],
          },
          { type: 'h2', text: 'לזהות את הדפוס שלכם' },
          {
            type: 'p',
            text: 'תיעוד של שעת השינה, שעת הקימה ותחושת הרעננות במשך שבועיים יכול לחשוף דפוסים — למשל איך קפה מאוחר או מסכים מאוחרים מתיישבים עם לילות גרועים יותר. שנו דבר אחד בכל פעם כדי לדעת מה עוזר.',
          },
          { type: 'h2', text: 'מתי לפנות לרופא.ה' },
          {
            type: 'p',
            text: 'קושי מתמשך להירדם או להישאר ישנים, נחירות חזקות, הפסקות נשימה שבן או בת הזוג שמים לב אליהן, או ישנוניות רבה במהלך היום למרות מספיק זמן במיטה — כל אלה שווים שיחה עם רופא.ה. לבעיות שינה יכולות להיות סיבות רפואיות שהרגלים לבדם לא יפתרו.',
          },
          { type: 'note', text: PRO_NOTE_HE },
        ],
      },
    },
  },
  {
    id: 'start-food-log',
    datePublished: '2026-09-27',
    dateModified: '2026-09-27',
    related: ['balanced-plate', 'calories-vs-macros'],
    locales: {
      en: {
        slug: 'how-to-start-a-food-log',
        title: 'How to start a food log (and keep it going)',
        description:
          'A practical, low-pressure way to start writing down what you eat — what to record, how detailed to be, and how to use it to notice patterns.',
        body: [
          {
            type: 'p',
            text: 'A food log is simply a record of what you eat and drink. Its main value is awareness: it turns a vague sense of "I eat pretty well" into something you can actually look at. It does not need to be precise to be useful.',
          },
          { type: 'h2', text: 'Start small' },
          {
            type: 'ul',
            items: [
              'Pick a short trial — for example a week — rather than committing to forever.',
              'Log as you go, or right after each meal. Trying to remember a whole day in the evening is harder and less accurate.',
              'Begin with what and roughly how much. Add detail later only if it helps you.',
            ],
          },
          { type: 'h2', text: 'What is worth recording' },
          {
            type: 'ul',
            items: [
              'The food and an approximate portion — household measures like "a cup" or "a palm-sized piece" are fine.',
              'Drinks, including coffee, juice and alcohol.',
              'When you ate, and optionally how hungry you were before and how you felt after.',
              'Weekends and meals out. Skipping the "messy" days hides the most useful information.',
            ],
          },
          { type: 'h2', text: 'Using what you log' },
          {
            type: 'p',
            text: 'After a week, look for patterns rather than judging single meals. Are there long gaps followed by very large meals? Few vegetables on busy days? More snacking in the evening? Pick one small, specific change and try it for a week.',
          },
          { type: 'h2', text: 'Keep it kind' },
          {
            type: 'p',
            text: 'Logging is a tool, not a test. Missing a meal or a day is normal — just pick up again at the next meal. If tracking food starts to make you anxious, guilty or preoccupied, stop and consider speaking with a health professional; for some people, especially those with a history of disordered eating, detailed tracking is not a good fit.',
          },
          { type: 'note', text: PRO_NOTE_EN },
        ],
      },
      he: {
        slug: 'how-to-start-a-food-log',
        title: 'איך מתחילים יומן אוכל (וממשיכים איתו)',
        description:
          'דרך מעשית ובלי לחץ להתחיל לרשום מה אוכלים — מה לתעד, כמה לפרט, ואיך להשתמש בזה כדי לזהות דפוסים.',
        body: [
          {
            type: 'p',
            text: 'יומן אוכל הוא פשוט רישום של מה שאוכלים ושותים. הערך העיקרי שלו הוא מודעות: הוא הופך תחושה כללית של "אני אוכל די טוב" למשהו שאפשר באמת להסתכל עליו. הוא לא חייב להיות מדויק כדי להועיל.',
          },
          { type: 'h2', text: 'להתחיל בקטן' },
          {
            type: 'ul',
            items: [
              'בחרו תקופת ניסיון קצרה — למשל שבוע — במקום להתחייב לתמיד.',
              'תעדו תוך כדי או מיד אחרי כל ארוחה. לנסות לזכור יום שלם בערב קשה יותר ופחות מדויק.',
              'התחילו ב"מה" וב"בערך כמה". הוסיפו פרטים רק אם זה עוזר לכם.',
            ],
          },
          { type: 'h2', text: 'מה שווה לתעד' },
          {
            type: 'ul',
            items: [
              'את המזון וכמות משוערת — מידות ביתיות כמו "כוס" או "חתיכה בגודל כף יד" זה מספיק.',
              'שתייה, כולל קפה, מיץ ואלכוהול.',
              'מתי אכלתם, ואם בא לכם — כמה הייתם רעבים לפני ואיך הרגשתם אחרי.',
              'סופי שבוע וארוחות בחוץ. דילוג על הימים ה"מבולגנים" מסתיר את המידע הכי שימושי.',
            ],
          },
          { type: 'h2', text: 'להשתמש במה שתיעדתם' },
          {
            type: 'p',
            text: 'אחרי שבוע, חפשו דפוסים במקום לשפוט ארוחות בודדות. יש הפסקות ארוכות ואחריהן ארוחות גדולות מאוד? מעט ירקות בימים עמוסים? יותר נשנושים בערב? בחרו שינוי אחד קטן וספציפי ונסו אותו שבוע.',
          },
          { type: 'h2', text: 'בעדינות' },
          {
            type: 'p',
            text: 'תיעוד הוא כלי, לא מבחן. לפספס ארוחה או יום זה נורמלי — פשוט ממשיכים בארוחה הבאה. אם המעקב אחרי האוכל מתחיל לעורר חרדה, אשמה או עיסוק מתמיד, עצרו ושקלו לפנות לאיש מקצוע; לחלק מהאנשים, במיוחד עם רקע של הפרעות אכילה, מעקב מפורט אינו מתאים.',
          },
          { type: 'note', text: PRO_NOTE_HE },
        ],
      },
    },
  },
  {
    id: 'calories-vs-macros',
    datePublished: '2026-09-27',
    dateModified: '2026-09-27',
    related: ['balanced-plate', 'start-food-log'],
    locales: {
      en: {
        slug: 'calories-vs-macros',
        title: 'Calories vs. macros: what is the difference?',
        description:
          'A plain-language explanation of calories and macronutrients — protein, carbohydrates and fat — and why food quality matters alongside the numbers.',
        body: [
          {
            type: 'p',
            text: 'Calories and macros describe the same food from two angles. Calories tell you how much energy it provides. Macronutrients ("macros") tell you where that energy comes from.',
          },
          { type: 'h2', text: 'Calories' },
          {
            type: 'p',
            text: 'A calorie (on food labels, a kilocalorie, or kcal) is a unit of energy. Your body uses energy for everything from breathing to walking. How much a person needs varies widely with age, sex, body size, activity level and health, so any single number is an estimate.',
          },
          { type: 'h2', text: 'The three macronutrients' },
          {
            type: 'ul',
            items: [
              'Protein — about 4 kcal per gram. Found in legumes, eggs, dairy, fish, poultry, meat, tofu and, in smaller amounts, grains. Used to build and repair body tissues.',
              'Carbohydrates — about 4 kcal per gram. Found in grains, bread, fruit, vegetables, legumes and sugars. The body’s main everyday fuel. Fibre is a type of carbohydrate that is mostly not digested and supports digestive health.',
              'Fat — about 9 kcal per gram. Found in oils, nuts, seeds, tahini, avocado, dairy and meat. Needed to absorb some vitamins; public health guidance generally favours unsaturated fats, such as olive oil, over saturated and trans fats.',
            ],
          },
          {
            type: 'p',
            text: 'Alcohol also provides energy — about 7 kcal per gram — without being a nutrient the body needs.',
          },
          { type: 'h2', text: 'Why both views are useful' },
          {
            type: 'p',
            text: 'Two meals with the same calories can feel very different. A meal with protein, fibre and vegetables is usually more filling than the same energy from sugary snacks. Looking at macros, and at the kinds of foods they come from, gives a fuller picture than calories alone.',
          },
          { type: 'h2', text: 'Numbers are a tool' },
          {
            type: 'p',
            text: 'Calorie and macro figures on labels and in apps are approximations. Use them to notice trends, not to chase precision. For most people, the overall pattern — plenty of vegetables, fruit, whole grains and legumes, enough protein, and mostly unsaturated fats — matters more than hitting an exact number on any single day.',
          },
          { type: 'note', text: PRO_NOTE_EN },
        ],
      },
      he: {
        slug: 'calories-vs-macros',
        title: 'קלוריות מול מאקרו: מה ההבדל?',
        description:
          'הסבר בשפה פשוטה על קלוריות ועל אבות המזון — חלבון, פחמימות ושומן — ולמה איכות המזון חשובה לצד המספרים.',
        body: [
          {
            type: 'p',
            text: 'קלוריות ומאקרו מתארים את אותו מזון משתי זוויות. קלוריות אומרות כמה אנרגיה הוא מספק. אבות המזון ("מאקרו") אומרים מאיפה האנרגיה הזו מגיעה.',
          },
          { type: 'h2', text: 'קלוריות' },
          {
            type: 'p',
            text: 'קלוריה (על תוויות מזון — קילו-קלוריה, kcal) היא יחידת אנרגיה. הגוף משתמש באנרגיה לכל דבר, מנשימה ועד הליכה. הצורך משתנה מאוד לפי גיל, מין, גודל גוף, רמת פעילות ומצב בריאותי, ולכן כל מספר בודד הוא הערכה.',
          },
          { type: 'h2', text: 'שלושת אבות המזון' },
          {
            type: 'ul',
            items: [
              'חלבון — כ-4 קלוריות לגרם. נמצא בקטניות, ביצים, מוצרי חלב, דגים, עוף, בשר, טופו, ובכמויות קטנות יותר גם בדגנים. משמש לבנייה ולתיקון של רקמות הגוף.',
              'פחמימות — כ-4 קלוריות לגרם. נמצאות בדגנים, לחם, פירות, ירקות, קטניות וסוכרים. הדלק היומיומי העיקרי של הגוף. סיבים תזונתיים הם סוג של פחמימה שרובה אינו מתעכל, והם תומכים בבריאות מערכת העיכול.',
              'שומן — כ-9 קלוריות לגרם. נמצא בשמנים, אגוזים, זרעים, טחינה, אבוקדו, מוצרי חלב ובשר. נחוץ לספיגת חלק מהוויטמינים; הנחיות בריאות הציבור מעדיפות בדרך כלל שומנים בלתי רוויים, כמו שמן זית, על פני שומן רווי ושומן טראנס.',
            ],
          },
          {
            type: 'p',
            text: 'גם אלכוהול מספק אנרגיה — כ-7 קלוריות לגרם — בלי להיות רכיב תזונתי שהגוף צריך.',
          },
          { type: 'h2', text: 'למה שתי הזוויות שימושיות' },
          {
            type: 'p',
            text: 'שתי ארוחות עם אותן קלוריות יכולות להרגיש שונה מאוד. ארוחה עם חלבון, סיבים וירקות משביעה בדרך כלל יותר מאותה אנרגיה מחטיפים מתוקים. מבט על המאקרו, ועל סוגי המזון שמהם הוא מגיע, נותן תמונה מלאה יותר מקלוריות בלבד.',
          },
          { type: 'h2', text: 'מספרים הם כלי' },
          {
            type: 'p',
            text: 'ערכי הקלוריות והמאקרו בתוויות ובאפליקציות הם הערכות. השתמשו בהם כדי לזהות מגמות, לא כדי לרדוף אחרי דיוק. אצל רוב האנשים הדפוס הכללי — הרבה ירקות, פירות, דגנים מלאים וקטניות, מספיק חלבון, ובעיקר שומנים בלתי רוויים — חשוב יותר מלפגוע במספר מדויק ביום מסוים.',
          },
          { type: 'note', text: PRO_NOTE_HE },
        ],
      },
    },
  },
];

const WORDS_PER_MINUTE = 200;

const blockText = (block: GuideBlock) => (block.type === 'ul' ? block.items.join(' ') : block.text);

/** Whole minutes, at least 1, from the words in the body. */
export const readingMinutes = (locale: GuideLocale): number => {
  const words = locale.body
    .map(blockText)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
};

export const findGuideBySlug = (lang: Lang, slug: string): Guide | undefined =>
  guides.find((g) => g.locales[lang].slug === slug);

export const findGuideById = (id: string): Guide | undefined => guides.find((g) => g.id === id);

/** Signup link for a guide's call to action, tagged for acquisition reporting. */
export const guideSignupHref = (guide: Guide, lang: Lang): string =>
  `/signup?utm_source=seo&utm_medium=guide&utm_campaign=${encodeURIComponent(guide.locales[lang].slug)}`;
