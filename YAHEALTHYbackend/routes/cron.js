/**
 * Scheduled jobs, called by Vercel Cron (vercel.json → "crons").
 *
 *   GET /api/cron/reminders   WhatsApp reminders for tomorrow's meetings
 *
 * Once a day rather than hourly: Vercel's Hobby plan runs crons daily at most,
 * and "tomorrow at 10:00" is a reminder people want the evening before, not
 * exactly 24 hours before. The schedule is 15:00 UTC — 18:00 in Israel in
 * summer, 17:00 in winter.
 *
 * Vercel signs its cron calls with `Authorization: Bearer $CRON_SECRET`. Without
 * that secret set this route refuses everyone, because an open trigger is a way
 * for anyone to make the server message every customer.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../utils/database');
const booking = require('../utils/booking');
const messages = require('../utils/appointment-messages');

const router = express.Router();

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(String(req.get('authorization') || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Tomorrow, as a [from, to) window of instants, in the calendar's time zone. */
function tomorrowWindow(now = Date.now()) {
  const { timeZone } = booking.config();
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now))
    .split('-')
    .map(Number);
  const day = (offset) => {
    const date = new Date(Date.UTC(y, m - 1, d + offset));
    return booking.zonedToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 0, timeZone);
  };
  return { from: new Date(day(1)).toISOString(), to: new Date(day(2)).toISOString() };
}

router.get('/reminders', async (req, res) => {
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!messages.isConfigured()) {
    return res.status(503).json({ error: 'WhatsApp is not configured', requestId: req.id });
  }

  try {
    const { from, to } = tomorrowWindow();
    const due = await db.listAppointmentsNeedingReminder(from, to);
    let sent = 0;
    for (const row of due) {
      // Marked only once it went, so a failed send is retried by tomorrow's
      // run if the meeting is still ahead — and never sent twice if it went.
      if (await messages.sendReminder(row)) {
        await db.updateAppointment(row.id, { reminder_sent_at: new Date().toISOString() });
        sent += 1;
      }
    }
    console.info(`[cron] reminders: ${sent}/${due.length} sent for ${from.slice(0, 10)}`);
    return res.json({ due: due.length, sent });
  } catch (error) {
    console.error('[cron] reminders failed:', error.message);
    return res.status(500).json({ error: 'Reminders failed', requestId: req.id });
  }
});

module.exports = router;
module.exports.tomorrowWindow = tomorrowWindow;
