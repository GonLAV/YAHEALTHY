/**
 * Browser side of Web Push: permission, subscribe/unsubscribe, and keeping
 * the server's copy of this browser's subscription current.
 */
import { pushApi } from '@/services/api';
import { browserTimeZone } from '@/utils/date';
import { isIOS, isStandalone, swSupported } from './pwa';

export type PushSupport =
  | 'supported'
  | 'unsupported'
  /** iOS/iPadOS Safari: push only works once the app is on the Home Screen. */
  | 'ios-needs-install';

export function pushSupport(): PushSupport {
  const hasApis = swSupported() && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
  if (hasApis) return 'supported';
  if (isIOS() && !isStandalone()) return 'ios-needs-install';
  return 'unsupported';
}

export const notificationPermission = (): NotificationPermission | 'unsupported' =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

/** VAPID public key (base64url) → the raw bytes pushManager.subscribe expects. */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

function sameKey(a: ArrayBuffer | null | undefined, b: ArrayBuffer): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** The active registration. `ready` never settles if registration failed, so it is raced against a timeout. */
async function registration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error('Service worker is not active')), 10000),
    ),
  ]);
}

/**
 * Ask for permission (must run from a user gesture), subscribe this browser
 * and register it with the server. Returns the resulting permission.
 */
export async function enablePush(lang: 'he' | 'en'): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  await syncPushSubscription(lang, { create: true });
  return permission;
}

/**
 * Make sure the server knows this browser's current subscription.
 *
 * Called on app start when permission is already granted: the server may be
 * using new VAPID keys (dev generates a pair per boot), the browser may have
 * rotated the subscription, or the time zone may have changed. A subscription
 * made with a different key is replaced.
 */
export async function syncPushSubscription(lang: 'he' | 'en', { create = false } = {}): Promise<boolean> {
  if (pushSupport() !== 'supported' || notificationPermission() !== 'granted') return false;
  const reg = await registration();
  const { data } = await pushApi.getPublicKey();
  const key = urlBase64ToBuffer(data.publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    if (!create) return false;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  await pushApi.subscribe(sub.toJSON(), { tz: browserTimeZone(), lang });
  return true;
}

/** Unsubscribe this browser here and on the server. */
export async function disablePushOnThisDevice(): Promise<void> {
  if (!swSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await pushApi.unsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function hasLocalSubscription(): Promise<boolean> {
  if (pushSupport() !== 'supported') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}
