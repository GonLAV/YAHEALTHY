import { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { Lang, translations } from '@/i18n/translations';

/**
 * Renders a component the way the app does: inside the language provider and
 * a router, in the chosen language (the provider reads it from localStorage,
 * exactly as it does for a returning visitor). The providers are a wrapper, so
 * `rerender` with new props keeps them.
 */
export const renderInApp = (ui: ReactElement, { lang = 'en', route = '/' }: { lang?: Lang; route?: string } = {}) => {
  localStorage.setItem('yahealthy-lang', lang);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <LanguageProvider>{children}</LanguageProvider>
    </MemoryRouter>
  );
  return render(ui, { wrapper });
};

/**
 * The copy a user sees for a key, with its {params} filled in — so tests assert
 * on the real strings without repeating them.
 */
export const copy = (lang: Lang, key: string, params: Record<string, string | number> = {}) => {
  const str = translations[lang][key];
  if (str == null) throw new Error(`No ${lang} translation for "${key}"`);
  return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), str);
};

/** What axios rejects with when the server answers with an error status. */
export const httpError = (status: number, data: unknown = {}) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });
