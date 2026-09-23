import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { PrivateRoute } from '@/components/PrivateRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { WhatsAppWidget } from '@/components/WhatsAppWidget';

const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FoodLogPage = lazy(() => import('@/pages/FoodLogPage').then((m) => ({ default: m.FoodLogPage })));
const HydrationPage = lazy(() => import('@/pages/HydrationPage').then((m) => ({ default: m.HydrationPage })));
const SleepPage = lazy(() => import('@/pages/SleepPage').then((m) => ({ default: m.SleepPage })));
const WeightPage = lazy(() => import('@/pages/WeightPage').then((m) => ({ default: m.WeightPage })));
const CoachingPage = lazy(() => import('@/pages/CoachingPage').then((m) => ({ default: m.CoachingPage })));
// RecipesPage was built, exported, backed by four API endpoints and a Hebrew
// recipe file on disk — and never imported here or listed in the nav. The chef
// product docs/product-truth.md calls the differentiator had no door.
const RecipesPage = lazy(() => import('@/pages/RecipesPage').then((m) => ({ default: m.RecipesPage })));
const TargetsPage = lazy(() => import('@/pages/TargetsPage').then((m) => ({ default: m.TargetsPage })));

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
  </div>
);

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/food-log"
        element={
          <PrivateRoute>
            <AppLayout>
              <FoodLogPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/hydration"
        element={
          <PrivateRoute>
            <AppLayout>
              <HydrationPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/sleep"
        element={
          <PrivateRoute>
            <AppLayout>
              <SleepPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/weight"
        element={
          <PrivateRoute>
            <AppLayout>
              <WeightPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/coaching"
        element={
          <PrivateRoute>
            <AppLayout>
              <CoachingPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/recipes"
        element={
          <PrivateRoute>
            <AppLayout>
              <RecipesPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/targets"
        element={
          <PrivateRoute>
            <AppLayout>
              <TargetsPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <Router>
      <LanguageProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
        <WhatsAppWidget />
      </LanguageProvider>
    </Router>
  );
}

export default App;
