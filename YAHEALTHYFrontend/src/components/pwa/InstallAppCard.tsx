import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { isIOS, promptInstall, readFlag, writeFlag } from '@/pwa/pwa';
import { useInstallPrompt, useInstalled } from '@/pwa/usePwa';

const DISMISS_KEY = 'yahealthy-install-dismissed';

/**
 * Dashboard card offering to install the app.
 *
 * Chromium: shows our own button for the captured beforeinstallprompt.
 * iOS/iPadOS: no prompt API exists, so it explains Share → Add to Home Screen.
 * Hidden once installed, when running standalone, or after "Not now"
 * (remembered in localStorage).
 */
export const InstallAppCard = () => {
  const { t } = useLanguage();
  const prompt = useInstallPrompt();
  const installed = useInstalled();
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISS_KEY) === '1');
  const [justInstalled, setJustInstalled] = useState(false);

  const dismiss = () => {
    writeFlag(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) setJustInstalled(true);
  };

  if (justInstalled) {
    return (
      <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
        {t('pwa.install.installed')}
      </p>
    );
  }

  const ios = isIOS();
  if (installed || dismissed || (!prompt && !ios)) return null;

  return (
    <section
      aria-labelledby="install-app-title"
      className="relative mb-6 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-white shadow-md shadow-emerald-200"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('pwa.install.dismissAria')}
        className="absolute end-3 top-3 rounded-full p-1.5 text-emerald-50 transition hover:bg-white/15"
      >
        <X size={18} aria-hidden="true" />
      </button>

      <div className="flex items-start gap-4 pe-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <Smartphone size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="install-app-title" className="text-lg font-bold">
            {prompt ? t('pwa.install.title') : t('pwa.install.iosTitle')}
          </h2>
          <p className="mt-1 text-sm text-emerald-50">{t('pwa.install.body')}</p>

          {prompt ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                <Download size={16} aria-hidden="true" />
                {t('pwa.install.button')}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full px-3 py-2 text-sm font-medium text-emerald-50 transition hover:bg-white/15"
              >
                {t('pwa.install.dismiss')}
              </button>
            </div>
          ) : (
            <>
              <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm text-emerald-50">
                <li>
                  {t('pwa.install.iosStep1')}{' '}
                  <Share size={14} aria-hidden="true" className="inline align-text-bottom" />
                </li>
                <li>{t('pwa.install.iosStep2')}</li>
                <li>{t('pwa.install.iosStep3')}</li>
              </ol>
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 rounded-full px-3 py-2 text-sm font-medium text-emerald-50 transition hover:bg-white/15"
              >
                {t('pwa.install.dismiss')}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default InstallAppCard;
