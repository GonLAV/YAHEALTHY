// Calendar dates as YYYY-MM-DD in the user's local time zone.
// Do not use `toISOString().split('T')[0]` for this — that is the UTC date,
// which lags the local date after midnight for users east of UTC (e.g. Israel).
export const localIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const localToday = (): string => localIsoDate(new Date());
