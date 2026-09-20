/**
 * Runs every suite in this directory and reports once.
 *
 * Sequentially on purpose: each suite starts its own server, and running them
 * at the same time makes a failure harder to place than the seconds it saves.
 *
 *   npm run test:all
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suites = fs
  .readdirSync(__dirname)
  .filter((file) => file.endsWith('.test.js'))
  .sort();

if (!suites.length) {
  console.error('no suites found in tests/');
  process.exit(1);
}

const failures = [];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failures.push(suite);
}

console.log('─'.repeat(60));
if (failures.length) {
  console.log(`FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`all ${suites.length} suites passed`);
