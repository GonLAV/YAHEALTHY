import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
export const PrivateRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-[60vh] gap-3", children: [_jsx("span", { className: "w-9 h-9 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" }), _jsx("p", { className: "text-sm text-slate-400", children: "Checking your session\u2026" })] }));
    }
    return isAuthenticated ? _jsx(_Fragment, { children: children }) : _jsx(Navigate, { to: "/login" });
};
