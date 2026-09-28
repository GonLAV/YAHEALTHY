import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from 'react';
import { translations, Lang } from './translations';
import { langFromPublicPath } from '@/seo/site';

interface LanguageContextType {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  isRTL: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
}

// useLayoutEffect warns under the build-time prerender; there is no document there anyway.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LANG_STORAGE_KEY = 'yahealthy-lang';

export const readStoredLang = (): Lang | null => {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return stored === 'he' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
};

/**
 * A public, indexable URL decides its own language ("/" is Hebrew, "/en" is
 * English) so the first client render matches the prerendered HTML. Anywhere
 * else the saved preference applies.
 */
const getInitialLang = (): Lang => {
  if (typeof window === 'undefined') return 'he';
  return langFromPublicPath(window.location.pathname) ?? readStoredLang() ?? 'he';
};

export const LanguageProvider = ({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) => {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? getInitialLang());

  const dir: 'rtl' | 'ltr' = lang === 'he' ? 'rtl' : 'ltr';

  // A layout effect so it runs before any page's own (passive) effects: a page
  // that sets its own title or meta description, like the landing page, then
  // wins instead of being overwritten by this default.
  useIsoLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = lang === 'he' ? 'YAHealthy — מעקב תזונה ובריאות' : 'YAHealthy — Nutrition & Health Tracker';
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* storage unavailable — the choice lasts for this page view */
    }
  }, [lang, dir]);

  const setLang = (next: Lang) => setLangState(next);
  const toggleLang = () => setLangState((prev) => (prev === 'he' ? 'en' : 'he'));

  const t = (key: string, params?: Record<string, string | number>) => {
    let str = translations[lang][key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang, dir, isRTL: dir === 'rtl', t, setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
