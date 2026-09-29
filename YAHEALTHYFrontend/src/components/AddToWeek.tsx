import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { MealType, mealPlanApi } from '@/services/api';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * A day of the browser's calendar, offsetDays from today. Counted in calendar
 * days, not in 24-hour steps: across a clock change (Israel's is 25 Oct 2026)
 * a 24-hour step can land on the day before or after, so the label built that
 * way could name a different day from the date that is saved.
 */
const localDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
};

/** A calendar date in the browser's own day, as the API expects it. */
export const localDate = (offsetDays = 0) => {
  const d = localDay(offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Puts a recipe into a day of the coming week. This is the only way anything
 * reaches the shopping list: /api/grocery-list is built from meal plans, and
 * until this existed nothing in the app created one, so the list was always
 * empty.
 */
export const AddToWeek = ({ recipeId, defaultMeal = 'dinner' }: { recipeId: string; defaultMeal?: MealType }) => {
  const { t, lang } = useLanguage();
  const [date, setDate] = useState(localDate(0));
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [state, setState] = useState<'idle' | 'busy' | 'added' | 'taken' | 'error'>('idle');

  // The same day the option's value is built from, so the label and the saved
  // date cannot disagree.
  const dayLabel = (offset: number) =>
    new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'numeric' }).format(
      localDay(offset)
    );

  const add = async () => {
    setState('busy');
    try {
      await mealPlanApi.add(recipeId, date, meal);
      setState('added');
    } catch (err: any) {
      setState(err.response?.status === 409 ? 'taken' : 'error');
    }
  };

  const select = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500';

  return (
    <div className="mt-5 rounded-xl bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('week.day')}</span>
          <select value={date} onChange={(e) => { setDate(e.target.value); setState('idle'); }} className={select}>
            {Array.from({ length: 7 }, (_, i) => (
              <option key={i} value={localDate(i)}>{dayLabel(i)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">{t('week.meal')}</span>
          <select value={meal} onChange={(e) => { setMeal(e.target.value as MealType); setState('idle'); }} className={select}>
            {MEAL_TYPES.map((m) => (
              <option key={m} value={m}>{t(`meal.${m}`)}</option>
            ))}
          </select>
        </label>
        <button
          onClick={add}
          disabled={state === 'busy'}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <CalendarPlus size={16} /> {t('week.add')}
        </button>
      </div>
      {state === 'added' && (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {t('week.added')}{' '}
          <Link to="/shopping" className="font-semibold underline">{t('week.toList')}</Link>
        </p>
      )}
      {state === 'taken' && <p role="alert" className="mt-2 text-sm text-amber-800">{t('week.taken')}</p>}
      {state === 'error' && <p role="alert" className="mt-2 text-sm text-rose-700">{t('common.error')}</p>}
    </div>
  );
};
