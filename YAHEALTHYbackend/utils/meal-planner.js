/**
 * Weekly meal planner — 7 days × breakfast / lunch / dinner / snack, sized to
 * the user's confirmed targets, with a shopping list derived from it.
 *
 * Pure: no I/O. routes/meal-planner.js loads the user's preferences and the
 * stored week and persists what comes out of here.
 *
 * Where the numbers come from (the "לא ממציאים" rule):
 *   Every ingredient points at a row in data/food-database.json (the
 *   food-calculator engine) or data/foods-usda.json (USDA FoodData Central,
 *   with its fdcId). Values are looked up at load time and the planner only
 *   multiplies grams by them. A meal's calories are never typed in by hand, so
 *   a corrected source value corrects every stored plan on the next read (the
 *   stored plan holds grams, not nutrition).
 *
 * How a day is sized:
 *   Each meal template has components with a role — 'p' (the protein part),
 *   'o' (the other scalable part: grains, fats) and 'f' (fixed: vegetables,
 *   fruit). For a day the planner solves two factors, p and o, so that
 *     fixed + p·(protein-part) + o·(other-part) = calorie target
 *   and, when a protein target exists, the same for protein. Factors are
 *   clamped to sane portion ranges, grams are rounded to kitchen amounts
 *   (whole eggs, whole fruit, 5 g steps), and the totals reported are
 *   recomputed from the rounded grams. Locked meals are never resized.
 *
 * Safety (same rules as the coach and the onboarding wizard):
 *   - minors: no calorie/macro numbers, no target sizing (base portions only),
 *     never a deficit
 *   - a calorie target under the safe floor is raised to the floor
 *   - no meal ever contains an ingredient matching a stated allergy
 *     (utils/allergens.js, the parser the coach uses); diets are hard filters;
 *     kosher also means no meat/poultry with dairy in the same meal
 *
 * Deterministic: everything random comes from a seeded PRNG.
 */

const calcDb = require('../data/food-database.json');
const usdaDb = require('../data/foods-usda.json');
const { DIET_EXCLUDES, normalizeText, parseAllergies, termMatchesWord } = require('./allergens');

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const DAYS = 7;
const PLAN_VERSION = 1;

/** Calories within ±7 % and protein within ±15 % count as "on target". */
const TOLERANCE = { kcal: 0.07, protein: 0.15 };

/** How far a portion may be scaled from the template's base amount. */
const P_RANGE = [0.5, 2.4];
const O_RANGE = [0.3, 2.8];

/** Candidate days tried per day; the best-scoring one is kept. */
const CANDIDATES_PER_DAY = 40;
/** A candidate day scoring under this (≈1–2 % off) ends the search early. */
const GOOD_ENOUGH = 0.03;

const SECTIONS = ['produce', 'meat_fish', 'dairy_eggs', 'bakery', 'grains_legumes', 'nuts_oils'];

// ─── ingredients ────────────────────────────────────────────────────────────

/**
 * src: ['calc', id] → data/food-database.json, ['usda', name_he] → foods-usda.json.
 * contains: allergen/diet categories (utils/allergens.js ALLERGEN_WORDS keys).
 * words: en + he names for free-text allergy matching.
 * buy: how the shopping list counts it — grams, millilitres (density g/ml),
 *      or whole units (gramsPerUnit). state: the weight the grams refer to.
 */
