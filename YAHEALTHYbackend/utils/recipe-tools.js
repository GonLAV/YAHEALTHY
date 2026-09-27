/**
 * Yoni's tools — the owner's recipe library, read instead of remembered.
 *
 * Without these Yoni answered from the prompt and the model's own knowledge,
 * so "give me a recipe" produced a plausible recipe that is not one of the 45
 * the owner wrote and stands behind. With them, a recipe he gives is a recipe
 * in data/recipes.json, with its real temperatures, times and cues.
 *
 * Two deliberate omissions:
 *   - Calories are stripped. Yoni teaches cooking; the calorie number is Adi's
 *     territory and the prompt's health boundary says so ("יוני לא קובע
 *     קלוריות"). A tool that handed him the number would invite him to use it.
 *   - Excluding an ingredient is a preference filter, never an allergy check.
 *     The ingredient list does not name every trace (stock, spice blends), and
 *     the prompt's rule for an allergy is a full stop, not a filtered search.
 */
const recipes = require('../data/recipes.json');

const CATEGORIES = ['breakfast', 'salad', 'main', 'side', 'snack'];

const norm = (text) => String(text || '').toLowerCase().trim();

function mentions(recipe, needle) {
  const n = norm(needle);
  if (!n) return false;
  return (
    norm(recipe.name).includes(n) ||
    norm(recipe.name_en).includes(n) ||
    (recipe.ingredients || []).some((i) => norm(i.item).includes(n))
  );
}

function summary(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    difficulty: recipe.difficulty,
    time_minutes: recipe.time_minutes,
    servings: recipe.servings ?? null,
    vessel: recipe.vessel ?? null,
    main_ingredients: (recipe.ingredients || []).slice(0, 6).map((i) => i.item)
  };
}

/**
 * @param {{query?: string, ingredients?: string[], category?: string,
 *          max_minutes?: number, exclude?: string[], limit?: number}} input
 */
function findRecipes(input = {}) {
  const wanted = (input.ingredients || []).filter(Boolean);
  const exclude = (input.exclude || []).filter(Boolean);
  const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 10);

  const matches = recipes
    .filter((r) => !input.category || r.category === input.category)
    .filter((r) => !input.max_minutes || r.time_minutes <= Number(input.max_minutes))
    .filter((r) => !exclude.some((x) => mentions(r, x)))
    .filter((r) => !input.query || mentions(r, input.query))
    .map((r) => ({ r, score: wanted.filter((w) => mentions(r, w)).length }))
    // With ingredients given, a recipe must use at least one of them, and the
    // ones using more of what is in the fridge come first.
    .filter(({ score }) => !wanted.length || score > 0)
    .sort((a, b) => b.score - a.score || a.r.time_minutes - b.r.time_minutes);

  return {
    total: matches.length,
    recipes: matches.slice(0, limit).map(({ r }) => summary(r))
  };
}

function getRecipe(input = {}) {
  const recipe = recipes.find((r) => r.id === input.id);
  if (!recipe) throw new Error(`No recipe with id "${input.id}". Call find_recipes to get a real id.`);
  const { calories: _calories, ...cooking } = recipe;
  return cooking;
}

const RECIPE_TOOLS = [
  {
    name: 'find_recipes',
    description:
      "Search the owner's recipe library (45 tested recipes, Hebrew). Always use this before suggesting a recipe -- never invent one that is not in the library. Search by what the person has (ingredients), by a dish name (query), by category, or by how much time they have. Returns short summaries with ids; call get_recipe for the full recipe. `exclude` filters out dislikes and preferences only -- it is NOT an allergy check and must never be used to tell anyone a recipe is safe for an allergy.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A dish name or word to look for, e.g. "שקשוקה" or "עוף".' },
        ingredients: {
          type: 'array',
          items: { type: 'string' },
          description: 'What the person has at home, in Hebrew, e.g. ["חזה עוף", "בטטה"]. Recipes using more of these rank first.'
        },
        category: { type: 'string', enum: CATEGORIES },
        max_minutes: { type: 'number', description: 'Only recipes that take at most this long.' },
        exclude: { type: 'array', items: { type: 'string' }, description: 'Ingredients the person does not want (preference only).' },
        limit: { type: 'number', description: 'How many to return, 1-10. Default 5.' }
      },
      required: []
    }
  },
  {
    name: 'get_recipe',
    description:
      'The full recipe by id: ingredients with amounts, what to cook it in, and every step with its heat, minutes, the cue that tells you it is ready, and why. Use these exact temperatures, times and cues -- do not substitute your own. Where a recipe has a `safety` field, always pass that internal-temperature line on.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'A recipe id returned by find_recipes.' } },
      required: ['id']
    }
  }
];

function executeRecipeTool(name, input) {
  if (name === 'find_recipes') return findRecipes(input);
  if (name === 'get_recipe') return getRecipe(input);
  return undefined;
}

module.exports = { RECIPE_TOOLS, executeRecipeTool, findRecipes, getRecipe };
