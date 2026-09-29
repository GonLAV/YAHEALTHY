/**
 * Booking — a diagnosis (physical or online, free) or a supermarket session
 * (paid), by anyone, with no account.
 *
 *   GET  /api/booking/options      what can be booked, for how long, for how much
 *   GET  /api/booking/slots?type=  the times that can be offered right now
 *   POST /api/booking              book one
 *   GET  /api/booking/:id          the confirmation page's view of one booking
 *   POST /api/booking/:id/cancel   the customer cancels, with the token from their link
 *   GET  /api/booking/:id/slots    times it can move to (token as ?t=)
 *   POST /api/booking/:id/reschedule  the customer moves it, with the same token
 *
 * Public on purpose, like /api/payments/checkout: the people booking a first
 * diagnosis are mostly not customers yet. That is why POST has its own tighter
 * rate limit, and why GET /:id returns only what the confirmation page shows.
 */
const express = require('express');
const db = require('../utils/database');
const booking = require('../utils/booking');
const appointments = require('../utils/appointments');
const google = require('../utils/google-calendar');
const payplus = require('../utils/payplus');
const mailer = require('../utils/mailer');
const { normalizePhone } = require('../utils/phone');
const { bookingLimiter } = require('../middleware/rateLimit');
const messages = require('../utils/appointment-messages');

const router = express.Router();

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// No real address is longer (RFC 5321). Checked before EMAIL, which
// backtracks quadratically on a long near-miss: ~90 KB took seconds.
const EMAIL_MAX = 254;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/options', (req, res) => {
  const cfg = booking.config();
  return res.json({
    timeZone: cfg.timeZone,
    calendarConnected: google.isConfigured(),
    types: booking.TYPES.map((type) => ({
      type,
      durationMin: cfg.durationMin[type],
      price: cfg.price[type],
      paid: booking.PAID_TYPES.includes(type),
      location: type === 'physical' ? cfg.location || null : null
    }))
  });
});

router.get('/slots', async (req, res) => {
  const type = String(req.query.type || '');
  if (!booking.TYPES.includes(type)) {
    return res.status(400).json({ error: 'Unknown appointment type', requestId: req.id });
  }
  try {
    return res.json({ slots: await appointments.slotsFor(type) });
  } catch (error) {
    // Not an empty list: offering no times reads as "fully booked", and
    // offering all of them would book over whatever Google could not tell us.
    console.error('[booking] could not read availability:', error.message);
    return res.status(502).json({ error: 'Could not read the calendar', requestId: req.id });
  }
});

router.post('/', bookingLimiter, async (req, res) => {
  const body = req.body || {};
  const type = String(body.type || '');
  const start = String(body.start || '');
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim().toLowerCase() || null;
  const location = String(body.location || '').trim() || null;
  const notes = String(body.notes || '').trim() || null;
  const cfg = booking.config();
  const paid = booking.PAID_TYPES.includes(type);

  if (!booking.TYPES.includes(type)) return res.status(400).json({ error: 'Unknown appointment type', requestId: req.id });
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'A name is required', requestId: req.id });
  if (!phone) return res.status(400).json({ error: 'A valid Israeli mobile number is required', requestId: req.id });
  if (email && (email.length > EMAIL_MAX || !EMAIL.test(email))) return res.status(400).json({ error: 'That email does not look right', requestId: req.id });
  // A paid session sends a receipt, and PayPlus needs somewhere to send it.
  if (paid && !email) return res.status(400).json({ error: 'An email is required for a paid session', requestId: req.id });
  if (type === 'supermarket' && (!location || location.length > 200)) {
    return res.status(400).json({ error: 'Say which supermarket or area', requestId: req.id });
  }
  if (notes && notes.length > 1000) return res.status(400).json({ error: 'Notes are too long', requestId: req.id });
  // Checked here, not left to the slot lookup: an unreadable start threw
  // there and came back as "Could not read the calendar".
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return res.status(400).json({ error: 'A start time is required', requestId: req.id });

  if (appointments.calendarRequiredButMissing()) {
    return res.status(503).json({ error: 'Booking is not connected to a calendar yet', code: 'calendar_unavailable', requestId: req.id });
  }
  if (paid && !(cfg.price[type] > 0)) {
    return res.status(503).json({ error: 'That session has no price set', code: 'no_price', requestId: req.id });
  }
  // isAvailable: PayPlus, or the demo stand-in (never in production).
  if (paid && !payplus.isAvailable()) {
    return res.status(503).json({ error: 'Payments are not configured on this server', code: 'payments_unavailable', requestId: req.id });
  }

  let slot;
  try {
    // Checked again here, not trusted from the page: the list the customer
    // chose from may be minutes old, and she may have filled that hour since.
    slot = (await appointments.slotsFor(type)).find((s) => s.start === new Date(startMs).toISOString());
  } catch (error) {
    console.error('[booking] could not read availability:', error.message);
    return res.status(502).json({ error: 'Could not read the calendar', requestId: req.id });
  }
  if (!slot) return res.status(409).json({ error: 'That time is no longer available', requestId: req.id });

  let row;
  try {
    row = await db.createAppointment({
      type,
      start_at: slot.start,
      end_at: slot.end,
      status: paid ? 'pending_payment' : 'booked',
      name,
      phone,
      email,
      location: type === 'supermarket' ? location : null,
      notes,
      amount: paid ? cfg.price[type] : null,
      cancel_token: appointments.newCancelToken()
    });
  } catch (error) {
    if (error.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'That time is no longer available', requestId: req.id });
    }
    console.error('[booking] could not store the appointment:', error.message);
    return res.status(500).json({ error: 'Could not book', requestId: req.id });
  }

  if (!paid) {
    try {
      row = await appointments.pushToCalendar(row);
    } catch (error) {
      // Not in her calendar means she will not show up. Better to say so now
      // than to confirm a meeting that exists only in our table.
      console.error('[booking] Google Calendar refused the event:', error.message);
      await db.updateAppointment(row.id, { status: 'cancelled' }).catch(() => {});
      return res.status(502).json({ error: 'Could not add the meeting to the calendar', requestId: req.id });
    }
    await messages.sendConfirmation(row);
    return res.status(201).json({ appointment: appointments.publicView(row), cancelToken: row.cancel_token });
  }

  try {
    const link = await payplus.createPaymentLink({
      amount: cfg.price[type],
      customerName: name,
      email,
      phone,
      plan: type,
      reference: row.id,
      callbackUrl: `${process.env.API_PUBLIC_URL || ''}/api/payments/callback`,
      successUrl: `${mailer.APP_URL}/book/confirmed?id=${row.id}&t=${encodeURIComponent(row.cancel_token)}`,
      failureUrl: `${mailer.APP_URL}/payment-failed?booking=${row.id}`
    });
    return res.status(201).json({
      appointment: appointments.publicView(row),
      cancelToken: row.cancel_token,
      paymentPageLink: link.paymentPageLink
    });
  } catch (error) {
    console.error('[booking] could not start the payment:', error.message);
    await db.updateAppointment(row.id, { status: 'cancelled' }).catch(() => {});
    return res.status(502).json({ error: 'Could not start the payment', requestId: req.id });
  }
});

