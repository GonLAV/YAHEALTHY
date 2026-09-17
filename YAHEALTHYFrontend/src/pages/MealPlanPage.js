import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Trash2, Utensils, Clock, Flame, ChefHat, Settings2, ArrowRightLeft, } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, Chip, Segmented } from '@/components/ui';
import { mealPlanApi, recipeApi, targetApi, prefApi, foodLogApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { addDays, fmtDateLong, todayStr } from '@/lib/date';
const MEAL_TYPES = [
    { key: 'breakfast', label: 'Breakfast' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'snack', label: 'Snack' },
    { key: 'dinner', label: 'Dinner' },
];
export const MealPlanPage = () => {
    const navigate = useNavigate();
    const { push } = useToast();
    const [days, setDays] = useState('3');
    const [mealTypes, setMealTypes] = useState(['breakfast', 'lunch', 'dinner']);
    const [showPrefs, setShowPrefs] = useState(false);
    const [dietary, setDietary] = useState({ maxCookingMinutes: 30, dislikes: '', allergies: '' });
    const [generating, setGenerating] = useState(false);
    const [busyMealId, setBusyMealId] = useState(null);
    const [openRecipe, setOpenRecipe] = useState(null);
    const load = useCallback(async () => {
        const [plans, recipes, targets, prefs] = await Promise.all([
            mealPlanApi.all().then((r) => r.data || []),
            recipeApi.all().then((r) => r.data || []),
            targetApi.get().then((r) => r.data.targets),
            prefApi.get().catch(() => ({})),
        ]);
        const d = prefs.dietary || {};
        setDietary({
            maxCookingMinutes: d.maxCookingMinutes ?? 30,
            dislikes: (d.dislikes || []).join(', '),
            allergies: (d.allergies || []).join(', '),
        });
        return { plans, recipes, targets: targets };
    }, []);
    const { data, loading, error, reload } = useAsync(load, []);
    const recipeById = useMemo(() => {
        const map = new Map();
        (data?.recipes || []).forEach((r) => map.set(r.id, r));
        return map;
    }, [data]);
    /** Recipes that respect cooking-time + dislikes + allergies constraints */
    const eligible = useCallback((preferredCategory) => {
        const dislikeSet = dietary.dislikes
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const allergySet = dietary.allergies
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const blocked = [...dislikeSet, ...allergySet];
        const pool = (data?.recipes || []).filter((r) => r.time_minutes <= dietary.maxCookingMinutes && !r.ingredients.some((i) => blocked.includes(i.toLowerCase())));
        const matching = preferredCategory ? pool.filter((r) => r.category === preferredCategory) : [];
        return matching.length > 0 ? matching : pool.length > 0 ? pool : (data?.recipes || []);
    }, [data, dietary]);
    const saveDietary = async () => {
        const list = (s) => s
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        try {
            await prefApi.merge({
                dietary: {
                    maxCookingMinutes: dietary.maxCookingMinutes,
                    dislikes: list(dietary.dislikes),
                    allergies: list(dietary.allergies),
                },
            });
            setShowPrefs(false);
            push('Meal preferences saved');
        }
        catch (err) {
            push(apiError(err), 'error');
        }
    };
    const generate = async () => {
        if (generating)
            return;
        if (mealTypes.length === 0) {
            push('Pick at least one meal type', 'error');
            return;
        }
        setGenerating(true);
        try {
            const start = todayStr();
            const n = Number(days);
            // Replace existing plans in the target window
            const existing = (data?.plans || []).filter((p) => p.date >= start && p.date < addDays(start, n));
            await Promise.all(existing.map((p) => mealPlanApi.remove(p.id)));
            // Create new plans that respect preferences
            for (let d = 0; d < n; d++) {
                const date = addDays(start, d);
                for (const mealType of mealTypes) {
                    const pool = eligible(mealType === 'breakfast' ? 'breakfast' : mealType === 'snack' ? 'salad' : undefined);
                    if (pool.length === 0)
                        continue;
                    const recipe = pool[Math.floor(Math.random() * pool.length)];
                    await mealPlanApi.create(recipe.id, date, mealType);
                }
            }
            push(`${n}-day meal plan generated`);
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setGenerating(false);
        }
    };
    const replaceMeal = async (plan) => {
        if (busyMealId)
            return;
        setBusyMealId(plan.id);
        try {
            const pool = eligible(plan.meal_type === 'breakfast' ? 'breakfast' : plan.meal_type === 'snack' ? 'salad' : undefined)
                .filter((r) => r.id !== plan.recipe_id);
            if (pool.length === 0) {
                push('No alternative recipe available — try relaxing your meal preferences', 'error');
                return;
            }
            const next = pool[Math.floor(Math.random() * pool.length)];
            await mealPlanApi.update(plan.id, { recipe_id: next.id });
            push(`Swapped to ${next.name}`);
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setBusyMealId(null);
        }
    };
    const logMeal = async (plan, recipe) => {
        if (busyMealId)
            return;
        setBusyMealId(plan.id);
        try {
            await foodLogApi.create({
                date: todayStr(),
                name: recipe.name,
                mealType: plan.meal_type,
                calories: recipe.calories,
            });
            push(`${recipe.name} logged to your food log`);
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setBusyMealId(null);
        }
    };
    const removeMeal = async (plan) => {
        if (busyMealId)
            return;
        setBusyMealId(plan.id);
        try {
            await mealPlanApi.remove(plan.id);
            push('Meal removed');
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setBusyMealId(null);
        }
    };
    const plansByDate = useMemo(() => {
        const map = new Map();
        for (const p of data?.plans || []) {
            if (!map.has(p.date))
                map.set(p.date, []);
            map.get(p.date).push(p);
        }
        const order = ['breakfast', 'lunch', 'snack', 'dinner'];
        return Array.from(map.entries())
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([date, plans]) => [date, plans.sort((a, b) => order.indexOf(a.meal_type) - order.indexOf(b.meal_type))]);
    }, [data]);
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { className: "flex items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Meal Planner" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Generate a plan around your schedule, then swap or log each meal in one tap" })] }), _jsxs(Button, { variant: "secondary", size: "sm", className: "shrink-0", onClick: () => setShowPrefs(true), children: [_jsx(Settings2, { className: "w-4 h-4" }), " Preferences"] })] }), _jsxs(Card, { children: [_jsxs("div", { className: "flex flex-col sm:flex-row sm:items-end gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-slate-700 mb-1.5", children: "Plan length" }), _jsx(Segmented, { value: days, onChange: setDays, options: [
                                            { value: '1', label: '1 day' },
                                            { value: '3', label: '3 days' },
                                            { value: '7', label: '7 days' },
                                        ] })] }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "text-sm font-semibold text-slate-700 mb-1.5", children: "Meals per day" }), _jsx("div", { className: "flex gap-2 flex-wrap", children: MEAL_TYPES.map((m) => {
                                            const active = mealTypes.includes(m.key);
                                            return (_jsx("button", { type: "button", onClick: () => setMealTypes((cur) => (active ? cur.filter((x) => x !== m.key) : [...cur, m.key])), className: `px-3.5 py-1.5 rounded-xl text-sm font-semibold border transition ${active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`, children: m.label }, m.key));
                                        }) })] }), _jsxs(Button, { size: "lg", loading: generating, onClick: generate, children: [_jsx(Wand2, { className: "w-4 h-4" }), " Generate plan"] })] }), _jsxs("p", { className: "text-xs text-slate-400 mt-3", children: ["Respects your preferences (cooking time, dislikes, allergies)", data?.targets?.calories ? ` · your daily target: ${data.targets.calories} kcal` : ''] })] }), loading && !data && _jsx(SkeletonCard, {}), error && _jsx(ErrorState, { message: error, onRetry: reload }), data && plansByDate.length === 0 && (_jsx(Card, { children: _jsx(EmptyState, { icon: _jsx(ChefHat, { className: "w-7 h-7" }), title: "No meal plan yet", text: "Generate your first plan above \u2014 it takes one tap and can be regenerated at any time." }) })), plansByDate.map(([date, plans]) => {
                const dayCalories = plans.reduce((s, p) => s + (recipeById.get(p.recipe_id)?.calories || 0), 0);
                return (_jsx(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [fmtDateLong(date), " ", date === todayStr() && _jsx(Chip, { color: "teal", children: "Today" })] }), subtitle: `${plans.length} meals · ${dayCalories} kcal`, action: _jsx(Button, { variant: "ghost", size: "sm", onClick: () => navigate('/recipes'), children: "More recipes" }), children: _jsx("div", { className: "space-y-2.5", children: plans.map((plan) => {
                            const recipe = recipeById.get(plan.recipe_id);
                            if (!recipe)
                                return null;
                            return (_jsxs("div", { className: `rounded-2xl border border-slate-100 p-4 flex items-center gap-3 ${busyMealId === plan.id ? 'opacity-50' : ''}`, children: [_jsx("span", { className: "w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 text-xl", children: plan.meal_type === 'breakfast' ? '🌅' : plan.meal_type === 'lunch' ? '☀️' : plan.meal_type === 'snack' ? '🍏' : '🌙' }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400", children: plan.meal_type }), _jsx("button", { onClick: () => setOpenRecipe(recipe), className: "text-left", children: _jsx("p", { className: "text-sm font-bold text-slate-900 truncate hover:text-teal-700", children: recipe.name }) }), _jsxs("div", { className: "flex flex-wrap gap-1.5 mt-1", children: [_jsxs(Chip, { color: "teal", children: [_jsx(Flame, { className: "w-3 h-3" }), " ", recipe.calories, " kcal"] }), _jsxs(Chip, { color: "slate", children: [_jsx(Clock, { className: "w-3 h-3" }), " ", recipe.time_minutes, " min"] })] })] }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-1 shrink-0", children: [_jsx(IconAction, { title: "Replace meal", onClick: () => replaceMeal(plan), children: _jsx(ArrowRightLeft, { className: "w-4 h-4" }) }), _jsx(IconAction, { title: "Add to food log", onClick: () => logMeal(plan, recipe), children: _jsx(Utensils, { className: "w-4 h-4" }) }), _jsx(IconAction, { title: "Remove", onClick: () => removeMeal(plan), danger: true, children: _jsx(Trash2, { className: "w-4 h-4" }) })] })] }, plan.id));
                        }) }) }, date));
            }), _jsx(Modal, { open: showPrefs, onClose: () => setShowPrefs(false), title: "Meal preferences", children: _jsxs("div", { className: "space-y-4", children: [_jsx(Field, { label: "Max cooking time", children: _jsx(Segmented, { value: String(dietary.maxCookingMinutes), onChange: (v) => setDietary((d) => ({ ...d, maxCookingMinutes: Number(v) })), options: [
                                    { value: '15', label: '15 min' },
                                    { value: '30', label: '30 min' },
                                    { value: '60', label: 'Any time' },
                                ] }) }), _jsx(Field, { label: "Foods you dislike", hint: "Comma-separated, e.g. eggplant, cilantro", children: _jsx("input", { value: dietary.dislikes, onChange: (e) => setDietary((d) => ({ ...d, dislikes: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Allergies", hint: "Comma-separated \u2014 excluded from every generated meal", children: _jsx("input", { value: dietary.allergies, onChange: (e) => setDietary((d) => ({ ...d, allergies: e.target.value })), className: inputCls }) }), _jsx(Button, { className: "w-full", onClick: saveDietary, children: "Save preferences" })] }) }), _jsx(Modal, { open: !!openRecipe, onClose: () => setOpenRecipe(null), title: openRecipe?.name, children: openRecipe && (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap gap-2 mb-4", children: [_jsxs(Chip, { color: "teal", children: [_jsx(Flame, { className: "w-3 h-3" }), " ", openRecipe.calories, " kcal"] }), _jsxs(Chip, { color: "slate", children: [_jsx(Clock, { className: "w-3 h-3" }), " ", openRecipe.time_minutes, " min"] }), _jsx(Chip, { color: "emerald", className: "capitalize", children: openRecipe.difficulty })] }), _jsx("h3", { className: "font-bold text-slate-900 mb-2", children: "Ingredients" }), _jsx("ul", { className: "space-y-1.5 mb-4", children: openRecipe.ingredients.map((i) => (_jsxs("li", { className: "flex items-center gap-2 text-sm text-slate-700", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-teal-500" }), " ", i] }, i))) }), _jsx("h3", { className: "font-bold text-slate-900 mb-2", children: "Preparation" }), _jsx("ol", { className: "space-y-2", children: openRecipe.steps.map((s, i) => (_jsxs("li", { className: "flex gap-3 text-sm text-slate-700", children: [_jsx("span", { className: "w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0", children: i + 1 }), s] }, i))) })] })) })] }));
};
function IconAction({ children, onClick, title, danger = false, }) {
    return (_jsx("button", { onClick: onClick, title: title, "aria-label": title, className: `w-9 h-9 rounded-full flex items-center justify-center transition ${danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-teal-50 hover:text-teal-700'}`, children: children }));
}
