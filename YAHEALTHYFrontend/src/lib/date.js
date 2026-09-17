/**
 * All dates in the app are "local calendar days" (YYYY-MM-DD in the user's
 * timezone), matching what users mean by "today" — not UTC ISO strings.
 */
export function todayStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
export function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return todayStr(dt);
}
/** Monday-based week start for the given local date */
export function weekStartStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = (dt.getDay() + 6) % 7; // Mon=0..Sun=6
    return addDays(dateStr, -dow);
}
export function fmtDayShort(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'short',
    });
}
export function fmtDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}
export function fmtDateLong(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
}
export function daysBetween(from, to) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const a = new Date(fy, fm - 1, fd).getTime();
    const b = new Date(ty, tm - 1, td).getTime();
    return Math.round((b - a) / 86400000);
}
/** Time input "HH:MM" -> decimal hours */
export function timeToHours(t) {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
}
/** Hours between bedtime and wake time, handling past-midnight */
export function sleepDuration(bedtime, wake) {
    let hours = timeToHours(wake) - timeToHours(bedtime);
    if (hours <= 0)
        hours += 24;
    return Math.round(hours * 10) / 10;
}
