/**
 * The colours that have to be written as values rather than as classes.
 *
 * Most of the app styles with Tailwind, where `bg-rose-500` is the whole story.
 * But a recharts `stroke`, an SVG `stroke` on ProgressRing, and a canvas
 * `fillStyle` all take a colour value, not a class name — so those hex codes
 * were being typed out by hand, in four separate files, from memory.
 *
 * That is how a chart drifts away from the bars it is meant to match: someone
 * changes a Tailwind class and the hardcoded twin beside it stays put, and
 * nothing fails, it just slowly stops looking like one system.
 *
 * So: no new palette. These are Tailwind's own values, named once, so that the
 * chart and the bar are provably the same colour rather than coincidentally
 * the same colour. If a value here ever disagrees with its class name, the
 * name is right and the value is the bug.
 */

export const COLOR = {
  /** emerald-600 — the product's primary, and what "on target" means. */
  brand: '#059669',
  /** emerald-400, for the light end of a gradient. */
  brandLight: '#34d399',

  /**
   * rose-600. Reserved: it means "over target" on the calorie ring, and using
   * it for anything neutral breaks a signal that is already established.
   */
  over: '#e11d48',

  // The three macros, matching MACRO_STYLES on the dashboard.
  protein: '#f43f5e', // rose-500
  carbs: '#0ea5e9', // sky-500
  fat: '#f59e0b', // amber-500

  // Supporting hues used by cards and charts.
  water: '#0284c7', // sky-600
  waterTrack: '#e0f2fe', // sky-100 — the unfilled part of the hydration ring
  sleep: '#6366f1', // indigo-500
  badge: '#8b5cf6', // violet-500

  // Neutrals.
  track: '#e2e8f0', // slate-200 — an empty bar, an unlogged day, a grid line
  muted: '#94a3b8', // slate-400 — axis ticks, secondary rules
} as const;

/**
 * The categorical order for a chart with no inherent meaning to its series.
 * Starts with the macro three so a macro chart inherits the meaning the bars
 * on the dashboard already carry.
 */
export const SERIES_COLORS = [
  COLOR.protein,
  COLOR.carbs,
  COLOR.fat,
  COLOR.brand,
  COLOR.badge,
] as const;

export default COLOR;
