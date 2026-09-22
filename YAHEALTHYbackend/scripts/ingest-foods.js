/**
 * Load food values from USDA FoodData Central into the foods table.
 *
 * This script exists so that no calorie value in YAHEALTHY is ever typed in by
 * hand or produced by a language model. Every row it writes carries the fdcId
 * it came from, so any number can be traced back and checked. A food it cannot
 * resolve is reported and skipped — never filled in with a guess.
 *
 * The Hebrew names come from data/food-catalog-he.json, which holds names,
 * categories and search terms and deliberately holds no values at all.
 *
 *   USDA_API_KEY=... node scripts/ingest-foods.js            # everything
 *   USDA_API_KEY=... node scripts/ingest-foods.js --limit 10 # a sample
 *   USDA_API_KEY=... node scripts/ingest-foods.js --dry-run  # resolve, write nothing
 *
 * A free key takes a minute: https://fdc.nal.usda.gov/api-key-signup.html
 * DEMO_KEY works but allows only about 30 requests an hour, which is not
 * enough for the catalogue.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.USDA_API_KEY || '';
const BASE = 'https://api.nal.usda.gov/fdc/v1';

// Energy. FDC reports it under two nutrient numbers and two units, and getting
// this wrong is the difference between 15 and 44 for the same cucumber.
const ENERGY_KCAL_IDS = [1008, 2047, 2048];
const NUTRIENTS = {
  protein_g: [1003],
  carbs_g: [1005],
  fat_g: [1004],
  fiber_g: [1079],
  sugar_g: [2000, 1063],
  sodium_mg: [1093],
};

// Foundation is the best-measured set; SR Legacy is the broad reference set.
// Branded is manufacturer-declared and far less consistent, so it is a last
// resort and is recorded as such.
const DATA_TYPES = 'Foundation,SR Legacy';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitFlag = args.indexOf('--limit');
const LIMIT = limitFlag !== -1 ? Number(args[limitFlag + 1]) : Infinity;

function nutrientValue(food, ids) {
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    if (!ids.includes(id)) continue;
    const unit = String(n.unitName ?? n.nutrient?.unitName ?? '').toUpperCase();
    const value = n.value ?? n.amount;
    if (value == null) continue;
    // kJ is not kcal. Convert rather than store a number four times too large.
    if (unit === 'KJ') return Math.round((value / 4.184) * 10) / 10;
    return value;
  }
  return null;
}

/**
 * Portion weights, straight from FDC. This is what lets "one medium tomato" or
 * "a tablespoon of oil" become grams without anybody estimating.
 */
function portions(food) {
  const out = [];
  for (const p of food.foodPortions || []) {
    const grams = p.gramWeight;
    if (!grams) continue;
    const label = [p.amount, p.modifier || p.measureUnit?.name]
      .filter((x) => x && x !== 'undetermined')
      .join(' ')
      .trim();
    if (!label) continue;
    out.push({ name_en: label, grams });
  }
  return out;
}

async function search(query) {
  const url =
    `${BASE}/foods/search?query=${encodeURIComponent(query)}` +
    `&dataType=${encodeURIComponent(DATA_TYPES)}&pageSize=1&api_key=${API_KEY}`;

  const res = await fetch(url);
  if (res.status === 429) {
    throw Object.assign(new Error('USDA rate limit reached'), { rateLimited: true });
  }
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const body = await res.json();
  return (body.foods || [])[0] || null;
}

async function detail(fdcId) {
  const res = await fetch(`${BASE}/food/${fdcId}?api_key=${API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  if (!API_KEY) {
    console.error(
      'USDA_API_KEY is not set.\n' +
        'Get a free key at https://fdc.nal.usda.gov/api-key-signup.html and put it in .env.\n' +
        'Refusing to run: without a source there is nothing to load, and this script ' +
        'will not invent values.'
    );
    process.exit(1);
  }

  const catalogPath = path.join(__dirname, '..', 'data', 'food-catalog-he.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  const resolvable = catalog.foods.filter((f) => f.source_plan === 'usda_fdc' && f.fdc_query);
  const israeli = catalog.foods.filter((f) => f.source_plan !== 'usda_fdc');
  const todo = resolvable.slice(0, LIMIT);

  console.log(`catalogue: ${catalog.foods.length} foods`);
  console.log(`  ${resolvable.length} resolvable from USDA FDC${LIMIT < Infinity ? ` (loading ${todo.length})` : ''}`);
  console.log(`  ${israeli.length} Israeli-specific — skipped, see the report at the end\n`);

  const rows = [];
  const failures = [];

  for (const [index, food] of todo.entries()) {
    const label = `${index + 1}/${todo.length} ${food.name_he}`;
    try {
      const hit = await search(food.fdc_query);
      if (!hit) {
        failures.push({ ...food, reason: 'no FDC match' });
        console.log(`  MISS ${label} — no match for "${food.fdc_query}"`);
        continue;
      }

      const full = (await detail(hit.fdcId)) || hit;
      const kcal = nutrientValue(full, ENERGY_KCAL_IDS);

      if (kcal == null) {
        failures.push({ ...food, reason: `FDC ${hit.fdcId} carries no energy value` });
        console.log(`  MISS ${label} — fdcId ${hit.fdcId} has no energy value`);
        continue;
      }

      const row = {
        name_he: food.name_he,
        name_en: full.description,
        category: food.category,
        state: food.state,
        kcal_per_100g: kcal,
        source: 'usda_fdc',
        source_ref: String(hit.fdcId),
        source_detail: full.dataType || hit.dataType || null,
        common_servings: portions(full),
      };
      for (const [column, ids] of Object.entries(NUTRIENTS)) {
        row[column] = nutrientValue(full, ids);
      }

      rows.push(row);
      console.log(
        `  OK   ${label} — ${kcal} kcal/100g  [fdcId ${hit.fdcId}, ${row.source_detail}` +
          `${row.common_servings.length ? `, ${row.common_servings.length} portions` : ''}]`
      );
    } catch (error) {
      if (error.rateLimited) {
        console.error(
          `\nStopped at ${index + 1}/${todo.length}: USDA rate limit. ` +
            'DEMO_KEY allows about 30 requests an hour; a free personal key allows far more.'
        );
        break;
      }
      failures.push({ ...food, reason: error.message });
      console.log(`  ERR  ${label} — ${error.message}`);
    }
  }

  const outPath = path.join(__dirname, '..', 'data', 'foods-usda.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        _note_he:
          'נטען אוטומטית מ-USDA FoodData Central. כל שורה נושאת את ה-fdcId ' +
          'שממנו הגיעה, כך שאפשר לבדוק כל מספר. אין כאן ערך שהוזן ביד.',
        source: 'USDA FoodData Central',
        dataTypes: DATA_TYPES,
        count: rows.length,
        foods: rows,
      },
      null,
      2
    ) + '\n'
  );

  console.log(`\n${rows.length} foods written to data/foods-usda.json`);

  if (!DRY_RUN && rows.length) {
    const db = require('../utils/database');
    const written = await db.upsertFoods(rows);
    console.log(`${written} rows upserted into the foods table`);
  } else if (DRY_RUN) {
    console.log('dry run — nothing written to the database');
  }

  // Never a silent gap. Anything not loaded is named here.
  if (failures.length) {
    console.log(`\n${failures.length} could not be resolved from FDC:`);
    for (const f of failures) console.log(`  - ${f.name_he} (${f.reason})`);
  }
  if (israeli.length) {
    console.log(
      `\n${israeli.length} Israeli products have no USDA equivalent and need the Ministry of ` +
        'Health database or a manufacturer label:'
    );
    console.log('  ' + israeli.map((f) => f.name_he).join(' · '));
  }
}

main().catch((error) => {
  console.error('ingest failed:', error && error.message);
  process.exit(1);
});