const INGREDIENT_DEFS = [
  // meat & fish
  { id: 'chicken_breast', src: ['calc', 'chicken_breast'], he: 'חזה עוף', en: 'Chicken breast', section: 'meat_fish', state: 'cooked', contains: ['poultry'], words: ['chicken', 'עוף', 'חזה עוף'] },
  { id: 'turkey_breast', src: ['calc', 'turkey_breast'], he: 'חזה הודו', en: 'Turkey breast', section: 'meat_fish', state: 'cooked', contains: ['poultry'], words: ['turkey', 'הודו', 'חזה הודו'] },
  { id: 'beef_lean', src: ['calc', 'beef_lean'], he: 'בקר רזה', en: 'Lean beef', section: 'meat_fish', state: 'cooked', contains: ['meat'], words: ['beef', 'meat', 'בקר', 'בשר'] },
  { id: 'salmon', src: ['calc', 'salmon'], he: 'סלמון', en: 'Salmon', section: 'meat_fish', state: 'cooked', contains: ['fish'], words: ['salmon', 'fish', 'סלמון', 'דג'] },
  { id: 'tuna', src: ['calc', 'tuna_canned_water'], he: 'טונה בקופסה (במים)', en: 'Canned tuna (in water)', section: 'meat_fish', state: 'drained', contains: ['fish'], words: ['tuna', 'fish', 'טונה', 'דג'] },
  { id: 'tilapia', src: ['usda', 'אמנון'], he: 'פילה אמנון', en: 'Tilapia fillet', section: 'meat_fish', state: 'raw', contains: ['fish'], words: ['tilapia', 'fish', 'אמנון', 'דג', 'דגים'] },
  { id: 'shrimp', src: ['usda', 'שרימפס'], he: 'שרימפס', en: 'Shrimp', section: 'meat_fish', state: 'raw', contains: ['shellfish'], words: ['shrimp', 'seafood', 'שרימפס', 'פירות ים'] },
  // dairy & eggs
  { id: 'egg', src: ['calc', 'egg'], he: 'ביצים', en: 'Eggs', section: 'dairy_eggs', contains: ['egg'], words: ['egg', 'eggs', 'ביצה', 'ביצים'], buy: { unit: 'unit', gramsPerUnit: 50 } },
  { id: 'cottage_cheese', src: ['calc', 'cottage_cheese'], he: "גבינת קוטג'", en: 'Cottage cheese', section: 'dairy_eggs', contains: ['dairy'], words: ['cottage cheese', 'cheese', 'קוטג', 'גבינה'] },
  { id: 'greek_yogurt', src: ['calc', 'greek_yogurt'], he: 'יוגורט יווני', en: 'Greek yogurt', section: 'dairy_eggs', contains: ['dairy'], words: ['yogurt', 'greek yogurt', 'יוגורט'] },
  { id: 'milk', src: ['calc', 'milk_low_fat'], he: 'חלב 1%', en: 'Low-fat milk', section: 'dairy_eggs', contains: ['dairy'], words: ['milk', 'חלב'], buy: { unit: 'ml', density: 1.03 } },
  { id: 'feta', src: ['usda', 'פטה 16%'], he: 'גבינת פטה', en: 'Feta cheese', section: 'dairy_eggs', contains: ['dairy'], words: ['feta', 'cheese', 'פטה', 'גבינה'] },
  // bakery & grains
  { id: 'bread', src: ['calc', 'whole_wheat_bread'], he: 'לחם מלא', en: 'Whole-wheat bread', section: 'bakery', contains: ['gluten'], words: ['bread', 'wheat', 'toast', 'לחם', 'חיטה'], buy: { unit: 'slice', gramsPerUnit: 30 } },
  { id: 'oats', src: ['calc', 'oats_dry'], he: 'שיבולת שועל', en: 'Rolled oats', section: 'grains_legumes', state: 'dry', contains: ['gluten'], words: ['oats', 'oatmeal', 'שיבולת שועל'] },
  { id: 'pasta', src: ['usda', 'פסטה מחיטה מלאה'], he: 'פסטה מחיטה מלאה', en: 'Whole-wheat pasta', section: 'grains_legumes', state: 'cooked', contains: ['gluten'], words: ['pasta', 'wheat', 'פסטה', 'חיטה'] },
  { id: 'bulgur', src: ['usda', 'בורגול מבושל'], he: 'בורגול', en: 'Bulgur', section: 'grains_legumes', state: 'cooked', contains: ['gluten'], words: ['bulgur', 'wheat', 'בורגול', 'חיטה'] },
  { id: 'white_rice', src: ['calc', 'white_rice_cooked'], he: 'אורז לבן', en: 'White rice', section: 'grains_legumes', state: 'cooked', contains: [], words: ['rice', 'אורז'] },
  { id: 'brown_rice', src: ['calc', 'brown_rice_cooked'], he: 'אורז מלא', en: 'Brown rice', section: 'grains_legumes', state: 'cooked', contains: [], words: ['rice', 'brown rice', 'אורז', 'אורז מלא'] },
  { id: 'quinoa', src: ['calc', 'quinoa_cooked'], he: 'קינואה', en: 'Quinoa', section: 'grains_legumes', state: 'cooked', contains: [], words: ['quinoa', 'קינואה'] },
  // legumes
  { id: 'lentils', src: ['calc', 'lentils_cooked'], he: 'עדשים', en: 'Lentils', section: 'grains_legumes', state: 'cooked', contains: ['legume'], words: ['lentil', 'lentils', 'עדשים', 'עדשה'] },
  { id: 'chickpeas', src: ['calc', 'chickpeas_cooked'], he: 'גרגרי חומוס', en: 'Chickpeas', section: 'grains_legumes', state: 'cooked', contains: ['legume'], words: ['chickpea', 'chickpeas', 'חומוס', 'גרגרי חומוס'] },
  { id: 'black_beans', src: ['usda', 'שעועית שחורה מבושלת'], he: 'שעועית שחורה', en: 'Black beans', section: 'grains_legumes', state: 'cooked', contains: ['legume'], words: ['black beans', 'beans', 'bean', 'שעועית', 'שעועית שחורה'] },
  { id: 'edamame', src: ['usda', 'אדממה'], he: 'אדממה', en: 'Edamame', section: 'grains_legumes', state: 'cooked', contains: ['soy', 'legume'], words: ['edamame', 'soy', 'soybeans', 'אדממה', 'סויה'] },
  { id: 'hummus', src: ['calc', 'hummus'], he: 'חומוס (ממרח)', en: 'Hummus', section: 'grains_legumes', contains: ['legume', 'sesame'], words: ['hummus', 'chickpeas', 'tahini', 'חומוס', 'טחינה'] },
  // produce
  { id: 'potato', src: ['calc', 'potato_cooked'], he: 'תפוחי אדמה', en: 'Potatoes', section: 'produce', state: 'cooked', contains: [], words: ['potato', 'potatoes', 'תפוח אדמה', 'תפוחי אדמה'] },
  { id: 'sweet_potato', src: ['calc', 'sweet_potato_cooked'], he: 'בטטה', en: 'Sweet potato', section: 'produce', state: 'cooked', contains: [], words: ['sweet potato', 'בטטה'] },
  { id: 'cucumber', src: ['calc', 'cucumber'], he: 'מלפפון', en: 'Cucumber', section: 'produce', contains: [], words: ['cucumber', 'מלפפון', 'מלפפונים'] },
  { id: 'tomato', src: ['calc', 'tomato'], he: 'עגבניות', en: 'Tomatoes', section: 'produce', contains: [], words: ['tomato', 'tomatoes', 'עגבנייה', 'עגבניות'] },
  { id: 'bell_pepper', src: ['calc', 'bell_pepper'], he: 'פלפל', en: 'Bell pepper', section: 'produce', contains: [], words: ['pepper', 'bell pepper', 'פלפל'] },
  { id: 'lettuce', src: ['calc', 'lettuce'], he: 'חסה', en: 'Lettuce', section: 'produce', contains: [], words: ['lettuce', 'חסה'] },
  { id: 'salad_veg', src: ['calc', 'mixed_salad_vegetables'], he: 'ירקות לסלט', en: 'Salad vegetables', section: 'produce', contains: [], words: ['salad', 'vegetables', 'סלט', 'ירקות'] },
  { id: 'broccoli', src: ['usda', 'ברוקולי'], he: 'ברוקולי', en: 'Broccoli', section: 'produce', contains: [], words: ['broccoli', 'ברוקולי'] },
  { id: 'spinach', src: ['usda', 'תרד'], he: 'תרד', en: 'Spinach', section: 'produce', contains: [], words: ['spinach', 'תרד'] },
  { id: 'carrot', src: ['usda', 'גזר'], he: 'גזר', en: 'Carrots', section: 'produce', contains: [], words: ['carrot', 'carrots', 'גזר'] },
  { id: 'zucchini', src: ['usda', 'קישוא'], he: 'קישואים', en: 'Zucchini', section: 'produce', contains: [], words: ['zucchini', 'קישוא', 'קישואים'] },
  { id: 'onion', src: ['usda', 'בצל'], he: 'בצל', en: 'Onion', section: 'produce', contains: [], words: ['onion', 'onions', 'בצל'] },
  { id: 'mushrooms', src: ['usda', 'פטריות'], he: 'פטריות', en: 'Mushrooms', section: 'produce', contains: [], words: ['mushroom', 'mushrooms', 'פטריות', 'פטרייה'] },
  { id: 'lemon', src: ['usda', 'לימון'], he: 'לימון', en: 'Lemon', section: 'produce', contains: [], words: ['lemon', 'לימון'] },
  { id: 'avocado', src: ['calc', 'avocado'], he: 'אבוקדו', en: 'Avocado', section: 'produce', contains: [], words: ['avocado', 'אבוקדו'] },
  { id: 'banana', src: ['calc', 'banana'], he: 'בננות', en: 'Bananas', section: 'produce', contains: [], words: ['banana', 'bananas', 'fruit', 'בננה', 'פרי'], buy: { unit: 'unit', gramsPerUnit: 120 } },
  { id: 'apple', src: ['calc', 'apple'], he: 'תפוחים', en: 'Apples', section: 'produce', contains: [], words: ['apple', 'apples', 'fruit', 'תפוח', 'פרי'], buy: { unit: 'unit', gramsPerUnit: 180 } },
  { id: 'blueberries', src: ['usda', 'אוכמניות'], he: 'אוכמניות', en: 'Blueberries', section: 'produce', contains: [], words: ['blueberries', 'berries', 'fruit', 'אוכמניות', 'פירות יער', 'פרי'] },
  { id: 'orange', src: ['usda', 'תפוז'], he: 'תפוזים', en: 'Oranges', section: 'produce', contains: [], words: ['orange', 'oranges', 'fruit', 'citrus', 'תפוז', 'פרי'] },
  // nuts, seeds & oils
  { id: 'olive_oil', src: ['calc', 'olive_oil'], he: 'שמן זית', en: 'Olive oil', section: 'nuts_oils', contains: [], words: ['olive oil', 'olive', 'oil', 'שמן זית', 'שמן'], buy: { unit: 'ml', density: 0.91 } },
  { id: 'tahini', src: ['calc', 'tahini'], he: 'טחינה גולמית', en: 'Raw tahini', section: 'nuts_oils', contains: ['sesame'], words: ['tahini', 'sesame', 'טחינה', 'שומשום'] },
  { id: 'almonds', src: ['calc', 'almonds'], he: 'שקדים', en: 'Almonds', section: 'nuts_oils', contains: ['tree_nut'], words: ['almond', 'almonds', 'nuts', 'שקדים', 'שקד', 'אגוזים'] },
  { id: 'walnuts', src: ['usda', 'אגוזי מלך'], he: 'אגוזי מלך', en: 'Walnuts', section: 'nuts_oils', contains: ['tree_nut'], words: ['walnut', 'walnuts', 'nuts', 'אגוזי מלך', 'אגוז', 'אגוזים'] },
  { id: 'peanut_butter', src: ['usda', 'חמאת בוטנים'], he: 'חמאת בוטנים', en: 'Peanut butter', section: 'nuts_oils', contains: ['peanut'], words: ['peanut butter', 'peanut', 'peanuts', 'חמאת בוטנים', 'בוטנים'] },
  { id: 'chia', src: ['usda', "צ'יה"], he: "זרעי צ'יה", en: 'Chia seeds', section: 'nuts_oils', contains: [], words: ['chia', 'seeds', 'ציה', 'זרעים'] }
];

