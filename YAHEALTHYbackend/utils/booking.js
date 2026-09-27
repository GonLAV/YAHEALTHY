/**
 * Diagnosis booking — which times can be offered.
 *
 * Working hours are local time in Israel, and the server is not: Vercel runs in
 * UTC, and Israel moves its clocks twice a year. So a slot is built as "09:00
 * on this calendar date in Asia/Jerusalem" and converted, never as "UTC plus
 * two", which is wrong for half the year.
 *
 * Every value has a default and an environment override, so changing her hours
 * is a config change, not a deploy of new code.
 */

// physical and online are the diagnosis, and free. supermarket is the paid
// session — walking the aisles together, learning what to buy — and is the
// only type that goes through PayPlus before it reaches the calendar.
const TYPES = ['physical', 'online', 'supermarket'];
const PAID_TYPES = ['supermarket'];

function intList(value, fallback) {
  if (!value) return fallback;
  const list = String(value).split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n));
  return list.length ? list : fallback;
}

function hhmm(value, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

function config() {
  const env = process.env;
  return {
    timeZone: env.BOOKING_TIMEZONE || 'Asia/Jerusalem',
    // 0 = Sunday. Default Sunday–Thursday, the Israeli working week.
    days: intList(env.BOOKING_DAYS, [0, 1, 2, 3, 4]),
    startMinute: hhmm(env.BOOKING_START, 9 * 60),
    endMinute: hhmm(env.BOOKING_END, 17 * 60),
    durationMin: {
      physical: Number(env.BOOKING_PHYSICAL_DURATION_MIN) || 45,
      online: Number(env.BOOKING_ONLINE_DURATION_MIN) || 45,
      supermarket: Number(env.BOOKING_SUPERMARKET_DURATION_MIN) || 90
    },
    // Same rule as the subscription prices: from the environment, and a paid
    // type with no price refuses to book rather than booking for nothing.
    price: {
      physical: 0,
      online: 0,
      supermarket: Number(env.SESSION_SUPERMARKET_AMOUNT || 0)
    },
    // How long an unpaid supermarket booking holds its slot.
    holdMinutes: Number(env.BOOKING_HOLD_MINUTES) || 30,
    // Kept free after each meeting, so two bookings never sit back to back.
    bufferMin: Number(env.BOOKING_BUFFER_MIN ?? 15),
    stepMin: Number(env.BOOKING_STEP_MIN) || 30,
    minNoticeHours: Number(env.BOOKING_MIN_NOTICE_HOURS ?? 12),
    horizonDays: Number(env.BOOKING_HORIZON_DAYS) || 21,
    location: env.BOOKING_CLINIC_ADDRESS || ''
  };
}

/**
 * How far `timeZone` is ahead of UTC at instant `ms`, in ms.
 */
function tzOffset(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which it is `minute` minutes past midnight on y-m-d in
 * `timeZone`. Converted twice so a date on either side of a clock change lands
 * on the right offset.
 */
function zonedToUtc(y, m, d, minute, timeZone) {
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  const first = guess - tzOffset(guess, timeZone);
  return guess - tzOffset(first, timeZone);
}

/** Today's calendar date in `timeZone`, as {y, m, d}. */
function localDate(ms, timeZone) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms))
    .split('-')
    .map(Number);
  return { y, m, d };
}

/**
 * Every slot of `type` that can be offered now.
 *
 * @param {object} args
 * @param {'physical'|'online'} args.type
 * @param {number} args.now - epoch ms
 * @param {{start: number, end: number}[]} args.busy - taken intervals, epoch ms
 * @returns {{start: string, end: string}[]} ISO instants, earliest first
 */
function availableSlots({ type, now, busy = [], cfg = config() }) {
  const duration = cfg.durationMin[type] * 60_000;
  const buffer = cfg.bufferMin * 60_000;
  const earliest = now + cfg.minNoticeHours * 3_600_000;
  const today = localDate(now, cfg.timeZone);
  const slots = [];

  for (let offset = 0; offset <= cfg.horizonDays; offset++) {
    // Calendar arithmetic on a UTC date is safe: no clock changes in UTC.
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + offset));
    if (!cfg.days.includes(day.getUTCDay())) continue;
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];

    for (let minute = cfg.startMinute; minute + cfg.durationMin[type] <= cfg.endMinute; minute += cfg.stepMin) {
      const start = zonedToUtc(y, m, d, minute, cfg.timeZone);
      const end = start + duration;
      if (start < earliest) continue;
      // The buffer is checked on both sides: a slot may not start right after
      // something ends, nor end right before something starts.
      const clashes = busy.some((b) => start < b.end + buffer && end + buffer > b.start);
      if (!clashes) slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
  }
  return slots;
}

module.exports = { TYPES, PAID_TYPES, config, availableSlots, zonedToUtc, tzOffset };
