/**
 * Appointments — the part between the booking page, the database and her
 * Google calendar.
 *
 * What is busy is the union of two things: her Google calendar (anything she
 * put there, by hand or otherwise) and our own live rows (including a
 * supermarket session that is still waiting for payment, which is on purpose
 * not in her calendar yet). A slot is offered only when both say it is free.
 */
const crypto = require('crypto');
const db = require('./database');
const google = require('./google-calendar');
const booking = require('./booking');
const { maskPhone } = require('./phone');
const messages = require('./appointment-messages');

const TYPE_LABEL_HE = {
  physical: 'אבחון פיזי',
  online: 'אבחון אונליין',
  supermarket: 'פגישה בסופר'
};

/**
 * Production without a calendar would take bookings she never sees. Refused
 * there; allowed in development so the page can be tried without Google.
 */
function calendarRequiredButMissing() {
  return process.env.NODE_ENV === 'production' && !google.isConfigured();
}

function newCancelToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function tokenMatches(row, token) {
  if (!row?.cancel_token || typeof token !== 'string') return false;
  const a = Buffer.from(row.cancel_token);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Where the customer sees their booking, and can cancel it. */
function confirmationUrl(row) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  return `${appUrl}/book/confirmed?id=${row.id}&t=${encodeURIComponent(row.cancel_token || '')}`;
}

/**
 * `ignore` is one appointment's own time, left out when that appointment is
 * the one being moved: otherwise it blocks itself, and moving a meeting half
 * an hour later would be refused because the meeting is in the way. Google's
 * freeBusy reports the same event anonymously, so it is matched by its times.
 */
async function busyBetween(fromMs, toMs, cfg, ignore = null) {
  await db.releaseExpiredHolds(cfg.holdMinutes);
  const rows = await db.listLiveAppointments(new Date(fromMs).toISOString(), new Date(toMs).toISOString());
  const busy = rows
    .filter((r) => !ignore || r.id !== ignore.id)
    .map((r) => ({ start: Date.parse(r.start_at), end: Date.parse(r.end_at) }));
  if (google.isConfigured()) {
    const own = ignore ? { start: Date.parse(ignore.start_at), end: Date.parse(ignore.end_at) } : null;
    const fromGoogle = await google.freeBusy(fromMs, toMs);
    busy.push(...fromGoogle.filter((b) => !own || b.start !== own.start || b.end !== own.end));
  }
  return busy;
}

async function slotsFor(type, now = Date.now(), ignore = null) {
  const cfg = booking.config();
  const until = now + (cfg.horizonDays + 1) * 86_400_000;
  const busy = await busyBetween(now, until, cfg, ignore);
  return booking.availableSlots({ type, now, busy, cfg });
}

/**
 * Writes the appointment to her calendar and records the event on the row.
 * Throws when Google refuses; the caller decides what that means.
 */
async function pushToCalendar(appointment) {
  if (!google.isConfigured()) return appointment;
  const cfg = booking.config();
  const online = appointment.type === 'online';
  const lines = [
    `טלפון: ${appointment.phone}`,
    appointment.email ? `מייל: ${appointment.email}` : null,
    appointment.type === 'supermarket' && appointment.location ? `סופר / אזור: ${appointment.location}` : null,
    appointment.amount ? `שולם: ₪${appointment.amount}` : null,
    appointment.notes ? `\nהערות:\n${appointment.notes}` : null,
    // The invite reaches the customer too, so this is how they find their way
    // back to cancel, even if they closed the confirmation page long ago.
    `\nלצפייה / ביטול: ${confirmationUrl(appointment)}`,
    'נקבע דרך YAHEALTHY'
  ].filter(Boolean);

  const event = await google.createEvent({
    summary: `${TYPE_LABEL_HE[appointment.type]} — ${appointment.name}`,
    description: lines.join('\n'),
    start: appointment.start_at,
    end: appointment.end_at,
    timeZone: cfg.timeZone,
    attendeeEmail: appointment.email || null,
    online,
    location: appointment.type === 'supermarket' ? appointment.location : cfg.location
  });
  return db.updateAppointment(appointment.id, { google_event_id: event.id, meet_link: event.meetLink });
}

/**
 * Reasons accumulate rather than replace: a customer who underpaid and later
 * cancelled is owed two refunds, and the second flag must not erase the first.
 */
function withReason(existing, reason) {
  const reasons = String(existing || '').split(',').filter(Boolean);
  return reasons.includes(reason) ? reasons.join(',') : [...reasons, reason].join(',');
}

/**
 * Something a person has to settle. Written on the row, so the staff screen
 * shows it; the log line is for whoever reads logs first.
 */
async function flag(row, reason, detail) {
  console.error(`[appointments] ${row.id} needs attention (${reason}): ${detail}`);
  const current = await db.getAppointment(row.id).catch(() => row);
  await db.updateAppointment(row.id, { needs_attention: withReason(current?.needs_attention, reason) }).catch((err) =>
    console.error('[appointments] could not record needs_attention:', err.message)
  );
}

/**
 * The approved PayPlus callback for a supermarket session.
 *
 * Money has already moved when this runs, so nothing here refuses the
 * payment. Anything that cannot be completed is flagged for a person to
 * settle — a refund, or a call to pick another time.
 */
