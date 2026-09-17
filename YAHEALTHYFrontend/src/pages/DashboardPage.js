import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Utensils, Droplets, Scale, Moon, ChefHat, Sparkles, Flame, TrendingUp, Plus, Info, } from 'lucide-react';
import { Card, Button, ProgressRing, ProgressBar, ErrorState, EmptyState, SkeletonCard, Chip, } from '@/components/ui';
import { FoodQuickAdd } from '@/components/FoodQuickAdd';
import { WaterModal, SleepModal, WeightModal } from '@/components/QuickLogModals';
import { foodLogApi, waterApi, sleepApi, weightApi, targetApi, streakApi, surveyApi, prefApi, } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { todayStr, fmtDateLong } from '@/lib/date';
import { computeHealthScore, scoreExplanation, scoreBand, sumCalories, sumMacros, waterToday, weightProgress, resolveWaterGoal, resolveSleepTarget, resolveTargets, } from '@/lib/health';
import { dailyRecommendations } from '@/lib/coach';
const MEALS = [
    { key: 'breakfast', label: 'Breakfast' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'snack', label: 'Snack' },
    { key: 'dinner', label: 'Dinner' },
];
export const DashboardPage = () => {
    const today = todayStr();
    const [modal, setModal] = useState(null);
    const navigate = useNavigate();
    const loadAll = useCallback(async () => {
        const [logs, water, sleep, goals, weights, targets, streak, surveys, prefs] = await Promise.all([
            foodLogApi.getAll({ date: today }).then((r) => r.data || []),
            waterApi.list().then((r) => r.data || []),
            sleepApi.list().then((r) => r.data || []),
            weightApi.goals().then((r) => r.data || []),
            weightApi.logs().then((r) => r.data || []),
            targetApi.get().then((r) => r.data),
            streakApi.get().then((r) => r.data),
            surveyApi.list().then((r) => r.data || []),
            prefApi.get().catch(() => ({})),
        ]);
        return { logs, water, sleep, goals, weights, targets, streak, surveys, prefs };
    }, [today]);
    const { data, loading, error, reload } = useAsync(loadAll, [today]);
    const reloadWater = useCallback(() => reload(), [reload]);
    const targets = data?.targets?.targets ?? null;
    const survey = data?.surveys?.[0] ?? null;
    const goal = data?.goals?.[0] ?? null;
    const view = useMemo(() => {
        if (!data)
            return null;
        const t = resolveTargets(targets);
        const logs = data.logs;
        const calories = sumCalories(logs);
        const macros = sumMacros(logs);
        const water = waterToday(data.water, today);
        const waterGoal = resolveWaterGoal(data.prefs.hydrationGoalLiters, survey?.water_target_liters);
        const sleepTarget = resolveSleepTarget(survey?.sleep_target_hours);
        const lastNight = data.sleep.find((l) => l.date === today) ?? null;
        const progress = goal ? weightProgress(goal, data.weights) : null;
        const score = computeHealthScore({
            calories,
            targetCalories: t.calories,
            protein: macros.protein,
            targetProtein: t.protein,
            waterLiters: water,
            waterGoal,
            sleepHours: lastNight?.sleep_hours ?? null,
            sleepTarget,
            streak: data.streak?.currentStreak ?? 0,
        });
        return {
            calories,
            macros,
            water,
            waterGoal,
            sleepTarget,
            lastNight,
            progress,
            score,
            streak: data.streak?.currentStreak ?? 0,
            longestStreak: data.streak?.longestStreak ?? 0,
        };
    }, [data, targets, survey, goal, today]);
    if (loading && !data) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx(SkeletonCard, {}), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(SkeletonCard, {}), _jsx(SkeletonCard, {})] })] }));
    }
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    if (!data || !view)
        return null;
    const hasAnyData = data.logs.length > 0 || data.water.length > 0 || data.sleep.length > 0;
    const t = resolveTargets(targets);
    const recommendations = dailyRecommendations({
        date: today,
        targets,
        todayLogs: data.logs,
        waterLogs: data.water,
        waterGoal: view.waterGoal,
        sleepLogs: data.sleep,
        sleepTarget: view.sleepTarget,
        goal,
        weightLogs: data.weights,
        streak: view.streak,
        recipes: [],
    });
    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12)
            return 'Good morning';
        if (h < 18)
            return 'Good afternoon';
        return 'Good evening';
    };
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { className: "flex items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: [greeting(), " \uD83D\uDC4B"] }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: fmtDateLong(today) })] }), view.streak > 0 && (_jsxs(Chip, { color: "amber", className: "text-sm py-1", children: [_jsx(Flame, { className: "w-3.5 h-3.5" }), " ", view.streak, "-day streak"] }))] }), !hasAnyData && (_jsx(Card, { className: "border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-50", children: _jsx(EmptyState, { icon: _jsx(Utensils, { className: "w-7 h-7" }), title: "Welcome! Let's log your first data", text: "Log a meal, water or sleep and your daily health picture appears here \u2014 calories, macros, hydration and a personal health score.", action: _jsxs("div", { className: "flex gap-2 flex-wrap justify-center", children: [_jsxs(Button, { onClick: () => setModal('food'), children: [_jsx(Plus, { className: "w-4 h-4" }), " Log food"] }), _jsxs(Button, { variant: "secondary", onClick: () => setModal('water'), children: [_jsx(Droplets, { className: "w-4 h-4" }), " Add water"] })] }) }) })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-4", children: [_jsxs(Card, { className: "lg:col-span-1 flex flex-col items-center", children: [_jsx("p", { className: "text-sm font-semibold text-slate-500 self-start", children: "Today's calories" }), _jsx("div", { className: "my-3", children: _jsxs(ProgressRing, { percent: t.calories ? (view.calories / t.calories) * 100 : 0, size: 140, color: t.calories && view.calories > t.calories ? '#f59e0b' : '#0d9488', children: [_jsx("span", { className: "text-3xl font-extrabold text-slate-900 tabular", children: Math.round(view.calories) }), _jsx("span", { className: "text-xs text-slate-400", children: t.calories ? `of ${t.calories} kcal` : 'no target set' })] }) }), _jsxs("div", { className: "w-full space-y-2.5", children: [_jsx(MacroRow, { label: "Protein", value: view.macros.protein, target: t.protein, color: "bg-teal-500" }), _jsx(MacroRow, { label: "Carbs", value: view.macros.carbs, target: t.carbs, color: "bg-amber-500" }), _jsx(MacroRow, { label: "Fat", value: view.macros.fat, target: t.fat, color: "bg-purple-500" })] }), _jsxs(Button, { variant: "soft", size: "sm", className: "mt-4 w-full", onClick: () => setModal('food'), children: [_jsx(Plus, { className: "w-4 h-4" }), " Log food"] })] }), _jsxs("div", { className: "lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start", children: [_jsx(TileCard, { icon: _jsx(Droplets, { className: "w-4 h-4" }), title: "Water", accent: "text-sky-600", main: `${(view.water * 1000).toFixed(0)}ml`, sub: `of ${(view.waterGoal * 1000).toFixed(0)}ml goal`, footer: _jsx(ProgressBar, { value: view.water, max: view.waterGoal, color: "bg-sky-500" }), action: _jsxs(Button, { size: "sm", variant: "soft", className: "!bg-sky-50 !text-sky-700 hover:!bg-sky-100", onClick: () => setModal('water'), children: [_jsx(Plus, { className: "w-4 h-4" }), " Add"] }) }), _jsx(TileCard, { icon: _jsx(Moon, { className: "w-4 h-4" }), title: "Sleep last night", accent: "text-indigo-600", main: view.lastNight ? `${view.lastNight.sleep_hours}h` : '—', sub: view.lastNight ? view.lastNight.sleep_quality ? `${view.lastNight.sleep_quality} quality` : 'logged' : 'not logged', footer: view.lastNight ? _jsx(ProgressBar, { value: view.lastNight.sleep_hours, max: view.sleepTarget, color: "bg-indigo-500" }) : undefined, action: _jsxs(Button, { size: "sm", variant: "soft", className: "!bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100", onClick: () => setModal('sleep'), children: [_jsx(Plus, { className: "w-4 h-4" }), " Log"] }) }), _jsx(TileCard, { icon: _jsx(Scale, { className: "w-4 h-4" }), title: "Current weight", accent: "text-emerald-600", main: view.progress ? `${view.progress.current}kg` : '—', sub: view.progress
                                    ? `${view.progress.pct}% to ${view.progress.target}kg goal`
                                    : goal
                                        ? 'no weigh-ins yet'
                                        : 'no goal set', footer: view.progress ? (_jsx(ProgressBar, { value: view.progress.pct, max: 100, color: "bg-emerald-500" })) : undefined, action: _jsxs(Button, { size: "sm", variant: "soft", className: "!bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100", onClick: () => (goal ? setModal('weight') : navigate('/progress')), children: [_jsx(Plus, { className: "w-4 h-4" }), " ", goal ? 'Log' : 'Set goal'] }) }), _jsx(TileCard, { icon: _jsx(Sparkles, { className: "w-4 h-4" }), title: "Daily health score", accent: "text-teal-600", main: `${view.score.score}`, sub: scoreBand(view.score.score).label, footer: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Info, { className: "w-3.5 h-3.5 text-slate-400 shrink-0" }), _jsx("p", { className: "text-xs text-slate-500 line-clamp-2", children: scoreExplanation(view.score) })] }) })] })] }), _jsx(Card, { title: "Why your score is what it is", subtitle: "A general wellness indicator built from your logged data \u2014 not medical advice.", children: _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", children: view.score.factors.map((f) => (_jsxs("div", { className: "rounded-xl bg-slate-50 px-4 py-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm font-semibold text-slate-700", children: f.label }), _jsxs("p", { className: "text-sm font-bold text-slate-900 tabular", children: [f.points, _jsxs("span", { className: "text-slate-400 font-medium", children: ["/", f.max] })] })] }), _jsx(ProgressBar, { className: "mt-2", value: f.points, max: f.max, color: "bg-teal-500" }), _jsx("p", { className: "text-xs text-slate-500 mt-2", children: f.detail })] }, f.key))) }) }), _jsx(Card, { title: "Today's meals", action: _jsx(Button, { variant: "secondary", size: "sm", onClick: () => navigate('/food-log'), children: "Open food log" }), children: data.logs.length === 0 ? (_jsx(EmptyState, { title: "No meals logged yet today", text: "Log breakfast, lunch, dinner or a snack \u2014 it only takes a few seconds.", action: _jsxs(Button, { size: "sm", onClick: () => setModal('food'), children: [_jsx(Plus, { className: "w-4 h-4" }), " Log your first meal"] }) })) : (_jsx("div", { className: "space-y-4", children: MEALS.map((meal) => {
                        const items = data.logs.filter((l) => (l.meal_type || 'snack') === meal.key);
                        if (items.length === 0)
                            return null;
                        const cal = sumCalories(items);
                        return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("p", { className: "text-sm font-bold text-slate-700", children: meal.label }), _jsxs("p", { className: "text-sm text-slate-400 tabular", children: [Math.round(cal), " kcal"] })] }), _jsx("div", { className: "space-y-1.5", children: items.map((l) => (_jsxs("div", { className: "flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5", children: [_jsx("span", { className: "text-sm font-medium text-slate-800 truncate", children: l.name }), _jsxs("span", { className: "text-sm text-slate-500 tabular shrink-0 ml-3", children: [Math.round(l.calories), " kcal"] })] }, l.id))) })] }, meal.key));
                    }) })) }), _jsx(Card, { title: "Your coach recommends", action: _jsx(Button, { variant: "ghost", size: "sm", onClick: () => navigate('/coach'), children: "Open coach" }), children: _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: recommendations.map((r, i) => (_jsxs("div", { className: "rounded-xl border border-slate-100 p-4 flex gap-3", children: [_jsx("span", { className: "text-2xl shrink-0", children: r.icon }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold text-slate-800", children: r.title }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: r.text })] })] }, i))) }) }), _jsx(Card, { title: "Quick actions", children: _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3", children: [_jsx(QuickAction, { icon: _jsx(Utensils, { className: "w-5 h-5" }), label: "Log food", onClick: () => setModal('food') }), _jsx(QuickAction, { icon: _jsx(Droplets, { className: "w-5 h-5" }), label: "Add water", onClick: () => setModal('water') }), _jsx(QuickAction, { icon: _jsx(Scale, { className: "w-5 h-5" }), label: "Log weight", onClick: () => (goal ? setModal('weight') : navigate('/progress')) }), _jsx(QuickAction, { icon: _jsx(Moon, { className: "w-5 h-5" }), label: "Log sleep", onClick: () => setModal('sleep') }), _jsx(QuickAction, { icon: _jsx(ChefHat, { className: "w-5 h-5" }), label: "Recipes", onClick: () => navigate('/recipes') }), _jsx(QuickAction, { icon: _jsx(Sparkles, { className: "w-5 h-5" }), label: "Ask coach", onClick: () => navigate('/coach') })] }) }), t.calories == null && (_jsx(Card, { className: "border-amber-100 bg-amber-50/60", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(TrendingUp, { className: "w-5 h-5 text-amber-600 shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold text-slate-800", children: "Set your daily targets" }), _jsx("p", { className: "text-sm text-slate-600 mt-0.5", children: "Complete your body metrics (age, height, weight) to auto-calculate calorie & protein targets, or set custom ones in Settings." }), _jsxs("div", { className: "flex gap-2 mt-3", children: [_jsx(Button, { size: "sm", onClick: () => navigate('/profile'), children: "Body metrics" }), _jsx(Button, { size: "sm", variant: "secondary", onClick: () => navigate('/settings'), children: "Custom targets" })] })] })] }) })), _jsx(FoodQuickAdd, { open: modal === 'food', onClose: () => setModal(null), onSaved: reload }), _jsx(WaterModal, { open: modal === 'water', onClose: () => setModal(null), onSaved: reloadWater }), _jsx(SleepModal, { open: modal === 'sleep', onClose: () => setModal(null), onSaved: reload }), _jsx(WeightModal, { open: modal === 'weight', onClose: () => setModal(null), onSaved: reload, goal: goal })] }));
};
function MacroRow({ label, value, target, color }) {
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between text-xs mb-1", children: [_jsx("span", { className: "font-semibold text-slate-500", children: label }), _jsxs("span", { className: "text-slate-500 tabular", children: [Math.round(value), "g", target ? ` / ${target}g` : ''] })] }), _jsx(ProgressBar, { value: value, max: target || value || 1, color: color })] }));
}
function TileCard({ icon, title, accent, main, sub, footer, action, }) {
    return (_jsxs(Card, { className: "flex flex-col", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("p", { className: "flex items-center gap-1.5 text-sm font-semibold text-slate-500", children: [_jsx("span", { className: accent, children: icon }), " ", title] }), action] }), _jsx("p", { className: "text-3xl font-extrabold text-slate-900 tabular mt-2", children: main }), _jsx("p", { className: "text-xs text-slate-400 mt-0.5", children: sub }), footer && _jsx("div", { className: "mt-3", children: footer })] }));
}
function QuickAction({ icon, label, onClick }) {
    return (_jsxs("button", { onClick: onClick, className: "flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white hover:border-teal-200 hover:bg-teal-50/40 transition py-4 px-2", children: [_jsx("span", { className: "w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center", children: icon }), _jsx("span", { className: "text-xs font-semibold text-slate-600", children: label })] }));
}
