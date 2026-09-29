import { describe, expect, it } from 'vitest';
import { translations, type Lang } from '@/i18n/translations';
import type { ShoppingList } from '@/services/api';
import {
  formatAmount, formatIngredientAmount, parseCoachLink, percentOf, shiftWeek, shoppingListText,
  stateNote, todayIndex, toggleChecked, weekStartOf, whatsappShareUrl,
} from './mealPlan';

const tFor = (lang: Lang) => (key: string, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), translations[lang][key] ?? key);

describe('week helpers', () => {
  it('weekStartOf is the Sunday on or before the date', () => {
    expect(weekStartOf('2026-09-27')).toBe('2026-09-27'); // Sunday
    expect(weekStartOf('2026-10-01')).toBe('2026-09-27');
    expect(weekStartOf('2026-10-03')).toBe('2026-09-27'); // Saturday
    expect(weekStartOf('2026-10-04')).toBe('2026-10-04');
  });

  it('shiftWeek moves by whole weeks across month and DST boundaries', () => {
    expect(shiftWeek('2026-09-27', 1)).toBe('2026-10-04');
    expect(shiftWeek('2026-10-25', 1)).toBe('2026-11-01');
    expect(shiftWeek('2026-01-04', -1)).toBe('2025-12-28');
  });

  it('todayIndex points at today inside the week, else the first day', () => {
    expect(todayIndex('2026-09-27', '2026-09-30')).toBe(3);
    expect(todayIndex('2026-09-27', '2026-10-10')).toBe(0);
  });
});

describe('amount formatting', () => {
  const en = tFor('en');
  const he = tFor('he');
  it('switches to kg / L at 1000 and keeps whole units', () => {
    expect(formatAmount(450, 'g', 'en', en)).toBe('450 g');
    expect(formatAmount(1250, 'g', 'en', en)).toBe('1.3 kg');
    expect(formatAmount(750, 'ml', 'en', en)).toBe('750 ml');
    expect(formatAmount(1500, 'ml', 'en', en)).toBe('1.5 L');
    expect(formatAmount(6, 'unit', 'en', en)).toBe('6 pcs');
    expect(formatAmount(4, 'slice', 'en', en)).toBe('4 slices');
    expect(formatAmount(1250, 'g', 'he', he)).toBe('1.3 ק״ג');
  });

  it('shows a meal ingredient in units when it has them', () => {
    expect(formatIngredientAmount({ id: 'egg', he: 'ביצים', en: 'Eggs', grams: 100, state: null, units: 2, unit: 'unit' }, 'en', en)).toBe('2 pcs');
    expect(formatIngredientAmount({ id: 'rice', he: 'אורז', en: 'Rice', grams: 180, state: 'cooked' }, 'en', en)).toBe('180 g');
  });

  it('notes cooked / dry weights only', () => {
    expect(stateNote('cooked', en)).toBe('(cooked weight)');
    expect(stateNote('raw', en)).toBe('');
    expect(stateNote(null, en)).toBe('');
  });

  it('percentOf handles a missing target', () => {
    expect(percentOf(1900, 2000)).toBe(95);
    expect(percentOf(100, null)).toBeNull();
  });
});

describe('shopping list sharing', () => {
  const list: ShoppingList = {
    totalItems: 3,
    sections: [
      { id: 'produce', items: [
        { key: 'apple', he: 'תפוחים', en: 'Apples', amount: 3, unit: 'unit', state: null, checked: false },
        { key: 'tomato', he: 'עגבניות', en: 'Tomatoes', amount: 400, unit: 'g', state: null, checked: true },
      ] },
      { id: 'grains_legumes', items: [
        { key: 'white_rice', he: 'אורז לבן', en: 'White rice', amount: 1200, unit: 'g', state: 'cooked', checked: false },
      ] },
    ],
  };

  it('lists what is still to buy, grouped by section (en)', () => {
    const text = shoppingListText(list, { lang: 'en', t: tFor('en'), weekLabel: '27 Sep – 3 Oct' });
    expect(text).toContain('Shopping list — week of 27 Sep – 3 Oct');
    expect(text).toContain('*Fruit & vegetables*');
    expect(text).toContain('• Apples — 3 pcs');
    expect(text).not.toContain('Tomatoes');
    expect(text).toContain('• White rice — 1.2 kg (cooked weight)');
    expect(text.trim().endsWith('Made with YAHealthy')).toBe(true);
  });

  it('is fully Hebrew in Hebrew', () => {
    const text = shoppingListText(list, { lang: 'he', t: tFor('he'), weekLabel: '27 בספט׳' });
    expect(text).toContain('*פירות וירקות*');
    expect(text).toContain('• תפוחים — 3 יח׳');
    expect(text).not.toMatch(/Apples|Rice|Shopping/);
  });

  it('when everything is ticked, the whole list is shared', () => {
    const all = { ...list, sections: list.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, checked: true })) })) };
    expect(shoppingListText(all, { lang: 'en', t: tFor('en'), weekLabel: 'w' })).toContain('Tomatoes');
  });

  it('builds a wa.me link with the text encoded', () => {
    expect(whatsappShareUrl('a b\nג')).toBe('https://wa.me/?text=a%20b%0A%D7%92');
  });

  it('toggleChecked adds once and removes', () => {
    expect(toggleChecked(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleChecked(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleChecked(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('coach links', () => {
  it('turns a trailing "→ /path" line into a link', () => {
    expect(parseCoachLink('A whole week planned: the weekly meal planner → /meal-plan')).toEqual({
      label: 'A whole week planned: the weekly meal planner',
      href: '/meal-plan',
    });
    expect(parseCoachLink('תפריט לכל השבוע → /meal-plan')?.href).toBe('/meal-plan');
  });

  it('leaves ordinary lines and external URLs alone', () => {
    expect(parseCoachLink('• Lentil stew — about 500 kcal')).toBeNull();
    expect(parseCoachLink('see → https://evil.example')).toBeNull();
  });
});
