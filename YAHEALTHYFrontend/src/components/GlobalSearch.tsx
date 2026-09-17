import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChefHat, Utensils, CalendarRange } from 'lucide-react';
import { Modal, inputCls } from '@/components/ui';
import { FoodLog, Recipe, foodLogApi, mealPlanApi, recipeApi } from '@/services/api';
import { todayStr } from '@/lib/date';

interface Results {
  recipes: Recipe[];
  foods: FoodLog[];
  planned: { name: string; date: string; mealType: string }[];
}

/**
 * Fast global search across recipes, logged foods and planned meals.
 * Data is fetched once when the search first opens.
 */
export const GlobalSearch = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [q, setQ] = useState('');
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || data) return;
    Promise.all([recipeApi.all(), foodLogApi.getAll({ limit: 100 }), mealPlanApi.all()])
      .then(([recipes, foods, plans]) => {
        // Most recent distinct logged food names
        const seen = new Set<string>();
        const distinctFoods = (foods.data || []).filter((f) => {
          if (seen.has(f.name)) return false;
          seen.add(f.name);
          return true;
        });
        setData({ recipes: recipes.data, foods: distinctFoods.slice(0, 40), planned: plans.data as never[] });
      })
      .catch(() => setError('Search is unavailable right now'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const results = useMemo(() => {
    if (!data) return { recipes: [], foods: [], plans: [] };
    const query = q.trim().toLowerCase();
    const inPlans = (data.planned || []) as unknown as { recipe_id: string; date: string; meal_type: string }[];
    if (!query) return { recipes: data.recipes.slice(0, 3), foods: data.foods.slice(0, 3), plans: [] };
    return {
      recipes: data.recipes.filter((r) => r.name.toLowerCase().includes(query)).slice(0, 5),
      foods: data.foods.filter((f) => f.name.toLowerCase().includes(query)).slice(0, 5),
      plans: inPlans
        .map((p) => {
          const recipe = data.recipes.find((r) => r.id === p.recipe_id);
          return recipe && recipe.name.toLowerCase().includes(query)
            ? { name: recipe.name, date: p.date, mealType: p.meal_type, today: p.date === todayStr() }
            : null;
        })
        .filter((x): x is { name: string; date: string; mealType: string; today: boolean } => x !== null)
        .slice(0, 5),
    };
  }, [data, q]);

  const close = () => {
    setQ('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Search">
      <div className="relative">
        <Search className="w-4.5 h-4.5 w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Recipes, foods, meal plans…"
          className={`${inputCls} pl-10`}
        />
      </div>

      {error && <p className="text-sm text-rose-600 mt-4">{error}</p>}

      {!error && !data && <p className="text-sm text-slate-400 mt-4">Loading search…</p>}

      {data && (
        <div className="mt-4 space-y-5">
          {results.recipes.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Recipes</p>
              {results.recipes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    close();
                    navigate(`/recipes?open=${r.id}`);
                  }}
                  className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-teal-50 text-left"
                >
                  <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                    <ChefHat className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{r.name}</span>
                    <span className="block text-xs text-slate-400">
                      {r.calories} kcal · {r.time_minutes} min
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {results.foods.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Foods you've logged</p>
              {results.foods.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    close();
                    navigate(`/food-log?add=${encodeURIComponent(f.name)}`);
                  }}
                  className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-teal-50 text-left"
                >
                  <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Utensils className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{f.name}</span>
                    <span className="block text-xs text-slate-400">{f.calories} kcal</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {results.plans.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Planned meals</p>
              {results.plans.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    close();
                    navigate('/meal-plan');
                  }}
                  className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-teal-50 text-left"
                >
                  <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <CalendarRange className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{p.name}</span>
                    <span className="block text-xs text-slate-400 capitalize">
                      {p.mealType} · {p.today ? 'today' : p.date}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {q.trim() && results.recipes.length === 0 && results.foods.length === 0 && results.plans.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No matches for “{q}”.</p>
          )}
        </div>
      )}
    </Modal>
  );
};
