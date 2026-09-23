/**
 * Yoni — the chef persona on WhatsApp.
 *
 * The persona key moved from 'chef' to 'yoni' (migrations/008), and a rename
 * that reaches only some of the places a name lives is worse than none: the
 * prompt loader, the switch words, the database constraint and the stored rows
 * all have to agree, or a customer types a word and nothing answers.
 *
 * These are unit assertions — no server, no WHAPI, no Anthropic call. What
 * they check is the wiring that decides which prompt a message reaches.
 *
 *   node tests/yoni-persona.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');

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

async function run() {
  // ── the words that reach him ──────────────────────────────────────────────
  const { SWITCH_COMMANDS } = require('../routes/whapi');

  check('"יוני" reaches Yoni', SWITCH_COMMANDS['יוני'] === 'yoni', `got ${SWITCH_COMMANDS['יוני']}`);
  check('"yoni" reaches Yoni', SWITCH_COMMANDS.yoni === 'yoni');
  check(
    '"שף" still reaches Yoni',
    SWITCH_COMMANDS['שף'] === 'yoni',
    'customers were told to type שף — a rename is no reason for that to stop working'
  );
  check('"chef" still reaches Yoni', SWITCH_COMMANDS.chef === 'yoni');
  check('"עדי" still reaches Adi', SWITCH_COMMANDS['עדי'] === 'adi');
  check(
    'nothing still routes to the old key',
    !Object.values(SWITCH_COMMANDS).includes('chef'),
    'a leftover "chef" target would load an undefined prompt'
  );

  // ── the prompt he answers with ────────────────────────────────────────────
  // Requiring the brain resolves and reads both prompt files at import time,
  // so a wrong path throws here rather than on a customer's message.
  let brain = null;
  try {
    brain = require('../utils/whapi-brain');
    check('the brain loads both prompts without throwing', true);
  } catch (error) {
    check('the brain loads both prompts without throwing', false, error.message);
  }
  check('generateReply is exported', typeof brain?.generateReply === 'function');

  const promptPath = path.join(__dirname, '..', 'docs', 'bot', 'chef-bot-prompt.md');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  check(
    'the prompt introduces him by name',
    /אתה \*\*יוני/.test(prompt),
    'renaming the key without renaming the persona makes him answer as "the chef"'
  );
  check('the safety gate survived the rename', prompt.includes('שער בטיחות'));
  check(
    'the health boundary survived the rename',
    prompt.includes('אל תמליץ תזונתית'),
    'this is the line that stops him answering a pregnant or diabetic customer'
  );

  // The vendored copy is what actually ships: Vercel's project root is
  // YAHEALTHYbackend/, so the repo-root copy is never deployed.
  const rootPrompt = fs.readFileSync(
    path.join(__dirname, '..', '..', 'docs', 'bot', 'chef-bot-prompt.md'),
    'utf8'
  );
  check(
    'the deployed copy and the source copy have not drifted',
    rootPrompt === prompt,
    'the vendored copy is the one that ships — a stale one answers customers'
  );

  // ── the stored value ──────────────────────────────────────────────────────
  const db = require('../utils/database');

  await db.upsertWhapiConversation('+972500000001', 'yoni');
  const stored = await db.getWhapiConversation('+972500000001');
  check('a conversation can be set to Yoni', stored?.active_bot === 'yoni', `got ${stored?.active_bot}`);

  check(
    'a conversation can still be set to Adi',
    (await db.upsertWhapiConversation('+972500000002', 'adi'), (await db.getWhapiConversation('+972500000002'))?.active_bot) === 'adi'
  );

  check(
    'an unknown phone has no conversation',
    (await db.getWhapiConversation('+972599999999')) === null
  );

  // ── and the migration it does not depend on ───────────────────────────────
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '008_rename_chef_to_yoni.sql'),
    'utf8'
  );
  check("the migration moves existing rows, not just the constraint", /update whapi_conversations set active_bot = 'yoni'/.test(migration));
  check('the migration allows both personas afterwards', /check \(active_bot in \('adi', 'yoni'\)\)/.test(migration));
  check('the migration documents its way back', migration.includes('נתיב חזרה'));
}

run()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('suite crashed:', error && error.message);
    process.exit(1);
  });