function lookupNutrition(src) {
  const [db, key] = src;
  if (db === 'calc') {
    const row = calcDb.foods.find((f) => f.id === key);
    if (!row) throw new Error(`meal-planner: ${key} is not in data/food-database.json`);
    const n = row.nutrition_per_100g;
    return { kcal: n.calories, protein: n.protein_g, carbs: n.carbs_g, fat: n.fat_g, source: 'food-database', ref: key };
  }
  const rows = usdaDb.foods.filter((f) => f.name_he === key);
  if (rows.length !== 1) throw new Error(`meal-planner: expected one "${key}" in data/foods-usda.json, found ${rows.length}`);
  const r = rows[0];
  return { kcal: r.kcal_per_100g, protein: r.protein_g, carbs: r.carbs_g, fat: r.fat_g, source: 'usda_fdc', ref: r.source_ref };
}

const INGREDIENTS = Object.fromEntries(
  INGREDIENT_DEFS.map((d) => [d.id, { ...d, state: d.state || null, buy: d.buy || { unit: 'g' }, per100: lookupNutrition(d.src) }])
);

// ─── meal templates ─────────────────────────────────────────────────────────

/**
 * slot: 'breakfast' | 'main' (lunch + dinner) | 'snack'.
 * items: [ingredientId, baseGrams, role]. recipeId links data/recipes.json
 * when the template is that dish.
 */
