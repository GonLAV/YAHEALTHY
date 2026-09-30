/**
 * The terms that mean a person, not a program, has to answer.
 *
 * This list used to live inside routes/whatsapp.js, where it guarded exactly
 * one channel. The result was a product with two doors and a lock on one of
 * them: somebody who wrote "אני בהריון" to the WhatsApp number got no
 * automated reply, and the same person opening the app got a calorie target
 * and a coach telling them to run a 300-500 kcal deficit.
 *
 * It lives here so both channels read the same list. A term added for one is
 * added for both, which is the only arrangement that stays true over time.
 *
 * Kept in sync with the safety gate in docs/bot/chef-bot-prompt.md and
 * docs/bot/nuri-bot-prompt.md. This list may run ahead of the prompts, which
 * cannot change without a new clinical approval; it only ever sends more to a
 * person, never less. Substring matching on purpose: Hebrew inflects,
 * and a missed flag can harm someone.
 *
 * A false flag is no longer free, though. Since migrations/018 a flag is kept
 * for the person, and they are never offered a paid plan by a bot again. So
 * the terms that are numbers or short words (ages, school years, "minor") are
 * patterns below, not substrings: as substrings, 'מתחת ל-18' matched
 * "מתחת ל-1800 קלוריות", 'בן 15' matched "קמח לבן 150 גרם", 'בת 14' matched
 * "לשבת 14 אנשים", 'קטין' matched "מקטין את התיאבון" and 'תיכון' matched
 * "דיאטת הים התיכון".
 */

const HEALTH_FLAGS_HE = [
  'הריון', 'בהריון', 'היריון', 'מניקה', 'הנקה',
  'סוכרת', 'סוכרתי', 'סוכרתית', 'אינסולין',
  'אנורקסי', 'בולימי', 'הפרעת אכילה', 'הקאות',
  'תרופ', 'כרונית', 'כרוני', 'בלוטת התריס', 'תירואיד',
  'כליות', 'לחץ דם', 'בריאטרי', 'קיצור קיבה',
  'אלרגי', 'אלרגיה', 'צליאק', 'גלוטן',
  // A teenager says what school they are in at least as often as their age.
  'בתיכון', 'לתיכון', 'תלמיד תיכון', 'תלמידת תיכון', 'חטיבת ביניים',
  'הילד שלי', 'הבת שלי', 'הבן שלי',
];

/**
 * The same ground in English.
 *
 * The list was Hebrew-only, which was defensible while it guarded the WhatsApp
 * number and nothing else. The app is bilingual — utils/coach.js answers in
 * English whenever lang !== 'he' — so "I have diabetes, what should I eat?"
 * went straight through the gate and came back with a nutrition answer.
 *
 * Stems rather than whole words, for the same reason the Hebrew list uses
 * them: 'diabet' catches diabetes and diabetic, 'allerg' catches allergy,
 * allergic and allergies.
 */
const HEALTH_FLAGS_EN = [
  'pregnan', 'breastfeed', 'breast feeding', 'nursing', 'lactat',
  'diabet', 'insulin',
  'anorexi', 'bulimi', 'eating disorder', 'purging', 'vomiting', 'binge',
  'medication', 'chronic', 'thyroid',
  'kidney', 'blood pressure', 'bariatric', 'gastric bypass', 'gastric sleeve',
  'allerg', 'celiac', 'coeliac', 'gluten',
  'underage', 'my son', 'my daughter', 'my child', 'my kid',
  'teenage', 'high school', 'middle school',
];

const HEALTH_FLAGS = [...HEALTH_FLAGS_HE, ...HEALTH_FLAGS_EN];

// Not after another Hebrew letter: 'לבן', 'שבת' and 'מקטין' are ordinary
// words. Only the prefixes that keep the meaning are allowed (ו, ה, ב...).
const HE_START = '(?:^|[^א-ת])';
// What follows a number that is a quantity, not an age: "מתכון בן 15 דקות".
const NOT_A_QUANTITY = String.raw`(?!\d|\s?(?:דק|שע|גרם|גר(?![א-ת])|ק"ג|קילו|מ"ל|ליטר|אנשים|סועדים|מנות|יחידות|ימים|יום|שבוע|חודש|מעלות))`;

/**
 * Ages and school years, as patterns. Each carries the label flagsIn reports,
 * which is what the logs and tests see; the words themselves are never logged.
 */
const HEALTH_PATTERNS = [
  { label: 'בן/בת 13-17', re: new RegExp(`${HE_START}[וה]?ב[ןת]\\s?-?1[3-7]${NOT_A_QUANTITY}`) },
  { label: 'מתחת לגיל 18', re: new RegExp(`מתחת\\s?לגיל\\s?-?18(?!\\d)`) },
  { label: 'קטין', re: new RegExp(`${HE_START}[והלכבש]?קטי(?:ן|נה|נים|נות)(?![א-ת])`) },
  // ז to יב, the grades a minor is in; 'כיתה חדשה' is not one.
  { label: 'כיתה ז-יב', re: new RegExp(`${HE_START}[וב]?כיתה\\s?(?:[זחט]|י[אב]?)['׳"״]?(?![א-ת])`) },
  { label: '13-17 years old', re: /\b1[3-7][\s-]?(?:years?|yrs?)[\s-]?old\b/ },
  { label: '13-17 yo', re: /\b1[3-7]\s?y\/?o\b/ },
  // "under 18" said of a person, not of minutes or calories.
  { label: 'under 18', re: /\b(?:i'?m|i am|am|is|are|she'?s|he'?s|they'?re)\s+under\s+18(?!\d)|\bunder\s+(?:the\s+)?age\s+(?:of\s+)?18(?!\d)/ },
];

/**
 * Which flags a piece of text trips. Empty array means none.
 *
 * Case-folded, which matters only for the English stems — 'Diabetes' at the
 * start of a sentence would not have matched 'diabet' otherwise. Hebrew has no
 * case, so this costs it nothing.
 */
const flagsIn = (text) => {
  const t = String(text || '').toLowerCase();
  return [
    ...HEALTH_FLAGS.filter((f) => t.includes(f)),
    ...HEALTH_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.label),
  ];
};

/**
 * Whether this text has to go to a person.
 */
const isFlagged = (text) => flagsIn(text).length > 0;

module.exports = { HEALTH_FLAGS, HEALTH_FLAGS_HE, HEALTH_FLAGS_EN, HEALTH_PATTERNS, flagsIn, isFlagged };
