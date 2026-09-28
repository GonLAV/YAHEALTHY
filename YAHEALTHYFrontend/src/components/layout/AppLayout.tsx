import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, UtensilsCrossed, Droplets, Moon, Scale,
  MessageCircleHeart, LogOut, Languages, Heart, BarChart3, Gift, Trophy, Megaphone,
  MoreHorizontal, X, Settings,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  /** Mobile placement: a bottom-bar tab, or an entry in the "More" sheet. */
  mobile: 'tab' | 'more';
  /** Shorter label for the narrow bottom-bar tab. */
  shortKey?: string;
  /** Shown only when /api/auth/me says isStaff (the server enforces it regardless). */
  staffOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', key: 'nav.dashboard', icon: <LayoutDashboard size={20} />, mobile: 'tab' },
  { to: '/progress', key: 'nav.progress', icon: <BarChart3 size={20} />, mobile: 'tab' },
  { to: '/achievements', key: 'nav.achievements', icon: <Trophy size={20} />, mobile: 'more' },
  { to: '/food-log', key: 'nav.foodLog', icon: <UtensilsCrossed size={20} />, mobile: 'tab' },
  { to: '/hydration', key: 'nav.hydration', icon: <Droplets size={20} />, mobile: 'more' },
  { to: '/sleep', key: 'nav.sleep', icon: <Moon size={20} />, mobile: 'more' },
  { to: '/weight', key: 'nav.weight', icon: <Scale size={20} />, mobile: 'more' },
  { to: '/coaching', key: 'nav.coaching', icon: <MessageCircleHeart size={20} />, mobile: 'tab', shortKey: 'nav.coachingShort' },
  { to: '/invite', key: 'nav.invite', icon: <Gift size={20} />, mobile: 'more' },
  { to: '/admin/marketing', key: 'nav.marketing', icon: <Megaphone size={20} />, mobile: 'more', staffOnly: true },
  { to: '/settings', key: 'nav.settings', icon: <Settings size={20} />, mobile: 'more' },
];

// Mobile bottom bar: four primary tabs in this order, then "More".
const MOBILE_TAB_ORDER = ['/dashboard', '/food-log', '/coaching', '/progress'];
const MOBILE_TABS = MOBILE_TAB_ORDER.flatMap((to) => NAV_ITEMS.filter((i) => i.to === to && i.mobile === 'tab'));
const MORE_ITEMS = NAV_ITEMS.filter((i) => i.mobile === 'more');

const LangToggle = ({ className = '' }: { className?: string }) => {
  const { lang, toggleLang, t } = useLanguage();
  return (
    <button
      onClick={toggleLang}
      className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 ${className}`}
      aria-label={t('a11y.toggleLang')}
    >
      <Languages size={16} />
      {lang === 'he' ? 'EN' : 'עב'}
    </button>
  );
};

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Mobile "More" sheet: a modal dialog (focus moves in, Tab is trapped,
  // Escape / backdrop / navigation close it, focus returns to the trigger).
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE_ITEMS.some((i) => location.pathname.startsWith(i.to));

  const closeMore = useCallback((restoreFocus = true) => {
    setMoreOpen(false);
    if (restoreFocus) moreButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const sheet = sheetRef.current;
    const focusables = () =>
      Array.from(sheet?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMore();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [moreOpen, closeMore]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
      isActive
        ? 'bg-emerald-600 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="skip-link rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
      >
        {t('a11y.skipToContent')}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600">
            <Heart size={20} className="text-white" fill="white" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">YAHealthy</div>
            <div className="text-xs text-slate-500">{t('app.tagline')}</div>
          </div>
        </div>

        <nav aria-label={t('a11y.mainNav')} className="flex-1 space-y-1 px-4">
          {NAV_ITEMS.filter((item) => !item.staffOnly || user?.isStaff).map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.icon}
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-slate-200 px-4 py-4">
          <div className="truncate rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
            {user?.email}
          </div>
          <div className="flex items-center justify-between">
            <LangToggle />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              <LogOut size={16} />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600">
            <Heart size={16} className="text-white" fill="white" />
          </div>
          <span className="font-bold text-slate-900">YAHealthy</span>
        </div>
        <LangToggle />
      </header>

      {/* Main content. pb-36 on mobile: the last content scrolls clear of the bottom nav and the WhatsApp button above it. */}
      <main id="main-content" className="pb-36 md:pb-8 md:ms-64">{children}</main>

      {/* Mobile bottom nav: primary tabs + "More" */}
      <nav
        aria-label={t('a11y.mobileNav')}
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 py-1.5 backdrop-blur md:hidden"
      >
        {MOBILE_TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition ${
                isActive ? 'text-emerald-600' : 'text-slate-500'
              }`
            }
          >
            {item.icon}
            <span className="max-w-full truncate">{t(item.shortKey ?? item.key)}</span>
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition ${
            moreOpen || moreActive ? 'text-emerald-600' : 'text-slate-500'
          }`}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
          <span className="max-w-full truncate">{t('nav.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            aria-hidden="true"
            onClick={() => closeMore()}
          />
          <div
            ref={sheetRef}
            id="mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-6 pt-3 shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 id="mobile-more-title" className="text-base font-bold text-slate-900">
                  {t('nav.moreTitle')}
                </h2>
                <p className="text-xs text-slate-500">{t('nav.moreHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => closeMore()}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                aria-label={t('nav.closeMore')}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <ul className="grid grid-cols-2 gap-2">
              {MORE_ITEMS.filter((item) => !item.staffOnly || user?.isStaff).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => closeMore(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                        isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`
                    }
                  >
                    {item.icon}
                    {t(item.key)}
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>{t('nav.language')}</span>
                <LangToggle />
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                <LogOut size={16} aria-hidden="true" />
                {t('nav.logout')}
              </button>
            </div>
            {user?.email && <p className="mt-3 truncate text-xs text-slate-400">{user.email}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
