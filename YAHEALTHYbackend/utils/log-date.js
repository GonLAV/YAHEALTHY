/**
 * Which calendar day a request means.
 *
 * Log rows store a plain `date` (YYYY-MM-DD) in the user's own calendar. When a
 * client leaves it out, falling back to the server's UTC date files late-evening
 * and after-midnight logs under the wrong day for anyone not on UTC (Israel is
 * UTC+2/+3), so the client can send its IANA time zone instead and we compute
 * "today" there. Order: explicit date → today in tz → today in UTC.
 */

const { localDate, isValidTimeZone } = require('./engagement');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * @param {{ date?: unknown, tz?: unknown, now?: Date }} input
 * @returns {{ date: string } | { error: string }}
 */
function resolveRequestDate({ date, tz, now = new Date() } = {}) {
  if (date !== undefined && date !== null && date !== '') {
    if (!isValidIsoDate(date)) return { error: 'date must be YYYY-MM-DD' };
    return { date };
  }
  const zone = typeof tz === 'string' && isValidTimeZone(tz) ? tz : 'UTC';
  return { date: localDate(now, zone) };
}

module.exports = { resolveRequestDate, isValidIsoDate };
