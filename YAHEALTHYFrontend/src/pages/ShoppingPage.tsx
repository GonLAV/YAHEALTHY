import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { localDate } from '@/components/AddToWeek';
import { useLanguage } from '@/i18n/LanguageContext';
import { GroceryItem, MealPlan, Recipe, groceryApi, mealPlanApi, recipeApi } from '@/services/api';

// Ticks are a convenience for the person standing in the shop, kept in this
// browser only. Storage can be missing (private mode) and the page must still
// work, so every access is guarded.
const CHECKED_KEY = 'yahealthy-shopping-checked';
const readChecked = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CHECKED_KEY) || '[]');
  } catch {
    return [];
  }
};
const writeChecked = (items: string[]) => {
  try {
    localStorage.setItem(CHECKED_KEY, JSON.stringify(items));
  } catch {
    /* not persisted, still works for this visit */
  }
};

export const ShoppingPage = () => {
  const { t, lang } = useLanguage();
  const start = localDate(0);
  const end = localDate(6);

  const [plans, setPlans] = useState<MealPlan[] | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [failed, setFailed] = useState(false);
  const [checked, setChecked] = useState<string[]>(readChecked);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([mealPlanApi.list(start, end), groceryApi.list(start, end), recipeApi.getAll()])
      .then(([p, g, r]) => {
        setPlans(Array.isArray(p.data) ? p.data : []);
        setItems(g.data.items || []);
        setRecipes(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => setFailed(true));
  }, [start, end]);

  useEffect(load, [load]);

  const toggle = (item: string) => {
    const next = checked.includes(item) ? checked.filter((i) => i !== item) : [...checked, item];
    setChecked(next);
    writeChecked(next);
  };

  const byCategory = useMemo(() => {
    const groups = new Map<string, GroceryItem[]>();
    for (const item of items) {
      const key = item.category || t('shopping.other');
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return [...groups.entries()];
  }, [items, t]);

  const recipeName = (id: string) => recipes.find((r) => r.id === id)?.name ?? id;
  const dayName = (date: string) =>
    new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'numeric' }).format(
      new Date(`${date}T12:00:00`)
    );

  const sortedPlans = [...(plans || [])].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader title={t('shopping.title')} subtitle={t('shopping.subtitle')} icon={<ShoppingCart size={22} />} />

      {failed && <p className="text-rose-600">{t('common.error')}</p>}
      {!plans && !failed && <p className="text-slate-500">{t('common.loading')}</p>}

      {plans && plans.length === 0 && (
        <div className="space-y-4">
          <EmptyState icon={<ShoppingCart size={28} />} text={t('shopping.empty')} />
          <div className="text-center">
            <Link to="/recipes" className="inline-block rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">
              {t('shopping.toRecipes')}
            </Link>
          </div>
        </div>
      )}

      {plans && plans.length > 0 && (
        <div className="grid gap-6 md:grid-cols-5">
          <section className="md:col-span-3">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold text-slate-900">{t('shopping.items')}</h2>
              {checked.length > 0 && (
                <button onClick={() => { setChecked([]); writeChecked([]); }} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                  {t('shopping.clearChecked')}
                </button>
              )}
            </div>
            <div className="space-y-4">
              {byCategory.map(([category, group]) => (
                <div key={category} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <h3 className="mb-2 text-sm font-semibold text-slate-500">{category}</h3>
                  <ul className="space-y-1">
                    {group.map((item) => {
                      const done = checked.includes(item.item);
                      return (
                        <li key={item.item}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-slate-50">
                            <input type="checkbox" checked={done} onChange={() => toggle(item.item)} className="mt-1 h-4 w-4 accent-emerald-600" />
                            <span className={done ? 'text-slate-400 line-through' : 'text-slate-800'}>
                              <span className="font-medium">{item.item}</span>
                              {item.amounts.length > 0 && <span className="block text-sm text-slate-500">{item.amounts.join(' · ')}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">{t('shopping.amountsNote')}</p>
          </section>

          <section className="md:col-span-2">
            <h2 className="mb-3 font-bold text-slate-900">{t('shopping.planned')}</h2>
            <ul className="space-y-2">
              {sortedPlans.map((plan) => (
                <li key={plan.id} className="flex items-start justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
                  <div>
                    <p className="font-medium text-slate-900">{recipeName(plan.recipe_id)}</p>
                    <p className="text-xs text-slate-500">{dayName(plan.date)} · {t(`meal.${plan.meal_type}`)}</p>
                  </div>
                  <button
                    onClick={() => mealPlanApi.remove(plan.id).then(load).catch(() => window.alert(t('common.error')))}
                    aria-label={t('shopping.remove')}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};
