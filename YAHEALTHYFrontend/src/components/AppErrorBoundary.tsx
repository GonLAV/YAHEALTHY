import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { translations, type Lang } from '@/i18n/translations';
import { readStoredLang } from '@/i18n/LanguageContext';
import { reportClientError } from '@/utils/errorReporting';
import '@/i18n/strings/errors'; // errorPage.* strings

/**
 * The language to apologise in. Read at crash time from what LanguageProvider
 * last wrote to <html lang>, so the fallback needs no context — the provider
 * itself may be what failed.
 */
function fallbackLang(): Lang {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement.lang;
    if (lang === 'he' || lang === 'en') return lang;
  }
  return readStoredLang() ?? 'he';
}

/** Full-page, bilingual "something went wrong" with a reload button. */
export function ErrorFallback({ onReload }: { onReload?: () => void }) {
  const lang = fallbackLang();
  const t = (key: string) => translations[lang][key] ?? translations.he[key] ?? key;
  const heading = useRef<HTMLHeadingElement>(null);

  // Screen-reader and keyboard users land on the message, not on nothing.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const reload = onReload ?? (() => window.location.reload());

  return (
    <main
      id="main"
      lang={lang}
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      className="flex min-h-screen items-center justify-center bg-slate-50 p-4"
    >
      <div role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-bold text-slate-900 focus:outline-none">
          {t('errorPage.title')}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{t('errorPage.body')}</p>
        <p className="mt-2 text-sm text-slate-500">{t('errorPage.contact')}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reload}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            {t('errorPage.reload')}
          </button>
          {/* A plain link, not the router: the router may be what broke. */}
          <a
            href={lang === 'en' ? '/en' : '/'}
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            {t('errorPage.home')}
          </a>
        </div>
      </div>
    </main>
  );
}

interface Props {
  children: ReactNode;
  /** Tests: replace window.location.reload. */
  onReload?: () => void;
}

interface State {
  failed: boolean;
}

/**
 * Catches render errors anywhere below it, shows ErrorFallback, and reports
 * the crash (scrubbed) to POST /api/client-errors. Renders its children
 * untouched otherwise, so prerendered pages hydrate exactly as before.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      kind: 'boundary',
      message: error?.message || String(error),
      name: error?.name,
      stack: error?.stack,
      componentStack: info?.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.failed) return <ErrorFallback onReload={this.props.onReload} />;
    return this.props.children;
  }
}

export default AppErrorBoundary;
