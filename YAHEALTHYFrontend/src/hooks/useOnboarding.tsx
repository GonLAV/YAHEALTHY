import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * 'unknown'    — no user, or not asked yet
 * 'loading'    — asking the server
 * 'complete'   — finished/skipped the wizard, or an account that pre-dates it
 * 'incomplete' — a new account that should go through /onboarding
 */
export type OnboardingState = 'unknown' | 'loading' | 'complete' | 'incomplete';

interface OnboardingContextType {
  state: OnboardingState;
  markComplete: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>('unknown');
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setState('unknown');
      return;
    }
    let cancelled = false;
    setState('loading');
    import('@/services/api')
      .then((m) => m.onboardingApi.getStatus())
      .then((res) => {
        if (!cancelled) setState(res.data.completed ? 'complete' : 'incomplete');
      })
      .catch(() => {
        // Fail open: a status hiccup must never lock someone out of their data.
        if (!cancelled) setState('complete');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markComplete = useCallback(() => setState('complete'), []);

  return (
    <OnboardingContext.Provider value={{ state, markComplete }}>{children}</OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within OnboardingProvider');
  return context;
};
