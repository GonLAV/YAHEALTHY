/**
 * The food database.
 *
 * The rule this suite exists to enforce: no calorie value without a source,
 * and no weight without a source either. Most of these cases are about the
 * server REFUSING — to price a food it has no weight for, to hide a gap inside
 * a total, to serve a value it cannot attribute.
 *
 *   node tests/foods.test.js
 *
 * Seeds its own foods through the same upsert path the ingest script uses, so
 * it never calls USDA and never touches the real project.
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
  const signup = await call('POST', '/api/auth/signup', {
    body: { email: `foods-${Date.now()}@example.com`, password: 'a long enough one' }
  });
  const token = signup.body?.token;
  check('an account exists to query with', !!token);

  check(
    'the food database needs a login',
    (await call('GET', '/api/foods/search?q=עגבנ')).status === 401,
    'food entries are not public data'
  );

  // ── lookup ────────────────────────────────────────────────────────────────
  const tomato = await call('GET', '/api/foods/search?q=עגבנייה', { token });
  check('a Hebrew name finds the food', tomato.status === 200 && tomato.body?.count >= 1, `status ${tomato.status}`);

  const found = tomato.body?.foods?.[0];
  check('the value is per 100 g', found?.per100g?.kcal === 18, `got ${found?.per100g?.kcal}`);
  check(
    'every value carries the reference it came from',
    found?.source?.name === 'usda_fdc' && !!found?.source?.ref,
    JSON.stringify(found?.source)
  );
  check(
    'an English name finds it too',
    (await call('GET', '/api/foods/search?q=Tomatoes', { token })).body?.count >= 1
  );
  check(
    'a one-character search is refused',
    (await call('GET', '/api/foods/search?q=ע', { token })).status === 400,
    'it would return most of the database'
  );
  check(
    'a food nobody has loaded returns nothing, not something close',
    (await call('GET', '/api/foods/search?q=פתיתים', { token })).body?.count === 0,
    'an Israeli product with no source must stay absent rather than be approximated'
  );

  // ── arithmetic ────────────────────────────────────────────────────────────
  const byGrams = await call('POST', '/api/foods/calculate', {
    token,
    body: { items: [{ foodId: found.id, grams: 250 }] }
  });
  check('grams scale from the per-100 g value', byGrams.body?.total?.kcal === 45, `got ${byGrams.body?.total?.kcal}`);
  check('the result is marked complete', byGrams.body?.complete === true);
  check('each line keeps its own source', !!byGrams.body?.items?.[0]?.source?.ref);

  const bySer = await call('POST', '/api/foods/calculate', {
    token,
    body: { items: [{ foodId: found.id, servingName: '1 medium whole (2-3/5" dia)', servings: 2 }] }
  });
  check(
    'a sourced portion weight converts to grams',
    bySer.body?.items?.[0]?.grams === 246,
    `got ${bySer.body?.items?.[0]?.grams} — 2 x 123 g, straight from FDC`
  );

  // ── and what it refuses to do ─────────────────────────────────────────────
  const noWeight = await call('POST', '/api/foods/calculate', {
    token,
    body: { items: [{ foodId: found.id }] }
  });
  check(
    'a food with no weight is not priced',
    noWeight.body?.unresolved?.length === 1 && noWeight.body?.total?.kcal === 0,
    'guessing a portion size is guessing a calorie count'
  );
  check(
    'and the refusal says what it would have needed',
    (noWeight.body?.unresolved?.[0]?.availableServings?.length ?? 0) > 0
  );

  const mixed = await call('POST', '/api/foods/calculate', {
    token,
    body: {
      items: [
        { foodId: found.id, grams: 100 },
        { foodId: '00000000-0000-0000-0000-000000000000', grams: 200 }
      ]
    }
  });
  check(
    'an unknown food does not silently vanish from the total',
    mixed.body?.complete === false && mixed.body?.unresolved?.length === 1,
    'a total that quietly dropped an item is worse than no total'
  );
  check('the part it could price is still returned', mixed.body?.total?.kcal === 18);

  check(
    'an empty request is refused',
    (await call('POST', '/api/foods/calculate', { token, body: { items: [] } })).status === 400
  );
  check(
    'an oversized request is refused',
    (await call('POST', '/api/foods/calculate', {
      token,
      body: { items: Array.from({ length: 51 }, () => ({ foodId: found.id, grams: 1 })) }
    })).status === 400
  );

  // ── coverage is stated, not assumed ───────────────────────────────────────
  const coverage = await call('GET', '/api/foods/coverage', { token });
  check('coverage reports the catalogue size', coverage.body?.catalogued === 250, `got ${coverage.body?.catalogued}`);
  check('coverage reports how much is actually loaded', typeof coverage.body?.loaded === 'number');
  check(
    'coverage names the Israeli gap',
    coverage.body?.awaitingIsraeliSource === 32,
    `got ${coverage.body?.awaitingIsraeliSource}`
  );
}

(async () => {
  const port = Number(process.env.TEST_PORT) || (await freePort());
  BASE = `http://127.0.0.1:${port}`;

  const server = spawn(
    process.execPath,
    ['-e', `
      process.env.PORT = '${port}';
      const db = require('${path.join(__dirname, '..', 'utils', 'database.js').replace(/\\/g, '\\\\')}');
      // Seeded through the same upsert the ingest script uses, with values and
      // portion weights exactly as USDA FoodData Central returned them for
      // fdcId 170457 — so the test asserts on real data, not invented data.
      db.upsertFoods([{
        name_he: 'עגבנייה',
        name_en: 'Tomatoes, red, ripe, raw, year round average',
        category: 'ירקות',
        state: 'raw',
        kcal_per_100g: 18,
        protein_g: 0.88, carbs_g: 3.89, fat_g: 0.2, fiber_g: 1.2,
        source: 'usda_fdc', source_ref: '170457', source_detail: 'SR Legacy',
        common_servings: [
          { name_en: '1 medium whole (2-3/5" dia)', grams: 123 },
          { name_en: '1 cherry', grams: 17 }
        ]
      }]).then(() => require('${path.join(__dirname, '..', 'index.js').replace(/\\/g, '\\\\')}'));
    `],
    {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        SUPABASE_URL: '',
        SUPABASE_KEY: '',
        ALLOW_MEMORY_DB: 'true',
        JWT_SECRET: 'foods-test-secret'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

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
      console.log('\nfood database\n');
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
