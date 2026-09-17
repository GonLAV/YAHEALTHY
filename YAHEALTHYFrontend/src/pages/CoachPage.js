import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, SendHorizonal } from 'lucide-react';
import { Card, Button, ErrorState, SkeletonCard } from '@/components/ui';
import { foodLogApi, waterApi, sleepApi, weightApi, targetApi, streakApi, surveyApi, recipeApi, } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { todayStr } from '@/lib/date';
import { resolveWaterGoal, resolveSleepTarget } from '@/lib/health';
import { coachAnswer, dailyRecommendations } from '@/lib/coach';
const SUGGESTED = [
    'How am I doing today?',
    'What should I eat for dinner?',
    'Am I getting enough protein?',
    'How can I improve my sleep?',
    'Give me a healthy meal under 600 calories.',
    "Create tomorrow's meal plan.",
];
const HISTORY_KEY = 'yahealthy.coach.history';
/**
 * Personal coach chat: grounded in the user's real logged data
 * (rule-based, no external AI service), with saved conversation history.
 */
export const CoachPage = () => {
    const today = todayStr();
    const [messages, setMessages] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        }
        catch {
            return [];
        }
    });
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const scrollRef = useRef(null);
    const load = useCallback(async () => {
        const [logs, water, sleep, goals, weights, targets, streak, surveys, recipes] = await Promise.all([
            foodLogApi.getAll({ date: today }).then((r) => (r.data || [])),
            waterApi.list().then((r) => (r.data || [])),
            sleepApi.list().then((r) => (r.data || [])),
            weightApi.goals().then((r) => (r.data || [])),
            weightApi.logs().then((r) => (r.data || [])),
            targetApi.get().then((r) => r.data.targets),
            streakApi.get().then((r) => r.data),
            surveyApi.list().then((r) => r.data || []),
            recipeApi.all().then((r) => r.data || []),
        ]);
        const survey = surveys[0] ?? null;
        return {
            logs,
            water,
            sleep,
            goal: goals[0] ?? null,
            weights,
            targets: targets,
            streak,
            survey,
            recipes,
            // preferences-derived goals
            waterGoal: resolveWaterGoal(undefined, survey?.water_target_liters),
            sleepTarget: resolveSleepTarget(survey?.sleep_target_hours),
        };
    }, [today]);
    const { data, loading, error, reload } = useAsync(load, [today]);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages]);
    const persist = (next) => {
        setMessages((prev) => {
            const value = typeof next === 'function' ? next(prev) : next;
            localStorage.setItem(HISTORY_KEY, JSON.stringify(value.slice(-50)));
            return value;
        });
    };
    const ask = (question) => {
        if (!data || thinking || !question.trim())
            return;
        const q = question.trim();
        persist([...messages, { role: 'user', text: q, time: new Date().toISOString() }]);
        setInput('');
        setThinking(true);
        // Small delay so the reply feels like a conversation turn
        setTimeout(() => {
            const ctx = {
                date: today,
                targets: data.targets,
                todayLogs: data.logs,
                waterLogs: data.water,
                waterGoal: data.waterGoal,
                sleepLogs: data.sleep,
                sleepTarget: data.sleepTarget,
                goal: data.goal,
                weightLogs: data.weights,
                streak: data.streak?.currentStreak ?? 0,
                recipes: data.recipes,
            };
            const reply = coachAnswer(q, ctx);
            persist((prev) => [...prev, { role: 'coach', text: reply, time: new Date().toISOString() }]);
            setThinking(false);
        }, 450);
    };
    const recommendations = useMemo(() => {
        if (!data)
            return [];
        return dailyRecommendations({
            date: today,
            targets: data.targets,
            todayLogs: data.logs,
            waterLogs: data.water,
            waterGoal: data.waterGoal,
            sleepLogs: data.sleep,
            sleepTarget: data.sleepTarget,
            goal: data.goal,
            weightLogs: data.weights,
            streak: data.streak?.currentStreak ?? 0,
            recipes: data.recipes,
        });
    }, [data, today]);
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    if (!data)
        return null;
    return (_jsxs("div", { className: "animate-fade-up grid grid-cols-1 lg:grid-cols-3 gap-5", children: [_jsxs("div", { className: "lg:col-span-2 space-y-4", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2", children: [_jsx(Sparkles, { className: "w-6 h-6 text-teal-600" }), " Your Coach"] }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Grounded in your logged data \u2014 meals, water, sleep, weight and streaks" })] }), _jsxs(Card, { padded: false, children: [_jsxs("div", { ref: scrollRef, className: "h-[55vh] lg:h-[60vh] overflow-y-auto px-4 py-4 space-y-3", children: [messages.length === 0 && (_jsxs("div", { className: "text-center py-10", children: [_jsx("span", { className: "w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4", children: _jsx(Sparkles, { className: "w-7 h-7" }) }), _jsx("p", { className: "font-bold text-slate-800", children: "Hi! I'm your health coach \uD83D\uDC4B" }), _jsx("p", { className: "text-sm text-slate-500 mt-1 max-w-sm mx-auto", children: "Ask me anything about your day, meals, protein, sleep or weight \u2014 I'll answer using your real logged data." })] })), messages.map((m, i) => (_jsx("div", { className: `flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsx("div", { className: `max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user'
                                                ? 'bg-teal-600 text-white rounded-br-md'
                                                : 'bg-slate-100 text-slate-800 rounded-bl-md'}`, children: m.text }) }, i))), thinking && (_jsx("div", { className: "flex justify-start", children: _jsxs("div", { className: "bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5", children: [_jsx("span", { className: "w-2 h-2 bg-slate-400 rounded-full animate-bounce", style: { animationDelay: '0ms' } }), _jsx("span", { className: "w-2 h-2 bg-slate-400 rounded-full animate-bounce", style: { animationDelay: '120ms' } }), _jsx("span", { className: "w-2 h-2 bg-slate-400 rounded-full animate-bounce", style: { animationDelay: '240ms' } })] }) }))] }), _jsxs("div", { className: "border-t border-slate-100 p-3 flex gap-2", children: [_jsx("input", { value: input, onChange: (e) => setInput(e.target.value), onKeyDown: (e) => e.key === 'Enter' && ask(input), placeholder: "Ask your coach\u2026", className: "flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 text-sm" }), _jsx(Button, { onClick: () => ask(input), disabled: !input.trim() || thinking, "aria-label": "Send", children: _jsx(SendHorizonal, { className: "w-4 h-4" }) })] })] }), _jsx("div", { className: "flex gap-2 overflow-x-auto no-scrollbar pb-1", children: SUGGESTED.map((s) => (_jsx("button", { onClick: () => ask(s), className: "shrink-0 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-4 py-2 hover:bg-teal-100 transition", children: s }, s))) })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(Card, { title: "Today for you", subtitle: "Live from your logged data", children: _jsx("div", { className: "space-y-3", children: recommendations.map((r, i) => (_jsxs("div", { className: "rounded-xl border border-slate-100 p-3.5 flex gap-3", children: [_jsx("span", { className: "text-xl shrink-0", children: r.icon }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold text-slate-800", children: r.title }), _jsx("p", { className: "text-xs text-slate-500 mt-0.5 leading-relaxed", children: r.text })] })] }, i))) }) }), messages.length > 0 && (_jsx(Card, { children: _jsx(Button, { variant: "ghost", size: "sm", className: "w-full !text-slate-400", onClick: () => {
                                persist([]);
                                localStorage.removeItem(HISTORY_KEY);
                            }, children: "Clear conversation history" }) })), _jsx("p", { className: "text-xs text-slate-400 leading-relaxed", children: "Your coach provides general wellness guidance based on the data you log. It is not medical advice \u2014 for personal medical questions, consult a healthcare professional." })] })] }));
};
