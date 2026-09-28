import { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Heart, Languages } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { WHATSAPP_URL } from '@/components/WhatsAppWidget';

/**
 * The frame for pages anyone can open without an account — the landing page,
 * pricing, booking, and the pages PayPlus sends people back to. AppLayout
 * assumes a signed-in user (it shows their email and a logout button), so
 * these cannot use it.
 *
 * `bare` hands the page the full width, for sections that run edge to edge;
 * without it the content sits in the usual centred column.
 */
export const PublicLayout = ({ children, bare = false }: { children: ReactNode; bare?: boolean }) => {
  const { t, lang, toggleLang } = useLanguage();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-medium transition sm:px-3 sm:text-sm ${
      isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50">
      <a href="#main-content" className="skip-link rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {t('a11y.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="YAHealthy">
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
              className="ms-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1.5 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-100 sm:px-2.5 sm:text-sm"
              aria-label={t('a11y.toggleLang')}
            >
              <Languages size={15} />
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content" className={bare ? 'flex-1' : 'mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12'}>
        {children}
      </main>

      <footer className="border-t border-slate-200/70 bg-white/60 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t('landing.footer.nav')}>
            <Link to="/" className="hover:text-slate-800">{t('landing.footer.home')}</Link>
            <Link to="/pricing" className="hover:text-slate-800">{t('nav.pricing')}</Link>
            <Link to="/book" className="hover:text-slate-800">{t('nav.book')}</Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="hover:text-slate-800">{t('whatsapp.chat')}</a>
            <Link to="/login" className="hover:text-slate-800">{t('auth.signIn')}</Link>
          </nav>
          <p className="max-w-md text-xs leading-relaxed">{t('landing.footer.disclaimer')}</p>
        </div>
      </footer>
    </div>
  );
};
