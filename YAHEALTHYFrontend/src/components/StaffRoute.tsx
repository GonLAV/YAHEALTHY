import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PrivateRoute } from '@/components/PrivateRoute';

/**
 * Staff-only pages. Signed-out visitors go to /login (via PrivateRoute);
 * signed-in non-staff land on their dashboard, as if the page did not exist.
 * This only hides the UI — every /api/analytics call is refused server-side
 * for non-staff (middleware/requireStaff) no matter what the browser does.
 */
export const StaffRoute = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return (
    <PrivateRoute>
      {user?.isStaff ? <>{children}</> : <Navigate to="/dashboard" replace />}
    </PrivateRoute>
  );
};
