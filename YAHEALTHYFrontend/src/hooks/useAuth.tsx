import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, SignupExtras } from '@/services/api';

interface User {
  id: string;
  email: string;
  /** Only hides/shows staff pages; the server re-checks on every staff request. */
  isStaff?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, extras?: SignupExtras) => Promise<void>;
  logout: () => Promise<void>;
}

const hasStoredToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem('token'));
  } catch {
    return false;
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  // Only a stored token needs checking. Without one there is nothing to wait
  // for, so the public landing page renders at once — and identically to its
  // prerendered HTML (no token on the server either), which hydration needs.
  const [loading, setLoading] = useState(hasStoredToken);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await authApi.getCurrentUser();
          setUser(response.data);
        } catch (error) {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const token = response.data.access_token || response.data.token || '';
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    const userResponse = await authApi.getCurrentUser();
    setUser(userResponse.data);
  };

  const signup = async (email: string, password: string, extras?: SignupExtras) => {
    const response = await authApi.signup(email, password, extras);
    const token = response.data.access_token || response.data.token || '';
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    const userResponse = await authApi.getCurrentUser();
    setUser(userResponse.data);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      // The local session ends even if the server could not be reached, so a
      // failed request never strands someone in a logged-in screen. What it
      // does mean is that the token stays live server-side until it expires,
      // which is why the request is attempted first rather than skipped.
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
