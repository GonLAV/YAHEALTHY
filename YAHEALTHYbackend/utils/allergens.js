/**
 * Allergens and diets — shared by the coach (utils/coach.js) and the weekly
 * meal planner (utils/meal-planner.js), so both read a stated allergy the
 * same way and neither can suggest what the other would have filtered out.
 *
 *   parseAllergies(text)      free text (he/en) → { categories, terms, text }
 *   termMatchesWord(t, w)     does an allergy word match an ingredient word
 *   DIET_EXCLUDES             diet → the categories it rules out
 *                             ('meat_dairy' = kosher: no meat with dairy in
 *                             one meal; checked by the caller per meal)
 *
 * Pure, no I/O.
 */

/**
 * Allergen categories and the words (en + he) that name them. A word can name
 * several (a bare "nuts" means tree nuts AND peanuts — we err on the safe side).
 */
const ALLERGEN_WORDS = {
  peanut: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'peanut butter', 'nut', 'nuts', 'בוטן', 'בוטנים', 'חמאת בוטנים', 'אגוז', 'אגוזים'],
  tree_nut: ['tree nut', 'tree nuts', 'nut', 'nuts', 'almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'pecan', 'pecans', 'אגוז', 'אגוזים', 'אגוזי מלך', 'שקד', 'שקדים', 'קשיו', 'פיסטוק', 'לוז', 'אגוזי לוז', 'פקאן'],
  sesame: ['sesame', 'tahini', 'tahina', 'שומשום', 'טחינה'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'דג', 'דגים', 'סלמון', 'טונה', 'בקלה', 'אמנון'],
  shellfish: ['shellfish', 'seafood', 'shrimp', 'shrimps', 'prawn', 'prawns', 'crab', 'lobster', 'פירות ים', 'שרימפס', 'סרטן', 'סרטנים', 'לובסטר'],
  egg: ['egg', 'eggs', 'mayo', 'mayonnaise', 'ביצה', 'ביצים', 'מיונז'],
  dairy: ['milk', 'dairy', 'lactose', 'cheese', 'yogurt', 'yoghurt', 'cream', 'חלב', 'מוצרי חלב', 'חלבי', 'לקטוז', 'גבינה', 'גבינות', 'יוגורט', 'שמנת'],
  gluten: ['gluten', 'wheat', 'celiac', 'coeliac', 'flour', 'bread', 'גלוטן', 'חיטה', 'צליאק', 'צליאקיה', 'קמח', 'לחם'],
  soy: ['soy', 'soya', 'tofu', 'soy sauce', 'סויה', 'טופו', 'רוטב סויה'],
  legume: ['legume', 'legumes', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'bean', 'beans', 'hummus', 'קטניות', 'עדשים', 'עדשה', 'חומוס', 'שעועית', 'גרגרי חומוס'],
  poultry: ['chicken', 'turkey', 'poultry', 'עוף', 'הודו', 'עופות'],
  meat: ['beef', 'meat', 'red meat', 'בקר', 'בשר', 'בשר בקר']
};

const DIET_EXCLUDES = {
  vegetarian: ['meat', 'poultry', 'pork', 'fish', 'shellfish'],
  vegan: ['meat', 'poultry', 'pork', 'fish', 'shellfish', 'egg', 'dairy'],
  kosher: ['pork', 'shellfish', 'meat_dairy'],
  gluten_free: ['gluten'],
  lactose_free: ['dairy']
};

const ALLERGY_STOPWORDS = new Set([
  'allergic', 'allergy', 'allergies', 'intolerant', 'intolerance', 'to', 'and', 'or', 'no', 'not', 'avoid', 'any', 'all',
  'food', 'foods', 'the', 'a', 'an', 'of', 'with', 'free', 'none', 'nothing', 'n/a', 'na', 'mild', 'severe', 'some',
  'אלרגיה', 'אלרגי', 'אלרגית', 'אלרגיות', 'רגישות', 'רגיש', 'רגישה', 'ל', 'ללא', 'בלי', 'אין', 'מזון', 'מזונות', 'וגם', 'או', 'גם', 'קשה', 'קלה'
]);

const HEB_PREFIX = /^[והבלמשכ]/;

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // niqqud / cantillation
    .replace(/[“”„"'`׳״]/g, '')
    .replace(/[^\p{L}\p{N}\s/]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Free-text allergies → { categories: Set, terms: string[] }.
 * `terms` keeps every meaningful word so an allergen we have no category for
 * ("kiwi", "tomatoes") still filters dishes by ingredient name.
 */
function parseAllergies(text) {
  const categories = new Set();
  const terms = [];
  const clean = normalizeText(text).replace(/\//g, ' ');
  if (!clean) return { categories, terms, text: '' };
  const padded = ` ${clean} `;
  for (const [cat, words] of Object.entries(ALLERGEN_WORDS)) {
    for (const w of words) {
      if (w.includes(' ') && padded.includes(` ${w} `)) categories.add(cat);
    }
  }
  for (const token of clean.split(/[\s,;|]+/)) {
    if (!token || ALLERGY_STOPWORDS.has(token)) continue;
    const candidates = [token];
    if (HEB_PREFIX.test(token) && token.length > 3) candidates.push(token.slice(1));
    if (/[a-z]/.test(token)) {
      if (token.endsWith('es')) candidates.push(token.slice(0, -2));
      if (token.endsWith('s')) candidates.push(token.slice(0, -1));
    }
    for (const c of candidates) {
      for (const [cat, words] of Object.entries(ALLERGEN_WORDS)) if (words.includes(c)) categories.add(cat);
    }
    for (const c of candidates) if (c.length >= 3 && !ALLERGY_STOPWORDS.has(c)) terms.push(c);
  }
  return { categories, terms: Array.from(new Set(terms)), text: String(text || '').trim() };
}


function termMatchesWord(term, word) {
  const parts = word.split(' ');
  return parts.some((p) => p === term || (term.length >= 4 && (p.startsWith(term) || term.startsWith(p) && p.length >= 4)))
    || word === term;
}

module.exports = {
  ALLERGEN_WORDS,
  DIET_EXCLUDES,
  ALLERGY_STOPWORDS,
  HEB_PREFIX,
  normalizeText,
  parseAllergies,
  termMatchesWord
};
