import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Utensils, CalendarRange, HeartPulse, Sparkles, Search, ChevronDown, Leaf, } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { GlobalSearch } from '@/components/GlobalSearch';
const primaryNav = [
    { to: '/dashboard', label: 'Home', icon: Home },
    { to: '/food-log', label: 'Food', icon: Utensils },
    { to: '/meal-plan', label: 'Plan', icon: CalendarRange },
    { to: '/health', label: 'Health', icon: HeartPulse },
    { to: '/coach', label: 'Coach', icon: Sparkles },
];
const moreNav = [
    { to: '/recipes', label: 'Recipes' },
    { to: '/progress', label: 'Progress & Weight' },
    { to: '/reports', label: 'Weekly Report' },
    { to: '/achievements', label: 'Achievements' },
    { to: '/favorites', label: 'Favorites' },
    { to: '/profile', label: 'Body Metrics' },
    { to: '/settings', label: 'Settings' },
];
export const AppShell = ({ children }) => {
    const { isAuthenticated, user, logout } = useAuth();
    const [searchOpen, setSearchOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const navigate = useNavigate();
    if (!isAuthenticated)
        return _jsx(_Fragment, { children: children });
    const linkCls = ({ isActive }) => `px-3 py-2 rounded-xl text-sm font-semibold transition ${isActive ? 'text-teal-700 bg-teal-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`;
    return (_jsxs("div", { className: "min-h-screen flex flex-col", children: [_jsx("header", { className: "sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100", children: _jsxs("div", { className: "max-w-6xl mx-auto px-4 h-16 flex items-center gap-2", children: [_jsxs(NavLink, { to: "/dashboard", className: "flex items-center gap-2 mr-2", children: [_jsx("span", { className: "w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-sm", children: _jsx(Leaf, { className: "w-5 h-5" }) }), _jsxs("span", { className: "font-extrabold text-lg tracking-tight text-slate-900", children: ["YA", _jsx("span", { className: "text-teal-600", children: "Healthy" })] })] }), _jsxs("nav", { className: "hidden md:flex items-center gap-1 flex-1", children: [primaryNav.map((n) => (_jsx(NavLink, { to: n.to, className: linkCls, children: n.label }, n.to))), _jsxs("div", { className: "relative", children: [_jsxs("button", { onClick: () => setMenuOpen((v) => !v), className: "px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-1", children: ["More ", _jsx(ChevronDown, { className: "w-4 h-4" })] }), menuOpen && (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-10", onClick: () => setMenuOpen(false) }), _jsxs("div", { className: "absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20", children: [moreNav.map((n) => (_jsx("button", { onClick: () => {
                                                                setMenuOpen(false);
                                                                navigate(n.to);
                                                            }, className: "w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700", children: n.label }, n.to))), _jsxs("div", { className: "border-t border-slate-100 mt-1 pt-1", children: [_jsx("div", { className: "px-4 py-2 text-xs text-slate-400 truncate", children: user?.email }), _jsx("button", { onClick: () => {
                                                                        setMenuOpen(false);
                                                                        logout();
                                                                        navigate('/login');
                                                                    }, className: "w-full text-left px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50", children: "Log out" })] })] })] }))] })] }), _jsx("div", { className: "flex-1 md:hidden" }), _jsx("button", { onClick: () => setSearchOpen(true), "aria-label": "Search", className: "w-10 h-10 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center", children: _jsx(Search, { className: "w-5 h-5" }) })] }) }), _jsx("main", { className: "flex-1 w-full max-w-6xl mx-auto px-4 pt-6 pb-28 md:pb-10", children: children }), _jsx("nav", { className: "md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-100 pb-safe", children: _jsx("div", { className: "grid grid-cols-5 px-2 pt-1.5", children: primaryNav.map((n) => (_jsxs(NavLink, { to: n.to, className: ({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] font-semibold transition ${isActive ? 'text-teal-600' : 'text-slate-400'}`, children: [_jsx(n.icon, { className: "w-[22px] h-[22px]" }), n.label] }, n.to))) }) }), _jsx(GlobalSearch, { open: searchOpen, onClose: () => setSearchOpen(false) })] }));
};
