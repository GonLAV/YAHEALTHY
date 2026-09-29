import { useEffect, useId, useState } from 'react';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { foodsApi, type CatalogFood, type FoodCalculation } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import { catalogName, gramsFor, positiveNumber, scalePer100g, servingLabel } from '@/utils/foodLogging';

const DEBOUNCE_MS = 250;

/**
 * A food picked from the catalog: choose grams or a sourced serving, see the
 * values the backend computes (POST /api/foods/calculate — the same arithmetic
 * that runs when it is logged), then log it.
 */
export function PortionPicker({
  food,
  initialGrams = 100,
  busy,
  isFavorite,
  onLog,
  onToggleFavorite,
  onBack,
}: {
  food: CatalogFood;
  initialGrams?: number;
  busy: boolean;
  isFavorite: boolean;
  onLog: (grams: number, name: string) => void;
  onToggleFavorite: (grams: number, name: string) => void;
  onBack: () => void;
}) {
  const { t, lang, isRTL } = useLanguage();
  const uid = useId();
  const name = catalogName(food, lang);
  const [serving, setServing] = useState(-1); // -1 = grams
  const [amount, setAmount] = useState(String(initialGrams));
  const [calc, setCalc] = useState<FoodCalculation['total'] | null>(null);
  const [error, setError] = useState('');

  const servings = food.commonServings || [];
  const parsed = positiveNumber(amount);
  const grams = parsed == null ? null : serving < 0 ? parsed : gramsFor(servings[serving]?.grams ?? 0, parsed);

  useEffect(() => {
    setCalc(null);
    if (grams == null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await foodsApi.calculate([{ foodId: food.id, grams }], controller.signal);
        setCalc(res.data.total);
      } catch {
        /* the local preview below stays */
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [food.id, grams]);

  const kcal = calc?.kcal ?? scalePer100g(food.per100g.kcal, grams ?? 0);
  const macro = (server: number | undefined, per100: number | null) =>
    server ?? scalePer100g(per100, grams ?? 0) ?? 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (grams == null) {
      setError(t('food.portion.invalid'));
      return;
    }
    setError('');
    onLog(grams, name);
  };

  const Back = isRTL ? ArrowRight : ArrowLeft;

  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby={`${uid}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${uid}-title`} className="text-lg font-semibold text-slate-900">{name}</h3>
          <p className="num text-xs text-slate-500">
            {t('food.search.per100', { kcal: Math.round(food.per100g.kcal) })} · {t('food.portion.source', { source: food.source.name === 'usda_fdc' ? 'USDA FoodData Central' : food.source.name })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => grams != null && onToggleFavorite(grams, name)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? t('food.fav.remove', { name }) : t('food.fav.add', { name })}
          className="rounded-lg p-2 text-amber-500 transition hover:bg-amber-50"
        >
          <Star size={20} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${uid}-serving`} className="mb-1.5 block text-sm font-medium text-slate-700">
            {t('food.portion.serving')}
          </label>
          <select
            id={`${uid}-serving`}
            value={serving}
            onChange={(e) => {
              const next = Number(e.target.value);
              setServing(next);
              setAmount(next < 0 ? String(grams ?? 100) : '1');
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value={-1}>{t('food.portion.servingGrams')}</option>
            {servings.map((s, i) => (
              <option key={`${i}-${s.grams}`} value={i}>
                {servingLabel(s, lang)} ({s.grams} {t('common.grams')})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-amount`} className="mb-1.5 block text-sm font-medium text-slate-700">
            {serving < 0 ? t('food.portion.grams') : t('food.portion.servings')}
          </label>
          <input
            id={`${uid}-amount`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      <div role="status" aria-live="polite" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {grams == null ? (
          t('food.portion.invalid')
        ) : (
          <>
            <span className="num font-semibold">{kcal ?? 0} {t('food.kcal')}</span>
            <span className="num ms-3 text-slate-500">
              {t('dash.protein')} {macro(calc?.proteinG, food.per100g.proteinG)}{t('common.grams')} · {t('dash.carbs')} {macro(calc?.carbsG, food.per100g.carbsG)}{t('common.grams')} · {t('dash.fat')} {macro(calc?.fatG, food.per100g.fatG)}{t('common.grams')}
            </span>
            <span className="num ms-3 text-xs text-slate-400">({grams} {t('common.grams')})</span>
          </>
        )}
      </div>

      {error && (
        <p id={`${uid}-error`} role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || grams == null}
          className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('food.portion.log', { name })}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          <Back size={16} aria-hidden="true" />
          {t('food.portion.back')}
        </button>
      </div>
    </form>
  );
}

export default PortionPicker;
