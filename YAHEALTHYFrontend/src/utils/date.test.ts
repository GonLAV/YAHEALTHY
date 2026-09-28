import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addDaysISO, browserTimeZone, localDateISO, parseLocalDate } from './date';

/**
 * Node re-reads process.env.TZ when it is assigned, so each block runs the
 * helpers as if the browser were in that zone. The sanity check below makes
 * the suite fail loudly (instead of passing vacuously) if that ever stops
 * working, e.g. under a different test pool.
 */
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** Pure calendar arithmetic in UTC, independent of any time zone. */
const calendarAdd = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const zones = [
  {
    tz: 'Asia/Jerusalem',
    // 2026: clocks go forward Fri 27 Mar 02:00, back Sun 25 Oct 02:00.
    springForward: [2026, 2, 27] as const,
    fallBack: [2026, 9, 25] as const,
    winterOffset: -120,
    summerOffset: -180,
  },
  {
    tz: 'America/Los_Angeles',
    // 2026: clocks go forward Sun 8 Mar 02:00, back Sun 1 Nov 02:00.
    springForward: [2026, 2, 8] as const,
    fallBack: [2026, 10, 1] as const,
    winterOffset: 480,
    summerOffset: 420,
  },
];

describe.each(zones)('date helpers in $tz', ({ tz, springForward, fallBack, winterOffset, summerOffset }) => {
  beforeEach(() => {
    process.env.TZ = tz;
  });

  it('really runs in the zone (sanity check)', () => {
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(winterOffset);
    expect(new Date(2026, 6, 15, 12).getTimezoneOffset()).toBe(summerOffset);
    expect(browserTimeZone()).toBe(tz);
  });

  it('localDateISO formats the local calendar day with zero padding', () => {
    expect(localDateISO(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
    expect(localDateISO(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('addDaysISO keeps whole calendar days across the spring-forward day', () => {
    const [y, m, d] = springForward;
    const day = localDateISO(new Date(y, m, d, 12));
    // Every hour of the DST-change day (and the ones around it) moves by
    // exactly n calendar days, whatever the clock does in between.
    for (let hour = 0; hour < 24; hour++) {
      for (const base of [new Date(y, m, d - 1, hour, 30), new Date(y, m, d, hour, 30), new Date(y, m, d + 1, hour, 30)]) {
        const from = localDateISO(base);
        for (let n = -8; n <= 8; n++) {
          expect(addDaysISO(n, base), `${from} ${hour}:30 + ${n}`).toBe(calendarAdd(from, n));
        }
      }
    }
    expect(addDaysISO(1, new Date(y, m, d - 1, 23, 30))).toBe(day);
  });

  it('addDaysISO keeps whole calendar days across the fall-back day', () => {
    const [y, m, d] = fallBack;
    for (let hour = 0; hour < 24; hour++) {
      for (const base of [new Date(y, m, d - 1, hour, 30), new Date(y, m, d, hour, 30), new Date(y, m, d + 1, hour, 30)]) {
        const from = localDateISO(base);
        for (let n = -8; n <= 8; n++) {
          expect(addDaysISO(n, base), `${from} ${hour}:30 + ${n}`).toBe(calendarAdd(from, n));
        }
      }
    }
  });

  it('addDaysISO differs from naive "+24h" on the 25-hour fall-back day', () => {
    const [y, m, d] = fallBack;
    const earlyMorning = new Date(y, m, d, 0, 30);
    const naive = localDateISO(new Date(earlyMorning.getTime() + 24 * 3600 * 1000));
    // 24 hours after 00:30 on a 25-hour day is still the same calendar day…
    expect(naive).toBe(localDateISO(earlyMorning));
    // …but "tomorrow" is the next day.
    expect(addDaysISO(1, earlyMorning)).toBe(calendarAdd(localDateISO(earlyMorning), 1));
  });

  it('parseLocalDate round-trips every day of the year (incl. both DST changes)', () => {
    let iso = '2026-01-01';
    for (let i = 0; i < 366; i++) {
      const parsed = parseLocalDate(iso);
      expect(parsed.getHours(), iso).toBe(0);
      expect(localDateISO(parsed)).toBe(iso);
      iso = calendarAdd(iso, 1);
    }
  });

  it('parseLocalDate falls back to Date parsing for non-YYYY-MM-DD input', () => {
    expect(parseLocalDate('2026-09-27T10:00:00Z').getTime()).toBe(Date.UTC(2026, 8, 27, 10));
    expect(Number.isNaN(parseLocalDate('not a date').getTime())).toBe(true);
  });
});

describe('local day vs UTC day', () => {
  it('Jerusalem: 00:30 local is already "today" while UTC is still yesterday', () => {
    process.env.TZ = 'Asia/Jerusalem';
    const instant = new Date('2026-09-27T21:30:00Z'); // 00:30 IDT on the 28th
    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-27');
    expect(localDateISO(instant)).toBe('2026-09-28');
    expect(addDaysISO(-1, instant)).toBe('2026-09-27');
  });

  it('Los Angeles: 23:30 local is still "today" while UTC is already tomorrow', () => {
    process.env.TZ = 'America/Los_Angeles';
    const instant = new Date('2026-03-08T07:30:00Z'); // 23:30 PST on the 7th
    expect(instant.toISOString().slice(0, 10)).toBe('2026-03-08');
    expect(localDateISO(instant)).toBe('2026-03-07');
    expect(addDaysISO(1, instant)).toBe('2026-03-08');
  });
});
