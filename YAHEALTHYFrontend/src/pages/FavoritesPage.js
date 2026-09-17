import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Utensils, ChefHat } from 'lucide-react';
import { Card, Button, Segmented, ErrorState, EmptyState, SkeletonCard, Chip } from '@/components/ui';
import { FoodQuickAdd } from '@/components/FoodQuickAdd';
import { recipeApi, prefApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
/**
 * Favorites page: starred recipes and saved foods, with one-tap logging.
 */
export const FavoritesPage = () => {
    const [tab, setTab] = useState('recipes');
    const [quickAdd, setQuickAdd] = useState(null);
    const navigate = useNavigate();
    const { push } = useToast();
    const load = useCallback(async () => {
        const [recipes, prefs] = await Promise.all([
            recipeApi.all().then((r) => (r.data || [])),
            prefApi.get().catch(() => ({})),
        ]);
        const favoriteIds = prefs.favorites?.recipeIds || [];
        const favoriteFoods = prefs.favorites?.foods || [];
        return {
            recipes: recipes.filter((r) => favoriteIds.includes(r.id)),
            foods: favoriteFoods,
        };
    }, []);
    const { data, loading, error, reload } = useAsync(load, []);
    const removeFoodFavorite = async (name) => {
        try {
            const prefs = await prefApi.get();
            const foods = (prefs.favorites?.foods || []).filter((f) => f.name !== name);
            await prefApi.merge({ favorites: { recipeIds: undefined, foods } });
            push('Removed from favorites');
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
    };
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { className: "flex items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Favorites" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Your go-to recipes and foods, one tap away" })] }), _jsx(Segmented, { value: tab, onChange: setTab, options: [
                            { value: 'recipes', label: 'Recipes' },
                            { value: 'foods', label: 'Foods' },
                        ] })] }), loading && !data && _jsx(SkeletonCard, {}), error && _jsx(ErrorState, { message: error, onRetry: reload }), data && tab === 'recipes' && (data.recipes.length === 0 ? (_jsx(Card, { children: _jsx(EmptyState, { icon: _jsx(ChefHat, { className: "w-7 h-7" }), title: "No favorite recipes yet", text: "Tap the star on any recipe card to keep it here.", action: _jsx(Button, { size: "sm", onClick: () => navigate('/recipes'), children: "Browse recipes" }) }) })) : (_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: data.recipes.map((r) => (_jsxs(Card, { padded: false, className: "overflow-hidden", children: [_jsx("div", { className: "h-2 bg-gradient-to-r from-amber-300 to-amber-400" }), _jsx("div", { className: "p-5", children: _jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("button", { onClick: () => navigate(`/recipes?open=${r.id}`), className: "text-left", children: [_jsx("h3", { className: "font-bold text-slate-900 leading-snug hover:text-teal-700", children: r.name }), _jsxs("div", { className: "flex flex-wrap gap-2 mt-2", children: [_jsxs(Chip, { color: "teal", children: [r.calories, " kcal"] }), _jsxs(Chip, { color: "slate", children: [r.time_minutes, " min"] })] })] }), _jsx(Star, { className: "w-5 h-5 fill-amber-400 text-amber-400 shrink-0" })] }) })] }, r.id))) }))), data && tab === 'foods' && (data.foods.length === 0 ? (_jsx(Card, { children: _jsx(EmptyState, { icon: _jsx(Utensils, { className: "w-7 h-7" }), title: "No favorite foods yet", text: "Tap the star while logging food to save it here.", action: _jsx(Button, { size: "sm", onClick: () => navigate('/food-log'), children: "Log food" }) }) })) : (_jsx(Card, { children: _jsx("div", { className: "space-y-2", children: data.foods.map((f) => (_jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-semibold text-slate-800 truncate", children: f.name }), _jsxs("p", { className: "text-xs text-slate-400", children: [f.calories, " kcal"] })] }), _jsx(Button, { variant: "soft", size: "sm", onClick: () => setQuickAdd(f.name), children: "Log" }), _jsx("button", { onClick: () => removeFoodFavorite(f.name), "aria-label": "Remove favorite", className: "w-9 h-9 rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center shrink-0", children: _jsx(Star, { className: "w-4 h-4 fill-current" }) })] }, f.name))) }) }))), _jsx(FoodQuickAdd, { open: !!quickAdd, onClose: () => setQuickAdd(null), onSaved: reload, prefillName: quickAdd })] }));
};
