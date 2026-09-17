import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { Info, Ruler, PersonStanding } from 'lucide-react';
import { Card, Button, Field, inputCls, ErrorState, SkeletonCard } from '@/components/ui';
import { surveyApi, apiError } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
const LIFESTYLES = [
    { value: 'sedentary', label: 'Sedentary — desk job, little exercise' },
    { value: 'light', label: 'Lightly active — 1-3 workouts a week' },
    { value: 'moderate', label: 'Moderately active — 3-5 workouts a week' },
    { value: 'very_active', label: 'Very active — 6-7 workouts a week' },
    { value: 'extra_active', label: 'Extra active — physical job or athlete' },
];
export const ProfilePage = () => {
    const { data, loading, error, reload } = useAsync(() => surveyApi.list().then((r) => r.data || []), []);
    const [form, setForm] = useState({
        gender: 'female',
        age: '',
        heightCm: '',
        weightKg: '',
        targetWeightKg: '',
        targetDays: '90',
        lifestyle: 'light',
    });
    const [saving, setSaving] = useState(false);
    const { push } = useToast();
    const latest = data?.[0] ?? null;
    const load = useCallback(() => reload(), [reload]);
    const save = async () => {
        const age = Number(form.age);
        const height = Number(form.heightCm);
        const weight = Number(form.weightKg);
        if (!Number.isFinite(age) || age < 10 || age > 120) {
            push('Age must be between 10 and 120', 'error');
            return;
        }
        if (!Number.isFinite(height) || height < 100 || height > 250) {
            push('Height must be between 100 and 250 cm', 'error');
            return;
        }
        if (!Number.isFinite(weight) || weight < 30 || weight > 300) {
            push('Weight must be between 30 and 300 kg', 'error');
            return;
        }
        setSaving(true);
        try {
            await surveyApi.create({
                gender: form.gender,
                age,
                heightCm: height,
                weightKg: weight,
                targetWeightKg: form.targetWeightKg ? Number(form.targetWeightKg) : null,
                targetDays: form.targetDays ? Number(form.targetDays) : null,
                lifestyle: form.lifestyle,
            });
            push('Body metrics updated — targets recalculated');
            reload();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSaving(false);
        }
    };
    if (loading && !data)
        return _jsx(SkeletonCard, {});
    if (error)
        return _jsx(ErrorState, { message: error, onRetry: load });
    const dailyCal = latest?.daily_calories;
    const targetCal = typeof dailyCal === 'object' && dailyCal ? dailyCal.targetDailyCalories : typeof dailyCal === 'number' ? dailyCal : null;
    return (_jsxs("div", { className: "animate-fade-up space-y-5", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight", children: "Body Metrics" }), _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: "One quick survey powers your calorie, protein, water and sleep targets" })] }), latest && (_jsxs(Card, { title: "Your latest metrics", subtitle: `From survey on ${latest.created_at.slice(0, 10)}`, children: [_jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3", children: [_jsx(Metric, { label: "Daily calories", value: targetCal ? `${targetCal}` : '—', unit: "kcal", accent: "text-teal-700" }), _jsx(Metric, { label: "Protein target", value: `${latest.protein_target_g}`, unit: "g", accent: "text-teal-600" }), _jsx(Metric, { label: "Water target", value: `${latest.water_target_liters}`, unit: "L", accent: "text-sky-600" }), _jsx(Metric, { label: "Sleep target", value: `${latest.sleep_target_hours}`, unit: "h", accent: "text-indigo-600" }), _jsx(Metric, { label: "BMI", value: `${latest.bmi}`, unit: "", accent: "text-slate-800" }), _jsx(Metric, { label: "Body fat est.", value: `${latest.body_fat_percent}`, unit: "%", accent: "text-slate-800" }), _jsx(Metric, { label: "BMR", value: `${latest.bmr}`, unit: "kcal", accent: "text-slate-800" }), _jsx(Metric, { label: "TDEE", value: `${latest.tdee}`, unit: "kcal", accent: "text-slate-800" })] }), _jsxs("div", { className: "flex items-start gap-2 mt-4 rounded-xl bg-slate-50 px-4 py-3", children: [_jsx(Info, { className: "w-4 h-4 text-slate-400 shrink-0 mt-0.5" }), _jsx("p", { className: "text-xs text-slate-500", children: "BMI is a general screening metric, not a medical diagnosis. Body fat % and BMR are estimates based on population formulas \u2014 useful for tracking direction, not absolute truth." })] })] })), _jsxs(Card, { title: latest ? 'Update your metrics' : 'Complete your profile', subtitle: "Takes 30 seconds \u2014 everything else in the app gets smarter", children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsx(Field, { label: "Gender", children: _jsxs("select", { value: form.gender, onChange: (e) => setForm((f) => ({ ...f, gender: e.target.value })), className: inputCls, children: [_jsx("option", { value: "female", children: "Female" }), _jsx("option", { value: "male", children: "Male" })] }) }), _jsx(Field, { label: "Age", children: _jsx("input", { type: "number", min: "10", max: "120", inputMode: "numeric", value: form.age, onChange: (e) => setForm((f) => ({ ...f, age: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Height (cm)", children: _jsxs("div", { className: "relative", children: [_jsx(Ruler, { className: "w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" }), _jsx("input", { type: "number", min: "100", max: "250", inputMode: "numeric", value: form.heightCm, onChange: (e) => setForm((f) => ({ ...f, heightCm: e.target.value })), className: `${inputCls} pl-10` })] }) }), _jsx(Field, { label: "Weight (kg)", children: _jsx("input", { type: "number", min: "30", max: "300", step: "0.1", inputMode: "decimal", value: form.weightKg, onChange: (e) => setForm((f) => ({ ...f, weightKg: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Target weight (kg, optional)", children: _jsx("input", { type: "number", min: "30", max: "300", step: "0.1", inputMode: "decimal", value: form.targetWeightKg, onChange: (e) => setForm((f) => ({ ...f, targetWeightKg: e.target.value })), className: inputCls }) }), _jsx(Field, { label: "Timeframe (days, optional)", children: _jsx("input", { type: "number", min: "7", max: "365", inputMode: "numeric", value: form.targetDays, onChange: (e) => setForm((f) => ({ ...f, targetDays: e.target.value })), className: inputCls }) }), _jsx("div", { className: "sm:col-span-2", children: _jsx(Field, { label: "Activity level", children: _jsx("select", { value: form.lifestyle, onChange: (e) => setForm((f) => ({ ...f, lifestyle: e.target.value })), className: inputCls, children: LIFESTYLES.map((l) => (_jsx("option", { value: l.value, children: l.label }, l.value))) }) }) })] }), _jsxs(Button, { className: "w-full mt-5", loading: saving, onClick: save, children: [_jsx(PersonStanding, { className: "w-4 h-4" }), " ", latest ? 'Update metrics' : 'Calculate my targets'] }), latest && (_jsx("p", { className: "text-xs text-slate-400 mt-3 text-center", children: "Updating creates a new survey \u2014 your calorie & protein targets across the app refresh automatically." }))] })] }));
};
function Metric({ label, value, unit, accent }) {
    return (_jsxs("div", { className: "rounded-2xl bg-slate-50 px-4 py-3", children: [_jsx("p", { className: "text-xs font-semibold text-slate-400 uppercase tracking-wide", children: label }), _jsxs("p", { className: `text-2xl font-extrabold tabular mt-1 ${accent}`, children: [value, unit && _jsx("span", { className: "text-sm text-slate-400 font-bold ml-0.5", children: unit })] })] }));
}
