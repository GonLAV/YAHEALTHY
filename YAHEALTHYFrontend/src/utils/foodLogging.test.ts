import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FoodLog } from '@/services/api';
import {
  catalogName,
  currentMeal,
  servingLabel,
  dayTotals,
  gramsFor,
  groupByMeal,
  listboxNextIndex,
  loadRecentSearches,
  mealForHour,
  optionalNumber,
  positiveNumber,
  pushRecentSearch,
  RECENT_SEARCHES_KEY,
  sameFood,
  saveRecentSearches,
  scalePer100g,
} from './foodLogging';

const log = (over: Partial<FoodLog>): FoodLog => ({ id: 'x', name: 'Food', calories: 100, date: '2026-09-29', ...over });

describe('meal slot', () => {
  it('maps hours like the backend', () => {
    expect([6, 10, 11, 15, 16, 17, 21, 22, 2].map(mealForHour)).toEqual([
      'breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'dinner', 'dinner', 'snack', 'snack',
    ]);
  });
  it('reads the local hour', () => {
    expect(currentMeal(new Date(2026, 8, 29, 8, 30))).toBe('breakfast');
    expect(currentMeal(new Date(2026, 8, 29, 19, 0))).toBe('dinner');
  });
});

describe('grouping and totals', () => {
  it('groups by meal and puts unknown slots under snack', () => {
    const g = groupByMeal([log({ id: 'a', meal_type: 'lunch' }), log({ id: 'b' }), log({ id: 'c', meal_type: 'brunch' })]);
    expect(g.lunch.map((l) => l.id)).toEqual(['a']);
    expect(g.snack.map((l) => l.id)).toEqual(['b', 'c']);
    expect(g.breakfast).toEqual([]);
  });
  it('sums calories and macros, treating missing as zero', () => {
    const t = dayTotals([
      log({ calories: 120.4, protein_grams: 10 }),
      log({ calories: 80, carbs_grams: 5, fat_grams: 2 }),
    ]);
    expect(t).toEqual({ calories: 200, protein: 10, carbs: 5, fat: 2 });
  });
});

describe('listbox keyboard movement', () => {
  it('moves down and wraps', () => {
    expect(listboxNextIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(listboxNextIndex(1, 'ArrowDown', 3)).toBe(2);
    expect(listboxNextIndex(2, 'ArrowDown', 3)).toBe(0);
  });
  it('moves up and wraps', () => {
    expect(listboxNextIndex(-1, 'ArrowUp', 3)).toBe(2);
    expect(listboxNextIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(listboxNextIndex(2, 'ArrowUp', 3)).toBe(1);
  });
  it('Home / End, empty list, other keys', () => {
    expect(listboxNextIndex(1, 'Home', 3)).toBe(0);
    expect(listboxNextIndex(0, 'End', 3)).toBe(2);
    expect(listboxNextIndex(0, 'ArrowDown', 0)).toBe(-1);
    expect(listboxNextIndex(0, 'a', 3)).toBeNull();
  });
});

describe('recent searches', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps newest first, dedupes case-insensitively, caps the list', () => {
    let list: string[] = [];
    for (const term of ['egg', 'Rice', 'tomato', 'EGG ', 'x']) list = pushRecentSearch(list, term, 3);
    expect(list).toEqual(['EGG', 'tomato', 'Rice']);
  });

  it('round-trips through storage and survives a throwing or corrupt store', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    saveRecentSearches(['עגבנייה', 'rice']);
    expect(loadRecentSearches()).toEqual(['עגבנייה', 'rice']);
    store.set(RECENT_SEARCHES_KEY, '{not json');
    expect(loadRecentSearches()).toEqual([]);
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    expect(loadRecentSearches()).toEqual([]);
    expect(() => saveRecentSearches(['a'])).not.toThrow();
  });
});

describe('portions and numbers', () => {
  it('servings to grams', () => {
    expect(gramsFor(123, 2)).toBe(246);
    expect(gramsFor(0, 2)).toBeNull();
    expect(gramsFor(50, 0)).toBeNull();
  });
  it('per-100 g preview', () => {
    expect(scalePer100g(18, 250)).toBe(45);
    expect(scalePer100g(null, 100)).toBeNull();
    expect(scalePer100g(18, 0)).toBeNull();
  });
  it('parses form fields (comma decimals too)', () => {
    expect(positiveNumber('12,5')).toBe(12.5);
    expect(positiveNumber('0')).toBeNull();
    expect(optionalNumber('')).toBeUndefined();
    expect(optionalNumber('0')).toBe(0);
    expect(optionalNumber('-1')).toBeUndefined();
  });
  it('same food by catalog id, else by name', () => {
    expect(sameFood({ food_id: 'a', name: 'Tomato' }, { food_id: 'a', name: 'עגבנייה' })).toBe(true);
    expect(sameFood({ food_id: 'a', name: 'Tomato' }, { food_id: 'b', name: 'Tomato' })).toBe(false);
    expect(sameFood({ name: ' Oatmeal' }, { food_id: null, name: 'oatmeal' })).toBe(true);
  });
});

describe('display names', () => {
  it('uses the UI language, falling back to Hebrew', () => {
    expect(catalogName({ nameHe: 'עגבנייה', nameEn: 'Tomatoes, raw' }, 'en')).toBe('Tomatoes, raw');
    expect(catalogName({ nameHe: 'עגבנייה', nameEn: 'Tomatoes, raw' }, 'he')).toBe('עגבנייה');
    expect(catalogName({ nameHe: 'פתיתים', nameEn: null }, 'en')).toBe('פתיתים');
    expect(servingLabel({ name_en: '1 cup' }, 'he')).toBe('1 cup');
    expect(servingLabel({ name_he: 'כוס', name_en: '1 cup' }, 'he')).toBe('כוס');
  });
});
