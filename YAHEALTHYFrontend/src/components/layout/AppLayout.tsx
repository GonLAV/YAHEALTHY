import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, UtensilsCrossed, Droplets, Moon, Scale,
  MessageCircleHeart, LogOut, Languages, Heart,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', key: 'nav.dashboard', icon: <LayoutDashboard size={20} /> },
  { to: '/food-log', key: 'nav.foodLog', icon: <UtensilsCrossed size={20} /> },
  { to: '/hydration', key: 'nav.hydration', icon: <Droplets size={20} /> },
  { to: '/sleep', key: 'nav.sleep', icon: <Moon size={20} /> },
  { to: '/weight', key: 'nav.weight', icon: <Scale size={20} /> },
  { to: '/coaching', key: 'nav.coaching', icon: <MessageCircleHeart size={20} /> },
];

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
          {NAV_ITEMS.map((item) => (
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
        <div className="flex items-center gap-2">
          <LangToggle />
          <button
            onClick={handleLogout}
            className="rounded-full p-2 text-rose-600 transition hover:bg-rose-50"
            aria-label={t('nav.logout')}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="pb-20 md:pb-8 md:ms-64">{children}</main>

      {/* Mobile bottom nav */}
      <nav
        aria-label={t('a11y.mobileNav')}
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white/95 py-1.5 backdrop-blur md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-w-[14.2%] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition ${
                isActive ? 'text-emerald-600' : 'text-slate-400'
              }`
            }
          >
            {item.icon}
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