const TEMPLATE_DEFS = [
  // breakfast
  { id: 'shakshuka', slot: 'breakfast', recipeId: 'recipe_1', he: 'שקשוקה עם לחם מלא', en: 'Shakshuka with whole-wheat bread',
    items: [['egg', 100, 'p'], ['tomato', 150, 'f'], ['bell_pepper', 50, 'f'], ['onion', 40, 'f'], ['olive_oil', 7, 'o'], ['bread', 60, 'o']] },
  { id: 'yogurt-berries-oats', slot: 'breakfast', he: 'יוגורט יווני עם אוכמניות, שיבולת שועל ואגוזי מלך', en: 'Greek yogurt with blueberries, oats and walnuts',
    items: [['greek_yogurt', 200, 'p'], ['blueberries', 80, 'f'], ['oats', 30, 'o'], ['walnuts', 10, 'o']] },
  { id: 'oatmeal-banana', slot: 'breakfast', recipeId: 'recipe_18', he: 'דייסת שיבולת שועל בחלב עם בננה ושקדים', en: 'Oatmeal in milk with banana and almonds',
    items: [['oats', 50, 'o'], ['milk', 200, 'p'], ['banana', 120, 'f'], ['almonds', 10, 'o']] },
  { id: 'avocado-toast-egg', slot: 'breakfast', recipeId: 'recipe_19', he: 'טוסט אבוקדו עם ביצים ועגבנייה', en: 'Avocado toast with eggs and tomato',
    items: [['bread', 60, 'o'], ['avocado', 50, 'o'], ['egg', 100, 'p'], ['tomato', 80, 'f']] },
  { id: 'cottage-toast', slot: 'breakfast', he: "לחם מלא עם קוטג' וסלט ירקות", en: 'Whole-wheat bread with cottage cheese and salad',
    items: [['cottage_cheese', 150, 'p'], ['bread', 60, 'o'], ['cucumber', 100, 'f'], ['tomato', 80, 'f']] },
  { id: 'omelette-sweet-potato', slot: 'breakfast', recipeId: 'recipe_25', he: 'חביתת תרד עם בטטה', en: 'Spinach omelette with sweet potato',
    items: [['egg', 150, 'p'], ['spinach', 60, 'f'], ['olive_oil', 5, 'o'], ['sweet_potato', 120, 'o']] },
  { id: 'hummus-plate', slot: 'breakfast', he: 'צלחת חומוס עם ירקות ולחם מלא', en: 'Hummus plate with vegetables and bread',
    items: [['hummus', 100, 'p'], ['bread', 60, 'o'], ['cucumber', 100, 'f'], ['tomato', 100, 'f']] },
  { id: 'bean-hash', slot: 'breakfast', he: 'מחבת בטטה ושעועית שחורה', en: 'Sweet potato and black bean hash',
    items: [['black_beans', 120, 'p'], ['sweet_potato', 150, 'o'], ['bell_pepper', 60, 'f'], ['onion', 40, 'f'], ['olive_oil', 7, 'o']] },
  { id: 'pb-oats', slot: 'breakfast', he: 'שיבולת שועל עם חמאת בוטנים ובננה', en: 'Oats with peanut butter and banana',
    items: [['oats', 50, 'o'], ['peanut_butter', 20, 'p'], ['banana', 120, 'f']] },
  { id: 'quinoa-fruit-bowl', slot: 'breakfast', he: "קערת קינואה עם אוכמניות וצ'יה", en: 'Quinoa bowl with blueberries and chia',
    items: [['quinoa', 150, 'o'], ['blueberries', 80, 'f'], ['chia', 15, 'p']] },

  // lunch / dinner
  { id: 'chicken-quinoa', slot: 'main', recipeId: 'recipe_15', he: 'חזה עוף עם קינואה וירקות קלויים', en: 'Chicken breast with quinoa and roasted vegetables',
    items: [['chicken_breast', 150, 'p'], ['quinoa', 150, 'o'], ['zucchini', 100, 'f'], ['bell_pepper', 80, 'f'], ['olive_oil', 10, 'o']] },
  { id: 'salmon-sweet-potato', slot: 'main', recipeId: 'recipe_16', he: 'סלמון אפוי עם בטטה וסלט ירוק', en: 'Baked salmon with sweet potato and green salad',
    items: [['salmon', 130, 'p'], ['sweet_potato', 150, 'o'], ['lettuce', 60, 'f'], ['cucumber', 80, 'f'], ['olive_oil', 5, 'o']] },
  { id: 'tilapia-rice', slot: 'main', recipeId: 'recipe_7', he: 'פילה אמנון בתנור עם אורז מלא וברוקולי', en: 'Baked tilapia with brown rice and broccoli',
    items: [['tilapia', 150, 'p'], ['brown_rice', 150, 'o'], ['broccoli', 120, 'f'], ['lemon', 20, 'f'], ['olive_oil', 10, 'o']] },
  { id: 'lentil-stew', slot: 'main', recipeId: 'recipe_5', he: 'תבשיל עדשים וירקות עם אורז מלא', en: 'Lentil and vegetable stew with brown rice',
    items: [['lentils', 200, 'p'], ['brown_rice', 100, 'o'], ['carrot', 80, 'f'], ['onion', 50, 'f'], ['tomato', 80, 'f'], ['olive_oil', 7, 'o']] },
  { id: 'turkey-bulgur', slot: 'main', he: 'חזה הודו עם בורגול וסלט', en: 'Turkey breast with bulgur and salad',
    items: [['turkey_breast', 150, 'p'], ['bulgur', 150, 'o'], ['salad_veg', 150, 'f'], ['olive_oil', 7, 'o']] },
  { id: 'beef-potatoes', slot: 'main', he: 'בקר רזה עם תפוחי אדמה וברוקולי', en: 'Lean beef with potatoes and broccoli',
    items: [['beef_lean', 130, 'p'], ['potato', 200, 'o'], ['broccoli', 120, 'f'], ['olive_oil', 5, 'o']] },
  { id: 'tuna-salad-bread', slot: 'main', recipeId: 'recipe_20', he: 'סלט טונה וירקות עם לחם מלא', en: 'Tuna and vegetable salad with whole-wheat bread',
    items: [['tuna', 120, 'p'], ['bread', 60, 'o'], ['lettuce', 60, 'f'], ['cucumber', 80, 'f'], ['tomato', 80, 'f'], ['olive_oil', 10, 'o']] },
  { id: 'chickpea-sweet-potato', slot: 'main', recipeId: 'recipe_21', he: 'בטטה אפויה עם גרגרי חומוס וטחינה', en: 'Baked sweet potato with chickpeas and tahini',
    items: [['chickpeas', 150, 'p'], ['sweet_potato', 150, 'o'], ['tahini', 15, 'o'], ['spinach', 50, 'f']] },
  { id: 'black-bean-bowl', slot: 'main', recipeId: 'recipe_37', he: 'קערת שעועית שחורה, אורז ואבוקדו', en: 'Black bean, rice and avocado bowl',
    items: [['black_beans', 180, 'p'], ['white_rice', 150, 'o'], ['bell_pepper', 80, 'f'], ['tomato', 80, 'f'], ['avocado', 40, 'o']] },
  { id: 'shrimp-rice', slot: 'main', he: 'שרימפס בשום עם אורז וקישואים', en: 'Garlic shrimp with rice and zucchini',
    items: [['shrimp', 150, 'p'], ['white_rice', 150, 'o'], ['zucchini', 120, 'f'], ['olive_oil', 10, 'o']] },
  { id: 'pasta-feta', slot: 'main', he: 'פסטה מלאה עם פטה, קישואים ועגבניות', en: 'Whole-wheat pasta with feta, zucchini and tomatoes',
    items: [['pasta', 180, 'o'], ['feta', 50, 'p'], ['zucchini', 100, 'f'], ['tomato', 100, 'f'], ['olive_oil', 7, 'o']] },
  { id: 'edamame-quinoa', slot: 'main', he: 'קערת קינואה ואדממה', en: 'Quinoa and edamame bowl',
    items: [['edamame', 150, 'p'], ['quinoa', 150, 'o'], ['carrot', 60, 'f'], ['cucumber', 80, 'f'], ['olive_oil', 7, 'o']] },
  { id: 'mushroom-omelette-potatoes', slot: 'main', he: 'חביתת פטריות עם תפוחי אדמה', en: 'Mushroom omelette with potatoes',
    items: [['egg', 150, 'p'], ['mushrooms', 100, 'f'], ['potato', 200, 'o'], ['olive_oil', 5, 'o']] },
  { id: 'chicken-yogurt-rice', slot: 'main', he: 'עוף ברוטב יוגורט ועשבי תיבול עם אורז', en: 'Chicken in yogurt-herb sauce with rice',
    items: [['chicken_breast', 150, 'p'], ['greek_yogurt', 80, 'o'], ['white_rice', 150, 'o'], ['cucumber', 80, 'f']] },
  { id: 'lentil-quinoa-salad', slot: 'main', recipeId: 'recipe_40', he: 'סלט עדשים, קינואה ועגבניות', en: 'Lentil, quinoa and tomato salad',
    items: [['lentils', 180, 'p'], ['quinoa', 100, 'o'], ['tomato', 100, 'f'], ['cucumber', 80, 'f'], ['lemon', 20, 'f'], ['olive_oil', 10, 'o']] },

  // snacks
  { id: 'yogurt-apple', slot: 'snack', he: 'יוגורט יווני ותפוח', en: 'Greek yogurt and an apple', items: [['greek_yogurt', 150, 'p'], ['apple', 180, 'f']] },
  { id: 'veg-hummus', slot: 'snack', he: 'ירקות חתוכים עם חומוס', en: 'Cut vegetables with hummus', items: [['hummus', 60, 'p'], ['carrot', 100, 'f'], ['cucumber', 100, 'f']] },
  { id: 'apple-pb', slot: 'snack', he: 'תפוח עם חמאת בוטנים', en: 'Apple with peanut butter', items: [['apple', 180, 'f'], ['peanut_butter', 15, 'p']] },
  { id: 'almonds-banana', slot: 'snack', he: 'בננה וחופן שקדים', en: 'A banana and a handful of almonds', items: [['banana', 120, 'f'], ['almonds', 20, 'p']] },
  { id: 'cottage-cucumber', slot: 'snack', he: "קוטג' עם מלפפון", en: 'Cottage cheese with cucumber', items: [['cottage_cheese', 150, 'p'], ['cucumber', 100, 'f']] },
  { id: 'roasted-chickpeas', slot: 'snack', recipeId: 'recipe_8', he: 'גרגרי חומוס קלויים', en: 'Crispy roasted chickpeas', items: [['chickpeas', 100, 'p'], ['olive_oil', 5, 'o']] },
  { id: 'orange', slot: 'snack', he: 'תפוז', en: 'An orange', items: [['orange', 150, 'f']] },
  { id: 'edamame-snack', slot: 'snack', he: 'אדממה', en: 'Edamame', items: [['edamame', 100, 'p']] },
  { id: 'eggs-cucumber', slot: 'snack', recipeId: 'recipe_42', he: 'ביצים קשות ומלפפון', en: 'Hard-boiled eggs and cucumber', items: [['egg', 100, 'p'], ['cucumber', 100, 'f']] }
];

