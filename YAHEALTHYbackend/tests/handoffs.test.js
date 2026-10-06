/**
 * request_human_handoff — Adi's "a person will get back to you" has to be a
 * real record with staff alerted, not just a sentence.
 *
 * In-process against the memory store; WHAPI and mail are stubbed so nothing
 * leaves the machine.
 *
 *   node tests/handoffs.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'handoffs-test-secret';
delete process.env.STAFF_ALERT_WHATSAPP;
delete process.env.STAFF_ALERT_EMAIL;

const db = require('../utils/database');
const whapi = require('../utils/whapi');
const mailer = require('../utils/mailer');
const handoff = require('../utils/handoff');
const brain = require('../utils/whapi-brain');
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

async function throws(fn) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const sent = [];
whapi.sendText = async (to, body) => {
  sent.push({ to, body });
};
mailer.deliver = async () => ({ delivered: false, logged: true });

async function run() {
  // ── the tool is offered to the model ──────────────────────────────────────
  const tool = brain.TOOLS.find((t) => t.name === 'request_human_handoff');
  check('Adi is offered request_human_handoff', !!tool);
  check(
    'its categories are exactly the ones the service accepts',
    JSON.stringify(tool?.input_schema.properties.category.enum) === JSON.stringify(handoff.CATEGORIES)
  );

  // ── the prompt Adi actually ships with knows about it ─────────────────────
  // The vendored copy is what Vercel deploys; the repo-root copy is where it
  // is edited. Yoni has had this drift check since the rename; Adi had none,
  // and the safety fixes that introduced this tool landed in the root copy
  // only at first.
  const shipped = fs.readFileSync(path.join(__dirname, '..', 'docs', 'bot', 'nuri-bot-prompt.md'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'bot', 'nuri-bot-prompt.md'), 'utf8');
  check("Adi's deployed prompt and its source have not drifted", shipped === source, 'the vendored copy is the one that answers customers');
  check("Adi's prompt tells her when she may say the team will follow up", /request_human_handoff/.test(shipped) && /recorded: true/.test(shipped));
  check(
    'every category the prompt names is one the tool accepts',
    (shipped.match(/`(medical_flag|minor|distress|urgent_symptom|below_floor|billing|complaint|other|[a-z_]+_flag)`/g) || [])
      .map((m) => m.replace(/`/g, ''))
      .every((c) => handoff.CATEGORIES.includes(c))
  );

  // ── recording ─────────────────────────────────────────────────────────────
  const phone = '972501111111@s.whatsapp.net';
  const first = await brain.executeTool(
    'request_human_handoff',
    { category: 'medical_flag', summary: 'מטפורמין, ביקשה יעד', urgent: false },
    { phone, activeBot: 'adi' }
  );
  check('a handoff is recorded', first.recorded === true && !!first.handoff_id && first.already_open === false);

  const open = await db.listWhapiHandoffs({ status: 'open' });
  const row = open.find((h) => h.id === first.handoff_id);
  check('it is listed for staff with what was asked', row?.phone === phone && row?.summary === 'מטפורמין, ביקשה יעד');
  check('with no alert channel configured, nobody is marked as told', row?.notified === false);

  const again = await brain.executeTool(
    'request_human_handoff',
    { category: 'medical_flag', summary: 'שוב', urgent: false },
    { phone, activeBot: 'adi' }
  );
  check(
    'a second request while one is open reuses it',
    again.already_open === true && again.handoff_id === first.handoff_id
  );
  check(
    'and does not add a second row',
    (await db.listWhapiHandoffs({ status: 'open' })).filter((h) => h.phone === phone).length === 1
  );

  // ── urgency ───────────────────────────────────────────────────────────────
  const distress = await handoff.requestHumanHandoff({
    phone: '972502222222@s.whatsapp.net',
    activeBot: 'adi',
    category: 'distress',
    summary: 'כתבה שלא רוצה להתעורר',
    urgent: false
  });
  const distressRow = (await db.listWhapiHandoffs({ status: 'open' })).find((h) => h.id === distress.handoff_id);
  check('distress is urgent even if the model said otherwise', distressRow?.urgent === true);
  check(
    'urgent handoffs come first in the staff list',
    (await db.listWhapiHandoffs({ status: 'open' }))[0]?.id === distress.handoff_id
  );

  // ── alerts ────────────────────────────────────────────────────────────────
  process.env.STAFF_ALERT_WHATSAPP = '972509999999, 972508888888';
  sent.length = 0;
  const alerted = await handoff.requestHumanHandoff({
    phone: '972503333333@s.whatsapp.net',
    activeBot: 'adi',
    category: 'urgent_symptom',
    summary: 'צום מים 4 ימים, סחרחורת',
    urgent: true
  });
  check('every configured staff number is alerted', sent.length === 2 && sent[0].to === '972509999999');
  check('the alert says what happened and that it is urgent', /דחוף/.test(sent[0]?.body) && /סחרחורת/.test(sent[0]?.body));
  check(
    'and the handoff is marked as told',
    (await db.listWhapiHandoffs({ status: 'open' })).find((h) => h.id === alerted.handoff_id)?.notified === true
  );

  sent.length = 0;
  await handoff.requestHumanHandoff({
    phone: '972503333333@s.whatsapp.net',
    activeBot: 'adi',
    category: 'urgent_symptom',
    summary: 'עוד הודעה',
    urgent: true
  });
  check('a repeat while open does not alert staff again', sent.length === 0);

  whapi.sendText = async () => {
    throw new Error('WHAPI down');
  };
  const unalerted = await handoff.requestHumanHandoff({
    phone: '972504444444@s.whatsapp.net',
    activeBot: 'adi',
    category: 'billing',
    summary: 'רוצה החזר',
    urgent: false
  });
  check('a failed alert still records the handoff', unalerted.recorded === true);
  check(
    'but does not claim anyone was told',
    (await db.listWhapiHandoffs({ status: 'open' })).find((h) => h.id === unalerted.handoff_id)?.notified === false
  );
  delete process.env.STAFF_ALERT_WHATSAPP;

  // ── refusing bad input, so the model can't claim a handoff that wasn't made
  check(
    'an unknown category is refused',
    await throws(() => handoff.requestHumanHandoff({ phone, activeBot: 'adi', category: 'vip', summary: 'x' }))
  );
  check(
    'an empty summary is refused',
    await throws(() => handoff.requestHumanHandoff({ phone: '972505555555', activeBot: 'adi', category: 'other', summary: '  ' }))
  );
  check(
    'a handoff with no conversation is refused',
    await throws(() => brain.executeTool('request_human_handoff', { category: 'other', summary: 'x', urgent: false }, {}))
  );

  // ── closing ───────────────────────────────────────────────────────────────
  const closed = await db.resolveWhapiHandoff(first.handoff_id, null);
  check('a handoff can be closed', closed?.status === 'resolved' && !!closed.resolved_at);
  const reopened = await handoff.requestHumanHandoff({ phone, activeBot: 'adi', category: 'medical_flag', summary: 'חזרה', urgent: false });
  check('after closing, a new issue opens a new handoff', reopened.already_open === false && reopened.handoff_id !== first.handoff_id);
}

(async () => {
  console.log('\nhuman handoff\n');
  try {
    await run();
  } catch (error) {
    failed++;
    console.error('suite crashed:', error);
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
