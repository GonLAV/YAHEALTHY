/**
 * Log-from-WhatsApp — a meal sent to Adi lands in the app's food diary.
 *
 * What this has to prove, in order of how bad it would be to get wrong:
 *   - a phone is linked to an account ONLY by a code that account issued:
 *     never by number, codes expire, are single-use, guesses are capped, and
 *     no user can see, use or remove another user's link;
 *   - nothing is written without an explicit "yes" to the server's own
 *     question, and a redelivered webhook never writes twice;
 *   - an escalated conversation (stop flags) is never logged from or invited;
 *   - a minor never gets a calorie number from these messages;
 *   - the entry lands on the user's local calendar day.
 *
 * WHAPI is replaced by a recorder; the Anthropic client by a scripted fake
 * with the same messages.create shape, so the real tool loop and the real
 * calculators (utils/food-calculator.js) run.
 *
 *   node tests/whatsapp-logging.test.js
 */

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'whatsapp-logging-test-secret';
process.env.VERCEL = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APP_URL = 'https://app.example.test';
process.env.WHATSAPP_BOT_NUMBER = '972541112233';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
delete process.env.WHAPI_WEBHOOK_SECRET;

const db = require('../utils/database');
const whapi = require('../utils/whapi');
const brain = require('../utils/whapi-brain');
const rules = require('../utils/whatsapp-logging');
const store = require('../utils/whatsapp-link-store');
const flow = require('../utils/whatsapp-food-log');

let BASE;
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

// ── fakes ───────────────────────────────────────────────────────────────────

const sent = []; // { to, body }
whapi.sendText = async (to, body) => {
  sent.push({ to, body });
  return { sent: true };
};
whapi.sendTyping = async () => {};
whapi.downloadMediaAsBase64 = async () => ({ base64: 'AAAA', mimeType: 'image/jpeg' });

let modelCalls = 0;
const lastUserText = (messages) => {
  const last = messages[messages.length - 1];
  if (!Array.isArray(last.content)) return String(last.content);
  const text = last.content.find((b) => b.type === 'text');
  return text ? text.text : '';
};
const toolUse = (blocks) => ({
  stop_reason: 'tool_use',
  content: blocks.map((b, i) => ({ type: 'tool_use', id: `tu_${modelCalls}_${i}`, name: b.name, input: b.input }))
});
const text = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

// "אכלתי" (or a photo) → one meal calculation; "תפריט" → a menu (two meal
// calculations in one turn, which must NOT be offered for logging).
brain._setClientForTests({
  messages: {
    create: async ({ messages }) => {
      modelCalls++;
      const last = messages[messages.length - 1];
      if (Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result')) {
        return text('חישבתי: ביצה ולחם מלא. ארוחה טובה.');
      }
      const said = lastUserText(messages);
      const hasImage = Array.isArray(last.content) && last.content.some((b) => b.type === 'image');
      if (said.includes('תפריט')) {
        return toolUse([
          { name: 'calculate_meal_nutrition', input: { items: [{ food_id: 'oats_dry', grams: 40 }] } },
          { name: 'calculate_meal_nutrition', input: { items: [{ food_id: 'chicken_breast', grams: 150 }] } }
        ]);
      }
      if (said.includes('אכלתי') || hasImage) {
        return toolUse([
          {
            name: 'calculate_meal_nutrition',
            input: { items: [{ food_id: 'egg', grams: 100 }, { food_id: 'whole_wheat_bread', grams: 60 }] }
          }
        ]);
      }
      return text('היי, איך אפשר לעזור?');
    }
  }
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function call(method, route, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const raw = await res.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* empty */
  }
  return { status: res.status, body: json };
}

let seq = 0;
async function signup() {
  seq++;
  const res = await call('POST', '/api/auth/signup', {
    body: { email: `wa-log-${Date.now()}-${seq}@example.com`, password: 'correct horse battery' }
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status}`);
  return { id: res.body.id, token: res.body.token };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 3000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (pred()) return true;
    await sleep(15);
  }
  return false;
}

let msgSeq = 0;
function msg(phone, body, extra = {}) {
  msgSeq++;
  return {
    id: `wamid.test.${msgSeq}`,
    from_me: false,
    type: 'text',
    chat_id: `${phone}@s.whatsapp.net`,
    from: phone,
    from_name: 'Test',
    text: { body },
    ...extra
  };
}

/** Deliver one webhook and return the messages the bot sent back for it. */
async function deliver(message, { expectReply = true, settleMs = 150 } = {}) {
  const before = sent.length;
  const res = await fetch(`${BASE}/api/whapi/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [message] })
  });
  if (res.status !== 200) throw new Error(`webhook ${res.status}`);
  if (expectReply) await waitFor(() => sent.length > before);
  // Let any follow-up bubble (the diary question) arrive too.
  let last = sent.length;
  for (;;) {
    await sleep(settleMs);
    if (sent.length === last) break;
    last = sent.length;
  }
  return sent.slice(before).map((s) => s.body);
}

