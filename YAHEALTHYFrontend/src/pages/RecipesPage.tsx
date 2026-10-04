import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChefHat, RefreshCw } from 'lucide-react';
import { recipeApi, type Recipe } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { recipeName } from '@/components/mealPlan/RecipePicker';

/** Translate a key, falling back to the raw value when no string exists. */
const useLabel = () => {
  const { t } = useLanguage();
  return (key: string, raw: string) => {
    const s = t(key);
    return s === key ? raw : s;
  };
};

export const RecipesPage = () => {
  const { t, lang } = useLanguage();
  const label = useLabel();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await recipeApi.getAll();
      setRecipes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load recipes:', err);
      setError(true);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(recipes.map((r) => r.category)))],
    [recipes]
  );

  const visible = useMemo(
    () => (category === 'all' ? recipes : recipes.filter((r) => r.category === category)),
    [recipes, category]
  );

  const stepTiming = (step: Recipe['steps'][number]) => {
    const parts: string[] = [];
    if (step.temp_c) parts.push(`${step.temp_c}°C`);
    if (step.heat) parts.push(step.heat);
    if (step.minutes) parts.push(t('recipes.minutes', { n: step.minutes }));
    return parts.join(' · ');
  };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={t('recipes.title')}
          subtitle={t('recipes.subtitle')}
          icon={<ChefHat size={24} />}
        />
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? t('recipes.refreshing') : t('recipes.refresh')}
        </button>
      </div>

      {recipes.length > 0 && (
        <div role="group" aria-label={t('recipes.filterLabel')} className="mb-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={c === category}
              className={
                c === category
                  ? 'rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:border-emerald-400'
              }
            >
              {label(`recipes.cat.${c}`, c)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-slate-600">
          {t('recipes.loading')}
        </p>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          {t('recipes.error')}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<ChefHat size={28} />} text={t('recipes.empty')} />
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((recipe) => {
            const isOpen = openId === recipe.id;
            const panelId = `recipe-panel-${recipe.id}`;
            return (
              <article key={recipe.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => setOpenId(isOpen ? null : recipe.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full p-5 text-start hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{recipeName(recipe, lang)}</h2>
                    <span className="text-sm text-slate-500">
                      {isOpen ? t('recipes.close') : t('recipes.open')}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>{label(`recipes.cat.${recipe.category}`, recipe.category)}</span>
                    <span>{t('recipes.minutes', { n: recipe.time_minutes })}</span>
                    {recipe.calories != null && (
                      <span>{t('recipes.calories', { n: recipe.calories })}</span>
                    )}
                    <span>{label(`recipes.diff.${recipe.difficulty}`, recipe.difficulty)}</span>
                    {recipe.servings ? (
                      <span>{t('recipes.servings', { n: recipe.servings })}</span>
                    ) : null}
                  </div>
                </button>

                {isOpen && (
                  <div id={panelId} className="border-t border-slate-100 px-5 pb-5">
                    {recipe.safety && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                        <p className="text-sm font-semibold text-red-900">
                          {t('recipes.safety')} {recipe.safety}
                        </p>
                      </div>
                    )}

                    {recipe.vessel && (
                      <p className="mt-4 text-sm text-slate-700">
                        <span className="font-semibold">{t('recipes.vessel')}</span> {recipe.vessel}
                      </p>
                    )}

                    <h3 className="mt-5 font-bold text-slate-900">{t('recipes.ingredients')}</h3>
                    <ul className="mt-2 flex flex-col gap-1">
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i} className="text-slate-700">
                          <span className="font-medium">{ing.item}</span>
                          <span className="text-slate-500"> — {ing.amount}</span>
                        </li>
                      ))}
                    </ul>

                    <h3 className="mt-5 font-bold text-slate-900">{t('recipes.steps')}</h3>
                    <ol className="mt-2 flex flex-col gap-3">
                      {recipe.steps.map((step) => {
                        const timing = stepTiming(step);
                        return (
                          <li key={step.step} className="text-slate-700">
                            <span className="font-semibold num">{step.step}.</span> {step.text}
                            {timing && (
                              <span className="mt-0.5 block text-sm text-emerald-700">{timing}</span>
                            )}
                            {step.cue && (
                              <span className="mt-0.5 block text-sm text-slate-500">
                                {t('recipes.cue')} {step.cue}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>

                    {recipe.tips && recipe.tips.length > 0 && (
                      <>
                        <h3 className="mt-5 font-bold text-slate-900">{t('recipes.tips')}</h3>
                        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
                          {recipe.tips.map((tip, i) => (
                            <li key={i} className="text-slate-700">
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {recipe.chef_note && (
                      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm text-amber-900">
                          <span className="font-semibold">{t('recipes.chefNote')} </span>
                          {recipe.chef_note}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
