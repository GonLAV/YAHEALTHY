import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
const ToastContext = createContext({
    push: () => { },
});
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const push = useCallback((message, type = 'success') => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, message, type }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    }, []);
    return (_jsxs(ToastContext.Provider, { value: { push }, children: [children, _jsx("div", { className: "fixed inset-x-0 bottom-20 md:bottom-6 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none", children: toasts.map((t) => (_jsxs("div", { role: "status", className: `animate-toast-in flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg max-w-md ${t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`, children: [t.type === 'success' ? _jsx(CheckCircle2, { className: "w-4 h-4 shrink-0" }) : _jsx(AlertCircle, { className: "w-4 h-4 shrink-0" }), _jsx("span", { children: t.message })] }, t.id))) })] }));
};
export const useToast = () => useContext(ToastContext);
