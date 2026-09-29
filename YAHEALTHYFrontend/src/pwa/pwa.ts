/**
 * PWA runtime: service-worker registration, the update flow, and the install
 * prompt. State lives in small module-level stores so it can be captured at
 * startup (beforeinstallprompt often fires before the dashboard mounts) and
 * read from React with useSyncExternalStore (see usePwa.ts).
 */

type Listener = () => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ── install prompt ──────────────────────────────────────────────────────────

/** Chromium's install prompt event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export const installPromptStore = createStore<BeforeInstallPromptEvent | null>(null);
export const installedStore = createStore<boolean>(false);

export const isStandalone = (): boolean => {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
};

/** iPhone/iPad, including iPadOS reporting itself as a Mac. */
export const isIOS = (): boolean => {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export function captureInstallPrompt() {
  installedStore.set(isStandalone());
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own card instead of the mini-infobar
    installPromptStore.set(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    installPromptStore.set(null);
    installedStore.set(true);
  });
}

/** Show the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = installPromptStore.get();
  if (!event) return false;
  installPromptStore.set(null); // a prompt event can be used once
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

// ── service worker + updates ────────────────────────────────────────────────

/** A new version is installed and waiting for the user to reload. */
export const updateStore = createStore<ServiceWorker | null>(null);
export const swRegistrationStore = createStore<ServiceWorkerRegistration | null>(null);

let reloadRequested = false;

export const swSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

function watchForWaiting(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) updateStore.set(reg.waiting);

  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // Installed while an older worker controls the page → it is an update,
      // not the first install.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        updateStore.set(reg.waiting || installing);
      }
    });
  });
}

export function registerServiceWorker() {
  if (!swSupported()) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when the user asked for the new version; the first install's
    // clients.claim() also fires this and must not yank the page away.
    if (reloadRequested) window.location.reload();
  });

  const register = async () => {
    try {
      // In dev the worker runs with caching off (see public/sw.js).
      const url = import.meta.env.DEV ? '/sw.js?dev=1' : '/sw.js';
      const reg = await navigator.serviceWorker.register(url, { scope: '/' });
      swRegistrationStore.set(reg);
      watchForWaiting(reg);

      // Long-lived tabs (an installed app is one) check for updates when they
      // come back to the foreground and once an hour.
      const check = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, 60 * 60 * 1000);
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Activate the waiting worker; the page reloads once it has taken over. */
export function applyUpdate() {
  const waiting = updateStore.get() || swRegistrationStore.get()?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  reloadRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissUpdate() {
  updateStore.set(null);
}

// ── localStorage, defensively ───────────────────────────────────────────────

export function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage blocked: the card just comes back next time */
  }
}
