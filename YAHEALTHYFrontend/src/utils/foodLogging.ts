/**
 * Pure helpers for the food log page: meal slot for the hour, grouping and
 * totals, listbox keyboard movement, recent searches, portion arithmetic.
 * No React and no network here, so all of it is unit-tested.
 */
import type { CatalogFood, FoodLog, MealType } from '@/services/api';

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export const isMealType = (v: unknown): v is MealType =>
  typeof v === 'string' && (MEAL_TYPES as readonly string[]).includes(v);

/** Same boundaries as the backend (utils/food-logging.js mealForHour). */
export function mealForHour(hour: number): MealType {
  if (!Number.isFinite(hour)) return 'snack';
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

/** The meal slot the browser's local time most likely means. */
export const currentMeal = (now: Date = new Date()): MealType => mealForHour(now.getHours());

/** Logs by meal slot; a log with no slot counts as a snack. Order within a slot is kept. */
export function groupByMeal(logs: FoodLog[]): Record<MealType, FoodLog[]> {
  const groups = { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<MealType, FoodLog[]>;
  for (const log of logs) {
    const slot = isMealType(log.meal_type) ? log.meal_type : 'snack';
    groups[slot].push(log);
  }
  return groups;
}

export interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export function dayTotals(logs: FoodLog[]): Totals {
  const t = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + n(l.calories),
      protein: acc.protein + n(l.protein_grams),
      carbs: acc.carbs + n(l.carbs_grams),
      fat: acc.fat + n(l.fat_grams),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { ...t, calories: Math.round(t.calories) };
}

/**
 * Listbox/combobox arrow-key movement (WAI-ARIA combobox pattern). `current`
 * is -1 when nothing is active. Returns the next active index, or null when
 * the key is not a navigation key.
 */
export function listboxNextIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End' ? -1 : null;
  switch (key) {
    case 'ArrowDown':
      return current < 0 || current >= count - 1 ? 0 : current + 1;
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export const RECENT_SEARCHES_KEY = 'yahealthy-food-recent-searches';
export const RECENT_SEARCHES_MAX = 6;

/** Newest first, no duplicates (case-insensitive), at most `max`. */
export function pushRecentSearch(list: string[], term: string, max = RECENT_SEARCHES_MAX): string[] {
  const clean = term.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return list.slice(0, max);
  const lower = clean.toLocaleLowerCase();
  return [clean, ...list.filter((s) => s.toLocaleLowerCase() !== lower)].slice(0, max);
}

/** Per-viewer convenience: storage can be missing or throw, never required. */
export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_SEARCHES_MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearches(list: string[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, RECENT_SEARCHES_MAX)));
  } catch {
    /* storage unavailable */
  }
}

/** Grams for `count` servings of `servingGrams`; null for a bad input. */
export function gramsFor(servingGrams: number, count: number): number | null {
  if (!(servingGrams > 0) || !(count > 0)) return null;
  return Math.round(servingGrams * count * 10) / 10;
}

/** Local preview of per-100 g values for `grams` (the server's number is logged). */
export function scalePer100g(per100: number | null | undefined, grams: number): number | null {
  if (per100 == null || !Number.isFinite(per100) || !(grams > 0)) return null;
  return Math.round(per100 * (grams / 100) * 10) / 10;
}

/** A parsed positive number from a form field, or null. */
export function positiveNumber(value: string): number | null {
  const v = Number(String(value).replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** A parsed non-negative number from an optional form field (empty → undefined). */
export function optionalNumber(value: string): number | undefined {
  if (!String(value).trim()) return undefined;
  const v = Number(String(value).replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Same food, for the favourite star: the catalog id when both have one, else the name. */
export function sameFood(
  a: { food_id?: string | null; name: string },
  b: { food_id?: string | null; name: string },
): boolean {
  if (a.food_id && b.food_id) return a.food_id === b.food_id;
  return a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase();
}

/** A catalog food's name in the UI language (Hebrew name when there is no English one). */
export const catalogName = (food: Pick<CatalogFood, 'nameHe' | 'nameEn'>, lang: 'he' | 'en'): string =>
  lang === 'en' && food.nameEn ? food.nameEn : food.nameHe;

/** A serving's label in the UI language, falling back to whichever the source gave. */
export const servingLabel = (s: { name_he?: string; name_en?: string }, lang: 'he' | 'en'): string =>
  (lang === 'he' ? s.name_he || s.name_en : s.name_en || s.name_he) || '';
