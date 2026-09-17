import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Utensils, ChefHat } from 'lucide-react';
import { Card, Button, Segmented, ErrorState, EmptyState, SkeletonCard, Chip } from '@/components/ui';
import { FoodQuickAdd } from '@/components/FoodQuickAdd';
import { recipeApi, prefApi, Recipe, FavoriteFood, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';

/**
 * Favorites page: starred recipes and saved foods, with one-tap logging.
 */
export const FavoritesPage = () => {
  const [tab, setTab] = useState<'recipes' | 'foods'>('recipes');
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  const navigate = useNavigate();
  const { push } = useToast();

  const load = useCallback(async () => {
    const [recipes, prefs] = await Promise.all([
      recipeApi.all().then((r) => (r.data || []) as Recipe[]),
      prefApi.get().catch(() => ({}) as { favorites?: { recipeIds?: string[]; foods?: FavoriteFood[] } }),
    ]);
    const favoriteIds = prefs.favorites?.recipeIds || [];
    const favoriteFoods = prefs.favorites?.foods || [];
    return {
      recipes: recipes.filter((r) => favoriteIds.includes(r.id)),
      foods: favoriteFoods,
    };
  }, []);
  const { data, loading, error, reload } = useAsync(load, []);

  const removeFoodFavorite = async (name: string) => {
    try {
      const prefs = await prefApi.get();
      const foods = (prefs.favorites?.foods || []).filter((f: FavoriteFood) => f.name !== name);
      await prefApi.merge({ favorites: { recipeIds: undefined, foods } });
      push('Removed from favorites');
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Favorites</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your go-to recipes and foods, one tap away</p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'recipes', label: 'Recipes' },
            { value: 'foods', label: 'Foods' },
          ]}
        />
      </div>

      {loading && !data && <SkeletonCard />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && tab === 'recipes' && (
        data.recipes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ChefHat className="w-7 h-7" />}
              title="No favorite recipes yet"
              text="Tap the star on any recipe card to keep it here."
              action={<Button size="sm" onClick={() => navigate('/recipes')}>Browse recipes</Button>}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.recipes.map((r) => (
              <Card key={r.id} padded={false} className="overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-amber-300 to-amber-400" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => navigate(`/recipes?open=${r.id}`)} className="text-left">
                      <h3 className="font-bold text-slate-900 leading-snug hover:text-teal-700">{r.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Chip color="teal">{r.calories} kcal</Chip>
                        <Chip color="slate">{r.time_minutes} min</Chip>
                      </div>
                    </button>
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400 shrink-0" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {data && tab === 'foods' && (
        data.foods.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Utensils className="w-7 h-7" />}
              title="No favorite foods yet"
              text="Tap the star while logging food to save it here."
              action={<Button size="sm" onClick={() => navigate('/food-log')}>Log food</Button>}
            />
          </Card>
        ) : (
          <Card>
            <div className="space-y-2">
              {data.foods.map((f) => (
                <div key={f.name} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.name}</p>
                    <p className="text-xs text-slate-400">{f.calories} kcal</p>
                  </div>
                  <Button variant="soft" size="sm" onClick={() => setQuickAdd(f.name)}>
                    Log
                  </Button>
                  <button
                    onClick={() => removeFoodFavorite(f.name)}
                    aria-label="Remove favorite"
                    className="w-9 h-9 rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center shrink-0"
                  >
                    <Star className="w-4 h-4 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      <FoodQuickAdd open={!!quickAdd} onClose={() => setQuickAdd(null)} onSaved={reload} prefillName={quickAdd} />
    </div>
  );
};