const TEMPLATES = Object.fromEntries(
  TEMPLATE_DEFS.map((t) => {
    const items = t.items.map(([ing, grams, role]) => {
      if (!INGREDIENTS[ing]) throw new Error(`meal-planner: template ${t.id} uses unknown ingredient ${ing}`);
      return { ing, grams, role };
    });
    const contains = Array.from(new Set(items.flatMap((i) => INGREDIENTS[i.ing].contains)));
    const words = Array.from(new Set(items.flatMap((i) => INGREDIENTS[i.ing].words)));
    return [t.id, { ...t, items, contains, words }];
  })
);

const slotPool = (slot) => (slot === 'lunch' || slot === 'dinner' ? 'main' : slot);

// ─── dietary filter ─────────────────────────────────────────────────────────

/** preferences.dietary → { diets, allergy } (same reading as the coach). */
function dietaryFromPreferences(prefs) {
  const raw = prefs && typeof prefs.dietary === 'object' && prefs.dietary ? prefs.dietary : {};
  const diets = Object.keys(DIET_EXCLUDES).filter((d) => raw[d] === true);
  const allergyText = typeof raw.allergies === 'string' ? raw.allergies.trim() : '';
  return { diets, allergy: parseAllergies(allergyText) };
}

/** Why a template is excluded for this user, or null when it is safe. */
function templateConflict(template, { diets = [], allergy = { categories: new Set(), terms: [] } } = {}) {
  for (const cat of template.contains) if (allergy.categories.has(cat)) return `allergy:${cat}`;
  const nameWords = [...normalizeText(template.en).split(' '), ...normalizeText(template.he).split(' ')];
  for (const term of allergy.terms) {
    if (template.words.some((w) => termMatchesWord(term, w))) return `allergy-term:${term}`;
    if (nameWords.some((w) => termMatchesWord(term, w))) return `allergy-term:${term}`;
  }
  for (const d of diets) {
    for (const cat of DIET_EXCLUDES[d] || []) {
      if (cat === 'meat_dairy') {
        const hasMeat = template.contains.includes('meat') || template.contains.includes('poultry');
        if (hasMeat && template.contains.includes('dairy')) return 'diet:kosher-meat-dairy';
      } else if (template.contains.includes(cat)) {
        return `diet:${d}`;
      }
    }
  }
  return null;
}

function allowedTemplates(dietary) {
  const pools = { breakfast: [], main: [], snack: [] };
  for (const t of Object.values(TEMPLATES)) if (!templateConflict(t, dietary)) pools[t.slot].push(t.id);
  return pools;
}

// ─── targets & safety ───────────────────────────────────────────────────────

const pos = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * What the week is sized to.
 * @param {object} p { preferences, survey, safety } — safety from coach.resolveSafety
 * @returns {{ mode: 'target'|'no-target'|'minor', calories, protein, carbs, fat, source, warnings: string[] }}
 */
