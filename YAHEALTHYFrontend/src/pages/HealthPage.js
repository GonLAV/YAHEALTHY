import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { Plus, Droplets, Moon, Pencil, Target } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, ProgressBar, Chip } from '@/components/ui';
import { WaterModal, SleepModal } from '@/components/QuickLogModals';
import { waterApi, sleepApi, prefApi, surveyApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { addDays, fmtDayShort, todayStr } from '@/lib/date';
import { resolveWaterGoal, resolveSleepTarget, sleepConsistency, waterToday } from '@/lib/health';
export const HealthPage = () => {
    const today = todayStr();
    const [waterOpen, setWaterOpen] = useState(false);
    const [sleepOpen, setSleepOpen] = useState(false);
    const [goalOpen, setGoalOpen] = useState(false);
    const [goalInput, setGoalInput] = useState('');
    const [savingGoal, setSavingGoal] = useState(false);
    const { push } = useToast();
    const load = useCallback(async () => {
        const [water, sleep, prefs, surveys] = await Promise.all([
            waterApi.list().then((r) => r.data || []),
            sleepApi.list().then((r) => r.data || []),
            prefApi.get().catch(() => ({})),
            surveyApi.list().then((r) => r.data || []),
        ]);
        return { water, sleep, prefs, survey: surveys[0] ?? null };
    }, []);
    const { data, loading, error, reload } = useAsync(load, []);
    const waterGoal = resolveWaterGoal(data?.prefs?.hydrationGoalLiters, data?.survey?.water_target_liters);
    const sleepTarget = resolveSleepTarget(data?.survey?.sleep_target_hours);
    // ---- weekly water chart data ----
    const waterWeek = (() => {
        if (!data)
            return [];
        const start = addDays(today, -6);
        return Array.from({ length: 7 }, (_, i) => {
            const date = addDays(start, i);
            return {
                day: fmtDayShort(date),
                ml: Math.round(waterToday(data.water, date) * 1000),
                goal: Math.round(waterGoal * 1000),
            };
        });
    })();
    // ---- weekly sleep chart data ----
    const sleepWeek = (() => {
        if (!data)
            return [];
        const start = addDays(today, -6);
        return Array.from({ length: 7 }, (_, i) => {
            const date = addDays(start, i);
            const log = data.sleep.find((l) => l.date === date);
            return { day: fmtDayShort(date), hours: log?.sleep_hours ?? 0, target: sleepTarget };
        });
    })();
    const todayWater = data ? waterToday(data.water, today) : 0;
    const lastNight = data ? data.sleep.find((l) => l.date === today) ?? null : null;
    const consistency = data ? sleepConsistency(data.sleep.slice(0, 7)) : null;
    const saveGoal = async () => {
        const v = Number(goalInput);
        if (!Number.isFinite(v) || v < 0.5 || v > 10) {
            push('Goal must be between 0.5 and 10 liters', 'error');
            return;
        }
        setSavingGoal(true);
        try {
            await prefApi.merge({ hydrationGoalLiters: Math.round(v * 10) / 10 });
            push(`Water goal set to ${v}L`);
            setGoalOpen(false);
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSavingGoal(false);
        }
    };
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    if (!data)
        return null;
    const waterPct = Math.min(100, (todayWater / waterGoal) * 100);
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Health" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Hydration and sleep \u2014 the two pillars you can improve today" })] }), _jsxs(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Droplets, { className: "w-4 h-4 text-sky-500" }), " Hydration"] }), action: _jsxs("div", { className: "flex gap-2", children: [_jsxs(Button, { variant: "secondary", size: "sm", onClick: () => { setGoalInput(String(waterGoal)); setGoalOpen(true); }, children: [_jsx(Target, { className: "w-4 h-4" }), " Goal"] }), _jsxs(Button, { size: "sm", onClick: () => setWaterOpen(true), children: [_jsx(Plus, { className: "w-4 h-4" }), " Add"] })] }), children: [_jsxs("div", { className: "flex flex-col sm:flex-row items-center gap-6", children: [_jsxs("div", { className: "relative w-24 h-44 rounded-b-3xl rounded-t-xl border-4 border-sky-200 overflow-hidden bg-sky-50/50 shrink-0", children: [_jsx("div", { className: "absolute bottom-0 inset-x-0 bg-gradient-to-t from-sky-400 to-sky-300 transition-all duration-700", style: { height: `${waterPct}%` }, children: _jsx("div", { className: "absolute -top-1 inset-x-0 h-2 bg-white/40 rounded-full" }) }), _jsx("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: _jsxs("p", { className: "text-2xl font-extrabold text-sky-900 tabular drop-shadow-sm", children: [Math.round(waterPct), "%"] }) })] }), _jsxs("div", { className: "flex-1 w-full", children: [_jsx("div", { className: "flex items-baseline gap-2", children: _jsxs("p", { className: "text-4xl font-extrabold text-slate-900 tabular", children: [(todayWater * 1000).toFixed(0), _jsx("span", { className: "text-lg text-slate-400", children: "ml" })] }) }), _jsxs("p", { className: "text-sm text-slate-500 mt-0.5", children: ["of ", (waterGoal * 1000).toFixed(0), "ml goal \u00B7 ", _jsxs("span", { className: "font-semibold text-sky-600", children: [Math.max(0, Math.round((waterGoal - todayWater) * 1000)), "ml remaining"] })] }), _jsx(ProgressBar, { className: "mt-3", value: todayWater, max: waterGoal, color: "bg-sky-500" }), _jsx("div", { className: "grid grid-cols-4 gap-2 mt-4", children: [250, 500, 750, 1000].map((ml) => (_jsx("button", { onClick: async () => {
                                                try {
                                                    await waterApi.add(Math.round(ml / 1000) / 10, today);
                                                    push(`Added ${ml >= 1000 ? '1L' : `${ml}ml`}`);
                                                    reload();
                                                }
                                                catch (err) {
                                                    push(apiError(err), 'error');
                                                }
                                            }, className: "rounded-xl bg-sky-50 border border-sky-100 text-sky-700 text-sm font-bold py-2.5 hover:bg-sky-100 transition", children: ml >= 1000 ? '1L' : `${ml}ml` }, ml))) })] })] }), _jsxs("div", { className: "mt-6", children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400 mb-2", children: "This week" }), _jsx("div", { className: "flex items-end gap-2 h-36", children: waterWeek.map((d) => {
                                    const max = Math.max(d.goal, ...waterWeek.map((x) => x.ml), 1000);
                                    const pct = Math.min(100, (d.ml / max) * 100);
                                    const goalPct = (d.goal / max) * 100;
                                    return (_jsxs("div", { className: "flex-1 flex flex-col items-center gap-1", children: [_jsxs("div", { className: "relative w-full h-28 bg-slate-50 rounded-lg overflow-hidden flex items-end", children: [_jsx("div", { className: "absolute inset-x-0 border-t-2 border-dashed border-sky-300", style: { bottom: `${goalPct}%` } }), _jsx("div", { className: "w-full bg-sky-400 rounded-t-lg transition-all duration-500", style: { height: `${pct}%` } })] }), _jsx("span", { className: "text-[11px] font-semibold text-slate-400", children: d.day }), _jsx("span", { className: "text-[10px] text-slate-400 tabular", children: d.ml > 0 ? `${d.ml}` : '—' })] }, d.day));
                                }) })] })] }), _jsxs(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Moon, { className: "w-4 h-4 text-indigo-500" }), " Sleep"] }), action: _jsxs(Button, { size: "sm", onClick: () => setSleepOpen(true), children: [_jsx(Plus, { className: "w-4 h-4" }), " Log"] }), children: [!lastNight ? (_jsx(EmptyState, { icon: _jsx(Moon, { className: "w-7 h-7" }), title: "No sleep logged for last night", text: `Log your bedtime and wake time to track consistency. Your target: ${sleepTarget}h.`, action: _jsx(Button, { size: "sm", onClick: () => setSleepOpen(true), children: "Log last night" }) })) : (_jsxs("div", { className: "flex items-center gap-5", children: [_jsxs("div", { className: "text-center", children: [_jsxs("p", { className: "text-4xl font-extrabold text-indigo-700 tabular", children: [lastNight.sleep_hours, "h"] }), lastNight.sleep_quality && _jsx(Chip, { color: "indigo", className: "mt-1 capitalize", children: lastNight.sleep_quality })] }), _jsxs("div", { className: "flex-1", children: [_jsxs("p", { className: "text-sm text-slate-500", children: ["vs ", sleepTarget, "h target \u00B7", ' ', _jsx("span", { className: lastNight.sleep_hours >= sleepTarget ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold', children: lastNight.sleep_hours >= sleepTarget ? 'on target' : `${(sleepTarget - lastNight.sleep_hours).toFixed(1)}h short` })] }), lastNight.notes && _jsxs("p", { className: "text-sm text-slate-400 mt-1 italic", children: ["\u201C", lastNight.notes, "\u201D"] }), _jsx(ProgressBar, { className: "mt-3", value: lastNight.sleep_hours, max: sleepTarget, color: "bg-indigo-500" })] })] })), _jsxs("div", { className: "mt-6", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400", children: "This week" }), consistency && _jsx("p", { className: "text-xs text-slate-500", children: consistency.label })] }), _jsx("div", { className: "flex items-end gap-2 h-36", children: sleepWeek.map((d) => {
                                    const max = 10;
                                    const pct = Math.min(100, (d.hours / max) * 100);
                                    const targetPct = (d.target / max) * 100;
                                    return (_jsxs("div", { className: "flex-1 flex flex-col items-center gap-1", children: [_jsxs("div", { className: "relative w-full h-28 bg-slate-50 rounded-lg overflow-hidden flex items-end", children: [_jsx("div", { className: "absolute inset-x-0 border-t-2 border-dashed border-indigo-300", style: { bottom: `${targetPct}%` } }), _jsx("div", { className: `w-full rounded-t-lg transition-all duration-500 ${d.hours >= d.target ? 'bg-indigo-500' : 'bg-indigo-300'}`, style: { height: `${pct}%` } })] }), _jsx("span", { className: "text-[11px] font-semibold text-slate-400", children: d.day }), _jsx("span", { className: "text-[10px] text-slate-400 tabular", children: d.hours > 0 ? `${d.hours}h` : '—' })] }, d.day));
                                }) }), consistency && !Number.isNaN(consistency.stdDev) && (_jsxs("p", { className: "text-xs text-slate-400 mt-2", children: ["Wellness note: your sleep duration varies by \u00B1", consistency.stdDev, "h night-to-night. Consistent bedtimes usually feel best."] }))] })] }), data.sleep.length > 0 && (_jsx(Card, { title: "Recent sleep logs", children: _jsx("div", { className: "space-y-2", children: data.sleep.slice(0, 7).map((l) => (_jsxs("div", { className: "flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-semibold text-slate-800", children: [fmtDayShort(l.date), " \u00B7 ", l.date === today ? 'today' : l.date] }), _jsx("p", { className: "text-xs text-slate-400 capitalize", children: l.sleep_quality || '—' })] }), _jsxs("p", { className: "text-sm font-bold text-indigo-700 tabular", children: [l.sleep_hours, "h"] })] }, l.id))) }) })), _jsx(WaterModal, { open: waterOpen, onClose: () => setWaterOpen(false), onSaved: reload }), _jsx(SleepModal, { open: sleepOpen, onClose: () => setSleepOpen(false), onSaved: reload }), _jsxs(Modal, { open: goalOpen, onClose: () => setGoalOpen(false), title: "Daily water goal", children: [_jsx(Field, { label: "Goal (liters)", hint: "A common starting point is 30-35ml per kg of body weight", children: _jsx("input", { type: "number", min: "0.5", max: "10", step: "0.1", inputMode: "decimal", value: goalInput, onChange: (e) => setGoalInput(e.target.value), className: `${inputCls} text-center text-2xl font-bold` }) }), _jsxs(Button, { className: "w-full mt-4", loading: savingGoal, onClick: saveGoal, children: [_jsx(Pencil, { className: "w-4 h-4" }), " Save goal"] })] })] }));
};
