/**
 * Yoni's recipe tools — what he can look up, and what he is not handed.
 *
 * No Anthropic call: these check the tools themselves and which persona is
 * offered which, which is where the boundary actually lives.
 *
 *   node tests/recipe-tools.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.NODE_ENV = 'test';

const { findRecipes, getRecipe, RECIPE_TOOLS } = require('../utils/recipe-tools');
const recipes = require('../data/recipes.json');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const byName = findRecipes({ query: 'שקשוקה' });
check('a dish is found by its Hebrew name', byName.recipes.some((r) => r.name === 'שקשוקה'));

const fridge = findRecipes({ ingredients: ['ביצים', 'עגבניות'] });
check('what is in the fridge finds recipes that use it', fridge.total > 0);
check(
  'the recipe using more of it comes first',
  fridge.recipes[0].main_ingredients.some((i) => i.includes('ביצ')) || fridge.recipes[0].name === 'שקשוקה',
  fridge.recipes[0].name
);

const quick = findRecipes({ max_minutes: 15 });
check('a time limit is respected', quick.recipes.every((r) => r.time_minutes <= 15));

const noEggs = findRecipes({ category: 'breakfast', exclude: ['ביצים'], limit: 10 });
check(
  'an excluded ingredient is left out',
  noEggs.recipes.every((r) => !recipes.find((x) => x.id === r.id).ingredients.some((i) => i.item.includes('ביצים')))
);

check('a limit is capped at ten', findRecipes({ limit: 99 }).recipes.length <= 10);
check('nothing matching returns an empty list, not an invented one', findRecipes({ query: 'סושי אינגה' }).total === 0);

const full = getRecipe({ id: 'recipe_1' });
check('the full recipe carries its steps and cues', full.steps.length > 0 && full.steps.some((s) => s.cue && s.heat));
check(
  'but not its calories',
  !('calories' in full) && byName.recipes.every((r) => !('calories' in r)),
  'Yoni teaches cooking; the calorie number is not his to give'
);
let threw = false;
try { getRecipe({ id: 'recipe_made_up' }); } catch { threw = true; }
check('an id that does not exist is an error, so the model has to look it up', threw);

const exclude = RECIPE_TOOLS.find((t) => t.name === 'find_recipes').input_schema.properties.exclude;
check('the tool says exclude is not an allergy check', /not an allergy check/i.test(RECIPE_TOOLS[0].description) && exclude);

// Which persona is offered which tools.
const brain = require('../utils/whapi-brain');
const names = (bot) => brain.TOOLS_BY_BOT[bot].map((t) => t.name);
check('Yoni is offered the recipe tools', names('yoni').includes('find_recipes') && names('yoni').includes('get_recipe'));
check(
  'Yoni is not offered the calorie calculators',
  !names('yoni').some((n) => n.startsWith('calculate_')),
  'his prompt says he does not set calories; the tools must not contradict it'
);
check('Adi keeps her calculators', names('adi').includes('calculate_daily_target'));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
