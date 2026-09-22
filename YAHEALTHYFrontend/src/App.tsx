import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { PrivateRoute } from '@/components/PrivateRoute';
import './App.css';

const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const FoodLogPage = lazy(() => import('@/pages/FoodLogPage').then((m) => ({ default: m.FoodLogPage })));
const CoachingPage = lazy(() => import('@/pages/CoachingPage').then((m) => ({ default: m.CoachingPage })));

const PageLoader = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex items-center justify-center min-h-screen"
  >
    <span className="text-gray-700">Loading page…</span>
  </div>
);

const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 rounded ${
        isActive ? 'text-gray-900 font-semibold' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </Link>
  );
};

const Navigation = () => {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <nav className="bg-white shadow" aria-label="Primary">
      <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="font-bold text-xl text-indigo-600">YAHealthy</div>
        <div className="flex space-x-6 items-center">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/food-log">Food Log</NavLink>
          <NavLink to="/coaching">Coaching</NavLink>
          <span className="text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            aria-label="Log out of your account"
            className="text-red-600 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 focus-visible:outline-offset-2 rounded"
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
            </PrivateRoute>
          }
        />
        <Route
          path="/food-log"
          element={
            <PrivateRoute>
              <FoodLogPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/coaching"
          element={
            <PrivateRoute>
              <CoachingPage />
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
      <AuthProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-indigo-700 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-semibold"
        >
          Skip to main content
        </a>
        <Navigation />
        <main id="main-content">
          <AppRoutes />
        </main>
      </AuthProvider>
    </Router>
  );
}

export default App;
