import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { applyUpdate, dismissUpdate, swSupported } from '@/pwa/pwa';
import { syncPushSubscription } from '@/pwa/push';
import { useOnline, useWaitingUpdate } from '@/pwa/usePwa';

/**
 * App-wide PWA pieces that render nothing (or a small toast) and must live
 * inside the Router, LanguageProvider and AuthProvider:
 *   - "new version available — reload" toast (role=status)
 *   - offline banner (role=status)
 *   - notification clicks → in-app navigation
 *   - keep this browser's push subscription registered after sign-in
 */
export const PwaChrome = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const waiting = useWaitingUpdate();
  const online = useOnline();

  // The service worker asks an already-open window to navigate after a
  // notification click (public/sw.js), which keeps the SPA's state.
  useEffect(() => {
    if (!swSupported()) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === 'NAVIGATE' && typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')) {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // Re-register an existing subscription on sign-in / language change: the
  // server may have new VAPID keys, and the reminder copy follows `lang`.
  useEffect(() => {
    if (!user) return;
    syncPushSubscription(lang).catch(() => {
      /* best effort: the reminders page shows the real state */
    });
  }, [user, lang]);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center md:bottom-6 md:start-72 md:end-6"
      >
        {waiting && (
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
            <RefreshCw size={18} aria-hidden="true" className="shrink-0 text-emerald-300" />
            <span className="flex-1">{t('pwa.update.message')}</span>
            <button
              type="button"
              onClick={applyUpdate}
              className="rounded-full bg-emerald-500 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-400"
            >
              {t('pwa.update.reload')}
            </button>
            <button
              type="button"
              onClick={dismissUpdate}
              className="rounded-full px-2 py-1.5 font-medium text-slate-300 transition hover:text-white"
            >
              {t('pwa.update.later')}
            </button>
          </div>
        )}
      </div>

      <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50">
        {!online && (
          <p className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 shadow">
            <WifiOff size={16} aria-hidden="true" className="shrink-0" />
            {t('pwa.offline')}
          </p>
        )}
      </div>
    </>
  );
};

export default PwaChrome;
