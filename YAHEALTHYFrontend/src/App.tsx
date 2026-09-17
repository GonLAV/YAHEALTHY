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

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
    <span className="w-9 h-9 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    <p className="text-sm text-slate-400">Loading…</p>
  </div>
);

/** Fires user-enabled reminders while the app is open (notifications or in-app toasts). */
const ReminderEngine = () => {
  const { isAuthenticated } = useAuth();
  const { push } = useToast();
  useReminders(isAuthenticated ? (msg) => push(msg) : undefined);
  return null;
};

const protectedRoutes = [
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/food-log', element: <FoodLogPage /> },
  { path: '/recipes', element: <RecipesPage /> },
  { path: '/meal-plan', element: <MealPlanPage /> },
  { path: '/health', element: <HealthPage /> },
  { path: '/progress', element: <ProgressPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/reports', element: <ReportsPage /> },
  { path: '/coach', element: <CoachPage /> },
  { path: '/achievements', element: <AchievementsPage /> },
  { path: '/favorites', element: <FavoritesPage /> },
  { path: '/settings', element: <SettingsPage /> },
];

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {protectedRoutes.map((r) => (
        <Route
          key={r.path}
          path={r.path}
          element={<PrivateRoute>{r.element}</PrivateRoute>}
        />
      ))}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <ReminderEngine />
          <AppShell>
            <AppRoutes />
          </AppShell>
        </AuthProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
