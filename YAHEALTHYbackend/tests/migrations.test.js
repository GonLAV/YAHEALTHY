/**
 * migrations/ALL.sql stays the exact ordered concatenation of the numbered
 * migration files (scripts/check-migrations.js).
 *
 *   node tests/migrations.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, check } = require('../scripts/check-migrations');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('migrations');

test('ALL.sql matches the numbered files (run scripts/check-migrations.js --write)', () => {
  const result = check();
  assert.ok(result.ok, result.problems.join('; '));
});

test('every numbered file documents its way back (rollback / נתיב חזרה)', () => {
  const dir = path.join(__dirname, '..', 'migrations');
  const missing = check().files.filter(
    (f) => !/rollback|נתיב חזרה/i.test(fs.readFileSync(path.join(dir, f), 'utf8'))
  );
  // Files from before the convention; do not let the list grow.
  const legacy = ['001_initial_schema.sql'];
  const unexpected = missing.filter((f) => !legacy.includes(f));
  assert.deepStrictEqual(unexpected, [], `no rollback note in: ${unexpected.join(', ')}`);
});

test('the checker catches a missing file, a reorder and a hand edit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  try {
    fs.writeFileSync(path.join(dir, '001_a.sql'), 'select 1;\n');
    fs.writeFileSync(path.join(dir, '002_b.sql'), 'select 2;');
    fs.writeFileSync(path.join(dir, 'ALL.sql'), build(dir));
    assert.ok(check(dir).ok);

    fs.writeFileSync(path.join(dir, '004_d.sql'), 'select 4;\n');
    const stale = check(dir);
    assert.ok(!stale.ok);
    assert.match(stale.problems[0], /missing: 004_d\.sql/);
    assert.deepStrictEqual(stale.gaps, ['003']);

    fs.writeFileSync(path.join(dir, 'ALL.sql'), build(dir).replace('select 2;', 'select 22;'));
    assert.ok(!check(dir).ok);

    fs.writeFileSync(path.join(dir, 'ALL.sql'), build(dir));
    assert.ok(check(dir).ok);
    fs.writeFileSync(path.join(dir, 'extra.sql'), '');
    assert.match(check(dir).problems.join(), /not named NNN_name\.sql/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`${passed} passed`);
