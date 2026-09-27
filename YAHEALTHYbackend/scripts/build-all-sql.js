/**
 * Rebuilds migrations/ALL.sql from every numbered migration, in order.
 *
 *   node scripts/build-all-sql.js          # write ALL.sql
 *   node scripts/build-all-sql.js --check  # exit 1 if ALL.sql is out of date
 *
 * ALL.sql is the file people paste into the Supabase SQL Editor. It used to be
 * assembled by hand, and it drifted: it had no 001_whapi_bot_conversations and
 * no 004_nutrition_engine_storage, yet it altered the tables those create, so
 * on a fresh database it failed partway and on an existing one it was missing
 * pieces. Generated, it cannot drift; tests/migrations.test.js runs --check.
 *
 * The whole file is one transaction. A migration's own begin/commit is
 * dropped, because a commit in the middle would make everything before it
 * permanent even if a later part fails. Every migration is written to be safe
 * to run again, so ALL.sql is safe both on a fresh database and on one that
 * already has some or all of it.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'migrations');
const OUT = path.join(DIR, 'ALL.sql');

function migrationFiles() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

function build() {
  const parts = migrationFiles().map((file) => {
    const body = fs
      .readFileSync(path.join(DIR, file), 'utf8')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => !/^\s*(begin|commit)\s*;\s*$/i.test(line))
      .join('\n')
      .trim();
    return `-- ═══════════════════════════════════════════════════════════════\n-- ${file}\n-- ═══════════════════════════════════════════════════════════════\n\n${body}\n`;
  });

  return [
    '-- YAHEALTHY — כל המיגרציות, לפי הסדר, בקובץ אחד.',
    '--',
    '-- 🔴 קובץ מחולל. לא לערוך ידנית: node scripts/build-all-sql.js',
    '--',
    '-- הרצה: Supabase Dashboard → SQL Editor → הדבק והרץ.',
    '-- בטוח גם על מסד ריק וגם על מסד שכבר יש בו חלק מזה או את כולו.',
    '-- טרנזקציה אחת: אם משהו נכשל — שום דבר לא משתנה.',
    '',
    'begin;',
    '',
    parts.join('\n'),
    'commit;',
    ''
  ].join('\n');
}

if (require.main === module) {
  const next = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== next) {
      console.error('migrations/ALL.sql is out of date. Run: node scripts/build-all-sql.js');
      process.exit(1);
    }
    console.log('migrations/ALL.sql is up to date.');
  } else {
    fs.writeFileSync(OUT, next);
    console.log(`wrote migrations/ALL.sql from ${migrationFiles().length} migrations`);
  }
}

module.exports = { build, migrationFiles };
