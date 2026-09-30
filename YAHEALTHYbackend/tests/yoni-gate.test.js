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
const coach = require('../utils/coach');

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

  // ── a disclosure is remembered ────────────────────────────────────────────
  // The stranger wrote "אני בהריון" above. The next day she types the switch
  // word, which says nothing about health on its own. The gate used to be
  // asked about that word alone, and sold to her.
  const PRICE = /₪|ליווי עם יוני/;
  r = await say(STRANGER, 'יוני');
  check(
    'someone who disclosed a pregnancy earlier is not sold to when she asks for Yoni',
    !r.sent.some((b) => PRICE.test(b)),
    JSON.stringify(r.sent)
  );
  check('she stays with Adi', (await db.getWhapiConversation(STRANGER)).active_bot === 'adi');
  check('and is still answered, not met with an error', r.sent.length === 1 && r.sent[0].includes('עדי'), JSON.stringify(r.sent));

  // Staff mark the message handled. What she told us is still true.
  for (const m of await db.getWhatsappMessages({ status: 'escalated' })) {
    if (m.chat_id === STRANGER) await db.setWhatsappMessageStatus(m.id, 'answered');
  }
  r = await say(STRANGER, 'שף');
  check('after staff mark it handled, still no price', !r.sent.some((b) => PRICE.test(b)), JSON.stringify(r.sent));

  // A flag raised in the app, on the other channel, by the same person.
  const appUser = await customer('app@test', '0505555555', null);
  await coach.answer(appUser.id, 'יש לי סוכרת, מה לאכול?', 'he');
  r = await say(WA('0505555555'), 'יוני');
  check('a disclosure in the app keeps the price off WhatsApp too', !r.sent.some((b) => PRICE.test(b)), JSON.stringify(r.sent));

  const blind = await decideYoniAccess({
    phone: WA('0506666666'),
    text: 'מה מבשלים?',
    getAccess: db.getWhatsappAccess,
    hasHealthFlag: async () => { throw new Error('db down'); }
  });
  check('if the history cannot be read, no price is shown', blind.bot === 'adi' && blind.notice === null, JSON.stringify(blind));

  const history = await decideYoniAccess({
    phone: PAYER,
    text: 'מה מבשלים?',
    getAccess: db.getWhatsappAccess,
    hasHealthFlag: async () => true
  });
  check('a paying customer with a history still gets the Yoni they paid for', history.bot === 'yoni');

  r = await say(WA('0507777777'), 'יוני');
  check('someone with no history is still told how to get Yoni', r.sent.some((b) => b.includes('ליווי עם יוני')), JSON.stringify(r.sent));

  // Already on Yoni, a flagged non-payer writes something with no flag in it.
  // The second gate call (every message, not only the switch) reads the
  // history too.
  await db.upsertWhapiConversation(STRANGER, 'yoni');
  r = await say(STRANGER, 'איך מכינים פסטה?');
  check('a flagged non-payer already on Yoni gets Adi and no price', r.bot === 'adi' && !r.sent.some((b) => PRICE.test(b)), JSON.stringify(r));

  // Told the app first, gave the phone later: the account carries the flag.
  const late = await db.createUser('late@test', 'x', 'late@test');
  await coach.answer(late.id, 'I have an eating disorder', 'en');
  await db.setUserPhone(late.id, '0508888888');
  r = await say(WA('0508888888'), 'יוני');
  check('a disclosure made before the phone was added still counts', !r.sent.some((b) => PRICE.test(b)), JSON.stringify(r.sent));

  // A false flag, cleared by a person on the staff screen.
  const express = require('express');
  const staffApp = express();
  staffApp.use(express.json());
  staffApp.use('/api/staff', require('../routes/staff'));
  const server = await new Promise((resolve) => { const s = staffApp.listen(0, '127.0.0.1', () => resolve(s)); });
  const COOK = WA('0509999999');
  await db.upsertWhapiConversation(COOK, 'adi');
  await say(COOK, 'יש לי אלרגיה לבוטנים, מה מבשלים?');
  const row = (await db.getWhatsappMessages({ status: 'escalated' })).find((m) => m.chat_id === COOK);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/staff/escalations/${row?.id}/not-health`, { method: 'POST' });
  await new Promise((resolve) => server.close(resolve));
  check('staff can say a flag was not about health', res.status === 200 && !(await db.hasHealthFlag({ phone: COOK })), `got ${res.status}`);
  check('  ...and it leaves the queue', !(await db.getWhatsappMessages({ status: 'escalated' })).some((m) => m.chat_id === COOK));
  r = await say(COOK, 'יוני');
  check('  ...and the person is offered Yoni again', r.sent.some((b) => b.includes('ליווי עם יוני')), JSON.stringify(r.sent));

  // Deleting the account forgets what the account said.
  await db.deleteUser(appUser.id);
  check('deleting the account removes its health flags', !(await db.hasHealthFlag({ userId: appUser.id })) && !(await db.hasHealthFlag({ phone: '0505555555' })));
  check('  ...but not one a WhatsApp message wrote for a phone', await db.hasHealthFlag({ phone: STRANGER }));
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