function resolvePlanTargets({ preferences, survey, safety }) {
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  const macro = prefs.macroTargets && typeof prefs.macroTargets === 'object' ? prefs.macroTargets : {};
  const warnings = [];
  if (safety && safety.minor) {
    // Same rule as the wizard and the coach: no calorie or macro numbers for
    // under-18s, and never a deficit. Base portions, no sizing.
    return { mode: 'minor', calories: null, protein: null, carbs: null, fat: null, source: null, warnings: ['minor'] };
  }
  let calories = pos(macro.calorieOverride);
  let source = calories ? 'preferences' : null;
  if (!calories) {
    calories = pos(survey?.daily_calories?.targetDailyCalories);
    if (calories) source = 'survey';
  }
  const protein = pos(macro.protein_grams ?? macro.proteinGrams ?? macro.protein) ?? pos(survey?.protein_target_g);
  const carbs = pos(macro.carbs_grams ?? macro.carbsGrams ?? macro.carbs);
  const fat = pos(macro.fat_grams ?? macro.fatGrams ?? macro.fat);
  if (!calories) {
    warnings.push('no-target');
    return { mode: 'no-target', calories: null, protein, carbs, fat, source: null, warnings };
  }
  const floor = safety && Number.isFinite(safety.floor) ? safety.floor : null;
  if (floor && calories < floor) {
    // Never plan below the calculator's safe floor.
    warnings.push('raised-to-floor');
    calories = floor;
  }
  if (safety && safety.needsProfessional) warnings.push('professional');
  return { mode: 'target', calories: Math.round(calories), protein: protein && Math.round(protein), carbs: carbs && Math.round(carbs), fat: fat && Math.round(fat), source, warnings };
}

// ─── numbers ────────────────────────────────────────────────────────────────

const r1 = (n) => Math.round(n * 10) / 10;

function nutritionOf(items) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const { ing, grams } of items) {
    const n = INGREDIENTS[ing].per100;
    t.kcal += (n.kcal * grams) / 100;
    t.protein += (n.protein * grams) / 100;
    t.carbs += (n.carbs * grams) / 100;
    t.fat += (n.fat * grams) / 100;
  }
  return t;
}

function roundTotals(t) {
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
}

/** Kitchen amounts: whole eggs / fruit / slices, 1 g under 20 g, 5 g under 100 g, else 10 g. */
function roundGrams(ing, grams) {
  const def = INGREDIENTS[ing];
  if (def.buy.gramsPerUnit && (def.buy.unit === 'unit' || def.buy.unit === 'slice')) {
    const unit = def.buy.gramsPerUnit;
    const step = def.buy.unit === 'slice' ? unit / 2 : unit; // half slices are fine
    return Math.max(step, Math.round(grams / step) * step);
  }
  if (grams < 20) return Math.max(1, Math.round(grams));
  if (grams < 100) return Math.round(grams / 5) * 5;
  return Math.round(grams / 10) * 10;
}

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Split a template's base items into the three role buckets' nutrition. */
function roleSums(templateIds) {
  const s = { p: { kcal: 0, protein: 0 }, o: { kcal: 0, protein: 0 }, f: { kcal: 0, protein: 0 } };
  for (const id of templateIds) {
    for (const item of TEMPLATES[id].items) {
      const n = INGREDIENTS[item.ing].per100;
      s[item.role].kcal += (n.kcal * item.grams) / 100;
      s[item.role].protein += (n.protein * item.grams) / 100;
    }
  }
  return s;
}

function scaleItems(templateId, p, o) {
  return TEMPLATES[templateId].items.map(({ ing, grams, role }) => {
    const factor = role === 'p' ? p : role === 'o' ? o : 1;
    return { ing, grams: roundGrams(ing, grams * factor) };
  });
}

/**
 * Size one day. `meals` is [{ slot, templateId, locked, items? }]: locked meals
 * keep their items; the rest are scaled by the solved (p, o).
 */
function sizeDay(meals, targets) {
  const free = meals.filter((m) => !m.locked && m.templateId);
  const locked = meals.filter((m) => m.locked && m.templateId);
  const lockedN = nutritionOf(locked.flatMap((m) => m.items));
  let p = 1;
  let o = 1;

  if (targets.mode === 'target' && free.length) {
    const s = roleSums(free.map((m) => m.templateId));
    const T = targets.calories - lockedN.kcal - s.f.kcal;
    const P = targets.protein ? targets.protein - lockedN.protein - s.f.protein : null;
    const det = s.p.kcal * s.o.protein - s.o.kcal * s.p.protein;
    if (P !== null && Math.abs(det) > 1e-6 && s.p.kcal > 0 && s.o.kcal > 0) {
      p = (T * s.o.protein - s.o.kcal * P) / det;
      o = (s.p.kcal * P - T * s.p.protein) / det;
    } else {
      p = o = T / Math.max(1, s.p.kcal + s.o.kcal);
    }
    p = clamp(p, P_RANGE);
    // Calories take priority over protein when the clamp bites.
    o = s.o.kcal > 0 ? clamp((T - p * s.p.kcal) / s.o.kcal, O_RANGE) : 1;
    // o hit its bound: move p back towards the calorie target instead.
    if (s.p.kcal > 0) p = clamp((T - (s.o.kcal > 0 ? o * s.o.kcal : 0)) / s.p.kcal, P_RANGE);

    // Rounding moves the totals a little; nudge o (then p) and re-round.
    for (let i = 0; i < 4; i++) {
      const items = free.flatMap((m) => scaleItems(m.templateId, p, o));
      const got = nutritionOf(items).kcal + lockedN.kcal;
      const gap = targets.calories - got;
      if (Math.abs(gap) < targets.calories * 0.015) break;
      if (s.o.kcal > 0) o = clamp(o + gap / s.o.kcal, O_RANGE);
      else p = clamp(p + gap / Math.max(1, s.p.kcal), P_RANGE);
    }
  }

  const out = meals.map((m) => {
    if (!m.templateId) return { slot: m.slot, templateId: null, locked: false, items: [] };
    if (m.locked) return { slot: m.slot, templateId: m.templateId, locked: true, items: m.items };
    return { slot: m.slot, templateId: m.templateId, locked: false, items: scaleItems(m.templateId, p, o) };
  });
  return out;
}

function dayScore(meals, targets) {
  if (targets.mode !== 'target') return 0;
  const n = nutritionOf(meals.flatMap((m) => m.items));
  let score = Math.abs(n.kcal - targets.calories) / targets.calories;
  if (targets.protein) score += 0.6 * Math.abs(n.protein - targets.protein) / targets.protein;
  return score;
}

// ─── seeded randomness ──────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function shuffled(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── variety ────────────────────────────────────────────────────────────────

