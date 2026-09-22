/**
 * Meal plans and the grocery list built from them.
 *
 * These moved out of a module-level array in index.js and into the database,
 * which is what makes the plan a paying customer buys survive a restart. The
 * cases below cover the behaviour that move had to preserve, the ownership
 * rules that a shared table makes load-bearing, and the mass assignment the
 * old PUT handler allowed.
 *
 *   node tests/meal-plans.test.js
 *
 * Runs against the in-memory store on a port the OS hands out, so it never
 * touches the real Supabase project.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

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

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body: json };
}

async function newUser(tag) {
  const signup = await call('POST', '/api/auth/signup', {
    body: { email: `${tag}-${Date.now()}@example.com`, password: 'a sufficiently long one' }
  });
  return signup.body?.token;
}

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE + '/api/health')).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function run() {
  const token = await newUser('planner');
  const other = await newUser('stranger');
  check('two accounts exist', !!token && !!other);

  // A real recipe id, taken from the catalogue the API serves.
  const recipesRes = await call('GET', '/api/recipes', { token });
  const catalogue = Array.isArray(recipesRes.body) ? recipesRes.body : recipesRes.body?.recipes || [];
  const recipeId = catalogue[0]?.id;
  const otherRecipeId = catalogue[1]?.id;
  check('the recipe catalogue is readable', !!recipeId, `got ${catalogue.length} recipes`);

  // ── creating ──────────────────────────────────────────────────────────────
  const created = await call('POST', '/api/meal-plans', {
    token,
    body: { recipeId, date: '2026-10-05', mealType: 'lunch' }
  });
  check('a meal can be planned', created.status === 201, `status ${created.status}`);
  const planId = created.body?.id;

  check(
    'an unknown recipe is refused',
    (await call('POST', '/api/meal-plans', {
      token,
      body: { recipeId: 'recipe_does_not_exist', date: '2026-10-06', mealType: 'lunch' }
    })).status === 400
  );

  check(
    'the same slot twice is a conflict, not a duplicate',
    (await call('POST', '/api/meal-plans', {
      token,
      body: { recipeId, date: '2026-10-05', mealType: 'lunch' }
    })).status === 409,
    'a duplicate would be counted twice by the grocery list'
  );

  // ── reading ───────────────────────────────────────────────────────────────
  const mine = await call('GET', '/api/meal-plans', { token });
  check('the plan comes back', mine.status === 200 && mine.body?.length === 1);
  check(
    'another account sees none of it',
    (await call('GET', '/api/meal-plans', { token: other })).body?.length === 0
  );
  check(
    'a date range outside the plan returns nothing',
    (await call('GET', '/api/meal-plans?start=2026-11-01&end=2026-11-30', { token })).body?.length === 0
  );

  // ── updating ──────────────────────────────────────────────────────────────
  const marked = await call('PUT', `/api/meal-plans/${planId}`, {
    token,
    body: { completed: true }
  });
  check('a meal can be marked done', marked.status === 200 && marked.body?.completed === true);

  const hijack = await call('PUT', `/api/meal-plans/${planId}`, {
    token,
    body: { completed: false, user_id: 'somebody-else', id: 'rewritten' }
  });
  check(
    'ownership cannot be rewritten through the request body',
    hijack.status === 200 && hijack.body?.id === planId && hijack.body?.user_id !== 'somebody-else',
    'the previous handler did Object.assign(plan, req.body)'
  );

  check(
    'another account cannot update it',
    (await call('PUT', `/api/meal-plans/${planId}`, { token: other, body: { completed: true } })).status === 404
  );
  check(
    'another account cannot delete it',
    (await call('DELETE', `/api/meal-plans/${planId}`, { token: other })).status === 404
  );

  // ── the grocery list is derived from the plans ────────────────────────────
  const groceries = await call('GET', '/api/grocery-list?start=2026-10-01&end=2026-10-31', { token });
  check('the grocery list reads the stored plans', groceries.status === 200 && groceries.body?.mealPlansCount === 1);

  const items = groceries.body?.items ?? [];
  check('it lists ingredients', items.length > 0);

  // The previous version of this test asserted only that the list was
  // non-empty, and passed for months while every row read "[object Object]" —
  // String() over an ingredient object. Assert the contents, not the count.
  check(
    'no row is a stringified object',
    items.every((row) => !/\[object/i.test(String(row.item))),
    `got: ${JSON.stringify(items.slice(0, 3))}`
  );
  check(
    'rows carry a readable ingredient name',
    items.every((row) => typeof row.item === 'string' && row.item.trim().length > 1)
  );
  check(
    'rows carry the quantity each recipe asks for',
    items.some((row) => Array.isArray(row.amounts) && row.amounts.length > 0),
    'a shopping list without amounts does not tell anyone how much to buy'
  );
  check(
    'more than one distinct ingredient is listed',
    items.length > 1,
    'a single row means everything collapsed to one key'
  );
  check(
    "another account's grocery list is empty",
    (await call('GET', '/api/grocery-list', { token: other })).body?.mealPlansCount === 0
  );

  // ── generating a range ────────────────────────────────────────────────────
  const generated = await call('POST', '/api/meal-plans/generate', {
    token,
    body: { startDate: '2026-10-05', endDate: '2026-10-07', mealTypes: ['breakfast', 'lunch'] }
  });
  check('a range generates', generated.status === 201, `status ${generated.status}`);
  check(
    'the slot that was already taken is skipped, not duplicated',
    generated.body?.skippedCount === 1 && generated.body?.createdCount === 5,
    `created ${generated.body?.createdCount}, skipped ${generated.body?.skippedCount}`
  );

  const regenerated = await call('POST', '/api/meal-plans/generate', {
    token,
    body: { startDate: '2026-10-05', endDate: '2026-10-07', mealTypes: ['breakfast', 'lunch'], overwrite: true }
  });
  check(
    'overwrite clears the range first',
    regenerated.body?.deleted === 6 && regenerated.body?.createdCount === 6,
    `deleted ${regenerated.body?.deleted}, created ${regenerated.body?.createdCount}`
  );

  check(
    'a range longer than a month is refused',
    (await call('POST', '/api/meal-plans/generate', {
      token,
      body: { startDate: '2026-01-01', endDate: '2026-06-01' }
    })).status === 400
  );

  // ── deleting ──────────────────────────────────────────────────────────────
  const all = await call('GET', '/api/meal-plans', { token });
  const victim = all.body?.[0]?.id;
  check('deleting works', (await call('DELETE', `/api/meal-plans/${victim}`, { token })).status === 200);
  check(
    'deleting the same plan again is a miss',
    (await call('DELETE', `/api/meal-plans/${victim}`, { token })).status === 404
  );

  // ── and the whole lot goes with the account ───────────────────────────────
  await call('DELETE', '/api/users/me', { token, body: { password: 'a sufficiently long one' } });
  check(
    'plans do not outlive the account',
    (await call('GET', '/api/meal-plans', { token })).status === 401
  );
}

(async () => {
  const port = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${port}`;

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_KEY: '',
      ALLOW_MEMORY_DB: 'true',
      JWT_SECRET: 'meal-plans-test-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));

  let code = 1;
  try {
    if (!(await waitForServer())) {
      console.error('server did not start:\n' + log.join(''));
    } else if (log.join('').includes('EADDRINUSE')) {
      console.error(`port ${port} is already in use — aborting rather than testing another process`);
    } else {
      console.log('\nmeal plans\n');
      await run();
      console.log(`\n${passed} passed, ${failed} failed\n`);
      code = failed === 0 ? 0 : 1;
    }
  } catch (error) {
    console.error('\nsuite crashed:', error && error.message);
  } finally {
    server.kill();
  }
  process.exit(code);
})();
