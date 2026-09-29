/**
 * Fast food logging — "log again" suggestions, copy a day/meal, favourites and
 * saved meals, quick add, catalog logging, undo.
 *
 * The pure ranking (utils/food-logging.js) is tested to the hour with a fixed
 * `now`; the endpoints (routes/food-logging.js) run against the in-memory
 * store. The ownership checks matter most: a saved meal or a log id is a
 * plain UUID in a URL, so user B holding A's id must get "not found" and
 * change nothing.
 *
 *   node tests/food-logging-fast.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'food-logging-fast-test-secret';
process.env.VERCEL = '1';

const db = require('../utils/database');
const fl = require('../utils/food-logging');
const { localDate } = require('../utils/engagement');

let BASE;
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

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body: json };
}

let seq = 0;
async function signup() {
  seq++;
  const res = await call('POST', '/api/auth/signup', {
    body: { email: `fast-log-${Date.now()}-${seq}@example.com`, password: 'correct horse battery' }
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status}`);
  return { id: res.body.id, token: res.body.token };
}

// ─── pure ranking ──────────────────────────────────────────────────────────
function pure() {
  console.log('\nranking (pure)\n');
  // 2026-09-29 06:30 UTC = 09:30 in Jerusalem (IDT, UTC+3).
  const now = new Date('2026-09-29T06:30:00Z');
  const TZ = 'Asia/Jerusalem';
  const at = (daysAgo, utcHour) => {
    const d = new Date(now.getTime() - daysAgo * 86400000);
    d.setUTCHours(utcHour, 0, 0, 0);
    return d.toISOString();
  };
  const log = (name, daysAgo, utcHour, meal, extra = {}) => ({
    name,
    meal_type: meal,
    calories: 100,
    created_at: at(daysAgo, utcHour),
    date: at(daysAgo, utcHour).slice(0, 10),
    ...extra
  });

  // Frequency: five oatmeal breakfasts beat one yoghurt, even a newer one.
  let ranked = fl.rankSuggestions(
    [
      ...[1, 3, 5, 7, 9].map((d) => log('Oatmeal', d, 5, 'breakfast')),
      log('Yoghurt', 1, 5, 'breakfast')
    ],
    { meal: 'breakfast', tz: TZ, now }
  );
  check('frequency: the food logged most often ranks first', ranked[0]?.name === 'Oatmeal', ranked.map((r) => r.name).join(','));
  check('each suggestion says how often it was logged', ranked[0]?.count === 5 && ranked[1]?.count === 1);

  // Recency: three logs two months ago lose to two logs this week.
  ranked = fl.rankSuggestions(
    [...[60, 61, 62].map((d) => log('Old habit', d, 5, 'breakfast')), ...[1, 2].map((d) => log('New habit', d, 5, 'breakfast'))],
    { meal: 'breakfast', tz: TZ, now }
  );
  check('recency: recent foods outrank a stale habit', ranked[0]?.name === 'New habit', ranked.map((r) => `${r.name}:${r.score}`).join(','));

  // Time of day: same count, same age, same slot — the one usually eaten at
  // this hour wins. 05:00 UTC = 08:00 Jerusalem (near 09:30); 17:00 UTC = 20:00.
  const morningEvening = [log('Evening snack', 2, 17, 'snack'), log('Morning snack', 2, 5, 'snack')];
  ranked = fl.rankSuggestions(morningEvening, { meal: 'snack', tz: TZ, now });
  check('time of day: the food eaten around this hour ranks first (morning)', ranked[0]?.name === 'Morning snack');
  const evening = new Date('2026-09-29T17:30:00Z');
  ranked = fl.rankSuggestions(morningEvening, { meal: 'snack', tz: TZ, now: evening });
  check('time of day: and in the evening the evening food does', ranked[0]?.name === 'Evening snack');
  // The slot guessed for "now" is the user's, not the server's: 06:30 UTC is
  // breakfast in Jerusalem and still the previous evening in Los Angeles.
  check(
    'the inferred meal slot uses the user\'s zone',
    fl.mealForHour(fl.localHour(now, TZ)) === 'breakfast' &&
      fl.mealForHour(fl.localHour(now, 'America/Los_Angeles')) === 'snack'
  );

  // Meal slot: asking for lunch puts lunch foods first.
  ranked = fl.rankSuggestions(
    [log('Eggs', 1, 5, 'breakfast'), log('Eggs', 2, 5, 'breakfast'), log('Salad', 3, 10, 'lunch')],
    { meal: 'lunch', tz: TZ, now }
  );
  check('meal slot: the requested slot\'s foods come first', ranked[0]?.name === 'Salad');
  check('a suggestion carries the requested meal slot', ranked.every((r) => r.mealType === 'lunch'));

  // Last-used quantity and values.
  ranked = fl.rankSuggestions(
    [
      log('Rice', 5, 10, 'lunch', { quantity: 100, unit: 'g', calories: 130 }),
      log('rice ', 1, 10, 'lunch', { quantity: 150, unit: 'g', calories: 195 })
    ],
    { meal: 'lunch', tz: TZ, now }
  );
  check('spellings that differ only in case/space are the same food', ranked.length === 1 && ranked[0].count === 2);
  check('one tap logs the last-used quantity', ranked[0]?.quantity === 150 && ranked[0]?.calories === 195);

  // Catalog foods group by id, whatever the display name was.
  ranked = fl.rankSuggestions(
    [log('עגבנייה', 1, 10, 'lunch', { food_id: 'f1' }), log('Tomato', 2, 10, 'lunch', { food_id: 'f1' })],
    { meal: 'lunch', tz: TZ, now }
  );
  check('catalog foods group by food id across languages', ranked.length === 1 && ranked[0].foodId === 'f1');
  check('an empty history suggests nothing', fl.rankSuggestions([], { now }).length === 0);

  check('mealForHour: 08 → breakfast, 13 → lunch, 19 → dinner, 23 → snack',
    ['breakfast', 'lunch', 'dinner', 'snack'].join() === [8, 13, 19, 23].map(fl.mealForHour).join());
  check('localHour reads the zone', fl.localHour(now, TZ) === 9 && fl.localHour(now, 'UTC') === 6);
  check('addDaysIso crosses months and DST without drift',
    fl.addDaysIso('2026-10-01', -1) === '2026-09-30' && fl.addDaysIso('2026-03-29', 1) === '2026-03-30');
  const scaled = fl.scaleFood({ kcal_per_100g: 18, protein_g: 0.88, carbs_g: 3.89, fat_g: 0.2 }, 250);
  check('scaleFood: per-100 g values scale to the portion', scaled.kcal === 45 && scaled.proteinG === 2.2);
}

// ─── endpoints ─────────────────────────────────────────────────────────────
async function endpoints() {
  console.log('\nendpoints\n');
  const a = await signup();
  const b = await signup();
  const TZ = 'Pacific/Kiritimati'; // UTC+14: its "today" is often not the server's
  const today = localDate(new Date(), TZ);
  const yesterday = fl.addDaysIso(today, -1);

  check('suggestions need a login', (await call('GET', '/api/food-logs/suggestions')).status === 401);

  // Quick add: calories only (the page fills in a name).
  const quick = await call('POST', '/api/food-logs', {
    token: a.token,
    body: { date: today, name: 'Quick add', calories: 250, mealType: 'snack' }
  });
  check('quick add: name + calories is enough', quick.status === 201 && quick.body?.calories === 250);

  // Catalog food: the server computes the values, from the sourced row.
  const found = await call('GET', `/api/foods/search?q=${encodeURIComponent('עגבניות')}`, { token: a.token });
  const tomato = found.body?.foods?.[0];
  check('catalog search finds a food by its Hebrew synonym', tomato?.nameHe === 'עגבנייה', JSON.stringify(found.body?.foods?.map((f) => f.nameHe)));
  const fromCatalog = await call('POST', '/api/food-logs', {
    token: a.token,
    body: { tz: TZ, foodId: tomato.id, grams: 250, calories: 9999, mealType: 'lunch' }
  });
  check('catalog log: 201', fromCatalog.status === 201, JSON.stringify(fromCatalog.body));
  check('catalog log: values come from the catalog, not the client', fromCatalog.body?.calories === 45);
  check('catalog log: quantity, unit and food id are kept', fromCatalog.body?.quantity === 250 && fromCatalog.body?.unit === 'g' && fromCatalog.body?.food_id === tomato.id);
  check('catalog log: no date + tz files it under the user\'s today', fromCatalog.body?.date === today);
  check('catalog log: unknown food id is 404',
    (await call('POST', '/api/food-logs', { token: a.token, body: { date: today, foodId: '00000000-0000-4000-8000-000000000000', grams: 100 } })).status === 404);
  check('a log with neither catalog food nor calories is refused',
    (await call('POST', '/api/food-logs', { token: a.token, body: { date: today, name: 'Nothing' } })).status === 400);

  // Suggestions from history.
  for (let i = 0; i < 3; i++) {
    await db.createFoodLog(a.id, { date: fl.addDaysIso(today, -i - 1), name: 'Oatmeal', meal_type: 'breakfast', calories: 300, quantity: 60, unit: 'g' });
  }
  await db.createFoodLog(a.id, { date: yesterday, name: 'Coffee', meal_type: 'breakfast', calories: 5 });
  const sug = await call('GET', `/api/food-logs/suggestions?meal=breakfast&tz=${encodeURIComponent(TZ)}`, { token: a.token });
  check('suggestions: 200 with the meal asked for', sug.status === 200 && sug.body?.meal === 'breakfast' && sug.body?.inferredMeal === false);
  check('suggestions: most frequent breakfast first', sug.body?.suggestions?.[0]?.name === 'Oatmeal');
  check('suggestions: with the last-used quantity', sug.body?.suggestions?.[0]?.quantity === 60);
  const inferred = await call('GET', `/api/food-logs/suggestions?tz=${encodeURIComponent(TZ)}`, { token: a.token });
  check('suggestions: without meal, the slot is inferred from the local hour', inferred.body?.inferredMeal === true && fl.MEAL_TYPES.includes(inferred.body?.meal));
  const bSug = await call('GET', '/api/food-logs/suggestions?meal=breakfast', { token: b.token });
  check('suggestions are per user', bSug.status === 200 && bSug.body?.suggestions?.length === 0);
  check('suggestions: bad meal is 400', (await call('GET', '/api/food-logs/suggestions?meal=brunch', { token: a.token })).status === 400);

  // Copy yesterday's breakfast into today, in the user's zone.
  const copyMeal = await call('POST', '/api/food-logs/copy', { token: a.token, body: { tz: TZ, mealType: 'breakfast' } });
  check('copy: defaults to yesterday → today in the user\'s zone',
    copyMeal.status === 201 && copyMeal.body?.fromDate === yesterday && copyMeal.body?.toDate === today,
    JSON.stringify({ from: copyMeal.body?.fromDate, to: copyMeal.body?.toDate, today }));
  check('copy: only that meal is copied', copyMeal.body?.copiedCount === 2 && copyMeal.body.logs.every((l) => l.meal_type === 'breakfast' && l.date === today));
  check('copy: returns the new ids (for undo)', copyMeal.body?.ids?.length === 2);
  check('copy: quantity travels with the copy', copyMeal.body?.logs?.some((l) => l.name === 'Oatmeal' && l.quantity === 60));
  const copyToSnack = await call('POST', '/api/food-logs/copy', { token: a.token, body: { tz: TZ, fromDate: today, mealType: 'lunch', toMealType: 'dinner' } });
  check('copy: today\'s lunch as today\'s dinner is allowed', copyToSnack.status === 201 && copyToSnack.body?.logs?.[0]?.meal_type === 'dinner');
  check('copy: same day and same meal is refused', (await call('POST', '/api/food-logs/copy', { token: a.token, body: { fromDate: today, toDate: today } })).status === 400);
  const bCopy = await call('POST', '/api/food-logs/copy', { token: b.token, body: { fromDate: yesterday, toDate: today } });
  check('copy: B copying "yesterday" gets B\'s (empty) day, not A\'s', bCopy.status === 201 && bCopy.body?.copiedCount === 0);

  // Undo.
  const bLog = await call('POST', '/api/food-logs', { token: b.token, body: { date: today, name: 'B toast', calories: 90 } });
  const bUndoA = await call('POST', '/api/food-logs/undo', { token: b.token, body: { ids: copyMeal.body.ids } });
  check('undo: B cannot delete A\'s logs', bUndoA.status === 404);
  check('undo: A\'s logs are still there', !!(await db.getFoodLogById(a.id, copyMeal.body.ids[0])));
  const aUndo = await call('POST', '/api/food-logs/undo', { token: a.token, body: { ids: [...copyMeal.body.ids, bLog.body.id] } });
  check('undo: A deletes only A\'s own among mixed ids', aUndo.status === 200 && aUndo.body?.deletedCount === 2);
  check('undo: B\'s log survives A\'s undo', !!(await db.getFoodLogById(b.id, bLog.body.id)));
  check('undo: ids must be UUIDs', (await call('POST', '/api/food-logs/undo', { token: a.token, body: { ids: ['x'] } })).status === 400);

  // Favourites & saved meals.
  const fav = await call('POST', '/api/food-logs/template', { token: a.token, body: { name: 'Oatmeal', calories: 300, quantity: 60, unit: 'g', mealType: 'breakfast' } });
  check('favourite food: created (kind food, keeps quantity)', fav.status === 201 && fav.body?.kind === 'food' && fav.body?.quantity === 60);
  // The legacy contract (test-system.sh): blank notes are stored as null, not "".
  const blankNotes = await call('POST', '/api/food-logs/template', { token: a.token, body: { name: 'Yogurt', calories: 180, notes: '' } });
  check('blank notes are stored as null', blankNotes.status === 201 && blankNotes.body?.notes === null, JSON.stringify(blankNotes.body?.notes));
  await call('DELETE', `/api/food-logs/templates/${blankNotes.body?.id}`, { token: a.token }); // keep the list counts below unchanged
  const favCatalog = await call('POST', '/api/food-logs/template', { token: a.token, body: { foodId: tomato.id, grams: 100, name: 'Tomato' } });
  check('favourite catalog food: values from the catalog', favCatalog.status === 201 && favCatalog.body?.calories === 18 && favCatalog.body?.food_id === tomato.id);
  const meal = await call('POST', '/api/food-logs/template', {
    token: a.token,
    body: {
      kind: 'meal',
      name: 'My usual breakfast',
      mealType: 'breakfast',
      items: [
        { name: 'Oatmeal', calories: 300, proteinGrams: 10, quantity: 60, unit: 'g' },
        { name: 'Coffee', calories: 5 },
        { foodId: tomato.id, grams: 50 }
      ]
    }
  });
  check('saved meal: created with items and totals', meal.status === 201 && meal.body?.kind === 'meal' && meal.body?.items?.length === 3 && meal.body?.calories === 314, JSON.stringify(meal.body));
  check('saved meal: needs at least one item', (await call('POST', '/api/food-logs/template', { token: a.token, body: { kind: 'meal', name: 'Empty', items: [] } })).status === 400);
  await call('POST', '/api/food-logs', { token: a.token, body: { date: today, name: 'Pita', calories: 250, mealType: 'dinner' } });
  const fromMeal = await call('POST', '/api/food-logs/templates/from-meal', { token: a.token, body: { date: today, mealType: 'dinner', name: 'Friday dinner' } });
  check('save a logged meal as a saved meal', fromMeal.status === 201 && fromMeal.body?.items?.length === 2, JSON.stringify(fromMeal.body));
  check('save an empty meal is 404', (await call('POST', '/api/food-logs/templates/from-meal', { token: a.token, body: { date: today, mealType: 'breakfast', name: 'x' } })).status === 404);

  const list = await call('GET', '/api/food-logs/templates', { token: a.token });
  check('list: A sees all four', list.status === 200 && list.body?.length === 4);
  const meals = await call('GET', '/api/food-logs/templates?kind=meal', { token: a.token });
  check('list: kind filter', meals.body?.length === 2 && meals.body.every((t) => t.kind === 'meal'));
  const bList = await call('GET', '/api/food-logs/templates', { token: b.token });
  check('list: B sees none of A\'s', bList.body?.length === 0);

  const renamed = await call('PATCH', `/api/food-logs/templates/${meal.body.id}`, { token: a.token, body: { name: 'Weekday breakfast' } });
  check('rename: owner can rename', renamed.status === 200 && renamed.body?.name === 'Weekday breakfast' && renamed.body?.items?.length === 3);
  check('rename: B gets 404 on A\'s saved meal',
    (await call('PATCH', `/api/food-logs/templates/${meal.body.id}`, { token: b.token, body: { name: 'pwned' } })).status === 404);
  check('rename: an empty change is 400', (await call('PATCH', `/api/food-logs/templates/${meal.body.id}`, { token: a.token, body: {} })).status === 400);

  const bLogA = await call('POST', `/api/food-logs/templates/${meal.body.id}/log`, { token: b.token, body: { date: today } });
  check('IDOR: B cannot log A\'s saved meal', bLogA.status === 404);
  const bAfter = await call('GET', `/api/food-logs?date=${today}`, { token: b.token });
  check('IDOR: and nothing was written to B\'s log', bAfter.body?.length === 1);
  check('IDOR: B cannot delete A\'s saved meal', (await call('DELETE', `/api/food-logs/templates/${meal.body.id}`, { token: b.token })).status === 404);

  const logged = await call('POST', `/api/food-logs/templates/${meal.body.id}/log`, { token: a.token, body: { tz: TZ } });
  check('one tap: a saved meal logs every item', logged.status === 201 && logged.body?.loggedCount === 3 && logged.body?.ids?.length === 3);
  check('one tap: under the template\'s meal slot and the user\'s today',
    logged.body?.logs?.every((l) => l.meal_type === 'breakfast' && l.date === today));
  const favLogged = await call('POST', `/api/food-logs/templates/${fav.body.id}/log`, { token: a.token, body: { date: today, mealType: 'snack' } });
  check('one tap: a favourite food logs once, meal slot overridable', favLogged.body?.loggedCount === 1 && favLogged.body?.logs?.[0]?.meal_type === 'snack' && favLogged.body.logs[0].quantity === 60);

  // Engagement still sees these logs (streaks read the same food_logs).
  const eng = await call('GET', `/api/engagement/summary?tz=${encodeURIComponent(TZ)}`, { token: a.token });
  check('engagement: food streak counts today\'s one-tap logs', eng.status === 200 && eng.body?.streaks?.food?.current >= 1, JSON.stringify(eng.body?.streaks?.food));

  const undoMeal = await call('POST', '/api/food-logs/undo', { token: a.token, body: { ids: logged.body.ids } });
  check('undo a one-tap saved meal', undoMeal.body?.deletedCount === 3);

  const del = await call('DELETE', `/api/food-logs/templates/${meal.body.id}`, { token: a.token });
  check('delete: owner can delete', del.status === 200);
  check('delete: then it is gone', (await call('POST', `/api/food-logs/templates/${meal.body.id}/log`, { token: a.token, body: {} })).status === 404);

  // Old paths still answer.
  check('GET /api/food-logs/:id still works', (await call('GET', `/api/food-logs/${quick.body.id}`, { token: a.token })).status === 200);
  check('GET /api/food-logs/stats still reaches its handler', (await call('GET', '/api/food-logs/stats', { token: a.token })).status === 200);
}

(async () => {
  let code = 1;
  let server;
  try {
    pure();
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;
    await endpoints();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
  }
  process.exit(code);
})();
