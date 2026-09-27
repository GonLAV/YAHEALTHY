/**
 * Calendar dates in the user's own time zone.
 *
 * Log rows carry a plain `date` (YYYY-MM-DD) that means "the user's day".
 * `toISOString().slice(0, 10)` gives the UTC day instead, which in Israel is
 * still yesterday between 00:00 and 02:00/03:00 — so logs land on the wrong day
 * and the dashboard says today isn't logged. Use these helpers wherever a
 * calendar date is produced or "today" is compared.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of `d` in the browser's local time zone. */
export const localDateISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's local calendar date (YYYY-MM-DD). */
export const todayISO = (): string => localDateISO();

/** Local calendar date `n` days from `d` (negative = past). DST-safe. */
export const addDaysISO = (n: number, d: Date = new Date()): string =>
  localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));

/** The browser's IANA time zone (e.g. Asia/Jerusalem); UTC if unavailable. */
export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * Parse a stored YYYY-MM-DD as local midnight. `new Date('2026-09-27')` is UTC
 * midnight, which renders as the previous day west of Greenwich.
 */
export const parseLocalDate = (iso: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
};
