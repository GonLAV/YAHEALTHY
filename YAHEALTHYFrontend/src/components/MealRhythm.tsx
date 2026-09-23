import { FoodLog } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * Where today's calories came from, by meal.
 *
 * The dashboard's recent-meals list shows the last four entries in the order
 * they were written. It does not show that two thirds of the day arrived after
 * eight in the evening, or that breakfast was skipped again — which is the kind
 * of thing a person can actually act on without being told what to eat.
 *
 * Computed from the logs the dashboard already holds, so it costs no request.
 * /api/insights/daily returns the same counts, but it also re-reads the user's
 * entire food history to do it (index.js does getFoodLogs with no date filter
 * and then filters in JS), and there is no reason to pay for that twice.
 *
 * It reports a distribution and stops there. No "you should eat breakfast".
 */

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const MEAL_STYLE: Record<(typeof MEALS)[number], { bar: string; dot: string }> = {
  breakfast: { bar: 'bg-amber-400', dot: 'bg-amber-400' },
  lunch: { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  dinner: { bar: 'bg-indigo-500', dot: 'bg-indigo-500' },
  snack: { bar: 'bg-slate-300', dot: 'bg-slate-300' },
};

export const MealRhythm = ({ logs }: { logs: FoodLog[] }) => {
  const { t } = useLanguage();

  const byMeal = MEALS.map((meal) => {
    const rows = logs.filter((l) => (l.meal_type || 'snack') === meal);
    return {
      meal,
      calories: rows.reduce((s, l) => s + (l.calories || 0), 0),
      count: rows.length,
    };
  });

  const total = byMeal.reduce((s, m) => s + m.calories, 0);
  if (total <= 0) return null;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="mb-4 font-semibold text-slate-900">{t('rhythm.title')}</h2>

      <div className="space-y-3">
        {byMeal.map(({ meal, calories, count }) => {
          const pct = Math.round((calories / total) * 100);
          return (
            <div key={meal}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-slate-700">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${MEAL_STYLE[meal].dot}`} />
                  {t(`meal.${meal}`)}
                </span>
                <span className="text-slate-500">
                  {/* Each number isolated on its own; the words between them
                      stay in the page's direction. */}
                  <span className="num font-semibold text-slate-700">{Math.round(calories)}</span>{' '}
                  {t('common.kcal')}
                  {count > 0 && (
                    <span className="ms-2 text-xs text-slate-400">
                      <span className="num">{pct}</span>%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${MEAL_STYLE[meal].bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MealRhythm;
