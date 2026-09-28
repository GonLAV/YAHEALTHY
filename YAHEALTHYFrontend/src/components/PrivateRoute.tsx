import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';

const Spinner = () => (
  <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
  </div>
);

/**
 * Signed-in only. A signed-in user who has not been through onboarding yet is
 * sent to /onboarding first; the onboarding route itself opts out of that
 * redirect with `allowIncompleteOnboarding`.
 */
export const PrivateRoute = ({
  children,
  allowIncompleteOnboarding = false,
}: {
  children: ReactNode;
  allowIncompleteOnboarding?: boolean;
}) => {
  const { isAuthenticated, loading } = useAuth();
  const { state: onboarding } = useOnboarding();

  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!allowIncompleteOnboarding) {
    // 'unknown' here means the status request has not started yet.
    if (onboarding === 'loading' || onboarding === 'unknown') return <Spinner />;
    if (onboarding === 'incomplete') return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};
