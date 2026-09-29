/**
 * Terms that mean a human has to answer, never an automated reply.
 *
 * Kept in sync with the safety gate in docs/bot/chef-bot-prompt.md and
 * docs/bot/nuri-bot-prompt.md, and with docs/product-truth.md §5 (stop flags
 * win over every sale). Substring matching on purpose: Hebrew inflects, and a
 * false escalation costs nothing while a miss can harm someone.
 *
 * Shared by routes/whatsapp.js (the human inbox) and routes/whapi.js (the
 * live bot), so both sides of the number agree on what "escalated" means.
 */
const HEALTH_FLAGS = [
  'הריון', 'בהריון', 'היריון', 'מניקה', 'הנקה',
  'סוכרת', 'סוכרתי', 'סוכרתית', 'אינסולין',
  'אנורקסי', 'בולימי', 'הפרעת אכילה', 'הקאות',
  'תרופ', 'כרונית', 'כרוני', 'בלוטת התריס', 'תירואיד',
  'כליות', 'לחץ דם', 'בריאטרי', 'קיצור קיבה',
  'אלרגי', 'אלרגיה', 'צליאק', 'גלוטן',
  'קטין', 'בן 16', 'בת 16', 'בן 17', 'בת 17',
  'הילד שלי', 'הבת שלי', 'הבן שלי',
];

const flagsIn = (text) => {
  const t = String(text || '');
  return HEALTH_FLAGS.filter((f) => t.includes(f));
};

module.exports = { HEALTH_FLAGS, flagsIn };
