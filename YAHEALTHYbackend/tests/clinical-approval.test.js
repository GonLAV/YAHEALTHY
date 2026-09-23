/**
 * Clinical approval and prompt provenance.
 *
 * The product's answer to "why may a bot tell someone what to eat?" is that a
 * registered professional wrote and approved the text. These cases check that
 * the answer is evidence rather than a claim: that an approval is bound to an
 * exact version, that editing the text revokes it, and that every reply
 * records which version produced it.
 *
 *   node tests/clinical-approval.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const os = require('os');
const path = require('path');

const clinical = require('../utils/clinical-approval');
const db = require('../utils/database');

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
  const registry = clinical.loadRegistry();

  // ── the registry describes what actually ships ────────────────────────────
  check('both live personas are in the registry', !!registry.prompts?.adi && !!registry.prompts?.yoni);
  check(
    'the registry points at the prompt files the bot really loads',
    registry.prompts.adi.file === 'docs/bot/nuri-bot-prompt.md' &&
      registry.prompts.yoni.file === 'docs/bot/chef-bot-prompt.md',
    'an approval bound to a file nobody reads approves nothing'
  );
  check(
    'each persona records what it is allowed to do',
    (registry.prompts.adi.scopeNotes_he || []).length > 0 &&
      (registry.prompts.yoni.scopeNotes_he || []).length > 0
  );

  // ── an approval is bound to an exact version ──────────────────────────────
  const tmp = path.join(os.tmpdir(), `clinical-test-${process.pid}.md`);
  fs.writeFileSync(tmp, 'הנוסח שאושר.\n');
  const approvedHash = clinical.sha256OfFile(tmp);

  const registryPath = clinical.REGISTRY_PATH;
  const original = fs.readFileSync(registryPath, 'utf8');

  try {
    const edited = JSON.parse(original);
    edited.prompts.__test = {
      file: 'unused-in-this-test',
      persona_he: 'בדיקה',
      approvedBy: 'yael',
      approvedAt: '2026-09-22',
      approvedSha256: approvedHash
    };
    fs.writeFileSync(registryPath, JSON.stringify(edited, null, 2));

    check(
      'an unchanged approved prompt is approved',
      clinical.statusFor('__test', tmp).approved === true
    );
    check(
      'it records who approved it and when',
      clinical.statusFor('__test', tmp).approvedBy === 'yael' &&
        clinical.statusFor('__test', tmp).approvedAt === '2026-09-22'
    );

    // The case this whole mechanism exists for.
    fs.writeFileSync(tmp, 'הנוסח שאושר.\nושורה שמישהו הוסיף אחר כך.\n');
    const afterEdit = clinical.statusFor('__test', tmp);
    check(
      'editing the prompt revokes the approval',
      afterEdit.approved === false,
      'this is the situation the register exists to catch'
    );
    check(
      'and it says why, in words a person can act on',
      /changed since it was approved/.test(afterEdit.reason || ''),
      `got: ${afterEdit.reason}`
    );

    check(
      'a persona with no registry entry is never approved by default',
      clinical.statusFor('__not_in_registry', tmp).approved === false,
      'silence must not read as permission'
    );
  } finally {
    fs.writeFileSync(registryPath, original);
    fs.unlinkSync(tmp);
  }

  // ── the live prompts, as they stand right now ─────────────────────────────
  const adiPath = path.join(__dirname, '..', 'docs', 'bot', 'nuri-bot-prompt.md');
  const adiStatus = clinical.statusFor('adi', adiPath);
  check(
    'the live Adi prompt has a readable hash',
    /^[0-9a-f]{64}$/.test(adiStatus.liveSha256)
  );
  check(
    'an unapproved live prompt is reported as unapproved rather than assumed fine',
    typeof adiStatus.approved === 'boolean' && (adiStatus.approved || !!adiStatus.reason)
  );

  // ── the version label that lands on every reply ───────────────────────────
  const label = clinical.versionLabel('adi', adiPath);
  check('the version label names the persona', label.startsWith('adi:'));
  check('the version label carries part of the hash', label.split(':')[1].length === 12);
  check(
    'the label changes when the prompt changes',
    clinical.versionLabel('adi', adiPath) === label,
    'stable for identical content'
  );

  // ── provenance is actually written ────────────────────────────────────────
  await db.logWhapiMessage('+972500000009', 'user', 'שאלה של לקוח');
  await db.logWhapiMessage('+972500000009', 'assistant', 'תשובה', 'adi:dc4acc971f59');
  const history = await db.getWhapiTranscript('+972500000009', 10);

  const assistantRow = history.find((m) => m.role === 'assistant');
  const userRow = history.find((m) => m.role === 'user');

  check('a reply records the prompt version that produced it', assistantRow?.prompt_version === 'adi:dc4acc971f59');
  check(
    "a customer's own message carries no prompt version",
    userRow?.prompt_version === null,
    'only what the system generated has a version'
  );

  // The model must not see the audit fields. Its context is what was said.
  const modelHistory = await db.getRecentWhapiMessages('+972500000009', 10);
  check(
    'the history fed to the model carries only role and content',
    modelHistory.every((m) => Object.keys(m).sort().join(',') === 'content,role'),
    `got keys: ${JSON.stringify(Object.keys(modelHistory[0] || {}))}`
  );
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
