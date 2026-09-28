import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { OnboardingProvider } from '@/hooks/useOnboarding';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { PrivateRoute } from '@/components/PrivateRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { WhatsAppWidget } from '@/components/WhatsAppWidget';
import { captureAttribution } from '@/utils/attribution';
import type { Lang } from '@/i18n/translations';

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
const GuidesIndexPage = lazy(() => import('@/pages/GuidesPage').then((m) => ({ default: m.GuidesIndexPage })));
const GuidePage = lazy(() => import('@/pages/GuidesPage').then((m) => ({ default: m.GuidePage })));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));

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

/**
 * In-app links can carry campaign tags too (a guide's signup button has
 * utm_source=seo…). main.tsx captures the first page load; this catches the
 * same on client-side navigation. captureAttribution keeps first-touch rules.
 */
const AttributionOnNavigate = () => {
  const { search } = useLocation();
  useEffect(() => {
    if (search) captureAttribution();
  }, [search]);
  return null;
};

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <AttributionOnNavigate />
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
      {/* Public, indexable pages. Hebrew at the root, English under /en.
          Keep in step with src/seo/site.ts (sitemap + prerender). */}
      <Route path="/" element={<HomeRoute />} />
      <Route path="/en" element={<HomeRoute />} />
      <Route path="/guides" element={<GuidesIndexPage />} />
      <Route path="/en/guides" element={<GuidesIndexPage />} />
      <Route path="/guides/:slug" element={<GuidePage />} />
      <Route path="/en/guides/:slug" element={<GuidePage />} />
      {/* Unknown paths land on "/", which sends signed-in users on to /dashboard. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

/**
 * Everything inside the router. The browser wraps it in BrowserRouter (App);
 * the build-time prerender wraps it in StaticRouter (src/entry-server.tsx).
 */
export function AppShell({ initialLang }: { initialLang?: Lang }) {
  return (
    <LanguageProvider initialLang={initialLang}>
      <AuthProvider>
        <OnboardingProvider>
          <AppRoutes />
        </OnboardingProvider>
      </AuthProvider>
      <WhatsAppWidget />
    </LanguageProvider>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
