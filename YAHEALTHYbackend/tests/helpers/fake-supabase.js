/**
 * A tiny in-process stand-in for @supabase/supabase-js, for tests that need
 * the Supabase branch of utils/database.js rather than the memory store.
 *
 * It models the one server behaviour those tests are about: PostgREST caps
 * every response at `maxRows` (Supabase's "Max rows" API setting, 1000 by
 * default) whatever `.limit()` asks for. Only reads are implemented
 * (select/eq/in/gte/lt/lte/is/order/limit/range); tables are seeded directly.
 *
 * Install before requiring utils/database.js:
 *   const fake = require('./helpers/fake-supabase').install({ maxRows: 1000 });
 *   fake.tables.users = [...];
 */

function install({ maxRows = 1000 } = {}) {
  const tables = {};

  function builder(table) {
    const filters = [];
    const orders = [];
    let limitN = null;
    let rangeFrom = null;
    let rangeTo = null;

    const q = {
      select() { return q; },
      eq(col, val) { filters.push((r) => r[col] === val); return q; },
      in(col, vals) { const s = new Set(vals); filters.push((r) => s.has(r[col])); return q; },
      gte(col, val) { filters.push((r) => r[col] >= val); return q; },
      gt(col, val) { filters.push((r) => r[col] > val); return q; },
      lt(col, val) { filters.push((r) => r[col] < val); return q; },
      lte(col, val) { filters.push((r) => r[col] <= val); return q; },
      is(col, val) { filters.push((r) => (r[col] ?? null) === val); return q; },
      order(col, { ascending = true } = {}) { orders.push([col, ascending]); return q; },
      limit(n) { limitN = n; return q; },
      range(a, b) { rangeFrom = a; rangeTo = b; return q; },
      then(resolve, reject) {
        try {
          let rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
          if (orders.length) {
            rows = rows.slice().sort((x, y) => {
              for (const [col, asc] of orders) {
                if (x[col] === y[col]) continue;
                const cmp = String(x[col]) < String(y[col]) ? -1 : 1;
                return asc ? cmp : -cmp;
              }
              return 0;
            });
          }
          if (rangeFrom !== null) rows = rows.slice(rangeFrom, rangeTo + 1);
          if (limitN !== null) rows = rows.slice(0, limitN);
          rows = rows.slice(0, maxRows); // the server-side cap
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject);
        } catch (error) {
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        }
      }
    };
    return q;
  }

  const client = { from: (table) => builder(table) };
  const fakeModule = { createClient: () => client };
  const modPath = require.resolve('@supabase/supabase-js');
  require.cache[modPath] = { id: modPath, filename: modPath, loaded: true, exports: fakeModule };
  return { tables, client };
}

module.exports = { install };
