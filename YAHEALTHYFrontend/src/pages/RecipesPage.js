import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Star, Clock, Flame, Share2, Utensils, CalendarPlus } from 'lucide-react';
import { Card, Modal, Button, inputCls, ErrorState, EmptyState, SkeletonCard, Chip } from '@/components/ui';
import { recipeApi, prefApi, foodLogApi, mealPlanApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { todayStr } from '@/lib/date';
export const RecipesPage = () => {
    const { data: recipes, loading, error, reload } = useAsync(() => recipeApi.all().then((r) => r.data || []), []);
    const [q, setQ] = useState('');
    const [category, setCategory] = useState('all');
    const [open, setOpen] = useState(null);
    const [favoriteIds, setFavoriteIds] = useState([]);
    const [searchParams] = useSearchParams();
    const { push } = useToast();
    // Favorites live in the user's preferences (per-account)
    useEffect(() => {
        prefApi
            .get()
            .then((p) => setFavoriteIds(p.favorites?.recipeIds || []))
            .catch(() => { });
    }, []);
    // Deep-link from global search: /recipes?open=recipe_1
    useEffect(() => {
        const id = searchParams.get('open');
        if (id && recipes) {
            const r = recipes.find((x) => x.id === id);
            if (r)
                setOpen(r);
        }
    }, [searchParams, recipes]);
    const categories = useMemo(() => ['all', ...Array.from(new Set((recipes || []).map((r) => r.category)))], [recipes]);
    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        return (recipes || []).filter((r) => (category === 'all' || r.category === category) &&
            (!query || r.name.toLowerCase().includes(query) || r.ingredients.some((i) => i.toLowerCase().includes(query))));
    }, [recipes, q, category]);
    const toggleFavorite = useCallback(async (id) => {
        const exists = favoriteIds.includes(id);
        const ids = exists ? favoriteIds.filter((x) => x !== id) : [...favoriteIds, id];
        setFavoriteIds(ids);
        try {
            await prefApi.merge({ favorites: { recipeIds: ids, foods: undefined } });
            push(exists ? 'Removed from favorites' : 'Added to favorites');
        }
        catch (err) {
            setFavoriteIds(favoriteIds);
            push(apiError(err), 'error');
        }
    }, [favoriteIds, push]);
    const logRecipe = async (r) => {
        try {
            await foodLogApi.create({ date: todayStr(), name: r.name, mealType: 'lunch', calories: r.calories });
            push(`${r.name} logged to lunch`);
        }
        catch (err) {
            push(apiError(err), 'error');
        }
    };
    const planRecipe = async (r) => {
        try {
            await mealPlanApi.create(r.id, todayStr(), 'dinner');
            push(`${r.name} added to today's dinner plan`);
        }
        catch (err) {
            push(apiError(err), 'error');
        }
    };
    const share = async (r) => {
        try {
            const res = await recipeApi.share(r.id);
            if (navigator.share) {
                await navigator.share({ title: r.name, text: res.data.copy });
            }
            else {
                await navigator.clipboard.writeText(res.data.copy);
                push('Recipe copied to clipboard');
            }
        }
        catch {
            push('Sharing was cancelled');
        }
    };
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Recipes" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Healthy, quick and tested \u2014 straight from our nutritionist kitchen" })] }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-3", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Search, { className: "w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search recipes or ingredients\u2026", className: `${inputCls} pl-10` })] }), _jsx("div", { className: "flex gap-2 overflow-x-auto no-scrollbar", children: categories.map((c) => (_jsx("button", { onClick: () => setCategory(c), className: `shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold capitalize transition ${category === c ? 'bg-teal-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`, children: c }, c))) })] }), loading && (_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: [_jsx(SkeletonCard, {}), _jsx(SkeletonCard, {}), _jsx(SkeletonCard, {})] })), error && _jsx(ErrorState, { message: error, onRetry: reload }), recipes && filtered.length === 0 && (_jsx(Card, { children: _jsx(EmptyState, { title: "No recipes match", text: q ? `Nothing matches “${q}” — try another search.` : undefined }) })), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: filtered.map((r) => (_jsx(Card, { padded: false, className: "overflow-hidden hover:shadow-md transition-shadow", children: _jsxs("button", { onClick: () => setOpen(r), className: "text-left w-full", children: [_jsx("div", { className: "h-2.5 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500" }), _jsxs("div", { className: "p-5", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsx("h3", { className: "font-bold text-slate-900 leading-snug", children: r.name }), _jsx("span", { role: "button", tabIndex: 0, onClick: (e) => {
                                                    e.stopPropagation();
                                                    toggleFavorite(r.id);
                                                }, onKeyDown: (e) => {
                                                    if (e.key === 'Enter') {
                                                        e.stopPropagation();
                                                        toggleFavorite(r.id);
                                                    }
                                                }, "aria-label": "Toggle favorite", className: `shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition ${favoriteIds.includes(r.id) ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:bg-slate-100'}`, children: _jsx(Star, { className: `w-5 h-5 ${favoriteIds.includes(r.id) ? 'fill-amber-400' : ''}` }) })] }), _jsxs("div", { className: "flex flex-wrap gap-2 mt-3", children: [_jsxs(Chip, { color: "teal", children: [_jsx(Flame, { className: "w-3 h-3" }), " ", r.calories, " kcal"] }), _jsxs(Chip, { color: "slate", children: [_jsx(Clock, { className: "w-3 h-3" }), " ", r.time_minutes, " min"] }), _jsx(Chip, { color: "emerald", className: "capitalize", children: r.difficulty })] }), _jsx("p", { className: "text-sm text-slate-500 mt-3 line-clamp-2", children: r.ingredients.join(', ') })] })] }) }, r.id))) }), _jsx(Modal, { open: !!open, onClose: () => setOpen(null), title: open?.name, wide: true, children: open && (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap gap-2 mb-4", children: [_jsxs(Chip, { color: "teal", children: [_jsx(Flame, { className: "w-3 h-3" }), " ", open.calories, " kcal"] }), _jsxs(Chip, { color: "slate", children: [_jsx(Clock, { className: "w-3 h-3" }), " ", open.time_minutes, " min"] }), _jsx(Chip, { color: "emerald", className: "capitalize", children: open.difficulty }), _jsx(Chip, { color: "sky", className: "capitalize", children: open.category })] }), _jsx("h3", { className: "font-bold text-slate-900 mb-2", children: "Ingredients" }), _jsx("ul", { className: "space-y-1.5 mb-5", children: open.ingredients.map((ing) => (_jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-700", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-teal-500" }), " ", ing] }, ing))) }), _jsx("h3", { className: "font-bold text-slate-900 mb-2", children: "Preparation" }), _jsx("ol", { className: "space-y-2 mb-6", children: open.steps.map((s, i) => (_jsxs("li", { className: "flex gap-3 text-sm text-slate-700", children: [_jsx("span", { className: "w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0", children: i + 1 }), s] }, i))) }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs(Button, { onClick: () => logRecipe(open), children: [_jsx(Utensils, { className: "w-4 h-4" }), " Log as meal"] }), _jsxs(Button, { variant: "secondary", onClick: () => planRecipe(open), children: [_jsx(CalendarPlus, { className: "w-4 h-4" }), " Plan for today"] }), _jsxs(Button, { variant: "secondary", onClick: () => share(open), children: [_jsx(Share2, { className: "w-4 h-4" }), " Share"] })] })] })) })] }));
};
