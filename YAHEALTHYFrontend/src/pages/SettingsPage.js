import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Target, Droplets, Bell, ShieldCheck, LogOut, Check } from 'lucide-react';
import { Card, Button, Field, inputCls, ErrorState, Toggle, SkeletonCard, Chip } from '@/components/ui';
import { authApi, targetApi, prefApi, surveyApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
const REMINDERS = [
    { key: 'water', label: 'Drink water', detail: 'Every 2 hours, 09:00–21:00' },
    { key: 'breakfast', label: 'Log breakfast', detail: 'Daily at 09:00' },
    { key: 'lunch', label: 'Log lunch', detail: 'Daily at 12:30' },
    { key: 'dinner', label: 'Log dinner', detail: 'Daily at 19:00' },
    { key: 'weight', label: 'Weekly weigh-in', detail: 'Mondays at 08:00' },
    { key: 'sleep', label: 'Wind down', detail: 'Daily at 22:30' },
];
export const SettingsPage = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { push } = useToast();
    const [targetForm, setTargetForm] = useState({ calories: '', protein: '', carbs: '', fat: '' });
    const [savingTargets, setSavingTargets] = useState(false);
    const [waterGoal, setWaterGoal] = useState('');
    const [savingWater, setSavingWater] = useState(false);
    const [reminders, setReminders] = useState({});
    const [notifState, setNotifState] = useState('unsupported');
    const [pwForm, setPwForm] = useState({ old: '', new_: '', confirm: '' });
    const [savingPw, setSavingPw] = useState(false);
    const load = useCallback(async () => {
        const [targets, prefs, surveys] = await Promise.all([
            targetApi.get().then((r) => r.data.targets),
            prefApi.get().catch(() => ({})),
            surveyApi.list().then((r) => r.data || []),
        ]);
        return { targets, prefs, survey: surveys[0] ?? null };
    }, []);
    const { data, loading, error, reload } = useAsync(load, []);
    useEffect(() => {
        if (!data)
            return;
        setTargetForm({
            calories: data.targets.calories?.toString() ?? '',
            protein: data.targets.protein_grams?.toString() ?? '',
            carbs: data.targets.carbs_grams?.toString() ?? '',
            fat: data.targets.fat_grams?.toString() ?? '',
        });
        setReminders(data.prefs.reminders || {});
        setWaterGoal(String(data.prefs.hydrationGoalLiters ??
            data.survey?.water_target_liters ??
            2.5));
    }, [data]);
    useEffect(() => {
        if (typeof Notification === 'undefined')
            return;
        setNotifState(Notification.permission);
    }, []);
    const saveTargets = async () => {
        const num = (v) => (v.trim() === '' ? undefined : Number(v));
        const calories = num(targetForm.calories);
        if (calories != null && (calories < 1000 || calories > 5000)) {
            push('Calories must be between 1000 and 5000', 'error');
            return;
        }
        setSavingTargets(true);
        try {
            await targetApi.set({
                calories,
                protein_grams: num(targetForm.protein),
                carbs_grams: num(targetForm.carbs),
                fat_grams: num(targetForm.fat),
            });
            push('Targets updated');
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSavingTargets(false);
        }
    };
    const saveWaterGoal = async () => {
        const v = Number(waterGoal);
        if (!Number.isFinite(v) || v < 0.5 || v > 10) {
            push('Water goal must be between 0.5 and 10 liters', 'error');
            return;
        }
        setSavingWater(true);
        try {
            await prefApi.merge({ hydrationGoalLiters: Math.round(v * 10) / 10 });
            push('Water goal updated');
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSavingWater(false);
        }
    };
    const toggleReminder = async (key, value) => {
        setReminders((r) => ({ ...r, [key]: value }));
        try {
            await prefApi.merge({ reminders: { ...reminders, [key]: value } });
        }
        catch (err) {
            setReminders((r) => ({ ...r, [key]: !value }));
            push(apiError(err), 'error');
        }
    };
    const requestNotifications = async () => {
        if (typeof Notification === 'undefined') {
            push('This browser does not support notifications', 'error');
            return;
        }
        const result = await Notification.requestPermission();
        setNotifState(result);
        if (result === 'granted') {
            new Notification('Reminders enabled 🎉', { body: 'You will get nudges while the app is open.' });
        }
    };
    const testReminder = () => {
        if (notifState === 'granted') {
            new Notification('💧 Time to hydrate', { body: 'This is what a reminder looks like.' });
        }
        else {
            push('💧 Time to hydrate — this is what a reminder looks like');
        }
    };
    const changePassword = async () => {
        if (pwForm.new_.length < 6) {
            push('New password must be at least 6 characters', 'error');
            return;
        }
        if (pwForm.new_ !== pwForm.confirm) {
            push('Passwords do not match', 'error');
            return;
        }
        setSavingPw(true);
        try {
            await authApi.changePassword(pwForm.old, pwForm.new_);
            push('Password changed');
            setPwForm({ old: '', new_: '', confirm: '' });
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSavingPw(false);
        }
    };
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: reload });
    return (_jsxs("div", { className: "animate-fade-up space-y-5 max-w-2xl", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Settings" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "Tune your goals, reminders and account" })] }), _jsxs(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(User, { className: "w-4 h-4 text-teal-600" }), " Profile"] }), children: [_jsxs("div", { className: "flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 mb-4", children: [_jsx("span", { className: "w-11 h-11 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-white font-extrabold flex items-center justify-center text-lg uppercase", children: (user?.email || '?').slice(0, 1) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-bold text-slate-800", children: user?.email }), _jsx("p", { className: "text-xs text-slate-400", children: "Signed in" })] })] }), _jsxs("details", { children: [_jsx("summary", { className: "text-sm font-semibold text-teal-700 cursor-pointer select-none", children: "Change password" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3", children: [_jsx(Field, { label: "Current", children: _jsx("input", { type: "password", value: pwForm.old, onChange: (e) => setPwForm((f) => ({ ...f, old: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "New", children: _jsx("input", { type: "password", value: pwForm.new_, onChange: (e) => setPwForm((f) => ({ ...f, new_: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Confirm new", children: _jsx("input", { type: "password", value: pwForm.confirm, onChange: (e) => setPwForm((f) => ({ ...f, confirm: e.target.value })), className: inputCls }) })] }), _jsx(Button, { size: "sm", className: "mt-3", loading: savingPw, onClick: changePassword, children: "Update password" })] })] }), _jsxs(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Target, { className: "w-4 h-4 text-teal-600" }), " Goals & nutrition targets"] }), subtitle: data?.survey ? 'Your body-metrics survey is active — custom values below override it' : 'Tip: complete Body Metrics for auto-calculated targets', action: _jsx(Button, { variant: "ghost", size: "sm", onClick: () => navigate('/profile'), children: "Body metrics" }), children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Daily calories", children: _jsx("input", { type: "number", min: "1000", max: "5000", inputMode: "numeric", value: targetForm.calories, onChange: (e) => setTargetForm((f) => ({ ...f, calories: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Protein (g)", children: _jsx("input", { type: "number", min: "0", inputMode: "numeric", value: targetForm.protein, onChange: (e) => setTargetForm((f) => ({ ...f, protein: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Carbs (g)", children: _jsx("input", { type: "number", min: "0", inputMode: "numeric", value: targetForm.carbs, onChange: (e) => setTargetForm((f) => ({ ...f, carbs: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Fat (g)", children: _jsx("input", { type: "number", min: "0", inputMode: "numeric", value: targetForm.fat, onChange: (e) => setTargetForm((f) => ({ ...f, fat: e.target.value })), className: inputCls }) })] }), _jsxs(Button, { className: "mt-4", loading: savingTargets, onClick: saveTargets, children: [_jsx(Check, { className: "w-4 h-4" }), " Save targets"] })] }), _jsx(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Droplets, { className: "w-4 h-4 text-sky-500" }), " Hydration goal"] }), children: _jsxs("div", { className: "flex items-end gap-3", children: [_jsx(Field, { label: "Daily water goal (liters)", children: _jsx("input", { type: "number", min: "0.5", max: "10", step: "0.1", inputMode: "decimal", value: waterGoal, onChange: (e) => setWaterGoal(e.target.value), className: `${inputCls} max-w-36 text-center text-xl font-bold` }) }), _jsx(Button, { loading: savingWater, onClick: saveWaterGoal, children: "Save" })] }) }), _jsxs(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(Bell, { className: "w-4 h-4 text-amber-500" }), " Reminders"] }), subtitle: "Reminders fire while the app is open", action: notifState === 'granted' ? (_jsx(Chip, { color: "emerald", children: "Notifications on" })) : notifState === 'denied' ? (_jsx(Chip, { color: "rose", children: "Blocked in browser" })) : notifState === 'unsupported' ? (_jsx(Chip, { color: "slate", children: "Not supported" })) : (_jsx(Button, { size: "sm", variant: "secondary", onClick: requestNotifications, children: "Enable" })), children: [_jsx("div", { className: "space-y-1", children: REMINDERS.map((r) => (_jsxs("div", { className: "flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-slate-700", children: r.label }), _jsx("p", { className: "text-xs text-slate-400", children: r.detail })] }), _jsx(Toggle, { checked: !!reminders[r.key], onChange: (v) => toggleReminder(r.key, v), label: r.label })] }, r.key))) }), _jsxs("div", { className: "flex items-center justify-between mt-3", children: [_jsx("p", { className: "text-xs text-slate-400", children: notifState === 'granted'
                                    ? 'Browser notifications are enabled.'
                                    : notifState === 'denied'
                                        ? 'Reminders will appear in-app while it is open.'
                                        : 'Enable browser notifications, or reminders appear in-app.' }), _jsx(Button, { variant: "ghost", size: "sm", onClick: testReminder, children: "Test" })] })] }), _jsx(Card, { title: "Meal preferences", children: _jsxs("p", { className: "text-sm text-slate-500", children: ["Dietary preferences, disliked foods and allergies for the meal planner live on the", ' ', _jsx("button", { onClick: () => navigate('/meal-plan'), className: "font-semibold text-teal-600 hover:underline", children: "Meal Planner" }), ' ', "page."] }) }), _jsx(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(ShieldCheck, { className: "w-4 h-4 text-emerald-600" }), " Privacy & data"] }), children: _jsxs("ul", { className: "space-y-2 text-sm text-slate-500", children: [_jsx("li", { children: "\u2022 Your logs live on your own account and are only visible to you." }), _jsx("li", { children: "\u2022 The coach uses only your logged data \u2014 no data is sent to third parties." }), _jsx("li", { children: "\u2022 Coach conversation history is stored locally on this device and can be cleared from the Coach page." })] }) }), _jsx(Card, { title: _jsxs("span", { className: "flex items-center gap-2", children: [_jsx(LogOut, { className: "w-4 h-4 text-rose-500" }), " Account"] }), children: _jsx(Button, { variant: "danger", onClick: () => {
                        logout();
                        navigate('/login');
                    }, children: "Log out" }) })] }));
};
