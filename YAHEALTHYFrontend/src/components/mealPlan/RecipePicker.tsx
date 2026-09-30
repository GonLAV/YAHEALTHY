import { useId, useMemo, useRef, useState } from 'react';
import { Clock, Flame, Search } from 'lucide-react';
import type { Recipe } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import Dialog from './Dialog';

export const recipeName = (recipe: Recipe, lang: string) =>
  lang === 'en' ? recipe.name_en || recipe.name : recipe.name;

/** Recipe category that best fits a meal slot, used as the picker's starting filter. */
const DEFAULT_CATEGORY: Record<string, string> = {
  breakfast: 'breakfast',
  snack: 'snack',
};

interface RecipePickerProps {
  recipes: Recipe[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  mealType: string;
  mealLabel: string;
  dayLabel: string;
  onPick: (recipe: Recipe) => void;
  onClose: () => void;
}

export const RecipePicker = ({
  recipes,
  loading,
  error,
  onRetry,
  mealType,
  mealLabel,
  dayLabel,
  onPick,
  onClose,
}: RecipePickerProps) => {
  const { t, lang } = useLanguage();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const categoryId = useId();

  const categories = useMemo(
    () => Array.from(new Set(recipes.map((r) => r.category))),
    [recipes]
  );

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(() => {
    const preferred = DEFAULT_CATEGORY[mealType];
    return preferred && recipes.some((r) => r.category === preferred) ? preferred : 'all';
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || (r.name_en ?? '').toLowerCase().includes(q)
      );
    });
  }, [recipes, query, category]);

  const catLabel = (c: string) => {
    const key = `mealPlan.cat.${c}`;
    const label = t(key);
    return label === key ? c : label;
  };

  return (
    <Dialog
      title={t('mealPlan.picker.title')}
      description={t('mealPlan.picker.for', { meal: mealLabel, day: dayLabel })}
      closeLabel={t('mealPlan.close')}
      onClose={onClose}
      initialFocusRef={searchRef}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor={searchId} className="mb-1 block text-sm font-medium text-slate-700">
            {t('mealPlan.picker.search')}
          </label>
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('mealPlan.picker.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pe-3 ps-9 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>
        <div>
          <label htmlFor={categoryId} className="mb-1 block text-sm font-medium text-slate-700">
            {t('mealPlan.picker.category')}
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          >
            <option value="all">{t('mealPlan.picker.all')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {catLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p role="status" aria-live="polite" className="mt-3 text-xs text-slate-500">
        {loading
          ? t('common.loading')
          : error
            ? ''
            : visible.length === 0
              ? t('mealPlan.picker.noResults')
              : t('mealPlan.picker.results', { count: visible.length })}
      </p>

      {error && !loading && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          <span>{t('mealPlan.picker.loadError')}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
          >
            {t('mealPlan.retry')}
          </button>
        </div>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {visible.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onPick(recipe)}
              className="w-full rounded-2xl p-3 text-start ring-1 ring-slate-100 transition hover:bg-emerald-50 hover:ring-emerald-200"
            >
              <span className="block font-semibold text-slate-900">{recipeName(recipe, lang)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{catLabel(recipe.category)}</span>
                <span className="inline-flex items-center gap-1">
                  <Flame size={12} aria-hidden="true" />
                  <span className="num">{recipe.calories}</span> {t('mealPlan.kcal')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} aria-hidden="true" />
                  {t('mealPlan.picker.minutes', { n: recipe.time_minutes })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
};

export default RecipePicker;