/**
 * Candidate templates for (day, slot) given the rest of the week.
 * Hard rules (kept whenever the pool allows): no same dinner (or lunch) two
 * days in a row, lunch ≠ dinner on one day, breakfast not the same as
 * yesterday's. Soft rule: a main at most twice a week.
 */
function varietyCandidates(pool, slot, dayIndex, week, dayMeals, exclude = null) {
  if (exclude) pool = pool.filter((id) => id !== exclude);
  if (!pool.length) return [];
  const at = (d, s) => (week[d] ? (week[d].meals.find((m) => m.slot === s) || {}).templateId : null);
  const banned = new Set();
  if (slot === 'dinner' || slot === 'lunch' || slot === 'breakfast') {
    if (at(dayIndex - 1, slot)) banned.add(at(dayIndex - 1, slot));
    if (at(dayIndex + 1, slot)) banned.add(at(dayIndex + 1, slot));
  }
  if (slot === 'dinner' || slot === 'lunch') {
    const other = slot === 'dinner' ? 'lunch' : 'dinner';
    const same = (dayMeals.find((m) => m.slot === other) || {}).templateId;
    if (same) banned.add(same);
  }
  let hard = pool.filter((id) => !banned.has(id));
  if (!hard.length) hard = pool; // a one-dish pool cannot vary; reported as low-variety

  if (slot === 'lunch' || slot === 'dinner') {
    const used = new Map();
    week.forEach((d, i) => {
      if (!d || i === dayIndex) return;
      for (const m of d.meals) if ((m.slot === 'lunch' || m.slot === 'dinner') && m.templateId) used.set(m.templateId, (used.get(m.templateId) || 0) + 1);
    });
    for (const m of dayMeals) if ((m.slot === 'lunch' || m.slot === 'dinner') && m.slot !== slot && m.templateId) used.set(m.templateId, (used.get(m.templateId) || 0) + 1);
    const soft = hard.filter((id) => (used.get(id) || 0) < 2);
    if (soft.length) return soft;
  }
  return hard;
}

// ─── building a week ────────────────────────────────────────────────────────

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday on or before `iso` (the Israeli week). */
function weekStartOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDaysIso(iso, -d.getUTCDay());
}

function buildDay(dayIndex, week, pools, targets, rng, lockedMeals = []) {
  let best = null;
  const tries = targets.mode === 'target' ? CANDIDATES_PER_DAY : 1;
  for (let t = 0; t < tries; t++) {
    const meals = [];
    for (const slot of SLOTS) {
      const lockedMeal = lockedMeals.find((m) => m.slot === slot && m.locked && m.templateId);
      if (lockedMeal) {
        meals.push({ ...lockedMeal });
        continue;
      }
      const candidates = varietyCandidates(pools[slotPool(slot)], slot, dayIndex, week, meals);
      meals.push({ slot, templateId: candidates.length ? pick(rng, candidates) : null, locked: false });
    }
    const sized = sizeDay(meals, targets);
    const score = dayScore(sized, targets);
    if (!best || score < best.score - 1e-9) best = { meals: sized, score };
    if (best.score < GOOD_ENOUGH) break; // well inside tolerance; stop searching
  }
  return best.meals;
}

/**
 * A fresh week. `previous` (optional stored plan) supplies locked meals, which
 * are kept exactly as they were.
 * @returns stored plan: { version, seed, weekStart, targets, days: [{ date, meals }] }
 */
function generateWeek({ weekStart, seed = 1, targets, dietary, previous = null }) {
  const pools = allowedTemplates(dietary);
  const rng = mulberry32(seed);
  const week = new Array(DAYS).fill(null);
  // Locked meals first, so variety rules around them hold.
  if (previous && Array.isArray(previous.days)) {
    previous.days.forEach((d, i) => {
      if (i >= DAYS) return;
      const lockedMeals = (d.meals || []).filter((m) => m.locked && m.templateId && TEMPLATES[m.templateId] && !templateConflict(TEMPLATES[m.templateId], dietary));
      if (lockedMeals.length) week[i] = { meals: lockedMeals };
    });
  }
  const lockedByDay = week.map((d) => (d ? d.meals : []));
  for (let i = 0; i < DAYS; i++) {
    week[i] = { meals: buildDay(i, week, pools, targets, rng, lockedByDay[i]) };
  }
  return {
    version: PLAN_VERSION,
    seed,
    swapNonce: 0,
    weekStart,
    targets,
    days: week.map((d, i) => ({ date: addDaysIso(weekStart, i), meals: d.meals }))
  };
}

/**
 * Swap one meal for another that fits (same slot pool, variety rules, the
 * user's filters), then re-size that day's unlocked meals so the day stays on
 * target. Deterministic in (plan.seed, plan.swapNonce).
 * @returns { plan, swapped: boolean }
 */
function swapMeal(plan, { dayIndex, slot, targets, dietary }) {
  const day = plan.days[dayIndex];
  if (!day) return { plan, swapped: false };
  const current = day.meals.find((m) => m.slot === slot);
  if (!current) return { plan, swapped: false };
  const pools = allowedTemplates(dietary);
  const week = plan.days.map((d) => ({ meals: d.meals }));
  const others = day.meals.filter((m) => m.slot !== slot);
  const candidates = varietyCandidates(pools[slotPool(slot)], slot, dayIndex, week, others, current.templateId);
  if (!candidates.length) return { plan, swapped: false };

  const nonce = (plan.swapNonce || 0) + 1;
  const rng = mulberry32((plan.seed * 7919 + nonce * 104729 + dayIndex * 31) >>> 0);
  // Of a few shuffled candidates, keep the one that sizes the day best.
  let best = null;
  for (const id of shuffled(rng, candidates).slice(0, 4)) {
    const meals = day.meals.map((m) => (m.slot === slot ? { slot, templateId: id, locked: false } : m));
    const sized = sizeDay(meals, targets);
    const score = dayScore(sized, targets);
    if (!best || score < best.score - 1e-9) best = { meals: sized, score };
  }
  const days = plan.days.map((d, i) => (i === dayIndex ? { ...d, meals: best.meals } : d));
  return { plan: { ...plan, swapNonce: nonce, days }, swapped: true };
}

function setLocked(plan, { dayIndex, slot, locked }) {
  const days = plan.days.map((d, i) =>
    i === dayIndex ? { ...d, meals: d.meals.map((m) => (m.slot === slot && m.templateId ? { ...m, locked: Boolean(locked) } : m)) } : d
  );
  return { ...plan, days };
}

