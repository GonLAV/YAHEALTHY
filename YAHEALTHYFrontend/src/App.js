import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { PrivateRoute } from '@/components/PrivateRoute';
import './App.css';
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FoodLogPage = lazy(() => import('@/pages/FoodLogPage').then((m) => ({ default: m.FoodLogPage })));
const CoachingPage = lazy(() => import('@/pages/CoachingPage').then((m) => ({ default: m.CoachingPage })));
const PageLoader = () => (_jsx("div", { className: "flex items-center justify-center min-h-screen", children: "Loading..." }));
const Navigation = () => {
    const { isAuthenticated, user, logout } = useAuth();
    if (!isAuthenticated)
        return null;
    return (_jsx("nav", { className: "bg-white shadow", children: _jsxs("div", { className: "max-w-6xl mx-auto px-4 py-4 flex justify-between items-center", children: [_jsx("div", { className: "font-bold text-xl text-indigo-600", children: "YAHealthy" }), _jsxs("div", { className: "flex space-x-6", children: [_jsx(Link, { to: "/dashboard", className: "text-gray-600 hover:text-gray-900", children: "Dashboard" }), _jsx(Link, { to: "/food-log", className: "text-gray-600 hover:text-gray-900", children: "Food Log" }), _jsx(Link, { to: "/coaching", className: "text-gray-600 hover:text-gray-900", children: "Coaching" }), _jsx("span", { className: "text-gray-600", children: user?.email }), _jsx("button", { onClick: logout, className: "text-red-600 hover:text-red-700", children: "Logout" })] })] }) }));
};
const AppRoutes = () => {
    return (_jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/signup", element: _jsx(SignupPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(PrivateRoute, { children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/food-log", element: _jsx(PrivateRoute, { children: _jsx(FoodLogPage, {}) }) }), _jsx(Route, { path: "/coaching", element: _jsx(PrivateRoute, { children: _jsx(CoachingPage, {}) }) }), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/dashboard" }) })] }) }));
};
function App() {
    return (_jsx(Router, { children: _jsxs(AuthProvider, { children: [_jsx(Navigation, {}), _jsx(AppRoutes, {})] }) }));
}
export default App;
