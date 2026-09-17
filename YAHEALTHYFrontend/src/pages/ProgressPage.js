import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { Plus, Pencil, Trash2, Scale, Trophy } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, ProgressBar, Chip, Segmented } from '@/components/ui';
import { WeightModal } from '@/components/QuickLogModals';
import { weightApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { fmtDate } from '@/lib/date';
import { milestoneReached, weightProgress } from '@/lib/health';
const MILESTONES = [
    { pct: 25, label: '25% there' },
    { pct: 50, label: 'Halfway' },
    { pct: 75, label: '75% there' },
    { pct: 100, label: 'Goal reached' },
];
export const ProgressPage = () => {
    const [logOpen, setLogOpen] = useState(false);
    const [goalOpen, setGoalOpen] = useState(false);
    const [goalForm, setGoalForm] = useState({ start: '', target: '' });
    const [savingGoal, setSavingGoal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [trend, setTrend] = useState('all');
    const { push } = useToast();
    const load = useCallback(async () => {
        const [goals, logs] = await Promise.all([
            weightApi.goals().then((r) => r.data || []),
            weightApi.logs().then((r) => r.data || []),
        ]);
        return { goal: goals[0] ?? null, logs };
    }, []);
    const { data, loading, error, reload } = useAsync(load, []);
    const goal = data?.goal ?? null;
    const progress = goal ? weightProgress(goal, (data?.logs || [])) : null;
    // Logs sorted oldest -> newest for the chart
    const sortedLogs = useMemo(() => {
        const logs = [...(data?.logs || [])];
        logs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return logs;
    }, [data]);
    const chartData = useMemo(() => {
        let logs = sortedLogs;
        if (trend === '7')
            logs = logs.slice(-7);
        else if (trend === '30')
            logs = logs.slice(-30);
        return logs.map((l) => ({
            date: fmtDate(l.created_at.slice(0, 10)),
            weight: l.weight_kg,
        }));
    }, [sortedLogs, trend]);
    const createGoal = async () => {
        const start = Number(goalForm.start);
        const target = Number(goalForm.target);
        if (!Number.isFinite(start) || start < 30 || start > 300) {
            push('Start weight must be between 30 and 300 kg', 'error');
            return;
        }
        if (!Number.isFinite(target) || target < 30 || target > 300) {
            push('Target weight must be between 30 and 300 kg', 'error');
            return;
        }
        setSavingGoal(true);
        try {
            await weightApi.createGoal(Math.round(start * 10) / 10, Math.round(target * 10) / 10);
            push('Weight goal created — let\'s go! 🎯');
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
    const saveEdit = async () => {
        if (!editing || savingEdit)
            return;
        const v = Number(editValue);
        if (!Number.isFinite(v) || v < 30 || v > 300) {
            push('Weight must be between 30 and 300 kg', 'error');
            return;
        }
        setSavingEdit(true);
        try {
            await weightApi.updateLog(editing.id, Math.round(v * 10) / 10);
            push('Weigh-in updated');
            setEditing(null);
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSavingEdit(false);
        }
    };
    const removeLog = async (log) => {
        try {
            await weightApi.removeLog(log.id);
            push('Weigh-in deleted');
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
    };
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    if (!data)
        return null;
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { className: "flex items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Progress" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Your weight journey \u2014 trend over noise" })] }), goal && (_jsxs(Button, { onClick: () => setLogOpen(true), className: "shrink-0", children: [_jsx(Plus, { className: "w-4 h-4" }), " Log weigh-in"] }))] }), !goal && (_jsx(Card, { children: _jsx(EmptyState, { icon: _jsx(Scale, { className: "w-7 h-7" }), title: "Set your weight goal", text: "Choose a start and target weight \u2014 then log weigh-ins here and watch the milestones unlock.", action: _jsx(Button, { onClick: () => setGoalOpen(true), children: "Create weight goal" }) }) })), goal && progress && (_jsxs(Card, { children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-slate-500", children: "Goal journey" }), _jsxs("p", { className: "text-2xl font-extrabold text-slate-900", children: [progress.start, "kg ", _jsx("span", { className: "text-slate-300 mx-1", children: "\u2192" }), ' ', _jsxs("span", { className: "text-emerald-600", children: [progress.target, "kg"] })] })] }), _jsxs(Chip, { color: progress.pct >= 100 ? 'emerald' : 'teal', className: "text-sm py-1", children: [_jsx(Trophy, { className: "w-3.5 h-3.5" }), " ", progress.pct, "% toward goal"] })] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5", children: [_jsx(Stat, { label: "Start weight", value: `${progress.start}kg` }), _jsx(Stat, { label: "Current weight", value: `${progress.current}kg`, accent: "text-emerald-700" }), _jsx(Stat, { label: "Total change", value: `${progress.totalChange > 0 ? '+' : ''}${progress.totalChange}kg`, accent: progress.totalChange < 0 ? 'text-emerald-600' : progress.totalChange > 0 ? 'text-amber-600' : 'text-slate-700' }), _jsx(Stat, { label: "Remaining", value: `${progress.remaining}kg` })] }), _jsx(ProgressBar, { className: "mt-5", value: progress.pct, max: 100, color: "bg-emerald-500" }), _jsx("div", { className: "grid grid-cols-4 gap-2 mt-4", children: MILESTONES.map((m) => {
                            const reached = milestoneReached(progress.pct) >= m.pct;
                            return (_jsxs("div", { className: `rounded-xl px-2 py-2.5 text-center text-xs font-bold transition ${reached ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`, children: [reached ? '🏆 ' : '🔒 ', m.label] }, m.pct));
                        }) })] })), goal && chartData.length > 0 && (_jsx(Card, { title: "Weight trend", action: _jsx(Segmented, { value: trend, onChange: setTrend, options: [
                        { value: '7', label: '7d' },
                        { value: '30', label: '30d' },
                        { value: 'all', label: 'All' },
                    ] }), children: _jsx("div", { className: "h-64 -ml-3", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: chartData, margin: { top: 10, right: 10, bottom: 0, left: 0 }, children: [_jsx(CartesianGrid, { stroke: "#f1f5f9", vertical: false }), _jsx(XAxis, { dataKey: "date", tick: { fontSize: 11, fill: '#94a3b8' }, tickLine: false, axisLine: false }), _jsx(YAxis, { domain: ['dataMin - 1', 'dataMax + 1'], tick: { fontSize: 11, fill: '#94a3b8' }, tickLine: false, axisLine: false, width: 40 }), _jsx(Tooltip, { formatter: (v) => [`${v}kg`, 'Weight'], contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 } }), _jsx(Line, { type: "monotone", dataKey: "weight", stroke: "#059669", strokeWidth: 2.5, dot: { r: 3, fill: '#059669' }, activeDot: { r: 5 } })] }) }) }) })), goal && chartData.length === 0 && (_jsx(Card, { children: _jsx(EmptyState, { title: "No weigh-ins yet", text: "Log your first weigh-in to start the trend chart.", action: _jsx(Button, { size: "sm", onClick: () => setLogOpen(true), children: "Log weigh-in" }) }) })), goal && (_jsx(Card, { title: "Weigh-in history", children: (data.logs || []).length === 0 ? (_jsx("p", { className: "text-sm text-slate-400", children: "No weigh-ins yet." })) : (_jsx("div", { className: "space-y-2", children: data.logs.map((l) => (_jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("p", { className: "text-sm font-bold text-slate-800 tabular", children: [l.weight_kg, "kg"] }), _jsx("p", { className: "text-xs text-slate-400", children: fmtDate(l.created_at.slice(0, 10)) })] }), _jsx("button", { onClick: () => { setEditing(l); setEditValue(String(l.weight_kg)); }, "aria-label": "Edit weigh-in", className: "w-9 h-9 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center", children: _jsx(Pencil, { className: "w-4 h-4" }) }), _jsx("button", { onClick: () => removeLog(l), "aria-label": "Delete weigh-in", className: "w-9 h-9 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center", children: _jsx(Trash2, { className: "w-4 h-4" }) })] }, l.id))) })) })), _jsx(WeightModal, { open: logOpen, onClose: () => setLogOpen(false), onSaved: reload, goal: goal }), _jsx(Modal, { open: goalOpen, onClose: () => setGoalOpen(false), title: "Create weight goal", children: _jsxs("div", { className: "space-y-3", children: [_jsx(Field, { label: "Starting weight (kg)", children: _jsx("input", { type: "number", min: "30", max: "300", step: "0.1", inputMode: "decimal", value: goalForm.start, onChange: (e) => setGoalForm((f) => ({ ...f, start: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Target weight (kg)", hint: "Lower for weight loss, higher for gaining", children: _jsx("input", { type: "number", min: "30", max: "300", step: "0.1", inputMode: "decimal", value: goalForm.target, onChange: (e) => setGoalForm((f) => ({ ...f, target: e.target.value })), className: inputCls }) }), _jsx(Button, { className: "w-full", loading: savingGoal, onClick: createGoal, children: "Create goal" })] }) }), _jsxs(Modal, { open: !!editing, onClose: () => setEditing(null), title: "Correct weigh-in", children: [_jsx(Field, { label: "Weight (kg)", children: _jsx("input", { type: "number", min: "30", max: "300", step: "0.1", inputMode: "decimal", value: editValue, onChange: (e) => setEditValue(e.target.value), className: `${inputCls} text-center text-2xl font-bold` }) }), _jsxs("div", { className: "flex gap-2 mt-4", children: [_jsx(Button, { className: "flex-1", loading: savingEdit, onClick: saveEdit, children: "Save" }), _jsx(Button, { variant: "secondary", onClick: () => setEditing(null), children: "Cancel" })] })] })] }));
};
function Stat({ label, value, accent = 'text-slate-900' }) {
    return (_jsxs("div", { className: "rounded-2xl bg-slate-50 px-4 py-3", children: [_jsx("p", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wide", children: label }), _jsx("p", { className: `text-xl font-extrabold tabular mt-1 ${accent}`, children: value })] }));
}
