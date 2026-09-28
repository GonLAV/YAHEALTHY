import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
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
// Public: buying and booking need no account. /welcome and /payment-failed are
// where PayPlus sends people back to — the server named them long before they
// existed, so a buyer used to land on the catch-all and see a login screen.
const StaffPage = lazy(() => import('@/pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const ShoppingPage = lazy(() => import('@/pages/ShoppingPage').then((m) => ({ default: m.ShoppingPage })));
const PricingPage = lazy(() => import('@/pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const BookingPage = lazy(() => import('@/pages/BookingPage').then((m) => ({ default: m.BookingPage })));
const BookingConfirmedPage = lazy(() => import('@/pages/ResultPages').then((m) => ({ default: m.BookingConfirmedPage })));
const WelcomePage = lazy(() => import('@/pages/ResultPages').then((m) => ({ default: m.WelcomePage })));
const PaymentFailedPage = lazy(() => import('@/pages/ResultPages').then((m) => ({ default: m.PaymentFailedPage })));
const ProgressPage = lazy(() => import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));

// The server mails links to /reset-password (every new customer gets one right
// after paying) — the page did not exist, so a buyer could never sign in.
const ResetPasswordPage = lazy(() => import('@/pages/PasswordPages').then((m) => ({ default: m.ResetPasswordPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })));
const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })));

const PageLoader = () => (
  <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
  </div>
);

// The root used to send everyone to /dashboard, which sent every visitor on
// to a login screen: the first thing a stranger saw was a password field. A
// visitor now gets the landing page; someone signed in still goes straight in.
const Home = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
};

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/book" element={<BookingPage />} />
      <Route path="/book/confirmed" element={<BookingConfirmedPage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/payment-failed" element={<PaymentFailedPage />} />
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
      <Route
        path="/shopping"
        element={
          <PrivateRoute>
            <AppLayout>
              <ShoppingPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/staff"
        element={
          <PrivateRoute>
            <AppLayout>
              <StaffPage />
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
      <Route path="/" element={<Home />} />
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
