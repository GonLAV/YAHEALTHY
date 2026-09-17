import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChefHat, Utensils, CalendarRange } from 'lucide-react';
import { Modal, inputCls } from '@/components/ui';
import { foodLogApi, mealPlanApi, recipeApi } from '@/services/api';
import { todayStr } from '@/lib/date';
/**
 * Fast global search across recipes, logged foods and planned meals.
 * Data is fetched once when the search first opens.
 */
export const GlobalSearch = ({ open, onClose }) => {
    const [q, setQ] = useState('');
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    useEffect(() => {
        if (!open || data)
            return;
        Promise.all([recipeApi.all(), foodLogApi.getAll({ limit: 100 }), mealPlanApi.all()])
            .then(([recipes, foods, plans]) => {
            // Most recent distinct logged food names
            const seen = new Set();
            const distinctFoods = (foods.data || []).filter((f) => {
                if (seen.has(f.name))
                    return false;
                seen.add(f.name);
                return true;
            });
            setData({ recipes: recipes.data, foods: distinctFoods.slice(0, 40), planned: plans.data });
        })
            .catch(() => setError('Search is unavailable right now'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    const results = useMemo(() => {
        if (!data)
            return { recipes: [], foods: [], plans: [] };
        const query = q.trim().toLowerCase();
        const inPlans = (data.planned || []);
        if (!query)
            return { recipes: data.recipes.slice(0, 3), foods: data.foods.slice(0, 3), plans: [] };
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
                .filter((x) => x !== null)
                .slice(0, 5),
        };
    }, [data, q]);
    const close = () => {
        setQ('');
        onClose();
    };
    return (_jsxs(Modal, { open: open, onClose: close, title: "Search", children: [_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "w-4.5 h-4.5 w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { autoFocus: true, value: q, onChange: (e) => setQ(e.target.value), placeholder: "Recipes, foods, meal plans\u2026", className: `${inputCls} pl-10` })] }), error && _jsx("p", { className: "text-sm text-rose-600 mt-4", children: error }), !error && !data && _jsx("p", { className: "text-sm text-slate-400 mt-4", children: "Loading search\u2026" }), data && (_jsxs("div", { className: "mt-4 space-y-5", children: [results.recipes.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400 mb-2", children: "Recipes" }), results.recipes.map((r) => (_jsxs("button", { onClick: () => {
                                    close();
                                    navigate(`/recipes?open=${r.id}`);
                                }, className: "w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-teal-50 text-left", children: [_jsx("span", { className: "w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0", children: _jsx(ChefHat, { className: "w-4 h-4" }) }), _jsxs("span", { className: "flex-1 min-w-0", children: [_jsx("span", { className: "block text-sm font-semibold text-slate-800 truncate", children: r.name }), _jsxs("span", { className: "block text-xs text-slate-400", children: [r.calories, " kcal \u00B7 ", r.time_minutes, " min"] })] })] }, r.id)))] })), results.foods.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400 mb-2", children: "Foods you've logged" }), results.foods.map((f) => (_jsxs("button", { onClick: () => {
                                    close();
                                    navigate(`/food-log?add=${encodeURIComponent(f.name)}`);
                                }, className: "w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-teal-50 text-left", children: [_jsx("span", { className: "w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0", children: _jsx(Utensils, { className: "w-4 h-4" }) }), _jsxs("span", { className: "flex-1 min-w-0", children: [_jsx("span", { className: "block text-sm font-semibold text-slate-800 truncate", children: f.name }), _jsxs("span", { className: "block text-xs text-slate-400", children: [f.calories, " kcal"] })] })] }, f.id)))] })), results.plans.length > 0 && (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400 mb-2", children: "Planned meals" }), results.plans.map((p, i) => (_jsxs("button", { onClick: () => {
                                    close();
                                    navigate('/meal-plan');
                                }, className: "w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-teal-50 text-left", children: [_jsx("span", { className: "w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0", children: _jsx(CalendarRange, { className: "w-4 h-4" }) }), _jsxs("span", { className: "flex-1 min-w-0", children: [_jsx("span", { className: "block text-sm font-semibold text-slate-800 truncate", children: p.name }), _jsxs("span", { className: "block text-xs text-slate-400 capitalize", children: [p.mealType, " \u00B7 ", p.today ? 'today' : p.date] })] })] }, i)))] })), q.trim() && results.recipes.length === 0 && results.foods.length === 0 && results.plans.length === 0 && (_jsxs("p", { className: "text-sm text-slate-400 text-center py-6", children: ["No matches for \u201C", q, "\u201D."] }))] }))] }));
};
