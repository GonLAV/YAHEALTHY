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
const RecipesPage = lazy(() => import('@/pages/RecipesPage').then((m) => ({ default: m.RecipesPage })));

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
const Navigation = () => {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <nav className="bg-white shadow">
      <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="font-bold text-xl text-indigo-600">YAHealthy</div>
        <div className="flex space-x-6">
          <Link to="/dashboard" className="text-gray-600 hover:text-gray-900">
            Dashboard
          </Link>
          <Link to="/food-log" className="text-gray-600 hover:text-gray-900">
            Food Log
          </Link>
          <Link to="/coaching" className="text-gray-600 hover:text-gray-900">
            Coaching
          </Link>
          <Link to="/recipes" className="text-gray-600 hover:text-gray-900">
            Recipes
          </Link>
          <span className="text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            className="text-red-600 hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
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
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </Suspense>
);
            </PrivateRoute>
          }
        />
        <Route
          path="/recipes"
          element={
            <PrivateRoute>
              <RecipesPage />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Suspense>
  );
};

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
