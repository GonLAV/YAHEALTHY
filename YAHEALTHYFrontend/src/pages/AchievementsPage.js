import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo } from 'react';
import { Flame, Droplets, Moon, Scale, Utensils, Trophy, Lock } from 'lucide-react';
import { Card, ErrorState, SkeletonCard, Chip } from '@/components/ui';
import { badgeApi, streakApi, waterApi, sleepApi, weightApi, } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { addDays, todayStr } from '@/lib/date';
/**
 * Achievements: server-earned badges + client-computed streaks
 * (food logging, hydration, sleep tracking, weekly weigh-in).
 */
export const AchievementsPage = () => {
    const today = todayStr();
    const load = useCallback(async () => {
        const [badges, streak, water, sleep, weights] = await Promise.all([
            badgeApi.get().then((r) => r.data),
            streakApi.get().then((r) => r.data),
            waterApi.list().then((r) => (r.data || [])),
            sleepApi.list().then((r) => (r.data || [])),
            weightApi.logs().then((r) => r.data || []),
        ]);
        return { badges, streak, water, sleep, weights };
    }, []);
    const { data, loading, error, reload } = useAsync(load, []);
    const streaks = useMemo(() => {
        if (!data)
            return null;
        const consecutive = (has) => {
            let count = 0;
            for (let i = 0; i < 365; i++) {
                const d = addDays(today, -i);
                if (has(d))
                    count++;
                else if (i > 0 || !has(d))
                    break;
            }
            // Allow the streak to survive if today isn't logged yet but yesterday was
            if (count === 0) {
                for (let i = 1; i < 365; i++) {
                    if (has(addDays(today, -i)))
                        count++;
                    else
                        break;
                }
            }
            return count;
        };
        const waterDates = new Set(data.water.map((l) => l.date));
        const sleepDates = new Set(data.sleep.map((l) => l.date));
        const weekAgo = addDays(today, -7);
        const weighedThisWeek = data.weights.some((l) => l.created_at.slice(0, 10) >= weekAgo);
        return {
            food: data.streak?.currentStreak ?? 0,
            longestFood: data.streak?.longestStreak ?? 0,
            hydration: consecutive((d) => waterDates.has(d)),
            sleep: consecutive((d) => sleepDates.has(d)),
            weighedThisWeek,
        };
    }, [data, today]);
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    if (!data || !streaks)
        return null;
    const streakCards = [
        { key: 'food', icon: _jsx(Flame, { className: "w-5 h-5" }), label: 'Food logging streak', value: streaks.food, goal: 7, unit: 'days', color: 'bg-amber-50 text-amber-600' },
        { key: 'hydration', icon: _jsx(Droplets, { className: "w-5 h-5" }), label: 'Hydration streak', value: streaks.hydration, goal: 7, unit: 'days', color: 'bg-sky-50 text-sky-600' },
        { key: 'sleep', icon: _jsx(Moon, { className: "w-5 h-5" }), label: 'Sleep tracking streak', value: streaks.sleep, goal: 7, unit: 'days', color: 'bg-indigo-50 text-indigo-600' },
        { key: 'weigh', icon: _jsx(Scale, { className: "w-5 h-5" }), label: 'Weekly weigh-in', value: streaks.weighedThisWeek ? 1 : 0, goal: 1, unit: 'this week', color: 'bg-emerald-50 text-emerald-600' },
    ];
    const goals = [
        { id: 'streak3', name: '3-Day Streak', description: 'Log food 3 days in a row', earned: streaks.food >= 3, icon: '🔥' },
        { id: 'streak7', name: '7-Day Streak', description: 'A full week of logging', earned: streaks.food >= 7, icon: '🏆' },
        { id: 'hydration3', name: 'Hydration Habit', description: 'Log water 3 days in a row', earned: streaks.hydration >= 3, icon: '💧' },
        { id: 'sleep3', name: 'Rest Tracker', description: 'Log sleep 3 nights in a row', earned: streaks.sleep >= 3, icon: '😴' },
        { id: 'weighin', name: 'Weekly Weigh-In', description: 'Log a weigh-in this week', earned: streaks.weighedThisWeek, icon: '⚖️' },
        { id: 'firstlog', name: 'First Step', description: 'Logged your first food', earned: (data.badges?.badges || []).some((b) => b.id === 'first-log'), icon: '🥗' },
    ];
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Achievements" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Consistency compounds \u2014 celebrate the small wins" })] }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: streakCards.map((s) => (_jsxs(Card, { className: "text-center", children: [_jsx("span", { className: `w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${s.color}`, children: s.icon }), _jsx("p", { className: "text-3xl font-extrabold text-slate-900 tabular mt-3", children: s.value }), _jsx("p", { className: "text-xs text-slate-400", children: s.unit }), _jsx("p", { className: "text-sm font-semibold text-slate-600 mt-1.5", children: s.label })] }, s.key))) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(Card, { title: "Milestones", subtitle: "Tap into your momentum", children: _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: goals.map((g) => (_jsxs("div", { className: `rounded-2xl border p-4 flex items-center gap-3 ${g.earned ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100 bg-slate-50/50'}`, children: [_jsx("span", { className: `text-2xl ${g.earned ? '' : 'grayscale opacity-40'}`, children: g.icon }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: `text-sm font-bold ${g.earned ? 'text-emerald-800' : 'text-slate-500'}`, children: g.name }), _jsx("p", { className: "text-xs text-slate-400", children: g.description })] }), g.earned ? (_jsx(Trophy, { className: "w-5 h-5 text-emerald-500 shrink-0" })) : (_jsx(Lock, { className: "w-4 h-4 text-slate-300 shrink-0" }))] }, g.id))) }) }), _jsxs(Card, { title: "Earned badges", subtitle: `${data.badges?.totalEarned || 0} from the server`, children: [(data.badges?.badges || []).length === 0 ? (_jsxs("div", { className: "flex flex-col items-center text-center py-8", children: [_jsx("span", { className: "w-12 h-12 rounded-2xl bg-slate-50 text-slate-300 flex items-center justify-center", children: _jsx(Utensils, { className: "w-6 h-6" }) }), _jsx("p", { className: "text-sm text-slate-400 mt-3", children: "Log food to earn your first badge." })] })) : (_jsx("div", { className: "space-y-2.5", children: (data.badges?.badges || []).map((b) => (_jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3", children: [_jsx("span", { className: "text-2xl", children: b.icon }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "text-sm font-bold text-slate-800", children: b.name }), _jsx("p", { className: "text-xs text-slate-400", children: b.description })] }), _jsx(Chip, { color: "emerald", children: "Earned" })] }, b.id))) })), streaks.longestFood > 0 && (_jsxs("p", { className: "text-xs text-slate-400 mt-4", children: ["Your all-time longest logging streak: ", _jsxs("span", { className: "font-bold text-amber-600", children: [streaks.longestFood, " days"] })] }))] })] })] }));
};
