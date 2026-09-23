import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, Loader2 } from 'lucide-react';
import { foodLogApi, FoodLogTemplate } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * The meals this person already told us they eat, one tap to log again.
 *
 * Saved meals have been in the database and the API the whole time —
 * POST /api/food-logs/template, GET /api/food-logs/templates,
 * DELETE /api/food-logs/templates/:id — and nothing in the frontend called any
 * of them. A tracking product lives or dies on how cheap the logging action is,
 * and the cheapest version of it was already built and unreachable.
 *
 * It is on the dashboard rather than buried in the food log because the
 * dashboard is where somebody lands, and the repeat meal is the one they are
 * most likely to be logging.
 */

const localDateKey = (d = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type State = 'idle' | 'saving' | 'done' | 'error';

export const QuickLogTemplates = ({ onLogged }: { onLogged?: () => void }) => {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<FoodLogTemplate[] | null>(null);
  const [state, setState] = useState<Record<string, State>>({});

  useEffect(() => {
    let cancelled = false;
    foodLogApi
      .getTemplates(6)
      .then((res) => { if (!cancelled) setTemplates(res.data ?? []); })
      .catch(() => { if (!cancelled) setTemplates([]); });
    return () => { cancelled = true; };
  }, []);

  // Nothing saved yet is not an empty state worth a box of its own — it is
  // simply a section that does not apply. Saying "you have no saved meals" to
  // somebody who has never been offered the chance to save one is noise.
  if (!templates || templates.length === 0) return null;

  const log = async (tpl: FoodLogTemplate) => {
    if (state[tpl.id] === 'saving' || state[tpl.id] === 'done') return;
    setState((s) => ({ ...s, [tpl.id]: 'saving' }));

    try {
      await foodLogApi.create({
        date: localDateKey(),
        name: tpl.name,
        calories: tpl.calories,
        mealType: tpl.meal_type ?? undefined,
        proteinGrams: tpl.protein_grams ?? undefined,
        carbsGrams: tpl.carbs_grams ?? undefined,
        fatGrams: tpl.fat_grams ?? undefined,
      });
      setState((s) => ({ ...s, [tpl.id]: 'done' }));
      // Lets the dashboard refetch, so the ring and the bars move on the same
      // tap rather than after a reload.
      onLogged?.();
    } catch {
      setState((s) => ({ ...s, [tpl.id]: 'error' }));
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-slate-900">{t('quickLog.title')}</h2>
        <Link to="/food-log" className="text-xs font-medium text-emerald-600 hover:underline">
          {t('quickLog.manage')}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {templates.map((tpl) => {
          const s = state[tpl.id] ?? 'idle';
          return (
            <button
              key={tpl.id}
              onClick={() => log(tpl)}
              disabled={s === 'saving' || s === 'done'}
              aria-label={t('quickLog.logAria', { name: tpl.name })}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                s === 'done'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : s === 'error'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                    : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {s === 'saving' ? (
                <Loader2 size={15} className="animate-spin" />
              ) : s === 'done' ? (
                <Check size={15} />
              ) : (
                <Plus size={15} />
              )}
              <span className="max-w-[10rem] truncate">{tpl.name}</span>
              <span className="num text-xs text-slate-400">{Math.round(tpl.calories)}</span>
            </button>
          );
        })}
      </div>

      {Object.values(state).includes('error') && (
        <p className="mt-3 text-xs text-rose-600">{t('quickLog.failed')}</p>
      )}
    </div>
  );
};

export default QuickLogTemplates;
