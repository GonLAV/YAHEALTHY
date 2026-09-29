/**
 * Browser crash reports → POST /api/client-errors (logged server-side).
 *
 * Sources: the app's error boundary (always reported) and window `error` /
 * `unhandledrejection` (sampled). What leaves the browser is deliberately
 * thin and scrubbed here AND again on the server:
 *   - no user id, token, email, phone, query string or share token;
 *   - the page is `location.pathname` with /s/<token> masked;
 *   - message ≤ 500 chars, stack ≤ 4000, component stack ≤ 2000.
 * Per page load: at most MAX_PER_PAGE reports, and the same message once.
 * Failed API calls (axios) are not reported: the server already logged them.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';
export const CLIENT_ERRORS_ENDPOINT = `${API_BASE}/api/client-errors`;

/** Share of window-level errors that are reported (boundary crashes: all). */
const GLOBAL_SAMPLE_RATE = (() => {
  const configured = Number(import.meta.env.VITE_CLIENT_ERROR_SAMPLE_RATE);
  return Number.isFinite(configured) && configured >= 0 && configured <= 1 ? configured : 0.5;
})();
const MAX_PER_PAGE = 5;

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'boundary';

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  path?: string;
  source?: string;
  line?: number;
  col?: number;
  lang?: 'he' | 'en';
}

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const PHONE = /(?<![\w/])\+?\d(?:[\s.-]?\d){8,14}(?!\w)/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const SHARE_PATH = /\/s\/[^/\s?#"')]+/g;
const QUERY = /\?[^\s#"')]*/g;

/** Removes personal data, credentials and query strings from free text. */
export function scrubText(value: string, max: number): string {
  return value
    .replace(BEARER, '$1 [REDACTED]')
    .replace(JWT, '[REDACTED_JWT]')
    .replace(QUERY, '')
    .replace(SHARE_PATH, '/s/:token')
    .replace(EMAIL, '$1***@$2')
    .replace(PHONE, '***')
    .slice(0, max);
}

let sent = 0;
const seen = new Set<string>();
let installed = false;

/** Tests only. */
export function resetErrorReporting(): void {
  sent = 0;
  seen.clear();
}

function currentLang(): 'he' | 'en' | undefined {
  if (typeof document === 'undefined') return undefined;
  const lang = document.documentElement.lang;
  return lang === 'he' || lang === 'en' ? lang : undefined;
}

function currentPath(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return scrubText(window.location.pathname, 300);
}

/**
 * Send one report. Never throws, never retries; returns whether it was sent.
 * `sampleRate` applies to this call (the boundary passes 1).
 */
export function reportClientError(report: ClientErrorReport, { sampleRate = 1 }: { sampleRate?: number } = {}): boolean {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
    const message = scrubText(String(report.message || '').trim(), 500);
    if (!message) return false;
    const key = `${report.kind}|${message}`;
    if (seen.has(key) || sent >= MAX_PER_PAGE) return false;
    if (Math.random() >= sampleRate) return false;
    seen.add(key);
    sent++;

    const body: ClientErrorReport = {
      kind: report.kind,
      message,
      name: report.name ? report.name.slice(0, 100) : undefined,
      stack: report.stack ? scrubText(report.stack, 4000) : undefined,
      componentStack: report.componentStack ? scrubText(report.componentStack, 2000) : undefined,
      path: report.path ?? currentPath(),
      source: report.source ? scrubText(report.source, 300) : undefined,
      line: Number.isInteger(report.line) ? report.line : undefined,
      col: Number.isInteger(report.col) ? report.col : undefined,
      lang: report.lang ?? currentLang(),
    };

    void fetch(CLIENT_ERRORS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Errors that say nothing useful or are reported elsewhere. */
function ignorable(message: string, reason?: unknown): boolean {
  if (/^Script error\.?$/i.test(message)) return true; // cross-origin, no detail
  if (/ResizeObserver loop/i.test(message)) return true; // benign browser notice
  if (reason && typeof reason === 'object') {
    const r = reason as { isAxiosError?: boolean; name?: string };
    if (r.isAxiosError) return true; // the API logged its side; offline users are not bugs
    if (r.name === 'AbortError') return true;
  }
  return false;
}

/** window `error` + `unhandledrejection` → sampled reports. Idempotent. */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    // Resource load failures (img/script) arrive as plain Events without a message.
    if (!(event instanceof ErrorEvent) || !event.message) return;
    const source = event.filename || '';
    if (/^(chrome|moz|safari)-extension:/.test(source)) return;
    if (ignorable(event.message)) return;
    const error = event.error instanceof Error ? event.error : undefined;
    reportClientError(
      {
        kind: 'error',
        message: error?.message || event.message,
        name: error?.name,
        stack: error?.stack,
        source,
        line: event.lineno || undefined,
        col: event.colno || undefined,
      },
      { sampleRate: GLOBAL_SAMPLE_RATE },
    );
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    const error = reason instanceof Error ? reason : undefined;
    const message = error?.message || (typeof reason === 'string' ? reason : 'Unhandled promise rejection');
    if (ignorable(message, reason)) return;
    reportClientError(
      { kind: 'unhandledrejection', message, name: error?.name, stack: error?.stack },
      { sampleRate: GLOBAL_SAMPLE_RATE },
    );
  });
}
