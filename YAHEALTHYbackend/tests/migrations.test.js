/**
 * migrations/ALL.sql — the file people paste into the Supabase SQL Editor.
 *
 * It was assembled by hand and drifted: no 001_whapi_bot_conversations, no
 * 004_nutrition_engine_storage, and a 007_foods that could not run at all
 * (`default raw` without quotes). These checks keep it generated, complete
 * and one transaction. They read files only; the run against real Postgres,
 * on a fresh database and on one that already has part of it, was done with
 * PGlite when ALL.sql was rebuilt.
 *
 *   node tests/migrations.test.js
 */

const fs = require('fs');
const path = require('path');
const { build, migrationFiles } = require('../scripts/build-all-sql');

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

const allPath = path.join(__dirname, '..', 'migrations', 'ALL.sql');
const all = fs.readFileSync(allPath, 'utf8').replace(/\r\n/g, '\n');

check(
  'ALL.sql is exactly what the generator produces',
  all === build(),
  'someone edited a migration without regenerating: node scripts/build-all-sql.js'
);

for (const file of migrationFiles()) {
  check(`ALL.sql includes ${file}`, all.includes(`-- ${file}\n`));
}

const begins = (all.match(/^begin;$/gim) || []).length;
const commits = (all.match(/^commit;$/gim) || []).length;
check('ALL.sql is one transaction', begins === 1 && commits === 1, `${begins} begin / ${commits} commit`);

// The shape of the bug that kept foods from ever being created: a default
// that is a bare word, which Postgres reads as a column name.
const bareDefault = migrationFiles().filter((file) =>
  /\bdefault\s+(?!now\(\)|true\b|false\b|null\b|gen_random_uuid\(\)|current_|'|-?\d)[a-z_]+\b(?!\s*\()/i.test(
    fs
      .readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n')
  )
);
check('no migration has a bare-word default', bareDefault.length === 0, bareDefault.join(', '));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
