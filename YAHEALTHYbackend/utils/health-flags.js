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
 * docs/bot/nuri-bot-prompt.md. Substring matching on purpose: Hebrew inflects,
 * and a false escalation costs nothing while a miss can harm someone.
 */

const HEALTH_FLAGS_HE = [
  'הריון', 'בהריון', 'היריון', 'מניקה', 'הנקה',
  'סוכרת', 'סוכרתי', 'סוכרתית', 'אינסולין',
  'אנורקסי', 'בולימי', 'הפרעת אכילה', 'הקאות',
  'תרופ', 'כרונית', 'כרוני', 'בלוטת התריס', 'תירואיד',
  'כליות', 'לחץ דם', 'בריאטרי', 'קיצור קיבה',
  'אלרגי', 'אלרגיה', 'צליאק', 'גלוטן',
  'קטין', 'בן 16', 'בת 16', 'בן 17', 'בת 17',
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
  '16 year', '17 year', '15 year', '14 year',
];

const HEALTH_FLAGS = [...HEALTH_FLAGS_HE, ...HEALTH_FLAGS_EN];

/**
 * Which flags a piece of text trips. Empty array means none.
 *
 * Case-folded, which matters only for the English stems — 'Diabetes' at the
 * start of a sentence would not have matched 'diabet' otherwise. Hebrew has no
 * case, so this costs it nothing.
 */
const flagsIn = (text) => {
  const t = String(text || '').toLowerCase();
  return HEALTH_FLAGS.filter((f) => t.includes(f));
};

/**
 * Whether this text has to go to a person.
 */
const isFlagged = (text) => flagsIn(text).length > 0;

module.exports = { HEALTH_FLAGS, HEALTH_FLAGS_HE, HEALTH_FLAGS_EN, flagsIn, isFlagged };
