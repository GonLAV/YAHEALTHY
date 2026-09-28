// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { LANG_STORAGE_KEY, LanguageProvider, readStoredLang, useLanguage } from './LanguageContext';

const Probe = () => {
  const { lang, dir, isRTL, t, toggleLang, setLang } = useLanguage();
  return (
    <div>
      <p data-testid="state">{`${lang}|${dir}|${isRTL}`}</p>
      <p data-testid="text">{t('dash.longestStreak', { n: 7 })}</p>
      <p data-testid="missing">{t('no.such.key')}</p>
      <button onClick={toggleLang}>toggle</button>
      <button onClick={() => setLang('en')}>english</button>
    </div>
  );
};

const state = () => screen.getByTestId('state').textContent;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/dashboard');
});
afterEach(cleanup);

describe('LanguageProvider', () => {
  it('defaults to Hebrew/RTL and sets <html lang dir>', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(state()).toBe('he|rtl|true');
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByTestId('text').textContent).toContain('7');
    expect(screen.getByTestId('missing').textContent).toBe('no.such.key');
  });

  it('toggling switches dir/lang, interpolates params and persists the choice', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    act(() => screen.getByText('toggle').click());
    expect(state()).toBe('en|ltr|false');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByTestId('text').textContent).toBe('Longest: 7 days');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en');
    act(() => screen.getByText('toggle').click());
    expect(state()).toBe('he|rtl|true');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('he');
  });

  it('uses the stored preference on private pages', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(state()).toBe('en|ltr|false');
  });

  it('a public URL decides its own language over the stored preference', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    window.history.replaceState(null, '', '/guides');
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(state()).toBe('he|rtl|true');
  });

  it('ignores junk in storage', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'fr');
    expect(readStoredLang()).toBeNull();
  });

  it('works when storage throws (private mode / blocked site data)', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    expect(readStoredLang()).toBeNull();
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(state()).toBe('he|rtl|true');
    act(() => screen.getByText('english').click());
    expect(state()).toBe('en|ltr|false');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('useLanguage outside the provider throws a helpful error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/within LanguageProvider/);
  });
});
