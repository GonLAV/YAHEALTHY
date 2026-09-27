import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { OnboardingProvider } from '@/hooks/useOnboarding';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { PrivateRoute } from '@/components/PrivateRoute';
import { StaffRoute } from '@/components/StaffRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { WhatsAppWidget } from '@/components/WhatsAppWidget';

const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FoodLogPage = lazy(() => import('@/pages/FoodLogPage').then((m) => ({ default: m.FoodLogPage })));
const HydrationPage = lazy(() => import('@/pages/HydrationPage').then((m) => ({ default: m.HydrationPage })));
const SleepPage = lazy(() => import('@/pages/SleepPage').then((m) => ({ default: m.SleepPage })));
const WeightPage = lazy(() => import('@/pages/WeightPage').then((m) => ({ default: m.WeightPage })));
const CoachingPage = lazy(() => import('@/pages/CoachingPage').then((m) => ({ default: m.CoachingPage })));
const ProgressPage = lazy(() => import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const InvitePage = lazy(() => import('@/pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));
const MarketingDashboardPage = lazy(() =>
  import('@/pages/MarketingDashboardPage').then((m) => ({ default: m.MarketingDashboardPage })),
);

const PageLoader = () => (
  <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
  </div>
);

// The public front door. Someone already signed in has no use for the pitch,
// so they go straight to their dashboard.
const HomeRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <PageLoader />;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />;
};

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* Full-screen wizard, no app chrome. Every other private route sends
          not-yet-onboarded users here (see PrivateRoute). */}
      <Route
        path="/onboarding"
        element={
          <PrivateRoute allowIncompleteOnboarding>
            <OnboardingPage />
          </PrivateRoute>
        }
      />
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
        path="/progress"
        element={
          <PrivateRoute>
            <AppLayout>
              <ProgressPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/achievements"
        element={
          <PrivateRoute>
            <AppLayout>
              <AchievementsPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/invite"
        element={
          <PrivateRoute>
            <AppLayout>
              <InvitePage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/marketing"
        element={
          <StaffRoute>
            <AppLayout>
              <MarketingDashboardPage />
            </AppLayout>
          </StaffRoute>
        }
      />
      <Route path="/" element={<HomeRoute />} />
      {/* Unknown paths land on "/", which sends signed-in users on to /dashboard. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

function App() {
  return (
    <Router>
      <LanguageProvider>
        <AuthProvider>
          <OnboardingProvider>
            <AppRoutes />
          </OnboardingProvider>
        </AuthProvider>
        <WhatsAppWidget />
      </LanguageProvider>
    </Router>
  );
}

export default App;
