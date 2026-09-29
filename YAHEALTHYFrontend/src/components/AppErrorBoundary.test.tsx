// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';
import { resetErrorReporting, scrubText } from '@/utils/errorReporting';

const Boom = (): JSX.Element => {
  throw new Error('render failed for dana@example.com');
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetErrorReporting();
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);
  // React logs caught render errors to console.error; keep the output clean.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  document.documentElement.lang = 'he';
  window.history.replaceState(null, '', '/s/SecretShareToken123?utm_source=x');
});
afterEach(cleanup);

describe('AppErrorBoundary', () => {
  it('renders children untouched when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>all good</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a Hebrew RTL fallback with role=alert and a reload button', () => {
    const onReload = vi.fn();
    render(
      <AppErrorBoundary onReload={onReload}>
        <Boom />
      </AppErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('משהו השתבש');
    expect(screen.getByRole('main').getAttribute('dir')).toBe('rtl');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'טעינה מחדש של הדף' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'מעבר לדף הבית' }).getAttribute('href')).toBe('/');
  });

  it('speaks English (LTR) when the page is in English', () => {
    document.documentElement.lang = 'en';
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('main').getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/en');
  });

  it('reports the crash to /api/client-errors without PII, share tokens or query strings', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/client-errors');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.kind).toBe('boundary');
    expect(body.path).toBe('/s/:token');
    expect(body.lang).toBe('he');
    expect(typeof body.componentStack).toBe('string');
    const raw = String(init.body);
    expect(raw).not.toContain('dana@example.com');
    expect(raw).not.toContain('SecretShareToken123');
    expect(raw).not.toContain('utm_source');
  });

  it('reports the same crash only once per page load', () => {
    for (let i = 0; i < 3; i++) {
      render(
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>,
      );
      cleanup();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('scrubText', () => {
  it('masks emails, phones, bearer tokens and query strings', () => {
    const out = scrubText('a dana@example.com 050-123-4567 Bearer abc.def https://x.test/a.js?token=z', 500);
    expect(out).not.toContain('dana@');
    expect(out).not.toContain('123-4567');
    expect(out).not.toContain('abc.def');
    expect(out).not.toContain('token=z');
  });
});
