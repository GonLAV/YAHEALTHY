import { useEffect, useState, useSyncExternalStore } from 'react';
import { installPromptStore, installedStore, updateStore } from './pwa';

/** The captured beforeinstallprompt event, or null (not offered / already used). */
export const useInstallPrompt = () =>
  useSyncExternalStore(installPromptStore.subscribe, installPromptStore.get, () => null);

export const useInstalled = () =>
  useSyncExternalStore(installedStore.subscribe, installedStore.get, () => false);

/** The waiting service worker when a new version is ready. */
export const useWaitingUpdate = () =>
  useSyncExternalStore(updateStore.subscribe, updateStore.get, () => null);

export function useOnline(): boolean {
  // Node 22 (the prerender) has a global navigator without onLine: treat "unknown" as online,
  // or every prerendered page would ship the offline banner and fail hydration.
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
