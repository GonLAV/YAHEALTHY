/**
 * Pure helpers for the weekly meal planner page (/meal-plan). No DOM, no API.
 */
import type { Lang } from '@/i18n/translations';
import type { PlannedIngredient, ShoppingItem, ShoppingList } from '@/services/api';
import { localDateISO, parseLocalDate } from '@/utils/date';

type T = (key: string, params?: Record<string, string | number>) => string;

/** Sunday on or before `iso` — the planner's (Israeli) week start. */
export const weekStartOf = (iso: string): string => {
  const d = parseLocalDate(iso);
  return localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
};

/** `iso` moved by whole weeks (DST-safe). */
export const shiftWeek = (iso: string, weeks: number): string => {
  const d = parseLocalDate(iso);
  return localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7));
};

/** Index of `todayIso` within the week, or 0 when today is outside it. */
export const todayIndex = (weekStart: string, todayIso: string): number => {
  const ms = parseLocalDate(todayIso).getTime() - parseLocalDate(weekStart).getTime();
  const i = Math.round(ms / 86400000);
  return i >= 0 && i < 7 ? i : 0;
};

const fmtNumber = (n: number, lang: Lang, maxFractionDigits = 0) =>
  new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: maxFractionDigits }).format(n);

/** "450 g", "1.2 kg", "750 ml", "1.5 L", "6 units", "4 slices" — localized. */
export const formatAmount = (amount: number, unit: ShoppingItem['unit'], lang: Lang, t: T): string => {
  const big = (unit === 'g' || unit === 'ml') && amount >= 1000;
  const n = big ? fmtNumber(amount / 1000, lang, 1) : fmtNumber(amount, lang, unit === 'g' || unit === 'ml' ? 0 : 1);
  if (unit === 'g') return big ? t('mealPlan.unit.kg', { n }) : t('mealPlan.unit.g', { n });
  if (unit === 'ml') return big ? t('mealPlan.unit.l', { n }) : t('mealPlan.unit.ml', { n });
  if (unit === 'slice') return t('mealPlan.unit.slice', { n });
  return t('mealPlan.unit.unit', { n });
};

/** An ingredient in a meal: whole units where they make sense, else grams. */
export const formatIngredientAmount = (item: PlannedIngredient, lang: Lang, t: T): string =>
  item.unit && item.units !== undefined ? formatAmount(item.units, item.unit, lang, t) : formatAmount(item.grams, 'g', lang, t);

/** "(cooked weight)" etc., or '' for raw/plain items. */
export const stateNote = (state: ShoppingItem['state'], t: T): string =>
  state === 'cooked' || state === 'dry' || state === 'drained' ? t(`mealPlan.state.${state}`) : '';

/** Percent of target, clamped 0–999, or null without a target. */
export const percentOf = (value: number, target: number | null | undefined): number | null =>
  target && target > 0 ? Math.max(0, Math.min(999, Math.round((value / target) * 100))) : null;

/**
 * The shopping list as plain text for WhatsApp / the clipboard. Unchecked
 * items only (what is still to buy) unless everything is checked.
 */
export const shoppingListText = (
  list: ShoppingList,
  { lang, t, weekLabel }: { lang: Lang; t: T; weekLabel: string },
): string => {
  const all = list.sections.flatMap((s) => s.items);
  const onlyOpen = all.some((i) => !i.checked);
  const lines = [t('mealPlan.share.heading', { week: weekLabel })];
  for (const section of list.sections) {
    const items = section.items.filter((i) => !onlyOpen || !i.checked);
    if (!items.length) continue;
    lines.push('', `*${t(`mealPlan.section.${section.id}`)}*`);
    for (const item of items) {
      const note = stateNote(item.state, t);
      lines.push(`• ${item[lang]} — ${formatAmount(item.amount, item.unit, lang, t)}${note ? ` ${note}` : ''}`);
    }
  }
  lines.push('', t('mealPlan.share.footer'));
  return lines.join('\n');
};

/** wa.me link that opens WhatsApp with `text` ready to send. */
export const whatsappShareUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Toggle `key` in a checked-keys list, keeping order stable. */
export const toggleChecked = (checked: string[], key: string, on: boolean): string[] =>
  on ? (checked.includes(key) ? checked : [...checked, key]) : checked.filter((k) => k !== key);

/**
 * A coach chat line that ends in " → /path" becomes a link: returns the label
 * and the in-app path, or null for ordinary text.
 */
export const parseCoachLink = (line: string): { label: string; href: string } | null => {
  const m = /^(.*\S)\s+→\s+(\/[a-z0-9/-]+)$/i.exec(line.trim());
  return m ? { label: m[1], href: m[2] } : null;
};