router.get('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found', requestId: req.id });
  try {
    const row = await db.getAppointment(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found', requestId: req.id });
    return res.json({ appointment: appointments.publicView(row) });
  } catch (error) {
    return res.status(500).json({ error: 'Could not read the booking', requestId: req.id });
  }
});

// The token is the whole of the authorisation: whoever holds the link the
// customer was given may cancel that one booking, and nothing else. A wrong
// token answers exactly like a missing booking.
router.post('/:id/cancel', bookingLimiter, async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Not found', requestId: req.id });
  try {
    const row = await db.getAppointment(req.params.id);
    if (!row || !appointments.tokenMatches(row, req.body?.token)) {
      return res.status(404).json({ error: 'Not found', requestId: req.id });
    }
    const result = await appointments.cancel(row.id, { by: 'customer' });
    if (!result.ok && result.reason === 'past') {
      return res.status(409).json({ error: 'This meeting has already started', requestId: req.id });
    }
    return res.json({ appointment: appointments.publicView(result.row) });
  } catch (error) {
    console.error('[booking] cancel failed:', error.message);
    return res.status(500).json({ error: 'Could not cancel', requestId: req.id });
  }
});

// Moving uses the same token as cancelling, and answers a wrong one the same
// way a missing booking is answered.
async function withToken(req, res, token) {
  if (!UUID.test(req.params.id)) {
    res.status(404).json({ error: 'Not found', requestId: req.id });
    return null;
  }
  const row = await db.getAppointment(req.params.id);
  if (!row || !appointments.tokenMatches(row, token)) {
    res.status(404).json({ error: 'Not found', requestId: req.id });
    return null;
  }
  return row;
}

router.get('/:id/slots', async (req, res) => {
  try {
    const row = await withToken(req, res, req.query.t);
    if (!row) return;
    // Its own current time is not "busy" for the purpose of moving it, but
    // it is also not somewhere to move to.
    const current = new Date(row.start_at).toISOString();
    const slots = (await appointments.slotsFor(row.type, Date.now(), row)).filter((s) => s.start !== current);
    return res.json({ slots });
  } catch (error) {
    console.error('[booking] could not read availability:', error.message);
    return res.status(502).json({ error: 'Could not read the calendar', requestId: req.id });
  }
});

router.post('/:id/reschedule', bookingLimiter, async (req, res) => {
  try {
    const row = await withToken(req, res, req.body?.token);
    if (!row) return;
    const result = await appointments.reschedule(row.id, req.body?.start);
    if (result.ok) return res.json({ appointment: appointments.publicView(result.row) });
    const status = { slot_unavailable: 409, past: 409, not_booked: 409, calendar: 502, not_found: 404 }[result.reason] || 400;
    return res.status(status).json({ error: result.reason, requestId: req.id });
  } catch (error) {
    console.error('[booking] reschedule failed:', error.message);
    return res.status(500).json({ error: 'Could not move the meeting', requestId: req.id });
  }
});

module.exports = router;