const joined = (bodies) => bodies.join('\n---\n');
async function logsFor(userId) {
  return db.getFoodLogs(userId, {});
}

async function linkViaChat(user, phone) {
  const issued = await call('POST', '/api/whatsapp/link/code', { token: user.token });
  const replies = await deliver(msg(phone, rules.linkMessageText(issued.body.code)));
  return { issued, replies };
}

// ── 1. pure rules ───────────────────────────────────────────────────────────

function pureRules() {
  console.log('\n— rules');
  const codes = new Set(Array.from({ length: 300 }, () => rules.generateLinkCode()));
  check('codes are unique across 300 draws', codes.size === 300);
  check('codes look like YH-XXXXXX from the unambiguous alphabet',
    [...codes].every((c) => /^YH-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(c)));
  check('a code is found inside the pre-filled sentence', rules.extractLinkCode('קוד חיבור ליומן: YH-AB2CD3') === 'AB2CD3');
  check('a code typed lower-case without the dash still reads', rules.extractLinkCode('yhab2cd3') === 'AB2CD3');
  check('ordinary text holds no code', rules.extractLinkCode('אכלתי ביצה ולחם') === null);
  check('the hash ignores case and the dash',
    rules.hashLinkCode('YH-AB2CD3') === rules.hashLinkCode('yhab2cd3') && rules.hashLinkCode('YH-AB2CD3') !== rules.hashLinkCode('YH-AB2CD4'));
  check('wa.me link carries the code pre-filled',
    rules.buildWaLink('+972-54-111-2233', 'YH-AB2CD3') === `https://wa.me/972541112233?text=${encodeURIComponent('קוד חיבור ליומן: YH-AB2CD3')}`);
  check('no bot number → no wa.me link', rules.buildWaLink('', 'YH-AB2CD3') === null);

  check('"כן" is yes', rules.classifyReply(' כן! ')?.kind === 'yes');
  check('"yes" is yes', rules.classifyReply('Yes')?.kind === 'yes');
  check('"לא" is no', rules.classifyReply('לא')?.kind === 'no');
  check('"ערב" moves the slot to dinner', rules.classifyReply('ערב')?.mealType === 'dinner');
  check('"חצי" halves', rules.classifyReply('חצי')?.factor === 0.5);
  check('"כן אבל בלי הלחם" is NOT a yes', rules.classifyReply('כן אבל בלי הלחם') === null);

  const jlm = 'Asia/Jerusalem';
  check('07:30 in Jerusalem is breakfast', rules.mealSlotFor(new Date('2026-09-29T04:30:00Z'), jlm) === 'breakfast');
  check('13:00 in Jerusalem is lunch', rules.mealSlotFor(new Date('2026-09-29T10:00:00Z'), jlm) === 'lunch');
  check('20:00 in Jerusalem is dinner', rules.mealSlotFor(new Date('2026-09-29T17:00:00Z'), jlm) === 'dinner');
  const late = rules.resolveWhen(new Date('2026-09-28T22:30:00Z'), jlm);
  check('01:30 local after UTC midnight files under the local day', late.date === '2026-09-29' && late.time === '01:30', JSON.stringify(late));
  const ny = rules.resolveWhen(new Date('2026-09-28T22:30:00Z'), 'America/New_York');
  check('the same instant in New York is the previous evening', ny.date === '2026-09-28' && ny.mealType === 'dinner', JSON.stringify(ny));
  check('an invalid zone falls back to Jerusalem', rules.resolveWhen(new Date(), 'Nope/Zone').tz === 'Asia/Jerusalem');

  const meal = { name: 'calculate_meal_nutrition', result: { lines: [{ foodId: 'egg', grams: 100, calories: 155, proteinG: 13, carbsG: 1.1, fatG: 11 }] } };
  check('one meal calculation is offered', rules.pickMealFromToolCalls([meal])?.length === 1);
  check('two meal calculations (a menu) are not', rules.pickMealFromToolCalls([meal, meal]) === null);
  check('a daily-target turn is not', rules.pickMealFromToolCalls([meal, { name: 'calculate_daily_target', result: {} }]) === null);
  check('no tool call, nothing offered', rules.pickMealFromToolCalls([]) === null);

  const pending = { id: 'p1', items: rules.pickMealFromToolCalls([meal]), meal_type: 'lunch', log_date: '2026-09-29' };
  check('the adult question shows calories', /155 קק"ל/.test(rules.confirmPrompt(pending, { today: '2026-09-29' })));
  check('the minor question shows no calorie number',
    !/קק"ל|\d{2,} ?kcal/.test(rules.confirmPrompt(pending, { today: '2026-09-29', minor: true })));
  check('the minor receipt shows no calorie number',
    !/קק"ל/.test(rules.loggedReceipt({ dayCalories: 900, dayEntries: 3, streak: { current: 2 }, minor: true, logDate: 'x', today: 'x' })));
  const rows = rules.foodLogRowsFor(pending);
  check('diary rows are marked whatsapp with a per-item idempotency key',
    rows[0].source === 'whatsapp' && rows[0].source_ref === 'wa:p1:0' && rows[0].quantity === 100 && rows[0].unit === 'g');
}

// ── 2. linking ──────────────────────────────────────────────────────────────

async function linking() {
  console.log('\n— linking');
  const dana = await signup();
  const eli = await signup();
  const PHONE_A = '972501110001';

  check('status needs auth', (await call('GET', '/api/whatsapp/link')).status === 401);
  check('issuing a code needs auth', (await call('POST', '/api/whatsapp/link/code')).status === 401);
  check('unlinking needs auth', (await call('DELETE', '/api/whatsapp/link')).status === 401);

  const status0 = await call('GET', '/api/whatsapp/link', { token: dana.token });
  check('a new account is not linked', status0.status === 200 && status0.body.linked === false);

  const issued = await call('POST', '/api/whatsapp/link/code', { token: dana.token });
  check('a code is issued', issued.status === 201 && /^YH-[A-Z0-9]{6}$/.test(issued.body.code));
  check('it expires in about ten minutes',
    Math.abs(new Date(issued.body.expiresAt).getTime() - Date.now() - rules.LINK_CODE_TTL_MS) < 5000);
  check('the wa.me link points at the bot with the code', issued.body.waLink?.startsWith('https://wa.me/972541112233?text=') && issued.body.waLink.includes(issued.body.code));

  // A number that merely matches an account is not a link.
  await db.setUserPhone(dana.id, PHONE_A);
  const beforeReplies = await deliver(msg(PHONE_A, 'אכלתי ביצה ולחם'));
  check('a phone number alone never links (payments phone on file, no code)',
    (await call('GET', '/api/whatsapp/link', { token: dana.token })).body.linked === false && joined(beforeReplies).includes('settings#whatsapp'));
  check('…and nothing was logged', (await logsFor(dana.id)).length === 0);

  const second = await call('POST', '/api/whatsapp/link/code', { token: dana.token });
  const oldCodeReply = await deliver(msg(PHONE_A, rules.linkMessageText(issued.body.code)));
  check('a newer code revokes the older one', joined(oldCodeReply).includes('לא תקף'));

  const ok = await deliver(msg(PHONE_A, rules.linkMessageText(second.body.code)));
  check('the right code from the phone links it', joined(ok).includes('מחובר'));
  const status1 = await call('GET', '/api/whatsapp/link', { token: dana.token });
  check('status shows linked, number masked', status1.body.linked === true && status1.body.phone === '050-***-0001', JSON.stringify(status1.body));
  check('the link code never reaches the model or the transcript',
    !(await db.getWhapiTranscript(`${PHONE_A}@s.whatsapp.net`, 200)).some((m) => m.content.includes(second.body.code)));

  const reuse = await deliver(msg('972501110002', rules.linkMessageText(second.body.code)));
  check('a used code cannot link a second phone', joined(reuse).includes('לא תקף'));

  // Expiry: a code checked eleven minutes after issue is refused.
  const late = await flow.issueCode(eli.id);
  const lateReply = await flow.handleLinkCode({
    phone: '972501110003@s.whatsapp.net',
    code: late.code,
    now: new Date(Date.now() + rules.LINK_CODE_TTL_MS + 60 * 1000)
  });
  check('an expired code is refused', lateReply.includes('לא תקף'));
  check('…and eli is still not linked', (await call('GET', '/api/whatsapp/link', { token: eli.token })).body.linked === false);

  // IDOR: eli cannot claim dana's number, see her link, or remove it.
  const eliCode = await call('POST', '/api/whatsapp/link/code', { token: eli.token });
  const taken = await deliver(msg(PHONE_A, rules.linkMessageText(eliCode.body.code)));
  check("another account's code cannot take a linked number", joined(taken).includes('מחובר לחשבון אחר'));
  check('…eli stays unlinked', (await call('GET', '/api/whatsapp/link', { token: eli.token })).body.linked === false);
  check('…dana stays linked', (await call('GET', '/api/whatsapp/link', { token: dana.token })).body.linked === true);
  const eliStatus = await call('GET', '/api/whatsapp/link', { token: eli.token });
  check("eli's status never shows dana's number", eliStatus.body.phone === null);
  // The refused code was put back, so eli can still use it from his own phone.
  const eliOwn = await deliver(msg('972501110004', rules.linkMessageText(eliCode.body.code)));
  check('a code refused for a taken number still works on a free one', joined(eliOwn).includes('מחובר'));
  await call('DELETE', '/api/whatsapp/link', { token: eli.token });
  check("eli's unlink removes only his own link",
    (await call('GET', '/api/whatsapp/link', { token: eli.token })).body.linked === false &&
    (await call('GET', '/api/whatsapp/link', { token: dana.token })).body.linked === true);
  const eliCode2 = await call('POST', '/api/whatsapp/link/code', { token: eli.token });
  await call('DELETE', '/api/whatsapp/link', { token: eli.token });
  const revoked = await deliver(msg('972501110004', rules.linkMessageText(eliCode2.body.code)));
  check('unlinking also revokes an unused code', joined(revoked).includes('לא תקף'));

  // Guess limit: five wrong codes, then even a correct one is not checked.
  const GUESSER = '972501110005';
  for (let i = 0; i < rules.MAX_FAILED_ATTEMPTS; i++) {
    await deliver(msg(GUESSER, `YH-ZZZZZ${'23456789'[i]}`));
  }
  const noa = await signup();
  const noaCode = await call('POST', '/api/whatsapp/link/code', { token: noa.token });
  const blocked = await deliver(msg(GUESSER, rules.linkMessageText(noaCode.body.code)));
  check('after five wrong codes the phone is locked out', joined(blocked).includes('יותר מדי ניסיונות'));
  check('…and the correct code did not link during the lockout', (await call('GET', '/api/whatsapp/link', { token: noa.token })).body.linked === false);

  // Issuance limit per account.
  let last;
  for (let i = 0; i < rules.MAX_CODES_PER_WINDOW + 1; i++) last = await call('POST', '/api/whatsapp/link/code', { token: noa.token });
  check('issuing codes is capped per account', last.status === 429);

  return { dana, PHONE_A };
}

// ── 3. logging from chat ────────────────────────────────────────────────────

async function logging({ dana, PHONE_A }) {
  console.log('\n— log from chat');
  // The app catalogue knows the bread (same name, not a "cooked" mismatch)
  // and has only a raw chicken breast, which the bot's cooked one must not match.
  await db.upsertFoods([
    { name_he: 'לחם מלא', name_en: 'Whole wheat bread', state: 'baked', source: 'usda_fdc', source_ref: 'wa-test-1', aliases_he: [] },
    { name_he: 'ביצה שלמה', name_en: 'Egg, whole', state: 'raw', source: 'usda_fdc', source_ref: 'wa-test-2', aliases_he: ['ביצה'] }
  ]);
  const catalog = await db.searchFoods('לחם מלא');

  const proposal = await deliver(msg(PHONE_A, 'אכלתי ביצה ושתי פרוסות לחם מלא'));
  const q = proposal[proposal.length - 1];
  check("Adi's reply comes first, then the server's question", proposal.length >= 2 && proposal[0].includes('חישבתי'));
  check('the question asks to log, with slot, day and calories',
    q.startsWith('לרשום ביומן?') && /היום \d{2}:\d{2}/.test(q) && q.includes('303 קק"ל'), q);
  check('nothing is written before the answer', (await logsFor(dana.id)).length === 0);

  const yes = msg(PHONE_A, 'כן');
  const receipt = await deliver(yes);
  const logs = await logsFor(dana.id);
  check('"כן" writes one diary row per item', logs.length === 2, `got ${logs.length}`);
  check('rows are marked whatsapp, in grams, on today', logs.every((l) => l.source === 'whatsapp' && l.unit === 'g' && l.date === logs[0].date));
  check('rows carry the calculator numbers', logs.reduce((s, l) => s + l.calories, 0) === 303);
  const bread = logs.find((l) => l.name === 'לחם מלא');
  const egg = logs.find((l) => l.name === 'ביצה');
  check('a food the app catalogue knows is linked to its catalogue id', bread?.food_id === catalog[0].id);
  check('an alias match links too (ביצה → ביצה שלמה)', Boolean(egg?.food_id) && egg.food_id !== bread.food_id);
  check('the receipt gives the day total and the streak',
    joined(receipt).includes('נרשם ביומן') && joined(receipt).includes('303') && joined(receipt).includes('רצף רישום: 1'), joined(receipt));

  // The same webhook delivered again: no reply, no second write.
  const again = await deliver(yes, { expectReply: false, settleMs: 250 });
  check('a redelivered "כן" is ignored', again.length === 0);
  check('…and writes nothing more', (await logsFor(dana.id)).length === 2);
  const secondYes = await deliver(msg(PHONE_A, 'כן'));
  check('a second "כן" (new id) after confirming does not log again', (await logsFor(dana.id)).length === 2);
  check('…it goes to Adi as an ordinary message', joined(secondYes).includes('איך אפשר לעזור'));

  // A redelivered meal message does not ask twice or call the model twice.
  const meal = msg(PHONE_A, 'אכלתי ביצה ולחם');
  await deliver(meal);
  const callsBefore = modelCalls;
  const mealAgain = await deliver(meal, { expectReply: false, settleMs: 250 });
  check('a redelivered meal message gets no second answer', mealAgain.length === 0 && modelCalls === callsBefore);

  const no = await deliver(msg(PHONE_A, 'לא'));
  check('"לא" cancels with a way to correct', joined(no).includes('לא נרשם'));
  check('…and writes nothing', (await logsFor(dana.id)).length === 2);

  await deliver(msg(PHONE_A, 'אכלתי ביצה ולחם'));
  const moved = await deliver(msg(PHONE_A, 'ערב'));
  check('"ערב" re-asks with the dinner slot', joined(moved).includes('ארוחת ערב'));
  const halved = await deliver(msg(PHONE_A, 'חצי'));
  check('"חצי" re-asks with half the calories', joined(halved).includes('152 קק"ל'), joined(halved));
  await deliver(msg(PHONE_A, 'yes'));
  const after = (await logsFor(dana.id)).filter((l) => l.meal_type === 'dinner');
  check('the corrected entry lands as dinner at half portion',
    after.length === 2 && after.some((l) => l.quantity === 50) && after.reduce((s, l) => s + l.calories, 0) === 152,
    JSON.stringify(after.map((l) => [l.quantity, l.calories])));

  // A menu (two meal calculations in one turn) is not offered for logging.
  const menu = await deliver(msg(PHONE_A, 'תבני לי תפריט ליום'));
  check('a menu is not offered as eaten', !joined(menu).includes('לרשום ביומן'));

  // A photo is offered too.
  const photo = await deliver({ ...msg(PHONE_A, ''), type: 'image', text: undefined, image: { link: 'https://example.test/x.jpg', caption: '' } });
  check('a meal photo is offered for logging', joined(photo).includes('לרשום ביומן'));
  await deliver(msg(PHONE_A, 'לא'));

  // Expiry of the question itself.
  await deliver(msg(PHONE_A, 'אכלתי ביצה ולחם'));
  const expired = await flow.handlePendingReply({
    phone: `${PHONE_A}@s.whatsapp.net`,
    text: 'כן',
    now: new Date(Date.now() + flow.PENDING_TTL_MS + 60 * 1000)
  });
  check('a "yes" after the question expired does not log', expired?.reply?.includes('עבר יותר מדי זמן'));
  check('…nothing written', (await logsFor(dana.id)).length === 4);

  // The app sees the rows with their source (the badge).
  const today = (await logsFor(dana.id))[0].date;
  const api = await call('GET', `/api/food-logs?date=${today}`, { token: dana.token });
  const apiRows = Array.isArray(api.body) ? api.body : api.body?.logs || api.body?.items || [];
  check('GET /api/food-logs returns them with source=whatsapp', apiRows.some((r) => r.source === 'whatsapp'), JSON.stringify(api.body).slice(0, 200));

  // Unlink: the next meal gets no question, only (throttled) nothing.
  await deliver(msg(PHONE_A, 'אכלתי ביצה ולחם'));
  const del = await call('DELETE', '/api/whatsapp/link', { token: dana.token });
  check('unlink works', del.status === 200 && (await call('GET', '/api/whatsapp/link', { token: dana.token })).body.linked === false);
  const afterUnlink = await deliver(msg(PHONE_A, 'כן'));
  check('an open question dies with the link', (await logsFor(dana.id)).length === 4 && !joined(afterUnlink).includes('נרשם'));
}

async function unlinked() {
  console.log('\n— unlinked');
  const PHONE = '972501110006';
  const first = await deliver(msg(PHONE, 'אכלתי ביצה ולחם'));
  check('an unlinked meal gets an invite to link, not a question',
    joined(first).includes('/settings#whatsapp') && !joined(first).includes('לרשום ביומן'));
  const second = await deliver(msg(PHONE, 'אכלתי ביצה ולחם'));
  check('the invite is not repeated within a week', !joined(second).includes('/settings#whatsapp'));
  const plain = await deliver(msg('972501110007', 'שלום'));
  check('no invite when no meal was computed', !joined(plain).includes('/settings#whatsapp'));
}

async function escalation() {
  console.log('\n— escalation');
  const user = await signup();
  const PHONE = '972501110008';
  await linkViaChat(user, PHONE);

  await deliver(msg(PHONE, 'אכלתי ביצה ולחם'));
  const flagged = await deliver(msg(PHONE, 'אני בהריון ואכלתי ביצה'));
  check('a stop flag means no diary question even though a meal was computed', !joined(flagged).includes('לרשום ביומן'));
  const yes = await deliver(msg(PHONE, 'כן'));
  check('the open question was cancelled by the escalation', (await logsFor(user.id)).length === 0 && !joined(yes).includes('נרשם'));
  const later = await deliver(msg(PHONE, 'אכלתי ביצה ולחם'));
  check('escalation is sticky: a later clean meal is not offered either', !joined(later).includes('לרשום ביומן'));
  const queue = await db.getWhatsappMessages({ status: 'escalated' });
  check('the flagged message is in the human escalation queue', queue.some((m) => m.chat_id === `${PHONE}@s.whatsapp.net`));

  const stranger = '972501110009';
  const strangerFlag = await deliver(msg(stranger, 'יש לי סוכרת, אכלתי ביצה'));
  check('an escalated unlinked conversation gets no invite', !joined(strangerFlag).includes('/settings#whatsapp'));
}

async function minorAndTz() {
  console.log('\n— minors and time zones');
  const teen = await signup();
  await db.updateUserPreferences(teen.id, { onboarding: { profile: { age: 16 } } });
  const TEEN = '972501110010';
  await linkViaChat(teen, TEEN);
  const q = await deliver(msg(TEEN, 'אכלתי ביצה ולחם'));
  check("a minor's question has no calorie number", joined(q).includes('לרשום ביומן') && !/קק"ל/.test(q[q.length - 1]), q[q.length - 1]);
  const r = await deliver(msg(TEEN, 'כן'));
  check("a minor's receipt has no calorie number", joined(r).includes('נרשם ביומן') && !/קק"ל/.test(joined(r)), joined(r));
  check("…but the minor's entry is logged", (await logsFor(teen.id)).length === 2);

  const tz = await signup();
  const TZ = '972501110011';
  await linkViaChat(tz, TZ);
  await db.upsertNotificationPrefs(tz.id, { timezone: 'America/New_York' });
  // Sent at 22:30 UTC: 18:30 the same day in New York.
  const at = Math.floor(new Date('2026-09-28T22:30:00Z').getTime() / 1000);
  const ny = await deliver(msg(TZ, 'אכלתי ביצה ולחם', { timestamp: at }));
  check('the question shows local time in the user zone', ny[ny.length - 1].includes('18:30') && ny[ny.length - 1].includes('ארוחת ערב'), ny[ny.length - 1]);
  await deliver(msg(TZ, 'כן'));
  const nyRows = await logsFor(tz.id);
  check('…and the entry is on the user\'s local date', nyRows.length === 2 && nyRows.every((l) => l.date === '2026-09-28' && l.meal_type === 'dinner'), JSON.stringify(nyRows.map((l) => l.date)));

  await db.upsertNotificationPrefs(tz.id, { timezone: 'Asia/Jerusalem' });
  await deliver(msg(TZ, 'אכלתי ביצה ולחם', { timestamp: at }));
  await deliver(msg(TZ, 'כן'));
  const jlm = (await logsFor(tz.id)).filter((l) => l.date === '2026-09-29');
  check('the same instant in Jerusalem (01:30) is the next day, a snack', jlm.length === 2 && jlm.every((l) => l.meal_type === 'snack'));
}

// ── run ─────────────────────────────────────────────────────────────────────

(async () => {
  let code = 1;
  let server;
  try {
    const app = require('../index.js');
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    BASE = `http://127.0.0.1:${server.address().port}`;

    console.log('\nwhatsapp → food log\n');
    pureRules();
    const ctx = await linking();
    await logging(ctx);
    await unlinked();
    await escalation();
    await minorAndTz();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    code = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error('\nsuite crashed:', error && error.stack);
  } finally {
    if (server) server.close();
    store._resetMemory();
  }
  process.exit(code);
})();
