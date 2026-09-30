// Local-calendar date helpers. Everything here works in the user's local time
// zone: toISOString() is UTC and would shift the day for users east/west of
// UTC (e.g. Israel after 21:00/22:00 would get tomorrow's date).

/** Format a Date as YYYY-MM-DD using its LOCAL calendar fields. */
export const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Parse YYYY-MM-DD as a LOCAL midnight Date (new Date('YYYY-MM-DD') would be UTC). */
export const parseYMD = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Local midnight of the first day of the week containing `d` (0 = Sunday). */
export const startOfWeek = (d: Date, weekStartsOn = 0): Date => {
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
};

export const weekDays = (start: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));
