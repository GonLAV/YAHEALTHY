import { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Heart, Languages } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * The frame for pages anyone can open without an account — pricing, booking,
 * and the pages PayPlus sends people back to. AppLayout assumes a signed-in
 * user (it shows their email and a logout button), so these cannot use it.
 */
export const PublicLayout = ({ children }: { children: ReactNode }) => {
  const { t, lang, toggleLang } = useLanguage();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-medium transition sm:px-3 sm:text-sm ${
      isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/pricing" className="flex shrink-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600">
              <Heart size={18} className="text-white" fill="white" />
            </div>
            <span className="hidden font-bold text-slate-900 sm:inline">YAHealthy</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1" aria-label={t('a11y.mainNav')}>
            <NavLink to="/pricing" className={linkClass}>{t('nav.pricing')}</NavLink>
            <NavLink to="/book" end className={linkClass}>{t('nav.book')}</NavLink>
            <NavLink to="/login" className={linkClass}>{t('auth.signIn')}</NavLink>
            <button
              onClick={toggleLang}
              className="ms-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1.5 text-[13px] sm:px-2.5 sm:text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              aria-label={t('a11y.toggleLang')}
            >
              <Languages size={15} />
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
};
