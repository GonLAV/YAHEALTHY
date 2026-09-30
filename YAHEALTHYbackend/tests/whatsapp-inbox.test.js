/**
 * The inbound WhatsApp inbox (routes/whatsapp.js): it never replies, only
 * stores — as 'escalated' when a health flag trips, which is what the staff
 * screen lists and what pauses a person's reminders. So who may post to it
 * matters: unset secret used to mean open, in production too.
 *
 *   node tests/whatsapp-inbox.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';
delete process.env.WHATSAPP_WEBHOOK_SECRET;

const express = require('express');

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

const db = require('../utils/database');

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api/whatsapp', require('../routes/whatsapp'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const post = (path, messages) =>
    fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) }).then((r) => r.status);
  const msg = (id, body) => ({ id, chat_id: '972501234567@s.whatsapp.net', from: '972501234567', type: 'text', text: { body } });
  const settle = () => new Promise((r) => setTimeout(r, 100));

  // Development, no secret: open, for local testing.
  check('in development with no secret the inbox accepts', (await post('/api/whatsapp/webhook', [msg('d1', 'שלום')])) === 200);
  await settle();
  const flagged = await post('/api/whatsapp/webhook', [msg('d2', 'יש לי סוכרת, מה לאכול?')]);
  await settle();
  const rows = await db.getWhatsappMessages({ status: 'escalated' });
  check('a health-flagged message is stored as escalated', flagged === 200 && rows.some((r) => r.id === 'd2'));
  check('and the sender is recorded, so the bot does not quote them a price later', await db.hasHealthFlag({ phone: '972501234567' }));
  // In a group the chat id is the group, and the flag must reach the person.
  await post('/api/whatsapp/webhook', [{ id: 'g1', chat_id: '120363041234567890@g.us', from: '972529876543', type: 'text', text: { body: 'אני בהריון' } }]);
  await settle();
  check('a flag in a group is recorded for the sender, not the group', (await db.hasHealthFlag({ phone: '972529876543' })) && !(await db.hasHealthFlag({ phone: '120363041234567890@g.us' })));

  // Production, no secret: refused.
  process.env.NODE_ENV = 'production';
  const before = (await db.getWhatsappMessages({ status: 'escalated' })).length;
  check('in production with no secret the inbox refuses', (await post('/api/whatsapp/webhook', [msg('p1', 'יש לי סוכרת')])) === 503);
  check('with the secretless path too', (await post('/api/whatsapp/webhook/anything', [msg('p2', 'יש לי סוכרת')])) === 503);
  await settle();
  check('and stores nothing', (await db.getWhatsappMessages({ status: 'escalated' })).length === before, 'a fake health flag would pause someone else\'s reminders');

  // Production, with a secret: only the right one.
  process.env.WHATSAPP_WEBHOOK_SECRET = 'the-right-secret';
  check('a wrong secret is refused', (await post('/api/whatsapp/webhook/wrong-secret', [msg('p3', 'x')])) === 401);
  check('no secret in the path is refused', (await post('/api/whatsapp/webhook', [msg('p4', 'x')])) === 401);
  check('a secret of a different length is refused', (await post('/api/whatsapp/webhook/short', [msg('p5', 'x')])) === 401);
  check('the right secret is accepted', (await post('/api/whatsapp/webhook/the-right-secret', [msg('p6', 'שלום')])) === 200);

  await new Promise((resolve) => server.close(resolve));
}

run()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('suite crashed:', error && error.stack);
    process.exitCode = 1;
  });
