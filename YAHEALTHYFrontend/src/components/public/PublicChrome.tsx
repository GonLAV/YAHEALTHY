/**
 * Shared chrome for the public, indexable pages (landing, /guides): header,
 * footer, brand and a language switch that is a real link to the other
 * language's URL, so crawlers can follow it and each language is its own page.
 */
import { useLayoutEffect, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart, Languages } from 'lucide-react';
import { useLanguage, LANG_STORAGE_KEY } from '@/i18n/LanguageContext';
import { alternatesFor, localizePath, matchPublicRoute, type PublicRouteMatch } from '@/seo/site';
import { useSeoHead } from '@/seo/useSeoHead';
import type { Lang } from '@/i18n/translations';

// useLayoutEffect warns during server rendering; nothing here needs to run there.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * For a public page: follow the URL's language (so "/en" is English even for
 * someone whose saved preference is Hebrew) and keep <head> tags current.
 */
export const usePublicPage = (): PublicRouteMatch | null => {
  const { pathname } = useLocation();
  const { lang, setLang } = useLanguage();
  const match = matchPublicRoute(pathname);
  const routeLang = match?.lang;

  useIsoLayoutEffect(() => {
    if (routeLang && routeLang !== lang) setLang(routeLang);
  }, [routeLang, lang, setLang]);

  useSeoHead();
  return match;
};

export const Brand = () => (
  <span className="flex items-center gap-2.5">
    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 shadow-sm shadow-emerald-200">
      <Heart size={18} className="text-white" fill="white" aria-hidden="true" />
    </span>
    <span className="text-lg font-extrabold tracking-tight text-slate-900">YAHealthy</span>
  </span>
);

/** Link to this page in the other language. Falls back to the other home page. */
export const PublicLangToggle = () => {
  const { lang, t } = useLanguage();
  const { pathname } = useLocation();
  const other: Lang = lang === 'he' ? 'en' : 'he';
  const match = matchPublicRoute(pathname);
  const href = match ? alternatesFor(match)[other] : localizePath(other, '/');

  const remember = () => {
    // Written now, not in an effect, so the next page load already knows.
    try {
      localStorage.setItem(LANG_STORAGE_KEY, other);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <Link
      to={href}
      onClick={remember}
      hrefLang={other}
      aria-label={t('a11y.toggleLang')}
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
    >
      <Languages size={16} aria-hidden="true" />
      <span lang={other}>{lang === 'he' ? 'EN' : 'עב'}</span>
    </Link>
  );
};

export interface PublicNavLink {
  href: string;
  label: string;
  /** In-page anchor ("#faq") rather than a route. */
  anchor?: boolean;
  current?: boolean;
}

const NavItem = ({ link, className }: { link: PublicNavLink; className: string }) =>
  link.anchor ? (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  ) : (
    <Link to={link.href} className={className} aria-current={link.current ? 'page' : undefined}>
      {link.label}
    </Link>
  );

export const PublicHeader = ({ nav }: { nav: PublicNavLink[] }) => {
  const { t, lang } = useLanguage();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to={localizePath(lang, '/')} aria-label="YAHealthy" className="rounded-xl">
          <Brand />
        </Link>
        <nav aria-label={t('landing.nav.label')} className="hidden items-center gap-6 md:flex">
          {nav.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              className="text-sm font-medium text-slate-600 transition hover:text-emerald-700 aria-[current=page]:text-emerald-700"
            />
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <PublicLangToggle />
          <Link
            to="/login"
            className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
          >
            {t('landing.nav.login')}
          </Link>
          <Link
            to="/signup"
            className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {t('landing.nav.signup')}
          </Link>
        </div>
      </div>
    </header>
  );
};

const FooterColumn = ({ title, children }: { title: string; children: ReactNode }) => (
  <nav aria-label={title}>
    <h2 className="text-sm font-bold text-slate-900">{title}</h2>
    <ul className="mt-3 flex flex-col gap-2 text-sm">{children}</ul>
  </nav>
);

export const PublicFooter = ({ nav }: { nav: PublicNavLink[] }) => {
  const { t, lang } = useLanguage();
  const linkClass = 'text-slate-600 transition hover:text-emerald-700';
  const guidesHref = localizePath(lang, '/guides');
  return (
    <footer className="border-t border-slate-200 bg-white px-4 pb-24 pt-12 sm:px-6 md:pb-12">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Brand />
          <p className="mt-3 max-w-sm text-sm text-slate-600">{t('landing.footer.tagline')}</p>
        </div>
        <FooterColumn title={t('landing.footer.product')}>
          {nav.map((link) => (
            <li key={link.href}>
              <NavItem link={link} className={linkClass} />
            </li>
          ))}
          {!nav.some((link) => link.href === guidesHref) && (
            <li>
              <Link to={guidesHref} className={linkClass}>
                {t('guides.nav')}
              </Link>
            </li>
          )}
        </FooterColumn>
        <FooterColumn title={t('landing.footer.account')}>
          <li>
            <Link to="/login" className={linkClass}>
              {t('landing.nav.login')}
            </Link>
          </li>
          <li>
            <Link to="/signup" className={linkClass}>
              {t('landing.nav.signup')}
            </Link>
          </li>
        </FooterColumn>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-3 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl">{t('landing.footer.disclaimer')}</p>
        <p className="num shrink-0">{t('landing.footer.rights', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
};
