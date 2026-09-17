import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { Card, Button, ErrorState, SkeletonCard, ProgressBar, Chip } from '@/components/ui';
import { foodLogApi, waterApi, sleepApi, weightApi, streakApi, targetApi, } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { addDays, daysBetween, fmtDayShort, fmtDate, todayStr, weekStartStr } from '@/lib/date';
import { resolveTargets } from '@/lib/health';
/**
 * Weekly health report: nutrition, hydration, sleep, weight and consistency
 * for a Monday-based week, with positive actionable insights.
 */
export const ReportsPage = () => {
    const [weekStart, setWeekStart] = useState(() => weekStartStr(todayStr()));
    const today = todayStr();
    const load = useCallback(async () => {
        const [summary, water, sleep, weights, streak, targets] = await Promise.all([
            foodLogApi.summaryWeek(weekStart).then((r) => r.data),
            waterApi.list().then((r) => (r.data || [])),
            sleepApi.list().then((r) => (r.data || [])),
            weightApi.logs().then((r) => (r.data || [])),
            streakApi.get().then((r) => r.data),
            targetApi.get().then((r) => r.data.targets),
        ]);
        return { summary, water, sleep, weights, streak, targets };
    }, [weekStart]);
    const { data, loading, error, reload } = useAsync(load, [weekStart]);
    const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
    const daysLogged = useMemo(() => (data?.summary?.days || []).filter((d) => d.count > 0).length, [data]);
    const avg = useMemo(() => {
        const s = data?.summary;
        if (!s || daysLogged === 0)
            return null;
        return {
            calories: Math.round(s.totals.calories / daysLogged),
            protein: Math.round(s.totals.protein_grams / daysLogged),
        };
    }, [data, daysLogged]);
    const waterStats = useMemo(() => {
        if (!data)
            return null;
        const perDay = week.map((d) => data.water.filter((l) => l.date === d).reduce((s, l) => s + l.liters_consumed, 0));
        const daysWithWater = perDay.filter((v) => v > 0).length;
        return {
            perDay,
            avgLiters: daysWithWater ? Math.round((perDay.reduce((a, b) => a + b, 0) / daysWithWater) * 10) / 10 : 0,
            goalReached: perDay.filter((v) => v >= 2).length,
        };
    }, [data, week]);
    const sleepStats = useMemo(() => {
        if (!data)
            return null;
        const logs = data.sleep.filter((l) => week.includes(l.date));
        const avgHours = logs.length ? Math.round((logs.reduce((s, l) => s + l.sleep_hours, 0) / logs.length) * 10) / 10 : 0;
        return { logs, avgHours, nights: logs.length };
    }, [data, week]);
    const weightChange = useMemo(() => {
        if (!data)
            return null;
        const inWeek = data.weights
            .filter((l) => week.includes(l.created_at.slice(0, 10)))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (inWeek.length < 2)
            return null;
        return Math.round((inWeek[inWeek.length - 1].weight_kg - inWeek[0].weight_kg) * 10) / 10;
    }, [data, week]);
    const t = resolveTargets(data?.targets ?? null);
    const prevDisabled = daysBetween(weekStart, today) >= 120;
    const nextDisabled = addDays(weekStart, 7) <= today;
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    if (!data)
        return null;
    const insights = [];
    if (daysLogged === 0) {
        insights.push('No meals logged this week — logging even one meal a day makes your reports shine.');
    }
    else if (t.calories && avg && avg.calories <= t.calories * 1.05 && avg.calories >= t.calories * 0.85) {
        insights.push(`Nice adherence — your average of ${avg.calories} kcal/day sits within 15% of your target.`);
    }
    else if (t.calories && avg) {
        insights.push(avg.calories > t.calories
            ? `You averaged ${avg.calories} kcal/day vs a ${t.calories} target — a slightly lighter dinner most days closes the gap.`
            : `You averaged ${avg.calories} kcal/day vs a ${t.calories} target — adding a balanced snack could help you hit it.`);
    }
    if (waterStats && waterStats.goalReached >= 5) {
        insights.push('Hydration was strong this week — you hit your water goal most days. 💧');
    }
    if (sleepStats && sleepStats.nights >= 3 && sleepStats.avgHours >= 7) {
        insights.push(`You averaged ${sleepStats.avgHours}h of sleep — a great foundation for recovery and energy.`);
    }
    if (data.streak?.currentStreak && data.streak.currentStreak >= 3) {
        insights.push(`A ${data.streak.currentStreak}-day logging streak — consistency is your superpower.`);
    }
    const maxBar = Math.max(t.calories || 2000, ...(data.summary?.days || []).map((d) => d.totals.calories), 1);
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { className: "flex items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Weekly Report" }), _jsxs("p", { className: "text-sm text-slate-500 mt-0.5", children: [fmtDate(weekStart), " \u2013 ", fmtDate(addDays(weekStart, 6))] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { variant: "secondary", size: "sm", disabled: prevDisabled, onClick: () => setWeekStart(addDays(weekStart, -7)), "aria-label": "Previous week", children: _jsx(ChevronLeft, { className: "w-4 h-4" }) }), _jsx(Button, { variant: "secondary", size: "sm", disabled: !nextDisabled, onClick: () => setWeekStart(addDays(weekStart, 7)), "aria-label": "Next week", children: _jsx(ChevronRight, { className: "w-4 h-4" }) })] })] }), _jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [_jsx(AvgCard, { label: "Avg calories / day", value: avg ? `${avg.calories}` : '—', unit: "kcal", sub: t.calories ? `target ${t.calories}` : undefined, color: "text-teal-700" }), _jsx(AvgCard, { label: "Avg protein / day", value: avg ? `${avg.protein}` : '—', unit: "g", sub: t.protein ? `target ${t.protein}g` : undefined, color: "text-teal-600" }), _jsx(AvgCard, { label: "Avg water / day", value: waterStats ? `${waterStats.avgLiters}` : '—', unit: "L", sub: waterStats ? `${waterStats.goalReached}/7 days on goal` : undefined, color: "text-sky-600" }), _jsx(AvgCard, { label: "Avg sleep / night", value: sleepStats && sleepStats.nights ? `${sleepStats.avgHours}` : '—', unit: "h", sub: sleepStats ? `${sleepStats.nights} nights logged` : undefined, color: "text-indigo-600" })] }), _jsx(Card, { title: "Calories per day", subtitle: daysLogged > 0 ? `${daysLogged} of 7 days logged` : 'Nothing logged this week yet', children: _jsx("div", { className: "flex items-end gap-2 h-40", children: (data.summary?.days || []).map((d) => {
                        const pct = Math.min(100, (d.totals.calories / maxBar) * 100);
                        const targetPct = t.calories ? (t.calories / maxBar) * 100 : null;
                        return (_jsxs("div", { className: "flex-1 flex flex-col items-center gap-1", children: [_jsxs("div", { className: "relative w-full h-32 bg-slate-50 rounded-lg overflow-hidden flex items-end", children: [targetPct != null && _jsx("div", { className: "absolute inset-x-0 border-t-2 border-dashed border-teal-300", style: { bottom: `${targetPct}%` } }), _jsx("div", { className: `w-full rounded-t-lg transition-all duration-500 ${d.totals.calories > (t.calories || Infinity) ? 'bg-amber-400' : 'bg-teal-500'}`, style: { height: `${pct}%` } })] }), _jsx("span", { className: "text-[11px] font-semibold text-slate-400", children: fmtDayShort(d.date) }), _jsx("span", { className: "text-[10px] text-slate-400 tabular", children: d.totals.calories > 0 ? d.totals.calories : '—' })] }, d.date));
                    }) }) }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(Card, { title: "Weight this week", children: weightChange == null ? (_jsx("p", { className: "text-sm text-slate-400", children: "Not enough weigh-ins this week to show a change \u2014 two weigh-ins unlock the trend." })) : (_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("p", { className: `text-3xl font-extrabold tabular ${weightChange <= 0 ? 'text-emerald-600' : 'text-amber-600'}`, children: [weightChange > 0 ? '+' : '', weightChange, "kg"] }), _jsx("p", { className: "text-sm text-slate-500", children: weightChange <= 0 ? 'Trend in your goal direction — great pace.' : 'A small bump — trends matter more than single weigh-ins.' })] })) }), _jsxs(Card, { title: "Consistency", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-3xl font-extrabold text-slate-900 tabular", children: [daysLogged, "/7"] }), _jsx("p", { className: "text-xs text-slate-400", children: "days logged" })] }), _jsxs("div", { className: "flex-1", children: [_jsx(ProgressBar, { value: daysLogged, max: 7, color: "bg-teal-500" }), _jsx("p", { className: "text-xs text-slate-500 mt-2", children: daysLogged >= 5 ? 'Excellent consistency — this is where results come from.' : daysLogged >= 3 ? 'Solid base — a few more days makes your data sparkle.' : 'Every logged day sharpens your score and coach advice.' })] })] }), data.streak?.longestStreak ? (_jsxs(Chip, { color: "amber", className: "mt-3", children: ["Longest streak: ", data.streak.longestStreak, " days"] })) : null] })] }), _jsx(Card, { title: "Insights", subtitle: "Actionable, not judgmental", children: insights.length === 0 ? (_jsx("p", { className: "text-sm text-slate-400", children: "Log a few more days and personalized insights will appear here." })) : (_jsx("ul", { className: "space-y-2.5", children: insights.map((text, i) => (_jsxs("li", { className: "flex items-start gap-3 text-sm text-slate-700", children: [_jsx(TrendingUp, { className: "w-4 h-4 text-teal-600 shrink-0 mt-0.5" }), text] }, i))) })) })] }));
};
function AvgCard({ label, value, unit, sub, color }) {
    return (_jsxs(Card, { children: [_jsx("p", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wide", children: label }), _jsxs("p", { className: `text-3xl font-extrabold tabular mt-1.5 ${color}`, children: [value, _jsx("span", { className: "text-sm text-slate-400 font-bold ml-1", children: unit })] }), sub && _jsx("p", { className: "text-xs text-slate-400 mt-1", children: sub })] }));
}
