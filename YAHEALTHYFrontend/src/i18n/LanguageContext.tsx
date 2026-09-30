import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { translations, Lang } from './translations';

interface LanguageContextType {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  isRTL: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Internal to useDocumentTitle: claim the tab title until the returned release is called. */
  claimTitle: (title: string) => () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const DEFAULT_TITLE: Record<Lang, string> = {
  he: 'YAHealthy — מעקב תזונה ובריאות',
  en: 'YAHealthy — Nutrition & Health Tracker',
};

const getInitialLang = (): Lang => {
  try {
    const stored = localStorage.getItem('yahealthy-lang');
    if (stored === 'he' || stored === 'en') return stored;
  } catch {
    // storage blocked: fall through to the default
  }
  return 'he';
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const dir: 'rtl' | 'ltr' = lang === 'he' ? 'rtl' : 'ltr';

  // The tab title. A page cannot simply set document.title itself: effects run
  // child first, so this provider's language effect would run after the page's
  // and put the app-wide default back. Instead pages claim the title through
  // useDocumentTitle, and every write goes through apply(), which shows the
  // most recent claim or, when there is none, the default for the language.
  const claims = useRef<{ title: string }[]>([]);
  const langRef = useRef(lang);
  langRef.current = lang;
  const apply = useCallback(() => {
    const top = claims.current[claims.current.length - 1];
    document.title = top ? top.title : DEFAULT_TITLE[langRef.current];
  }, []);
  const claimTitle = useCallback(
    (title: string) => {
      const claim = { title };
      claims.current.push(claim);
      apply();
      return () => {
        claims.current = claims.current.filter((c) => c !== claim);
        apply();
      };
    },
    [apply]
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    apply();
    try {
      localStorage.setItem('yahealthy-lang', lang);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }, [lang, dir, apply]);

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
    <LanguageContext.Provider value={{ lang, dir, isRTL: dir === 'rtl', t, setLang, toggleLang, claimTitle }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};

/**
 * Give the current page its own tab title, e.g. "Plans — YAHealthy".
 *
 * Pass the page's name already translated — `useDocumentTitle(t('nav.pricing'))`
 * — so it follows the language toggle: a new language re-renders the page, the
 * name changes, and the claim is renewed. Pass null (while loading, say) to
 * leave the default in place. One call per page; when two mounted components
 * both claim, the one that claimed last is shown.
 */
export const useDocumentTitle = (page: string | null | undefined) => {
  const { t, claimTitle } = useLanguage();
  const title = page ? t('title.page', { page }) : null;
  useEffect(() => {
    if (!title) return undefined;
    return claimTitle(title);
  }, [title, claimTitle]);
};
