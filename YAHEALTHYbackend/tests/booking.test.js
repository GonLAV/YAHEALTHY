/**
 * Booking — a free diagnosis (physical / online) and a paid supermarket
 * session, against her Google calendar.
 *
 * Google Calendar and PayPlus's link endpoint are stubbed on their module
 * objects, so nothing leaves the process. What is real: the slot arithmetic,
 * the database (memory mode), the routes, and the PayPlus signature check on
 * the callback that turns a held slot into a booked one.
 *
 *   node tests/booking.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';
process.env.PAYPLUS_API_KEY = 'k';
process.env.PAYPLUS_SECRET_KEY = 'payplus-test-secret';
process.env.PAYPLUS_PAYMENT_PAGE_UID = 'page';
process.env.SESSION_SUPERMARKET_AMOUNT = '800';
process.env.BOOKING_CLINIC_ADDRESS = 'רחוב הדוגמה 1, תל אביב';
process.env.BOOKING_RATE_LIMIT = '1000';

const crypto = require('crypto');
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

const booking = require('../utils/booking');

// ── stubs ───────────────────────────────────────────────────────────────────
const google = require('../utils/google-calendar');
const calendar = { busy: [], events: [], refuse: false };
google.isConfigured = () => true;
google.freeBusy = async () => calendar.busy;
google.createEvent = async (event) => {
  if (calendar.refuse) throw new Error('Google said no');
  calendar.events.push(event);
  return { id: `evt_${calendar.events.length}`, htmlLink: null, meetLink: event.online ? 'https://meet.google.com/abc-defg-hij' : null };
};

const payplus = require('../utils/payplus');
const paymentLinks = [];
payplus.createPaymentLink = async (args) => {
  paymentLinks.push(args);
  return { pageRequestUid: 'req', paymentPageLink: 'https://pay.test/page' };
};

let BASE;

async function call(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function paidCallback({ uid, reference, amount = 800, statusCode = '000' }) {
  const raw = JSON.stringify({
    transaction: {
      uid,
      payment_request_uid: uid,
      status_code: statusCode,
      amount,
      currency: 'ILS',
      more_info: 'supermarket',
      more_info_2: 'buyer@test.com',
      more_info_3: '0501234567',
      more_info_4: reference
    }
  });
  const hash = crypto.createHmac('sha256', process.env.PAYPLUS_SECRET_KEY).update(raw).digest('base64');
  const res = await fetch(BASE + '/api/payments/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', hash, 'user-agent': 'PayPlus' },
    body: raw
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const person = { name: 'דנה כהן', phone: '050-123-4567', email: 'dana@test.com' };

async function run() {
  // ── the arithmetic ────────────────────────────────────────────────────────
  // Israel is UTC+3 in summer and UTC+2 in winter; 09:00 local must follow.
  const summer = booking.zonedToUtc(2026, 7, 5, 9 * 60, 'Asia/Jerusalem');
  const winter = booking.zonedToUtc(2026, 12, 6, 9 * 60, 'Asia/Jerusalem');
  check('09:00 in July is 06:00 UTC', new Date(summer).toISOString() === '2026-07-05T06:00:00.000Z', new Date(summer).toISOString());
  check('09:00 in December is 07:00 UTC', new Date(winter).toISOString() === '2026-12-06T07:00:00.000Z', new Date(winter).toISOString());

  const cfg = { ...booking.config(), minNoticeHours: 0, horizonDays: 7 };
  // Saturday 3 Oct 2026, 12:00 Israel time.
  const saturdayNoon = booking.zonedToUtc(2026, 10, 3, 12 * 60, 'Asia/Jerusalem');
  const week = booking.availableSlots({ type: 'online', now: saturdayNoon, cfg });
  const days = new Set(week.map((s) => new Date(s.start).toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' })));
  check('no slots on Friday or Saturday', !days.has('Fri') && !days.has('Sat'), [...days].join(','));
  check('the first slot is Sunday 09:00', week[0]?.start === new Date(booking.zonedToUtc(2026, 10, 4, 540, 'Asia/Jerusalem')).toISOString(), week[0]?.start);
  const lastOfSunday = week.filter((s) => s.start.startsWith('2026-10-04')).at(-1);
  check('a 45-minute slot never runs past 17:00', lastOfSunday?.end <= new Date(booking.zonedToUtc(2026, 10, 4, 17 * 60, 'Asia/Jerusalem')).toISOString(), lastOfSunday?.end);

  const tenOClock = booking.zonedToUtc(2026, 10, 4, 10 * 60, 'Asia/Jerusalem');
  const withMeeting = booking.availableSlots({
    type: 'online', now: saturdayNoon, cfg,
    busy: [{ start: tenOClock, end: tenOClock + 60 * 60_000 }]
  }).map((s) => s.start);
  const at = (h, m = 0) => new Date(booking.zonedToUtc(2026, 10, 4, h * 60 + m, 'Asia/Jerusalem')).toISOString();
  check('a busy hour blocks the slots inside it', !withMeeting.includes(at(10)) && !withMeeting.includes(at(10, 30)));
  check('and the buffer blocks the slot that would end right before it', !withMeeting.includes(at(9, 30)));
  check('and the slot that would start right when it ends', !withMeeting.includes(at(11)));
  check('but not the slot after the buffer', withMeeting.includes(at(11, 30)));

  const notice = booking.availableSlots({ type: 'online', now: saturdayNoon, cfg: { ...cfg, minNoticeHours: 24 } });
  check('nothing inside the notice period', notice.every((s) => Date.parse(s.start) >= saturdayNoon + 24 * 3_600_000));

  const supermarket = booking.availableSlots({ type: 'supermarket', now: saturdayNoon, cfg });
  check('a supermarket session is 90 minutes', Date.parse(supermarket[0].end) - Date.parse(supermarket[0].start) === 90 * 60_000);

  // ── the server ────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  const { callbackRouter, checkoutRouter } = require('../routes/payments');
  app.use('/api/payments', callbackRouter);
  app.use('/api/payments', checkoutRouter);
  app.use('/api/booking', require('../routes/booking'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  BASE = `http://127.0.0.1:${server.address().port}`;

  const options = await call('GET', '/api/booking/options');
  const byType = Object.fromEntries((options.body?.types || []).map((t) => [t.type, t]));
  check('the diagnosis is free', byType.physical?.price === 0 && byType.online?.price === 0);
  check('the supermarket session costs 800', byType.supermarket?.price === 800 && byType.supermarket?.paid === true);

  const plans = await call('GET', '/api/payments/plans');
  check('the pricing page is offered the supermarket session', plans.body?.sessions?.some((s) => s.id === 'supermarket' && s.amount === 800));

  // Google says the first open slot is taken.
  const before = (await call('GET', '/api/booking/slots?type=online')).body.slots;
  calendar.busy = [{ start: Date.parse(before[0].start), end: Date.parse(before[0].end) }];
  const after = (await call('GET', '/api/booking/slots?type=online')).body.slots;
  check('a time busy in Google is not offered', !after.some((s) => s.start === before[0].start));

  const taken = await call('POST', '/api/booking', { ...person, type: 'online', start: before[0].start });
  check('booking a time busy in Google is refused', taken.status === 409, `got ${taken.status}`);

  // ── a free online diagnosis ───────────────────────────────────────────────
  const online = await call('POST', '/api/booking', { ...person, type: 'online', start: after[0].start });
  check('an online diagnosis is booked', online.status === 201, JSON.stringify(online.body));
  check('with a Meet link', online.body?.appointment?.meetLink?.startsWith('https://meet.google.com/'));
  check('and it is in her calendar, with the customer invited', calendar.events.at(-1)?.online === true && calendar.events.at(-1)?.attendeeEmail === person.email);

  const again = await call('POST', '/api/booking', { ...person, name: 'מישהו אחר', type: 'physical', start: after[0].start });
  check('the same time cannot be booked twice', again.status === 409, `got ${again.status}`);

  const physical = await call('POST', '/api/booking', { ...person, type: 'physical', start: after[3].start });
  check('a physical diagnosis is booked', physical.status === 201);
  check('with the clinic address, not a Meet link', physical.body?.appointment?.location === process.env.BOOKING_CLINIC_ADDRESS && !physical.body?.appointment?.meetLink);

  calendar.refuse = true;
  const refused = await call('POST', '/api/booking', { ...person, type: 'online', start: after[6].start });
  check('when Google refuses, the booking is not confirmed', refused.status === 502);
  calendar.refuse = false;
  const retried = await call('POST', '/api/booking', { ...person, type: 'online', start: after[6].start });
  check('and the time is free again afterwards', retried.status === 201, `got ${retried.status}`);

  check('a bad phone is refused', (await call('POST', '/api/booking', { ...person, phone: '03-1234567', type: 'online', start: after[8].start })).status === 400);
  check('a missing name is refused', (await call('POST', '/api/booking', { ...person, name: '', type: 'online', start: after[8].start })).status === 400);

  // No real address is longer than 254 characters (RFC 5321), and the email
  // pattern backtracks quadratically on a long near-miss: ~90 KB of "b." took
  // about two seconds of the event loop, per request, on a public endpoint.
  const longEmail = `${'a'.repeat(250)}@test.com`;
  check(
    'an email longer than any real address is refused',
    (await call('POST', '/api/booking', { ...person, email: longEmail, type: 'online', start: after[8].start })).status === 400
  );
  const hostileEmail = `a@${'b.'.repeat(45000)} x`;
  const hostileStarted = Date.now();
  const hostile = await call('POST', '/api/booking', { ...person, email: hostileEmail, type: 'online', start: after[8].start });
  const hostileMs = Date.now() - hostileStarted;
  check('and a huge one is refused without being scanned', hostile.status === 400 && hostileMs < 500, `${hostile.status} after ${hostileMs} ms`);

  // ── a paid supermarket session ────────────────────────────────────────────
  const shopSlots = (await call('GET', '/api/booking/slots?type=supermarket')).body.slots;
  const shopStart = shopSlots.at(-1).start;
  const noPlace = await call('POST', '/api/booking', { ...person, type: 'supermarket', start: shopStart });
  check('a supermarket session needs a supermarket or area', noPlace.status === 400);
  const noEmail = await call('POST', '/api/booking', { ...person, email: '', type: 'supermarket', start: shopStart, location: 'שופרסל דיל, רמת גן' });
  check('and an email, for the receipt', noEmail.status === 400);

  const eventsBefore = calendar.events.length;
  const shop = await call('POST', '/api/booking', { ...person, type: 'supermarket', start: shopStart, location: 'שופרסל דיל, רמת גן' });
  check('a supermarket session returns a payment page', shop.status === 201 && shop.body?.paymentPageLink === 'https://pay.test/page', JSON.stringify(shop.body));
  check('for 800, carrying the booking id', paymentLinks.at(-1)?.amount === 800 && paymentLinks.at(-1)?.reference === shop.body?.appointment?.id);
  check('it waits for payment', shop.body?.appointment?.status === 'pending_payment');
  check('and is not in her calendar yet', calendar.events.length === eventsBefore);
  check('but its time is held', !(await call('GET', '/api/booking/slots?type=supermarket')).body.slots.some((s) => s.start === shopStart));

  const id = shop.body.appointment.id;
  const declined = await paidCallback({ uid: 'pay_declined', reference: id, statusCode: '001' });
  check('a declined payment books nothing', declined.status === 200 && (await call('GET', `/api/booking/${id}`)).body.appointment.status === 'pending_payment');

  const short = await paidCallback({ uid: 'pay_short', reference: id, amount: 100 });
  check('a payment for less than the price is flagged, not booked', short.body?.needsAttention === true && (await call('GET', `/api/booking/${id}`)).body.appointment.status === 'pending_payment');

  const paid = await paidCallback({ uid: 'pay_ok', reference: id });
  check('an approved payment books it', paid.body?.booked === true, JSON.stringify(paid.body));
  check('and puts it in her calendar, at the supermarket', calendar.events.at(-1)?.location === 'שופרסל דיל, רמת גן' && calendar.events.at(-1)?.online === false);
  check('the confirmation page sees it booked', (await call('GET', `/api/booking/${id}`)).body.appointment.status === 'booked');

  const repeat = await paidCallback({ uid: 'pay_ok', reference: id });
  check('a repeated callback does not book twice', repeat.body?.duplicate === true && calendar.events.filter((e) => e.location === 'שופרסל דיל, רמת גן').length === 1);

  // ── a hold that runs out ──────────────────────────────────────────────────
  process.env.BOOKING_HOLD_MINUTES = '0.0001';
  const lapsing = await call('POST', '/api/booking', { ...person, type: 'supermarket', start: shopSlots[0].start, location: 'רמי לוי' });
  await new Promise((r) => setTimeout(r, 20));
  const reopened = (await call('GET', '/api/booking/slots?type=supermarket')).body.slots;
  check('an unpaid hold gives its time back', reopened.some((s) => s.start === shopSlots[0].start));
  const late = await paidCallback({ uid: 'pay_late', reference: lapsing.body.appointment.id });
  check('paying after the hold ran out still books it, if nobody took the time', late.body?.booked === true, JSON.stringify(late.body));
  delete process.env.BOOKING_HOLD_MINUTES;

  // ── cancelling ────────────────────────────────────────────────────────────
  const freeSlots = (await call('GET', '/api/booking/slots?type=online')).body.slots;
  const toCancel = await call('POST', '/api/booking', { ...person, type: 'online', start: freeSlots[0].start });
  const cancelId = toCancel.body.appointment.id;
  check('a booking hands back a cancel token', typeof toCancel.body?.cancelToken === 'string' && toCancel.body.cancelToken.length >= 30);
  check('and puts the cancel link in the invite', calendar.events.at(-1)?.description?.includes(`t=${encodeURIComponent(toCancel.body.cancelToken)}`));

  const wrong = await call('POST', `/api/booking/${cancelId}/cancel`, { token: 'x'.repeat(32) });
  check('a wrong token cannot cancel', wrong.status === 404);
  check('a missing token cannot cancel', (await call('POST', `/api/booking/${cancelId}/cancel`, {})).status === 404);

  calendar.deleted = [];
  google.deleteEvent = async (eventId) => { calendar.deleted.push(eventId); };
  const cancelled = await call('POST', `/api/booking/${cancelId}/cancel`, { token: toCancel.body.cancelToken });
  check('the right token cancels', cancelled.status === 200 && cancelled.body?.appointment?.status === 'cancelled');
  check('and removes it from her calendar', calendar.deleted.length === 1);
  check('and gives the time back', (await call('GET', '/api/booking/slots?type=online')).body.slots.some((s) => s.start === freeSlots[0].start));
  check('cancelling twice is harmless', (await call('POST', `/api/booking/${cancelId}/cancel`, { token: toCancel.body.cancelToken })).status === 200);

  // A paid session the customer cancels is owed a decision about a refund.
  const paidCancel = await call('POST', `/api/booking/${id}/cancel`, { token: shop.body.cancelToken });
  check('a customer can cancel a paid session', paidCancel.body?.appointment?.status === 'cancelled');

  // ── the staff screen ──────────────────────────────────────────────────────
  const staffApp = express();
  staffApp.use(express.json());
  staffApp.use('/api/staff', require('../routes/staff'));
  const staffServer = await new Promise((resolve) => { const s = staffApp.listen(0, '127.0.0.1', () => resolve(s)); });
  const STAFF = `http://127.0.0.1:${staffServer.address().port}/api/staff`;
  const staffCall = async (method, route) => {
    const res = await fetch(STAFF + route, { method, headers: { 'Content-Type': 'application/json' } });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const attention = (await staffCall('GET', '/appointments?scope=attention')).body.appointments;
  const refund = attention.find((a) => a.id === id);
  check('staff see the cancelled paid session as a refund to decide', refund?.needs_attention?.split(',').includes('refund_requested'), refund?.needs_attention);
  check(
    'and the earlier underpayment is still there beside it',
    refund?.needs_attention?.split(',').includes('underpaid'),
    'the 100 charged before the full payment is a second refund; a later flag must not erase it'
  );
  check('staff never receive the customer cancel token', attention.every((a) => !('cancel_token' in a)));

  const upcoming = (await staffCall('GET', '/appointments?scope=upcoming')).body.appointments;
  check('upcoming lists live bookings, earliest first', upcoming.length > 0 && upcoming.every((a, i) => i === 0 || upcoming[i - 1].start_at <= a.start_at));
  check('upcoming leaves out cancelled ones', upcoming.every((a) => a.status !== 'cancelled'));
  check('and shows staff the phone number', upcoming[0]?.phone === '972501234567');

  const resolved = await staffCall('POST', `/appointments/${id}/resolve`);
  check('staff can mark a matter settled', resolved.body?.appointment?.needs_attention === null);
  check('and it leaves the attention list', !(await staffCall('GET', '/appointments?scope=attention')).body.appointments.some((a) => a.id === id));

  const staffCancel = await staffCall('POST', `/appointments/${upcoming[0].id}/cancel`);
  check('staff can cancel a booking', staffCancel.body?.appointment?.status === 'cancelled' && staffCancel.body?.appointment?.cancelled_by === 'staff');
  check('staff cancelling does not ask themselves for a refund', !staffCancel.body?.appointment?.needs_attention);
  staffServer.close();

  // ── WhatsApp: confirmation, reschedule, reminder ─────────────────────────
  process.env.WHAPI_TOKEN = 'test-token';
  const whapi = require('../utils/whapi');
  const whatsapp = [];
  whapi.sendText = async (to, body) => { whatsapp.push({ to, body }); };

  const db = require('../utils/database');
  const moveSlots = (await call('GET', '/api/booking/slots?type=physical')).body.slots;
  const plus30 = (iso) => new Date(Date.parse(iso) + 30 * 60_000).toISOString();
  // A slot whose half-hour-later time is free too, so the only thing that
  // could block moving there is the meeting itself.
  const moveFrom = moveSlots.find((s) => moveSlots.some((x) => x.start === plus30(s.start)));
  const toMove = await call('POST', '/api/booking', { ...person, email: '', type: 'physical', start: moveFrom.start });
  const moveId = toMove.body.appointment.id;
  const moveToken = toMove.body.cancelToken;
  check('a booking without an email is still confirmed, on WhatsApp', whatsapp.at(-1)?.to === '972501234567@s.whatsapp.net' && whatsapp.at(-1)?.body.includes('הפגישה נקבעה'));
  check('and the message carries the link to change or cancel it', whatsapp.at(-1)?.body.includes(`t=${encodeURIComponent(moveToken)}`));

  check('moving slots need the token', (await call('GET', `/api/booking/${moveId}/slots?t=wrong`)).status === 404);
  const moveOptions = (await call('GET', `/api/booking/${moveId}/slots?t=${encodeURIComponent(moveToken)}`)).body.slots;
  check('its own time is not offered as somewhere to move to', !moveOptions.some((s) => s.start === moveFrom.start));
  // Half an hour later overlaps the meeting's own current time. It must not
  // block itself.
  const halfHourLater = plus30(moveFrom.start);
  check('a meeting can move to a time overlapping its own', moveOptions.some((s) => s.start === halfHourLater));

  calendar.moved = [];
  google.moveEvent = async (eventId, times) => { calendar.moved.push({ eventId, ...times }); };
  check('moving needs the token', (await call('POST', `/api/booking/${moveId}/reschedule`, { token: 'nope', start: halfHourLater })).status === 404);
  const moved = await call('POST', `/api/booking/${moveId}/reschedule`, { token: moveToken, start: halfHourLater });
  check('the customer can move it', moved.status === 200 && moved.body?.appointment?.start === halfHourLater, moved.status + ' ' + JSON.stringify(moved.body));
  check('and it moves in her calendar too', calendar.moved.at(-1)?.start === halfHourLater);
  check('and they are told on WhatsApp', whatsapp.at(-1)?.body.includes('הפגישה הוזזה'));
  check('the new time is now taken', !(await call('GET', '/api/booking/slots?type=physical')).body.slots.some((s) => s.start === halfHourLater));

  const takenElsewhere = (await call('GET', '/api/booking/slots?type=physical')).body.slots.at(-2).start;
  await call('POST', '/api/booking', { ...person, name: 'אחר', type: 'physical', start: takenElsewhere });
  check('it cannot move onto someone else', (await call('POST', `/api/booking/${moveId}/reschedule`, { token: moveToken, start: takenElsewhere })).status === 409);

  google.moveEvent = async () => { throw new Error('Google said no'); };
  const target = (await call('GET', `/api/booking/${moveId}/slots?t=${encodeURIComponent(moveToken)}`)).body.slots.at(-1).start;
  const failedMove = await call('POST', `/api/booking/${moveId}/reschedule`, { token: moveToken, start: target });
  check('when Google refuses the move, it is refused', failedMove.status === 502);
  check('and the booking keeps its time', (await call('GET', `/api/booking/${moveId}`)).body.appointment.start === halfHourLater);
  google.moveEvent = async () => {};

  // The reminder job.
  const cronApp = express();
  cronApp.use('/api/cron', require('../routes/cron'));
  const cronServer = await new Promise((resolve) => { const s = cronApp.listen(0, '127.0.0.1', () => resolve(s)); });
  const CRON = `http://127.0.0.1:${cronServer.address().port}/api/cron/reminders`;

  delete process.env.CRON_SECRET;
  check('without CRON_SECRET the job refuses everyone', (await fetch(CRON)).status === 401);
  process.env.CRON_SECRET = 'cron-test-secret';
  check('a wrong secret is refused', (await fetch(CRON, { headers: { Authorization: 'Bearer nope' } })).status === 401);

  const { tomorrowWindow } = require('../routes/cron');
  const { from } = tomorrowWindow();
  const tomorrowSlot = (await call('GET', '/api/booking/slots?type=online')).body.slots.find((s) => s.start >= from && s.start < tomorrowWindow().to);
  let remindId = null;
  if (tomorrowSlot) {
    remindId = (await call('POST', '/api/booking', { ...person, type: 'online', start: tomorrowSlot.start })).body.appointment.id;
  }
  whatsapp.length = 0;
  const run1 = await fetch(CRON, { headers: { Authorization: 'Bearer cron-test-secret' } }).then((r) => r.json());
  if (tomorrowSlot) {
    check("tomorrow's meeting gets a reminder", run1.sent >= 1 && whatsapp.some((m) => m.body.startsWith('תזכורת: מחר')), JSON.stringify(run1));
    const run2 = await fetch(CRON, { headers: { Authorization: 'Bearer cron-test-secret' } }).then((r) => r.json());
    check('and only one, however often the job runs', run2.sent === 0 && run2.due === 0, JSON.stringify(run2));
    check('the reminder is recorded on the booking', Boolean((await db.getAppointment(remindId)).reminder_sent_at));
  } else {
    // Tomorrow is Friday or Saturday — no working hours, so nothing is due.
    check('no meetings tomorrow, no reminders', run1.sent === 0);
  }
  check('meetings further out are not reminded yet', !whatsapp.some((m) => m.body.includes(moveSlots.at(-1).start)));
  cronServer.close();
  delete process.env.WHAPI_TOKEN;

  // ── money with nothing to match it to ────────────────────────────────────
  const orphan = await paidCallback({ uid: 'pay_orphan', reference: '00000000-0000-4000-8000-00000000dead' });
  check('a payment for a booking that does not exist is flagged', orphan.body?.needsAttention === true);

  const staffApp2 = express();
  staffApp2.use(express.json());
  staffApp2.use('/api/staff', require('../routes/staff'));
  const staffServer2 = await new Promise((resolve) => { const s = staffApp2.listen(0, '127.0.0.1', () => resolve(s)); });
  const STAFF2 = `http://127.0.0.1:${staffServer2.address().port}/api/staff`;
  const flagged = await fetch(`${STAFF2}/payments`).then((r) => r.json());
  const orphanRow = flagged.payments.find((p) => p.uid === 'pay_orphan');
  check('and staff see it, with why', orphanRow?.needsAttention === 'no_booking', JSON.stringify(flagged));
  const resolvedPay = await fetch(`${STAFF2}/payments/pay_orphan/resolve`, { method: 'POST' });
  check('staff can mark it settled', resolvedPay.status === 200);
  check('and it leaves the list', !(await fetch(`${STAFF2}/payments`).then((r) => r.json())).payments.some((p) => p.uid === 'pay_orphan'));
  staffServer2.close();

  check('an unknown id is not found', (await call('GET', '/api/booking/00000000-0000-4000-8000-000000000000')).status === 404);
  check('a malformed id is not found', (await call('GET', '/api/booking/not-an-id')).status === 404);

  server.close();
}

run()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('suite crashed:', error && error.stack);
    process.exit(1);
  });
