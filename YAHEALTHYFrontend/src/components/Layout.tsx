import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Utensils,
  CalendarRange,
  HeartPulse,
  Sparkles,
  Search,
  ChevronDown,
  Leaf,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { GlobalSearch } from '@/components/GlobalSearch';

const primaryNav = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/food-log', label: 'Food', icon: Utensils },
  { to: '/meal-plan', label: 'Plan', icon: CalendarRange },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/coach', label: 'Coach', icon: Sparkles },
];

const moreNav = [
  { to: '/recipes', label: 'Recipes' },
  { to: '/progress', label: 'Progress & Weight' },
  { to: '/reports', label: 'Weekly Report' },
  { to: '/achievements', label: 'Achievements' },
  { to: '/favorites', label: 'Favorites' },
  { to: '/profile', label: 'Body Metrics' },
  { to: '/settings', label: 'Settings' },
];

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (!isAuthenticated) return <>{children}</>;

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-xl text-sm font-semibold transition ${
      isActive ? 'text-teal-700 bg-teal-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-2">
          <NavLink to="/dashboard" className="flex items-center gap-2 mr-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Leaf className="w-5 h-5" />
            </span>
            <span className="font-extrabold text-lg tracking-tight text-slate-900">
              YA<span className="text-teal-600">Healthy</span>
            </span>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {primaryNav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkCls}>
                {n.label}
              </NavLink>
            ))}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-1"
              >
                More <ChevronDown className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20">
                    {moreNav.map((n) => (
                      <button
                        key={n.to}
                        onClick={() => {
                          setMenuOpen(false);
                          navigate(n.to);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700"
                      >
                        {n.label}
                      </button>
                    ))}
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <div className="px-4 py-2 text-xs text-slate-400 truncate">{user?.email}</div>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                          navigate('/login');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </nav>

          <div className="flex-1 md:hidden" />

          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="w-10 h-10 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-6 pb-28 md:pb-10">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-100 pb-safe">
        <div className="grid grid-cols-5 px-2 pt-1.5">
          {primaryNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] font-semibold transition ${
                  isActive ? 'text-teal-600' : 'text-slate-400'
                }`
              }
            >
              <n.icon className="w-[22px] h-[22px]" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};
