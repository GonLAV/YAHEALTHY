import { createContext, useContext, useLayoutEffect, useState, ReactNode } from 'react';
import { translations, Lang } from './translations';

interface LanguageContextType {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  isRTL: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getInitialLang = (): Lang => {
  const stored = localStorage.getItem('yahealthy-lang');
  if (stored === 'he' || stored === 'en') return stored;
  return 'he';
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const dir: 'rtl' | 'ltr' = lang === 'he' ? 'rtl' : 'ltr';

  // A layout effect so it runs before any page's own (passive) effects: a page
  // that sets its own title or meta description, like the landing page, then
  // wins instead of being overwritten by this default.
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = lang === 'he' ? 'YAHealthy — מעקב תזונה ובריאות' : 'YAHealthy — Nutrition & Health Tracker';
    localStorage.setItem('yahealthy-lang', lang);
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