/**
 * Re-check a stored plan against the user's current filters: a meal that now
 * conflicts (a new allergy was added) is dropped and the slot refilled.
 */
function revalidate(plan, { targets, dietary }) {
  let changed = false;
  const bad = [];
  plan.days.forEach((d, i) => d.meals.forEach((m) => {
    if (m.templateId && (!TEMPLATES[m.templateId] || templateConflict(TEMPLATES[m.templateId], dietary))) bad.push([i, m.slot]);
  }));
  let next = plan;
  for (const [i, slot] of bad) {
    next = {
      ...next,
      days: next.days.map((d, di) => (di === i ? { ...d, meals: d.meals.map((m) => (m.slot === slot ? { ...m, locked: false } : m)) } : d))
    };
    const res = swapMeal(next, { dayIndex: i, slot, targets, dietary });
    if (res.swapped) next = res.plan;
    else {
      next = { ...next, days: next.days.map((d, di) => (di === i ? { ...d, meals: sizeDay(d.meals.map((m) => (m.slot === slot ? { slot, templateId: null, locked: false } : m)), targets) } : d)) };
    }
    changed = true;
  }
  return { plan: next, changed };
}

// ─── presenting ─────────────────────────────────────────────────────────────

function withinTolerance(totals, targets) {
  if (targets.mode !== 'target') return null;
  const kcalOk = Math.abs(totals.kcal - targets.calories) <= targets.calories * TOLERANCE.kcal;
  const proteinOk = !targets.protein || Math.abs(totals.protein - targets.protein) <= targets.protein * TOLERANCE.protein;
  return { kcal: kcalOk, protein: proteinOk };
}

function presentIngredient(ing, grams, showNumbers) {
  const def = INGREDIENTS[ing];
  const out = { id: ing, he: def.he, en: def.en, grams, state: def.state };
  if (def.buy.gramsPerUnit) {
    out.units = r1(grams / def.buy.gramsPerUnit);
    out.unit = def.buy.unit;
  }
  if (showNumbers) out.nutrition = roundTotals(nutritionOf([{ ing, grams }]));
  return out;
}

/**
 * The API shape: names in both languages, nutrition per meal/day (omitted for
 * minors), tolerance flags, warnings and the shopping list.
 */
function presentPlan(plan, { targets, checked = [], dietary } = {}) {
  const t = targets || plan.targets;
  const showNumbers = t.mode !== 'minor';
  const warnings = new Set(t.warnings || []);
  const pools = dietary ? allowedTemplates(dietary) : null;
  if (pools) {
    for (const [slot, list] of Object.entries(pools)) {
      if (!list.length) warnings.add(`no-options:${slot}`);
      else if (slot === 'main' ? list.length < 3 : list.length < 2) warnings.add(`low-variety:${slot}`);
    }
  }
  const days = plan.days.map((d) => {
    const meals = d.meals.map((m) => {
      if (!m.templateId) return { slot: m.slot, templateId: null, locked: false, name: null, items: [], totals: null };
      const tpl = TEMPLATES[m.templateId];
      return {
        slot: m.slot,
        templateId: m.templateId,
        recipeId: tpl.recipeId || null,
        locked: Boolean(m.locked),
        name: { he: tpl.he, en: tpl.en },
        items: m.items.map((i) => presentIngredient(i.ing, i.grams, showNumbers)),
        totals: showNumbers ? roundTotals(nutritionOf(m.items)) : null
      };
    });
    const totals = showNumbers ? roundTotals(nutritionOf(d.meals.flatMap((m) => m.items || []))) : null;
    return { date: d.date, meals, totals, withinTolerance: totals ? withinTolerance(totals, t) : null };
  });
  return {
    weekStart: plan.weekStart,
    seed: plan.seed,
    targets: showNumbers
      ? { mode: t.mode, calories: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat, source: t.source }
      : { mode: t.mode, calories: null, protein: null, carbs: null, fat: null, source: null },
    tolerance: TOLERANCE,
    warnings: Array.from(warnings),
    days,
    shoppingList: buildShoppingList(plan, checked)
  };
}

// ─── shopping list ──────────────────────────────────────────────────────────

/**
 * Every ingredient across the week, summed, in the unit it is bought in:
 * grams (rounded up to 10 g), millilitres (via density, rounded up to 10 ml)
 * or whole units (eggs, fruit, bread slices — rounded up). Grouped by
 * supermarket section in a fixed aisle order.
 */
function buildShoppingList(plan, checked = []) {
  const totals = new Map();
  for (const d of plan.days) for (const m of d.meals) for (const i of m.items || []) totals.set(i.ing, (totals.get(i.ing) || 0) + i.grams);
  const checkedSet = new Set(checked);
  const sections = SECTIONS.map((id) => ({ id, items: [] }));
  for (const [ing, grams] of totals) {
    const def = INGREDIENTS[ing];
    let amount;
    let unit;
    if (def.buy.unit === 'ml') {
      amount = Math.ceil(grams / def.buy.density / 10) * 10;
      unit = 'ml';
    } else if (def.buy.unit === 'unit' || def.buy.unit === 'slice') {
      amount = Math.ceil(grams / def.buy.gramsPerUnit - 1e-9);
      unit = def.buy.unit;
    } else {
      amount = Math.ceil(grams / 10) * 10;
      unit = 'g';
    }
    sections.find((s) => s.id === def.section).items.push({
      key: ing, he: def.he, en: def.en, amount, unit, state: def.state, checked: checkedSet.has(ing)
    });
  }
  for (const s of sections) s.items.sort((a, b) => a.en.localeCompare(b.en));
  const nonEmpty = sections.filter((s) => s.items.length);
  return { sections: nonEmpty, totalItems: nonEmpty.reduce((n, s) => n + s.items.length, 0) };
}

module.exports = {
  SLOTS,
  DAYS,
  SECTIONS,
  TOLERANCE,
  PLAN_VERSION,
  INGREDIENTS,
  TEMPLATES,
  dietaryFromPreferences,
  templateConflict,
  allowedTemplates,
  resolvePlanTargets,
  nutritionOf,
  sizeDay,
  generateWeek,
  swapMeal,
  setLocked,
  revalidate,
  presentPlan,
  buildShoppingList,
  weekStartOf,
  addDaysIso,
  mulberry32
};
