/**
 * The Yoni paywall — who reaches the chef on WhatsApp.
 *
 * Only the "ליווי עם יוני" tier gets Yoni. The part that must not regress is
 * the order: a non-paying customer who writes about a pregnancy or diabetes is
 * answered by Adi with no mention of a price, never with a sales pitch.
 *
 * WHAPI and Anthropic are stubbed through require.cache, so nothing leaves the
 * process. What is real is the database (memory mode), the phone
 * normalisation, the plans, and the webhook's own routing.
 *
 *   node tests/yoni-gate.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';
process.env.PLAN_YONI_AMOUNT = '250';
delete process.env.YONI_SIGNUP_URL;

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

// ── stubs ───────────────────────────────────────────────────────────────────
const sent = [];
const generated = [];

function stub(relative, exports) {
  const file = require.resolve(path.join(__dirname, '..', relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

stub('utils/whapi', {
  sendText: async (to, body) => { sent.push({ to, body }); },
  sendTyping: async () => {},
  downloadMediaAsBase64: async () => ({ base64: '', mimeType: 'image/jpeg' }),
  verifyWebhookSecret: () => true
});

// Anthropic can fail (rate limit, timeout, 5xx); set to make the next reply throw.
let brainDown = false;
const fakeGenerate = async ({ activeBot }) => {
  if (brainDown) throw new Error('Anthropic 529 overloaded');
  generated.push(activeBot);
  return `reply from ${activeBot}`;
};
stub('utils/whapi-brain', {
  generateReply: fakeGenerate,
  generateReplyWithTools: fakeGenerate,
  PROMPT_VERSIONS: { adi: 'adi:test', yoni: 'yoni:test' }
});

// The typing delay is real time; the tests do not need to wait for it.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);

const db = require('../utils/database');
const { decideYoniAccess, plansIncludeYoni } = require('../utils/yoni-gate');
const { handleIncomingMessage } = require('../routes/whapi');

const WA = (national) => `972${national.slice(1)}@s.whatsapp.net`;

async function customer(email, phone, plan) {
  const user = await db.createUser(email, 'x', email);
  await db.setUserPhone(user.id, phone);
  if (plan) await db.createSubscription(user.id, plan);
  return user;
}

async function say(phone, text) {
  sent.length = 0;
  generated.length = 0;
  await handleIncomingMessage({ id: String(Math.random()), type: 'text', chat_id: phone, text: { body: text } });
  return { sent: sent.map((m) => m.body), bot: generated[0] || null };
}

async function run() {
  await customer('payer@test', '0501111111', 'yoni');
  await customer('base@test', '0502222222', 'base');
  const PAYER = WA('0501111111');
  const BASE = WA('0502222222');
  const STRANGER = WA('0503333333');

  // ── the decision ──────────────────────────────────────────────────────────
  check('the yoni plan includes Yoni', plansIncludeYoni(['yoni']));
  check('the base plan does not', !plansIncludeYoni(['base']));
  check('an unknown plan does not', !plansIncludeYoni(['made-up']));

  const payer = await decideYoniAccess({ phone: PAYER, text: 'מה מבשלים?', getAccess: db.getWhatsappAccess });
  check('a paying customer gets Yoni', payer.bot === 'yoni', JSON.stringify(payer));

  const pregnant = await decideYoniAccess({ phone: STRANGER, text: 'אני בהריון, מה לבשל?', getAccess: db.getWhatsappAccess });
  check('a flagged non-payer goes to Adi', pregnant.bot === 'adi');
  check(
    'a flagged non-payer is not shown a price',
    pregnant.notice === null,
    'someone who wrote that they are pregnant must not be answered with a sales pitch'
  );

  const english = await decideYoniAccess({ phone: STRANGER, text: 'I have diabetes', getAccess: db.getWhatsappAccess });
  check('the English flags hold the same line', english.bot === 'adi' && english.notice === null);

  const plain = await decideYoniAccess({ phone: STRANGER, text: 'איך מכינים שקשוקה?', getAccess: db.getWhatsappAccess });
  check('an unflagged non-payer goes to Adi', plain.bot === 'adi');
  check('and is told what Yoni costs', /250/.test(plain.notice || ''), plain.notice);
  check('and there is no link to a page that does not exist', !/https?:/.test(plain.notice || ''));

  const outage = await decideYoniAccess({
    phone: PAYER,
    text: 'מה מבשלים?',
    getAccess: async () => { throw new Error('db down'); }
  });
  check(
    'a failed lookup lets Yoni answer',
    outage.bot === 'yoni',
    'an outage must not read as a paying customer having lapsed'
  );

  // ── through the webhook ───────────────────────────────────────────────────
  await db.upsertWhapiConversation(PAYER, 'adi');
  let r = await say(PAYER, 'יוני');
  check('a payer typing "יוני" is switched', (await db.getWhapiConversation(PAYER)).active_bot === 'yoni');
  check('and told so', r.sent.some((b) => b.includes('עברנו ליוני')));
  r = await say(PAYER, 'מה עושים עם חזה עוף?');
  check("and his next message reaches Yoni", r.bot === 'yoni', `reached ${r.bot}`);

  await db.upsertWhapiConversation(BASE, 'adi');
  r = await say(BASE, 'שף');
  check('a base-tier customer typing "שף" stays with Adi', (await db.getWhapiConversation(BASE)).active_bot === 'adi');
  check('and is told how to get Yoni', r.sent.some((b) => b.includes('ליווי עם יוני')));
  check('and is not told "עברנו ליוני"', !r.sent.some((b) => b.includes('עברנו ליוני')));

  // A conversation set to Yoni before the gate existed, or whose plan ended.
  await db.upsertWhapiConversation(STRANGER, 'yoni');
  r = await say(STRANGER, 'איך מכינים שקשוקה?');
  check('a non-payer already on Yoni is answered by Adi', r.bot === 'adi', `reached ${r.bot}`);
  check('and moved back to Adi', (await db.getWhapiConversation(STRANGER)).active_bot === 'adi');
  check('and told why, before the answer', r.sent[0]?.includes('ליווי עם יוני') && r.sent.at(-1) === 'reply from adi');

  await db.upsertWhapiConversation(STRANGER, 'yoni');
  r = await say(STRANGER, 'אני בהריון, מה כדאי לבשל?');
  check('a flagged message on Yoni from a non-payer reaches Adi', r.bot === 'adi');
  check(
    'with no price anywhere in what was sent',
    !r.sent.some((b) => /₪|ליווי עם יוני/.test(b)),
    JSON.stringify(r.sent)
  );

  // "I'll pass this on" has to be true: the message reaches the staff queue.
  const escalated = await db.getWhatsappMessages({ status: 'escalated' });
  check(
    'a health-flagged message is put in the staff escalation queue',
    escalated.some((m) => m.chat_id === STRANGER && m.body.includes('בהריון')),
    'both prompts promise to pass it on to a professional'
  );
  r = await say(PAYER, 'איך צולים פלפלים?');
  check(
    'an ordinary message is not',
    !(await db.getWhatsappMessages({ status: 'escalated' })).some((m) => m.chat_id === PAYER)
  );

  // The escalation is the professional's copy of the message. It must not
  // depend on the bot managing to answer: with Anthropic down the customer
  // gets the fallback line, and a person still has to see what they wrote.
  const DIABETIC = WA('0504444444');
  await db.upsertWhapiConversation(DIABETIC, 'adi');
  brainDown = true;
  let threw = false;
  try {
    await say(DIABETIC, 'יש לי סוכרת סוג 1, מה מותר לי לאכול בבוקר?');
  } catch {
    threw = true;
  }
  brainDown = false;
  check('when the reply fails, the customer still hears something', threw && sent.some((m) => m.body.includes('משהו השתבש')));
  check(
    'and the health-flagged message still reaches the staff queue',
    (await db.getWhatsappMessages({ status: 'escalated' })).some((m) => m.chat_id === DIABETIC && m.body.includes('סוכרת')),
    'the escalation was written only after a successful reply, so an Anthropic outage dropped it'
  );
}

run()
  .then(() => {
    global.setTimeout = realSetTimeout;
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('suite crashed:', error && error.stack);
    process.exit(1);
  });
