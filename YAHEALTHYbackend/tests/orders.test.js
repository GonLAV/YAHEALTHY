/**
 * One-time purchases (Yael's personal menu) and the demo payment stand-in.
 *
 * The menu grants no access: paying opens an order that Yael fulfils, and the
 * staff screen is where she sees it. The demo payment page (utils/payplus.js,
 * isDemo) runs the same transaction code a signed PayPlus callback runs — and
 * must be impossible to reach in production.
 *
 *   node tests/orders.test.js
 */

process.env.ALLOW_MEMORY_DB = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
process.env.NODE_ENV = 'test';
process.env.PAYPLUS_API_KEY = '';
process.env.PAYPLUS_SECRET_KEY = '';
process.env.PAYPLUS_PAYMENT_PAGE_UID = '';
process.env.PLAN_BASE_AMOUNT = '150';
process.env.PLAN_YONI_AMOUNT = '250';
process.env.PRODUCT_MENU_AMOUNT = '400';
process.env.SESSION_SUPERMARKET_AMOUNT = '800';
process.env.APP_URL = 'http://localhost:5173';
process.env.BOOKING_RATE_LIMIT = '1000';
process.env.DEMO_PAYMENTS = 'true';

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
const payplus = require('../utils/payplus');

async function run() {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  const { callbackRouter, checkoutRouter } = require('../routes/payments');
  app.use('/api/payments', callbackRouter);
  app.use('/api/payments', checkoutRouter);
  app.use('/api/booking', require('../routes/booking'));
  app.use('/api/staff', require('../routes/staff'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, route, body) => {
    const res = await fetch(BASE + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  // ── what is for sale ──────────────────────────────────────────────────────
  const plans = (await call('GET', '/api/payments/plans')).body;
  check("Yael's menu is for sale, once, at 400", plans.products?.some((p) => p.id === 'menu' && p.amount === 400 && p.billing === 'once'), JSON.stringify(plans.products));
  check('the monthly plans are still there', plans.plans.map((p) => p.id).join(',') === 'base,yoni');

  // ── buying the menu, through the demo payment page ───────────────────────
  const checkout = await call('POST', '/api/payments/checkout', { plan: 'menu', name: 'דנה', email: 'dana@example.com', phone: '050-1234567' });
  check('checkout for the menu returns a payment page', checkout.status === 201, JSON.stringify(checkout.body));
  const link = new URL(checkout.body.paymentPageLink);
  check('in demo mode that page is ours, on the app origin', link.origin === 'http://localhost:5173' && link.pathname === '/demo-pay');
  const ref = link.searchParams.get('ref');

  const details = await call('GET', `/api/payments/demo/${ref}`);
  check('the demo page can show what is being paid for', details.body?.amount === 400 && details.body?.label === 'תפריט אישי מיעל');

  const paid = await call('POST', `/api/payments/demo/${ref}/pay`);
  check('paying sends the buyer to the welcome page for the menu', paid.body?.redirect === 'http://localhost:5173/welcome?product=menu', JSON.stringify(paid.body));

  const orders = (await call('GET', '/api/staff/orders')).body.orders;
  const order = orders.find((o) => o.email === 'dana@example.com');
  check('it opens an order for Yael', order?.product === 'menu' && order?.status === 'paid' && Number(order?.amount) === 400, JSON.stringify(orders));
  check('with the number she will contact', order?.phone === '972501234567');
  const user = await db.getUserByEmail('dana@example.com');
  check('the buyer has an account to sign in to', Boolean(user));
  check('and no subscription: a menu is not access', (await db.getActiveSubscriptions(user.id)).length === 0);

  check('a demo payment can be paid only once', (await call('POST', `/api/payments/demo/${ref}/pay`)).status === 404);

  // ── Yael works the order ─────────────────────────────────────────────────
  const working = await call('POST', `/api/staff/orders/${order.id}/status`, { status: 'in_progress' });
  check('staff can mark it in progress', working.body?.order?.status === 'in_progress');
  check('an unknown status is refused', (await call('POST', `/api/staff/orders/${order.id}/status`, { status: 'teleported' })).status === 400);
  await call('POST', `/api/staff/orders/${order.id}/status`, { status: 'delivered' });
  check('a delivered order leaves the open list', !(await call('GET', '/api/staff/orders')).body.orders.some((o) => o.id === order.id));
  check('and stays in the full list', (await call('GET', '/api/staff/orders?scope=all')).body.orders.some((o) => o.id === order.id && o.status === 'delivered'));

  // ── cancelling on the demo page ──────────────────────────────────────────
  const second = await call('POST', '/api/payments/checkout', { plan: 'menu', email: 'noa@example.com', phone: '050-7654321' });
  const ref2 = new URL(second.body.paymentPageLink).searchParams.get('ref');
  const cancelled = await call('POST', `/api/payments/demo/${ref2}/cancel`);
  check('cancelling sends the buyer to payment-failed', cancelled.body?.redirect === 'http://localhost:5173/payment-failed');
  check('and opens no order', !(await call('GET', '/api/staff/orders?scope=all')).body.orders.some((o) => o.email === 'noa@example.com'));

  // ── the paid supermarket session, end to end in demo mode ────────────────
  const slots = (await call('GET', '/api/booking/slots?type=supermarket')).body.slots;
  const booking = await call('POST', '/api/booking', { type: 'supermarket', start: slots[0].start, name: 'גון', phone: '052-3717214', email: 'gon@example.com', location: 'שופרסל נהריה' });
  check('a supermarket session can be booked in the demo (was: "booking unavailable")', booking.status === 201 && Boolean(booking.body?.paymentPageLink), `${booking.status} ${JSON.stringify(booking.body)}`);
  const ref3 = new URL(booking.body.paymentPageLink).searchParams.get('ref');
  const paidSession = await call('POST', `/api/payments/demo/${ref3}/pay`);
  check('paying lands on the booking confirmation', /\/book\/confirmed\?id=/.test(paidSession.body?.redirect || ''));
  check('and the session is booked', (await call('GET', `/api/booking/${booking.body.appointment.id}`)).body.appointment.status === 'booked');

  // ── the locks ────────────────────────────────────────────────────────────
  process.env.NODE_ENV = 'production';
  check('in production the demo is off, whatever DEMO_PAYMENTS says', payplus.isDemo() === false && payplus.isAvailable() === false);
  const prodCheckout = await call('POST', '/api/payments/checkout', { plan: 'menu', email: 'x@example.com', phone: '050-1112233' });
  check('and checkout refuses, saying why', prodCheckout.status === 503 && prodCheckout.body?.code === 'payments_unavailable', JSON.stringify(prodCheckout.body));
  process.env.NODE_ENV = 'test';

  process.env.DEMO_PAYMENTS = '';
  check('without DEMO_PAYMENTS the demo is off', payplus.isDemo() === false);
  const offBooking = await call('POST', '/api/booking', { type: 'supermarket', start: slots[1].start, name: 'בדיקה', phone: '050-9998877', email: 'x@example.com', location: 'סופר' });
  check('and a paid booking says payments are unavailable, not booking', offBooking.status === 503 && offBooking.body?.code === 'payments_unavailable', JSON.stringify(offBooking.body));
  process.env.DEMO_PAYMENTS = 'true';

  check('an unknown product is refused', (await call('POST', '/api/payments/checkout', { plan: 'teleport', email: 'x@example.com', phone: '050-1112233' })).status === 400);

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
