import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { PrivateRoute } from '@/components/PrivateRoute';
import { AppShell } from '@/components/Layout';
import { ToastProvider, useToast } from '@/hooks/useToast';
import { useReminders } from '@/hooks/useReminders';
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FoodLogPage = lazy(() => import('@/pages/FoodLogPage').then((m) => ({ default: m.FoodLogPage })));
const RecipesPage = lazy(() => import('@/pages/RecipesPage').then((m) => ({ default: m.RecipesPage })));
const MealPlanPage = lazy(() => import('@/pages/MealPlanPage').then((m) => ({ default: m.MealPlanPage })));
const HealthPage = lazy(() => import('@/pages/HealthPage').then((m) => ({ default: m.HealthPage })));
const ProgressPage = lazy(() => import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const CoachPage = lazy(() => import('@/pages/CoachPage').then((m) => ({ default: m.CoachPage })));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const PageLoader = () => (_jsxs("div", { className: "flex flex-col items-center justify-center min-h-[60vh] gap-3", children: [_jsx("span", { className: "w-9 h-9 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" }), _jsx("p", { className: "text-sm text-slate-400", children: "Loading\u2026" })] }));
/** Fires user-enabled reminders while the app is open (notifications or in-app toasts). */
const ReminderEngine = () => {
    const { isAuthenticated } = useAuth();
    const { push } = useToast();
    useReminders(isAuthenticated ? (msg) => push(msg) : undefined);
    return null;
};
const protectedRoutes = [
    { path: '/dashboard', element: _jsx(DashboardPage, {}) },
    { path: '/food-log', element: _jsx(FoodLogPage, {}) },
    { path: '/recipes', element: _jsx(RecipesPage, {}) },
    { path: '/meal-plan', element: _jsx(MealPlanPage, {}) },
    { path: '/health', element: _jsx(HealthPage, {}) },
    { path: '/progress', element: _jsx(ProgressPage, {}) },
    { path: '/profile', element: _jsx(ProfilePage, {}) },
    { path: '/reports', element: _jsx(ReportsPage, {}) },
    { path: '/coach', element: _jsx(CoachPage, {}) },
    { path: '/achievements', element: _jsx(AchievementsPage, {}) },
    { path: '/favorites', element: _jsx(FavoritesPage, {}) },
    { path: '/settings', element: _jsx(SettingsPage, {}) },
];
const AppRoutes = () => (_jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/signup", element: _jsx(SignupPage, {}) }), protectedRoutes.map((r) => (_jsx(Route, { path: r.path, element: _jsx(PrivateRoute, { children: r.element }) }, r.path))), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/dashboard", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/dashboard", replace: true }) })] }) }));
function App() {
    return (_jsx(Router, { children: _jsx(ToastProvider, { children: _jsxs(AuthProvider, { children: [_jsx(ReminderEngine, {}), _jsx(AppShell, { children: _jsx(AppRoutes, {}) })] }) }) }));
}
export default App;