async function confirmPaid(appointmentId, paidAmount) {
  const row = appointmentId ? await db.getAppointment(appointmentId) : null;
  if (!row) {
    // No appointment to attach a flag to, so the caller flags the payment
    // itself (payment_events.needs_attention) and the staff screen shows it.
    console.error('[appointments] paid session with no matching appointment:', appointmentId);
    return { needsAttention: true, noBooking: true };
  }
  if (row.status === 'booked') return { alreadyBooked: true };

  if (paidAmount != null && row.amount && Number(paidAmount) < Number(row.amount)) {
    await flag(row, 'underpaid', `paid ${paidAmount}, expected ${row.amount}`);
    return { needsAttention: true };
  }

  try {
    // A hold that expired while they were on the payment page is revived if
    // nobody took the slot meanwhile. If somebody did, they paid for a time
    // they cannot have, and a person has to call them.
    await db.updateAppointment(row.id, { status: 'booked', cancelled_by: null, cancelled_at: null });
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') {
      await flag(row, 'slot_taken', `paid after the slot was taken — call ${maskPhone(row.phone)}`);
      return { needsAttention: true };
    }
    throw err;
  }

  let calendarOk = true;
  try {
    await pushToCalendar({ ...row, status: 'booked' });
  } catch (err) {
    // Booked in our table, so the slot stays blocked for everyone else; it is
    // only missing from her calendar, which is what the flag is for.
    await flag(row, 'calendar_failed', err.message);
    calendarOk = false;
  }
  // They paid and the time is theirs either way, so they hear so either way.
  await messages.sendConfirmation((await db.getAppointment(row.id)) || row);
  return calendarOk ? { booked: true } : { needsAttention: true };
}

/**
 * Cancel a booking, by the customer (with their token) or by staff.
 *
 * The slot is freed first and the calendar cleaned up second: a leftover event
 * in her calendar is an annoyance she can delete, while a row that still holds
 * the slot turns away the next person.
 *
 * A paid session cancelled by the customer is flagged refund_requested. Whether
 * and how much to refund is the business's call, not this function's.
 *
 * @returns {Promise<{ok: true, row} | {ok: false, reason: 'not_found'|'past'}>}
 */
async function cancel(id, { by }) {
  const row = await db.getAppointment(id);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status === 'cancelled') return { ok: true, row };
  if (by === 'customer' && Date.parse(row.start_at) <= Date.now()) return { ok: false, reason: 'past' };

  const wasPaidFor = row.status === 'booked' && Number(row.amount) > 0;
  const patch = { status: 'cancelled', cancelled_by: by, cancelled_at: new Date().toISOString() };
  if (wasPaidFor && by === 'customer') patch.needs_attention = withReason(row.needs_attention, 'refund_requested');
  let updated = await db.updateAppointment(row.id, patch);

  if (row.google_event_id && google.isConfigured()) {
    try {
      await google.deleteEvent(row.google_event_id);
    } catch (err) {
      await flag(row, 'calendar_cleanup', `cancelled, but the event is still in Google: ${err.message}`);
      updated = await db.getAppointment(row.id);
    }
  }
  return { ok: true, row: updated };
}

/**
 * Move a booked meeting to another free time of the same type.
 *
 * The row moves first, because the unique index is what settles two people
 * reaching for the same slot; Google follows. If Google refuses, the row goes
 * back: a meeting whose time differs between our table and her calendar is
 * worse than a move that did not happen.
 *
 * @returns {Promise<{ok: true, row} | {ok: false, reason: 'not_found'|'not_booked'|'past'|'slot_unavailable'|'calendar'}>}
 */
async function reschedule(id, newStart) {
  const row = await db.getAppointment(id);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'booked') return { ok: false, reason: 'not_booked' };
  if (Date.parse(row.start_at) <= Date.now()) return { ok: false, reason: 'past' };

  const wanted = new Date(newStart);
  if (Number.isNaN(wanted.getTime())) return { ok: false, reason: 'slot_unavailable' };
  const slot = (await slotsFor(row.type, Date.now(), row)).find((s) => s.start === wanted.toISOString());
  if (!slot) return { ok: false, reason: 'slot_unavailable' };

  const before = { start_at: row.start_at, end_at: row.end_at, reminder_sent_at: row.reminder_sent_at || null };
  let moved;
  try {
    moved = await db.updateAppointment(row.id, { start_at: slot.start, end_at: slot.end, reminder_sent_at: null });
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') return { ok: false, reason: 'slot_unavailable' };
    throw err;
  }

  if (row.google_event_id && google.isConfigured()) {
    try {
      await google.moveEvent(row.google_event_id, { start: slot.start, end: slot.end, timeZone: booking.config().timeZone });
    } catch (err) {
      console.error(`[appointments] ${row.id} could not be moved in Google, reverting:`, err.message);
      await db.updateAppointment(row.id, before);
      return { ok: false, reason: 'calendar' };
    }
  }

  await messages.sendConfirmation(moved, { moved: true });
  return { ok: true, row: moved };
}

/** What the customer's browser is allowed to see about an appointment. */
function publicView(row) {
  const cfg = booking.config();
  return {
    id: row.id,
    type: row.type,
    start: row.start_at,
    end: row.end_at,
    status: row.status,
    meetLink: row.meet_link || null,
    location: row.type === 'supermarket' ? row.location : row.type === 'physical' ? cfg.location || null : null,
    amount: row.amount ? Number(row.amount) : null
  };
}

/** Everything but the customer's cancel token, which staff never need. */
function staffView(row) {
  const { cancel_token: _token, ...rest } = row;
  return rest;
}

module.exports = {
  calendarRequiredButMissing,
  newCancelToken,
  tokenMatches,
  slotsFor,
  pushToCalendar,
  confirmPaid,
  cancel,
  reschedule,
  publicView,
  staffView
};
