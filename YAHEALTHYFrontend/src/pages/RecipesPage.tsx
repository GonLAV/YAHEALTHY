import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Star, Clock, Flame, Share2, Utensils, CalendarPlus } from 'lucide-react';
import { Card, Modal, Button, inputCls, ErrorState, EmptyState, SkeletonCard, Chip } from '@/components/ui';
import { Recipe, recipeApi, prefApi, foodLogApi, mealPlanApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { todayStr } from '@/lib/date';

export const RecipesPage = () => {
  const { data: recipes, loading, error, reload } = useAsync(() => recipeApi.all().then((r) => r.data || []), []);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [open, setOpen] = useState<Recipe | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [searchParams] = useSearchParams();
  const { push } = useToast();

  // Favorites live in the user's preferences (per-account)
  useEffect(() => {
    prefApi
      .get()
      .then((p) => setFavoriteIds(p.favorites?.recipeIds || []))
      .catch(() => {});
  }, []);

  // Deep-link from global search: /recipes?open=recipe_1
  useEffect(() => {
    const id = searchParams.get('open');
    if (id && recipes) {
      const r = recipes.find((x) => x.id === id);
      if (r) setOpen(r);
    }
  }, [searchParams, recipes]);

  const categories = useMemo(() => ['all', ...Array.from(new Set((recipes || []).map((r) => r.category)))], [recipes]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (recipes || []).filter(
      (r) =>
        (category === 'all' || r.category === category) &&
        (!query || r.name.toLowerCase().includes(query) || r.ingredients.some((i) => i.toLowerCase().includes(query)))
    );
  }, [recipes, q, category]);

  const toggleFavorite = useCallback(
    async (id: string) => {
      const exists = favoriteIds.includes(id);
      const ids = exists ? favoriteIds.filter((x) => x !== id) : [...favoriteIds, id];
      setFavoriteIds(ids);
      try {
        await prefApi.merge({ favorites: { recipeIds: ids, foods: undefined } });
        push(exists ? 'Removed from favorites' : 'Added to favorites');
      } catch (err) {
        setFavoriteIds(favoriteIds);
        push(apiError(err), 'error');
      }
    },
    [favoriteIds, push]
  );

  const logRecipe = async (r: Recipe) => {
    try {
      await foodLogApi.create({ date: todayStr(), name: r.name, mealType: 'lunch', calories: r.calories });
      push(`${r.name} logged to lunch`);
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  const planRecipe = async (r: Recipe) => {
    try {
      await mealPlanApi.create(r.id, todayStr(), 'dinner');
      push(`${r.name} added to today's dinner plan`);
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  const share = async (r: Recipe) => {
    try {
      const res = await recipeApi.share(r.id);
      if (navigator.share) {
        await navigator.share({ title: r.name, text: res.data.copy });
      } else {
        await navigator.clipboard.writeText(res.data.copy);
        push('Recipe copied to clipboard');
      }
    } catch {
      push('Sharing was cancelled');
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Recipes</h1>
        <p className="text-sm text-slate-500 mt-0.5">Healthy, quick and tested — straight from our nutritionist kitchen</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes or ingredients…" className={`${inputCls} pl-10`} />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold capitalize transition ${
                category === c ? 'bg-teal-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}
      {error && <ErrorState message={error} onRetry={reload} />}

      {recipes && filtered.length === 0 && (
        <Card>
          <EmptyState title="No recipes match" text={q ? `Nothing matches “${q}” — try another search.` : undefined} />
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((r) => (
          <Card key={r.id} padded={false} className="overflow-hidden hover:shadow-md transition-shadow">
            <button onClick={() => setOpen(r)} className="text-left w-full">
              <div className="h-2.5 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-900 leading-snug">{r.name}</h3>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(r.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        toggleFavorite(r.id);
                      }
                    }}
                    aria-label="Toggle favorite"
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition ${
                      favoriteIds.includes(r.id) ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Star className={`w-5 h-5 ${favoriteIds.includes(r.id) ? 'fill-amber-400' : ''}`} />
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Chip color="teal"><Flame className="w-3 h-3" /> {r.calories} kcal</Chip>
                  <Chip color="slate"><Clock className="w-3 h-3" /> {r.time_minutes} min</Chip>
                  <Chip color="emerald" className="capitalize">{r.difficulty}</Chip>
                </div>
                <p className="text-sm text-slate-500 mt-3 line-clamp-2">{r.ingredients.join(', ')}</p>
              </div>
            </button>
          </Card>
        ))}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name} wide>
        {open && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Chip color="teal"><Flame className="w-3 h-3" /> {open.calories} kcal</Chip>
              <Chip color="slate"><Clock className="w-3 h-3" /> {open.time_minutes} min</Chip>
              <Chip color="emerald" className="capitalize">{open.difficulty}</Chip>
              <Chip color="sky" className="capitalize">{open.category}</Chip>
            </div>

            <h3 className="font-bold text-slate-900 mb-2">Ingredients</h3>
            <ul className="space-y-1.5 mb-5">
              {open.ingredients.map((ing) => (
                <li key={ing} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> {ing}
                </li>
              ))}
            </ul>

            <h3 className="font-bold text-slate-900 mb-2">Preparation</h3>
            <ol className="space-y-2 mb-6">
              {open.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => logRecipe(open)}>
                <Utensils className="w-4 h-4" /> Log as meal
              </Button>
              <Button variant="secondary" onClick={() => planRecipe(open)}>
                <CalendarPlus className="w-4 h-4" /> Plan for today
              </Button>
              <Button variant="secondary" onClick={() => share(open)}>
                <Share2 className="w-4 h-4" /> Share
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
