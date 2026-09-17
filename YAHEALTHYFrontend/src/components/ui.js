import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { X, RefreshCw, Inbox } from 'lucide-react';
export function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', ...rest }) {
    const variants = {
        primary: 'bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 shadow-sm',
        secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
        ghost: 'text-slate-600 hover:bg-slate-100',
        danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
        soft: 'bg-teal-50 text-teal-700 hover:bg-teal-100',
    };
    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-5 py-3 text-base',
    };
    return (_jsxs("button", { ...rest, disabled: rest.disabled || loading, className: `inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`, children: [loading && _jsx("span", { className: "w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" }), children] }));
}
// ---------- Card ----------
export function Card({ children, className = '', title, subtitle, action, padded = true, }) {
    return (_jsxs("section", { className: `bg-white rounded-2xl shadow-sm border border-slate-100 ${className}`, children: [(title || action) && (_jsxs("header", { className: "flex items-start justify-between gap-3 px-5 pt-5 pb-3", children: [_jsxs("div", { children: [title && _jsx("h2", { className: "text-base font-bold text-slate-900", children: title }), subtitle && _jsx("p", { className: "text-sm text-slate-500 mt-0.5", children: subtitle })] }), action] })), _jsx("div", { className: padded ? 'px-5 pb-5 pt-3' : 'pb-5 pt-3', children: children })] }));
}
// ---------- Progress ----------
export function ProgressRing({ percent, size = 120, stroke = 10, color = '#0d9488', trackColor = '#e2e8f0', children, }) {
    const clamped = Math.max(0, Math.min(100, percent));
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (_jsxs("div", { className: "relative inline-flex items-center justify-center", style: { width: size, height: size }, children: [_jsxs("svg", { width: size, height: size, className: "-rotate-90", children: [_jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: trackColor, strokeWidth: stroke }), _jsx("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: c - (clamped / 100) * c, style: { transition: 'stroke-dashoffset 0.6s ease' } })] }), _jsx("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: children })] }));
}
export function ProgressBar({ value, max, color = 'bg-teal-500', className = '', }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (_jsx("div", { className: `h-2.5 bg-slate-100 rounded-full overflow-hidden ${className}`, children: _jsx("div", { className: `h-full rounded-full ${color} transition-all duration-500`, style: { width: `${pct}%` } }) }));
}
// ---------- States ----------
export function Skeleton({ className = '' }) {
    return _jsx("div", { className: `animate-pulse bg-slate-100 rounded-xl ${className}` });
}
export function SkeletonCard({ lines = 3 }) {
    return (_jsxs("div", { className: "bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3", children: [_jsx(Skeleton, { className: "h-4 w-1/3" }), Array.from({ length: lines }).map((_, i) => (_jsx(Skeleton, { className: "h-8 w-full" }, i)))] }));
}
export function EmptyState({ icon, title, text, action, }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center text-center py-10 px-6", children: [_jsx("div", { className: "w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4", children: icon ?? _jsx(Inbox, { className: "w-7 h-7" }) }), _jsx("h3", { className: "font-bold text-slate-900", children: title }), text && _jsx("p", { className: "text-sm text-slate-500 mt-1 max-w-xs", children: text }), action && _jsx("div", { className: "mt-5", children: action })] }));
}
export function ErrorState({ message, onRetry }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center text-center py-10 px-6", children: [_jsx("div", { className: "w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-4", children: _jsx(X, { className: "w-7 h-7" }) }), _jsx("h3", { className: "font-bold text-slate-900", children: "Couldn't load this" }), _jsx("p", { className: "text-sm text-slate-500 mt-1 max-w-xs", children: message || 'Something went wrong on our side.' }), onRetry && (_jsxs(Button, { variant: "secondary", size: "sm", className: "mt-5", onClick: onRetry, children: [_jsx(RefreshCw, { className: "w-4 h-4" }), " Try again"] }))] }));
}
// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide = false, }) {
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open)
        return null;
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]", onClick: onClose, "aria-hidden": true }), _jsxs("div", { role: "dialog", "aria-modal": "true", className: `relative bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[88vh] flex flex-col animate-fade-up`, children: [_jsxs("div", { className: "flex items-center justify-between px-5 pt-5 pb-2", children: [_jsx("h2", { className: "text-lg font-bold text-slate-900", children: title }), _jsx("button", { onClick: onClose, "aria-label": "Close", className: "w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center", children: _jsx(X, { className: "w-5 h-5" }) })] }), _jsx("div", { className: "px-5 pb-6 overflow-y-auto", children: children })] })] }));
}
// ---------- Form primitives ----------
export const inputCls = 'w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition';
export function Field({ label, hint, error, children, }) {
    return (_jsxs("label", { className: "block", children: [_jsx("span", { className: "block text-sm font-semibold text-slate-700 mb-1.5", children: label }), children, hint && !error && _jsx("span", { className: "block text-xs text-slate-400 mt-1", children: hint }), error && _jsx("span", { className: "block text-xs text-rose-600 mt-1", children: error })] }));
}
export function Segmented({ options, value, onChange, className = '', }) {
    return (_jsx("div", { className: `inline-flex bg-slate-100 rounded-xl p-1 gap-1 ${className}`, children: options.map((o) => (_jsx("button", { type: "button", onClick: () => onChange(o.value), className: `px-3.5 py-1.5 text-sm font-semibold rounded-lg transition ${value === o.value ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`, children: o.label }, o.value))) }));
}
export function Toggle({ checked, onChange, label }) {
    return (_jsx("button", { type: "button", role: "switch", "aria-checked": checked, onClick: () => onChange(!checked), className: `relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-teal-600' : 'bg-slate-300'}`, "aria-label": label, children: _jsx("span", { className: `absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}` }) }));
}
// ---------- Chips / tags ----------
export function Chip({ children, color = 'slate', className = '', }) {
    const colors = {
        slate: 'bg-slate-100 text-slate-600',
        teal: 'bg-teal-50 text-teal-700',
        amber: 'bg-amber-50 text-amber-700',
        purple: 'bg-purple-50 text-purple-700',
        sky: 'bg-sky-50 text-sky-700',
        indigo: 'bg-indigo-50 text-indigo-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        rose: 'bg-rose-50 text-rose-700',
    };
    return (_jsx("span", { className: `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color]} ${className}`, children: children }));
}
