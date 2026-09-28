// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { dismissUpdate, installPromptStore, isIOS, isStandalone, readFlag, updateStore, writeFlag } from './pwa';

describe('flags in localStorage', () => {
  it('round-trips values', () => {
    writeFlag('yahealthy-test-flag', '1');
    expect(readFlag('yahealthy-test-flag')).toBe('1');
    expect(readFlag('yahealthy-unset-flag')).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    expect(() => writeFlag('k', 'v')).not.toThrow();
    expect(readFlag('k')).toBeNull();
  });
});

describe('stores', () => {
  it('notify subscribers until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = installPromptStore.subscribe(listener);
    const event = new Event('beforeinstallprompt') as Parameters<typeof installPromptStore.set>[0];
    installPromptStore.set(event);
    expect(installPromptStore.get()).toBe(event);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    installPromptStore.set(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('dismissUpdate clears the waiting worker', () => {
    updateStore.set({} as ServiceWorker);
    dismissUpdate();
    expect(updateStore.get()).toBeNull();
  });
});

describe('platform detection', () => {
  const setNavigator = (ua: string, platform: string, maxTouchPoints: number) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
  };

  it.each([
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5, true],
    ['iPadOS as Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5, true],
    ['desktop Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0, false],
    ['Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5, false],
  ] as const)('isIOS: %s → %s', (_name, ua, platform, touch, expected) => {
    setNavigator(ua, platform, touch);
    expect(isIOS()).toBe(expected);
  });

  it('isStandalone is false (not throwing) when matchMedia is missing', () => {
    // jsdom has no matchMedia.
    expect(isStandalone()).toBe(false);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }));
    expect(isStandalone()).toBe(true);
  });
});
