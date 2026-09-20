import { useCallback, useEffect, useMemo, useState } from 'react';
import { recipeApi, type Recipe } from '@/services/api';

const CATEGORY_LABELS: Record<string, string> = {
  breakfast: 'בוקר',
  main: 'עיקרית',
  salad: 'סלט',
  side: 'תוספת',
  snack: 'חטיף',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'מאתגר',
};

const stepTiming = (step: Recipe['steps'][number]) => {
  const parts: string[] = [];
  if (step.temp_c) parts.push(`${step.temp_c}°C`);
  if (step.heat) parts.push(step.heat);
  if (step.minutes) parts.push(`${step.minutes} דק׳`);
  return parts.join(' · ');
};

export const RecipesPage = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await recipeApi.getAll();
      setRecipes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load recipes:', err);
      setError('לא הצלחנו לטעון את המתכונים. אפשר לנסות לרענן.');
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

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h1 className="text-3xl font-bold text-gray-900">מתכונים</h1>
          <button
            onClick={load}
            disabled={loading}
            className="text-indigo-600 hover:text-indigo-700 font-semibold disabled:opacity-50"
          >
            {loading ? 'מרענן…' : 'רענן'}
          </button>
        </div>
        <p className="text-gray-600 mb-6">
          כל מתכון עם טמפרטורה, זמן, ואיך לדעת שזה מוכן.
        </p>

        {/* Category filter */}
        {recipes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={
                  c === category
                    ? 'px-4 py-1.5 rounded-full bg-indigo-600 text-white text-sm font-semibold'
                    : 'px-4 py-1.5 rounded-full bg-white text-gray-700 text-sm border border-gray-300 hover:border-indigo-400'
                }
              >
                {c === 'all' ? 'הכל' : CATEGORY_LABELS[c] ?? c}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-gray-600">טוען מתכונים…</p>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-gray-600">אין מתכונים להצגה כאן.</p>
        ) : (
          <div className="space-y-4">
            {visible.map((recipe) => {
              const isOpen = openId === recipe.id;
              return (
                <article key={recipe.id} className="bg-white rounded-lg shadow overflow-hidden">
                  <button
                    onClick={() => setOpenId(isOpen ? null : recipe.id)}
                    aria-expanded={isOpen}
                    className="w-full text-right p-5 hover:bg-gray-50"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-xl font-bold text-gray-900">{recipe.name}</h2>
                      <span className="text-sm text-gray-500">
                        {isOpen ? 'סגור' : 'פתח'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
                      <span>{CATEGORY_LABELS[recipe.category] ?? recipe.category}</span>
                      <span>{recipe.time_minutes} דק׳</span>
                      <span>{recipe.calories} קלוריות</span>
                      <span>{DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}</span>
                      {recipe.servings ? <span>{recipe.servings} מנות</span> : null}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-gray-100">
                      {recipe.safety && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-semibold text-red-900">
                            בטיחות: {recipe.safety}
                          </p>
                        </div>
                      )}

                      {recipe.vessel && (
                        <p className="mt-4 text-sm text-gray-700">
                          <span className="font-semibold">כלי:</span> {recipe.vessel}
                        </p>
                      )}

                      <h3 className="mt-5 font-bold text-gray-900">מה צריך</h3>
                      <ul className="mt-2 space-y-1">
                        {recipe.ingredients.map((ing, i) => (
                          <li key={i} className="text-gray-700">
                            <span className="font-medium">{ing.item}</span>
                            <span className="text-gray-500"> — {ing.amount}</span>
                          </li>
                        ))}
                      </ul>

                      <h3 className="mt-5 font-bold text-gray-900">איך מכינים</h3>
                      <ol className="mt-2 space-y-3">
                        {recipe.steps.map((step) => {
                          const timing = stepTiming(step);
                          return (
                            <li key={step.step} className="text-gray-700">
                              <span className="font-semibold">{step.step}.</span> {step.text}
                              {timing && (
                                <span className="block text-sm text-indigo-700 mt-0.5">
                                  {timing}
                                </span>
                              )}
                              {step.cue && (
                                <span className="block text-sm text-gray-500 mt-0.5">
                                  איך יודעים: {step.cue}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>

                      {recipe.tips && recipe.tips.length > 0 && (
                        <>
                          <h3 className="mt-5 font-bold text-gray-900">טיפים</h3>
                          <ul className="mt-2 space-y-1">
                            {recipe.tips.map((tip, i) => (
                              <li key={i} className="text-gray-700">
                                • {tip}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {recipe.chef_note && (
                        <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm text-amber-900">
                            <span className="font-semibold">מהשף: </span>
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
    </div>
  );
};
