import { useEffect, useId, useRef, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { optionalNumber } from '@/utils/foodLogging';
import type { FoodItemInput } from '@/services/api';

/**
 * Calories-only entry, for a food that is not in the catalog or when searching
 * is not worth it. Name and macros are optional.
 */
export function QuickAddForm({
  initialName = '',
  busy,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  busy: boolean;
  onSubmit: (item: FoodItemInput) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const uid = useId();
  const [name, setName] = useState(initialName);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [error, setError] = useState('');
  const caloriesRef = useRef<HTMLInputElement>(null);

  // The name usually came from the search box; calories is what is missing.
  useEffect(() => caloriesRef.current?.focus(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = optionalNumber(calories);
    if (kcal === undefined) {
      setError(t('food.quickAdd.caloriesRequired'));
      caloriesRef.current?.focus();
      return;
    }
    setError('');
    onSubmit({
      name: name.trim() || t('food.quickAdd.defaultName'),
      calories: kcal,
      proteinGrams: optionalNumber(protein) ?? null,
      carbsGrams: optionalNumber(carbs) ?? null,
      fatGrams: optionalNumber(fat) ?? null,
    });
  };

  const input =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';
  const label = 'mb-1.5 block text-sm font-medium text-slate-700';

  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby={`${uid}-title`} noValidate>
      <div>
        <h3 id={`${uid}-title`} className="text-lg font-semibold text-slate-900">{t('food.quickAdd.title')}</h3>
        <p className="text-sm text-slate-500">{t('food.quickAdd.hint')}</p>
      </div>
      <div>
        <label htmlFor={`${uid}-name`} className={label}>{t('food.quickAdd.nameOptional')}</label>
        <input
          id={`${uid}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
          placeholder={t('food.namePlaceholder')}
          maxLength={200}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <label htmlFor={`${uid}-kcal`} className={label}>{t('dash.calories')}</label>
          <input
            ref={caloriesRef}
            id={`${uid}-kcal`}
            type="number"
            inputMode="decimal"
            min="0"
            required
            aria-required="true"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className={input}
          />
        </div>
        {[
          ['protein', t('dash.protein'), protein, setProtein],
          ['carbs', t('dash.carbs'), carbs, setCarbs],
          ['fat', t('dash.fat'), fat, setFat],
        ].map(([key, text, value, set]) => (
          <div key={key as string}>
            <label htmlFor={`${uid}-${key}`} className={label}>
              {text as string} ({t('common.grams')})
            </label>
            <input
              id={`${uid}-${key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              className={input}
            />
          </div>
        ))}
      </div>
      {error && (
        <p id={`${uid}-error`} role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-emerald-700 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('food.logFood')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-3 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export default QuickAddForm;
